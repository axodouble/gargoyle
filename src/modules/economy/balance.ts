import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
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
}
