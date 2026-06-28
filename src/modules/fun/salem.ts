import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { ChatInputCommandInteraction, MessageFlags, TextChannel } from 'discord.js';

export default class Salem extends GargoyleModule {
    public override name: string = 'salem';
    public override category: string = 'fun';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('salem')
            .addGuilds('1475065895742214267')
            .setDescription('Simple salem helper')
            .addStringOption((o) => o.setName('message').setDescription('Send a salem message').setRequired(true)) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.commandName === 'salem') {
            await interaction.reply({
                content: 'Sending message',
                flags: MessageFlags.Ephemeral
            });

            (interaction.channel as TextChannel).send({ content: interaction.options.getString('message', true), allowedMentions: { parse: [] } });
        }
    }
}
