import ChattoCommandBuilder from '@src/system/backend/builders/chattoCommandBuilder';
import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { Message, User } from 'chatto.ts';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

export default class Balance extends GargoyleModule {
    public override category: string = 'economy';
    public override name: string = 'balance';
    public override slashCommands = [
        new GargoyleSlashCommandBuilder()
            .setName(this.name)
            .setDescription("Check your balance or someone else's balance.")
            .addUserOption((option) =>
                option.setName('user').setDescription('The user to check the balance of. Defaults to yourself.').setRequired(false)
            ) as GargoyleSlashCommandBuilder
    ];
    public override chattoCommands: ChattoCommandBuilder[] = [
        new ChattoCommandBuilder().setName(this.name).setDescription("Check your balance or someone else's balance.").setUsage('balance [user]')
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            client.logger.error('Database not connected when executing balance command.');
            return;
        }

        const target = interaction.options.getUser('user') || interaction.user;
        const user = await client.db.getUser(target.id);
        if (!user) {
            await interaction.reply({
                content: `User ${target.tag} does not have a balance yet. They can get one by using the /daily command!`,
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }

        await interaction.reply({
            components: [new GargoyleContainerBuilder(`$${user.balance}.`)],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    public override async executeChattoCommand(client: GargoyleClient, message: Message, ...args: string[]): Promise<void> {
        if (!client.db) {
            await message.reply({ content: 'Database not connected. Please try again later.' });
            client.logger.error('Database not connected when executing balance command.');
            return;
        }

        const target = args[1] || message.author.username;

        const user: User | undefined = (await client.chatto?.users.list({ search: target }).catch(() => []))?.[0];
        if (!user) {
            await message.reply({
                content: `User ${target} wasn't found!`
            });
            return;
        }

        const dbUser = await client.db.getUser(user.id, { exists: true });
        if (!dbUser) {
            await message.reply({
                content: `User ${target} does not have a balance yet. They can get one by using the /daily command!`
            });
            return;
        }

        await message.reply({
            content: `$${dbUser.balance}.`
        });
    }
}
