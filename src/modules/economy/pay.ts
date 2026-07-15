import ChattoCommandBuilder from '@src/system/backend/builders/chattoCommandBuilder';
import GargoyleButtonBuilder from '@src/system/backend/builders/gargoyleButtonBuilder';
import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { Message, User } from 'chatto.ts';
import {
    ActionRowBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    MessageActionRowComponentBuilder,
    MessageFlags
} from 'discord.js';

type ResolvedRecipient = { id: string; displayName: string; platform: 'discord' | 'chatto' | 'both' };
type PendingPayment = { recipientId: string; recipientName: string; amount: number; expiresAt: number };

const CONFIRMATION_TIMEOUT_MS = 60_000;

export default class Pay extends GargoyleModule {
    public override name: string = 'pay';
    public override category: string = 'economy';

    private pendingPayments = new Map<string, PendingPayment>();

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName(this.name)
            .setDescription('Pay another user some of your balance.')
            .addNumberOption((option) => option.setName('amount').setDescription('The amount to pay.').setRequired(true).setMinValue(1))
            .addUserOption((option) => option.setName('user').setDescription('The Discord user to pay.').setRequired(false))
            .addStringOption((option) =>
                option.setName('id').setDescription('The raw user ID to pay (e.g. a Chatto account).').setRequired(false)
            ) as GargoyleSlashCommandBuilder
    ];
    public override chattoCommands: ChattoCommandBuilder[] = [
        new ChattoCommandBuilder().setName(this.name).setDescription('Pay another user some of your balance.').setUsage('pay <user|id> <amount>')
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (!client.db) {
            void interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            client.logger.error('Database not connected when executing pay command.');
            return;
        }

        const amount = interaction.options.getNumber('amount', true);
        const userOption = interaction.options.getUser('user', false);
        const idOption = interaction.options.getString('id', false);

        if ((userOption && idOption) || (!userOption && !idOption)) {
            await interaction.reply({
                components: [new GargoyleContainerBuilder('Please provide exactly one of `user` or `id`.')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        let recipient: ResolvedRecipient | null;
        if (userOption) {
            recipient = { id: userOption.id, displayName: userOption.tag, platform: 'discord' };
        } else {
            recipient = await this.resolveRecipient(client, idOption!.trim());
        }

        if (!recipient) {
            await interaction.reply({
                components: [new GargoyleContainerBuilder(`Could not find any account with ID \`${idOption}\` on Discord or Chatto.`)],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        if (recipient.id === interaction.user.id) {
            await interaction.reply({
                components: [new GargoyleContainerBuilder('You cannot pay yourself!')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        const payee = await client.db.getUser(interaction.user.id, { exists: true });
        if (payee.balance < amount) {
            await interaction.reply({
                components: [new GargoyleContainerBuilder('You do not have enough money to pay that amount!')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        this.pendingPayments.set(interaction.user.id, {
            recipientId: recipient.id,
            recipientName: recipient.displayName,
            amount,
            expiresAt: Date.now() + CONFIRMATION_TIMEOUT_MS
        });

        await interaction.reply({
            components: [
                new GargoyleContainerBuilder(
                    `You are about to pay $${amount.toLocaleString()} to **${recipient.displayName}** (${recipient.platform}).\nDo you want to confirm this payment?`
                ).addActionRowComponents(
                    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new GargoyleButtonBuilder(this, 'confirm', interaction.user.id).setLabel('Confirm').setStyle(ButtonStyle.Success),
                        new GargoyleButtonBuilder(this, 'cancel', interaction.user.id).setLabel('Cancel').setStyle(ButtonStyle.Danger)
                    )
                )
            ],
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
        });
    }

    public override async executeButtonCommand(client: GargoyleClient, interaction: ButtonInteraction, ...args: string[]): Promise<void> {
        if (!client.db) {
            await interaction.reply({
                components: [new GargoyleContainerBuilder('Database not connected. Please try again later.')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        const action = args[0];
        const ownerId = args[1];

        if (ownerId !== interaction.user.id) {
            await interaction.reply({
                components: [new GargoyleContainerBuilder('This confirmation is not for you!')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        const pending = this.pendingPayments.get(interaction.user.id);
        if (!pending || pending.expiresAt < Date.now()) {
            this.pendingPayments.delete(interaction.user.id);
            await interaction.update({
                components: [new GargoyleContainerBuilder('This payment confirmation has expired.')],
                flags: [MessageFlags.IsComponentsV2]
            });
            return;
        }

        if (action === 'cancel') {
            this.pendingPayments.delete(interaction.user.id);
            await interaction.update({
                components: [new GargoyleContainerBuilder('Payment cancelled.')],
                flags: [MessageFlags.IsComponentsV2]
            });
            return;
        }

        if (action !== 'confirm') {
            await interaction.reply({
                components: [new GargoyleContainerBuilder('Unknown button action!')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        const payee = await client.db.getUser(interaction.user.id, { exists: true });
        if (payee.balance < pending.amount) {
            this.pendingPayments.delete(interaction.user.id);
            await interaction.update({
                components: [new GargoyleContainerBuilder('You no longer have enough money to complete this payment!')],
                flags: [MessageFlags.IsComponentsV2]
            });
            return;
        }

        const recipient = await client.db.getUser(pending.recipientId, { exists: true });
        payee.balance -= pending.amount;
        recipient.balance += pending.amount;

        try {
            await client.db.setUsers([
                { user_id: interaction.user.id, balance: payee.balance },
                { user_id: pending.recipientId, balance: recipient.balance }
            ]);
            this.pendingPayments.delete(interaction.user.id);
            await interaction.update({
                components: [
                    new GargoyleContainerBuilder(
                        `You have paid $${pending.amount.toLocaleString()} to **${pending.recipientName}**! Your new balance is $${payee.balance.toLocaleString()}.`
                    )
                ],
                flags: [MessageFlags.IsComponentsV2]
            });
        } catch (error) {
            client.logger.error(`Error updating balances in pay command: ${error}`);
            this.pendingPayments.delete(interaction.user.id);
            await interaction.update({
                components: [new GargoyleContainerBuilder('An error occurred while processing the payment. Please try again later.')],
                flags: [MessageFlags.IsComponentsV2]
            });
        }
    }

    public override async executeChattoCommand(client: GargoyleClient, message: Message, ...args: string[]): Promise<void> {
        if (!client.db) {
            await message.reply({ content: 'Database not connected. Please try again later.' });
            client.logger.error('Database not connected when executing pay command.');
            return;
        }
        if (!client.chatto) return;

        const targetQuery = args[1];
        const amount = Number(args[2]);

        if (!targetQuery || !Number.isFinite(amount) || amount < 1) {
            await message.reply({ content: 'Invalid usage! Please try: `pay <user|id> <amount>`' });
            return;
        }

        let recipient = await this.resolveRecipient(client, targetQuery.trim());
        if (!recipient) {
            const searched: User | undefined = (await client.chatto.users.list({ search: targetQuery }).catch(() => []))?.[0];
            if (searched) {
                recipient = { id: searched.id, displayName: searched.username, platform: 'chatto' };
            }
        }

        if (!recipient) {
            await message.reply({ content: `User \`${targetQuery}\` wasn't found!` });
            return;
        }

        if (recipient.id === message.author.id) {
            await message.reply({ content: 'You cannot pay yourself!' });
            return;
        }

        const payee = await client.db.getUser(message.author.id, { exists: true });
        if (payee.balance < amount) {
            await message.reply({ content: 'You do not have enough money to pay that amount!' });
            return;
        }

        await message.reply({
            content: `You are about to pay $${amount.toLocaleString()} to **${recipient.displayName}**. Reply \`yes\` to confirm or \`no\` to cancel (60s).`
        });

        const confirmed = await this.awaitConfirmation(client, message.channelId, message.author.id, CONFIRMATION_TIMEOUT_MS);
        if (!confirmed) {
            await message.reply({ content: 'Payment cancelled.' });
            return;
        }

        const freshPayee = await client.db.getUser(message.author.id, { exists: true });
        if (freshPayee.balance < amount) {
            await message.reply({ content: 'You no longer have enough money to complete this payment!' });
            return;
        }

        const dbRecipient = await client.db.getUser(recipient.id, { exists: true });
        freshPayee.balance -= amount;
        dbRecipient.balance += amount;

        try {
            await client.db.setUsers([
                { user_id: message.author.id, balance: freshPayee.balance },
                { user_id: recipient.id, balance: dbRecipient.balance }
            ]);
            await message.reply({
                content: `You have paid $${amount.toLocaleString()} to ${recipient.displayName}! Your new balance is $${freshPayee.balance.toLocaleString()}.`
            });
        } catch (error) {
            client.logger.error(`Error updating balances in pay command: ${error}`);
            await message.reply({ content: 'An error occurred while processing the payment. Please try again later.' });
        }
    }

    private async resolveRecipient(client: GargoyleClient, id: string): Promise<ResolvedRecipient | null> {
        let discordUser = null;
        try {
            discordUser = await client.users.fetch(id);
        } catch {
            discordUser = null;
        }

        let chattoUser: User | null = null;
        if (client.chatto) {
            try {
                chattoUser = await client.chatto.users.fetch(id);
            } catch {
                chattoUser = null;
            }
        }

        if (discordUser && chattoUser) {
            return { id, displayName: `${discordUser.tag} / ${chattoUser.username}`, platform: 'both' };
        }
        if (discordUser) {
            return { id, displayName: discordUser.tag, platform: 'discord' };
        }
        if (chattoUser) {
            return { id, displayName: chattoUser.username, platform: 'chatto' };
        }
        return null;
    }

    private awaitConfirmation(client: GargoyleClient, channelId: string, userId: string, ms: number): Promise<boolean> {
        return new Promise((resolve) => {
            const chatto = client.chatto;
            if (!chatto) {
                resolve(false);
                return;
            }

            let timer: ReturnType<typeof setTimeout>;

            const cleanup = () => {
                clearTimeout(timer);
                chatto.off('messageCreate', listener);
            };

            const listener = (message: Message) => {
                if (message.channelId !== channelId || message.author.id !== userId) return;
                const content = (message.content ?? '').trim().toLowerCase();
                if (content === 'yes' || content === 'y') {
                    cleanup();
                    resolve(true);
                } else if (content === 'no' || content === 'n') {
                    cleanup();
                    resolve(false);
                }
            };

            timer = setTimeout(() => {
                cleanup();
                resolve(false);
            }, ms);

            chatto.on('messageCreate', listener);
        });
    }
}
