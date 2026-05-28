import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';

export default class Pay extends GargoyleModule {
    public override name: string = 'pay';
    public override category: string = 'economy';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName(this.name)
            .setDescription('Pay another user some of your balance.')
            .addUserOption((option) => option.setName('user').setDescription('The user to pay.').setRequired(true))
            .addNumberOption((option) =>
                option.setName('amount').setDescription('The amount to pay.').setRequired(true).setMinValue(1)
            ) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (!client.db) {
            void interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            client.logger.error('Database not connected when executing pay command.');
            return;
        }

        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getNumber('amount', true);

        if (target.id === interaction.user.id) {
            void interaction.reply({ content: 'You cannot pay yourself!', flags: [MessageFlags.Ephemeral] });
            return;
        }

        const payee = await client.db.getUser(interaction.user.id, { exists: true });
        const recipient = await client.db.getUser(target.id, { exists: true });

        if (payee.balance < amount) {
            await interaction.reply({
                components: [new GargoyleContainerBuilder('You do not have enough money to pay that amount!')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
            return;
        }

        payee.balance -= amount;
        recipient.balance += amount;

        try {
            await client.db.setUsers([
                { user_id: interaction.user.id, balance: payee.balance },
                { user_id: target.id, balance: recipient.balance }
            ]);

            await interaction.reply({
                components: [
                    new GargoyleContainerBuilder(
                        `You have paid $${amount.toLocaleString()} to <@!${target.id}>! Your new balance is $${payee.balance.toLocaleString()}.`
                    )
                ],
                flags: [MessageFlags.IsComponentsV2],
                allowedMentions: { users: [] }
            });
        } catch (error) {
            client.logger.error(`Error updating balances in pay command: ${error}`);

            await interaction.reply({
                components: [new GargoyleContainerBuilder('An error occurred while processing the payment. Please try again later.')],
                flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
            });
        }
    }
}
