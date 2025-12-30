import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType } from 'discord.js';

export default class BigFile extends GargoyleModule {
    public override category: string = 'utilities';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('bigfile')
            .setDescription('Lets you share files over the 8MB Discord limit')
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
            .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
            .addAttachmentOption((option) =>
                option.setName('file').setDescription('The file you want to share').setRequired(true)
            ) as GargoyleSlashCommandBuilder
    ];

    public override executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): void {
        interaction.reply(interaction.options.getAttachment('file', true).url);
    }
}
