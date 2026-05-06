import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { ChatInputCommandInteraction } from 'discord.js';

export default class Gif extends GargoyleModule {
    public override name: string = 'gif';
    public override category: string = 'fun';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('gif')
            .setDescription('Change an image into a gif')
            .addAttachmentOption((option) =>
                option.setName('image').setDescription('The image to change into a gif').setRequired(true)
            ) as GargoyleSlashCommandBuilder
    ];

    public override executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): void {
        const image = interaction.options.getAttachment('image', true);
        if (!image.contentType?.startsWith('image/')) {
            interaction.reply({ content: 'Please provide a valid image file.', ephemeral: true });
            return;
        }
        const url = image.url;
        const gifUrl = url.replace(/\.\w+$/, '.gif');
        interaction.reply({ content: `Here is your gif: ${gifUrl}` });
    }
}
