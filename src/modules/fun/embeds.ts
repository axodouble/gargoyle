import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { ChatInputCommandInteraction } from 'discord.js';

export default class Embeds extends GargoyleModule {
    public override category: string = 'fun';
    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('embeds')
            .setDescription('Returns a link to an embed')
            .addStringOption((option) => option.setName('title').setDescription('Title of the embed').setRequired(false))
            .addStringOption((option) => option.setName('description').setDescription('Description of the embed').setRequired(false))
            .addStringOption((option) => option.setName('color').setDescription('Color of the embed in hex (e.g. #ff0000)').setRequired(false))
            .addStringOption((option) => option.setName('url').setDescription('URL of the embed').setRequired(false))
            .addStringOption((option) => option.setName('footer').setDescription('Footer text of the embed').setRequired(false))
            .addStringOption((option) => option.setName('image').setDescription('Image URL of the embed').setRequired(false))
            .addStringOption((option) => option.setName('thumbnail').setDescription('Thumbnail URL of the embed').setRequired(false))
            .addStringOption((option) =>
                option.setName('author').setDescription('Author name of the embed').setRequired(false)
            ) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        const title = interaction.options.getString('title') ?? undefined;
        const description = interaction.options.getString('description') ?? undefined;
        const color = interaction.options.getString('color') ?? undefined;
        const url = interaction.options.getString('url') ?? undefined;
        const footer = interaction.options.getString('footer') ?? undefined;
        const image = interaction.options.getString('image') ?? undefined;
        const thumbnail = interaction.options.getString('thumbnail') ?? undefined;
        const author = interaction.options.getString('author') ?? undefined;

        const params = new URLSearchParams();
        if (title) params.set('title', title);
        if (description) params.set('description', description);
        if (color) params.set('color', color);
        if (url) params.set('url', url);
        if (footer) params.set('footer', footer);
        if (image) params.set('image', image);
        if (thumbnail) params.set('thumbnail', thumbnail);
        if (author) params.set('author', author);

        await interaction.reply({
            content: `https://gargoyle.axodouble.com/api/embeds/?${params.toString()}`
        });
    }

    public override executeApiRequest(_client: GargoyleClient, _request: Request): Promise<Response> {
        // https://gargoyle.axodouble.com/api/embeds/?title=&description=&color=&url=&footer=&image=&thumbnail=&author=
        const url = new URL(_request.url);
        const params = url.searchParams;

        const title = params.get('title') ?? '';
        const description = params.get('description') ?? '';
        const color = params.get('color') ?? '';
        const embedUrl = params.get('url') ?? '';
        const footer = params.get('footer') ?? '';
        const image = params.get('image') ?? '';
        const thumbnail = params.get('thumbnail') ?? '';
        const author = params.get('author') ?? '';

        let metaTags = '';

        if (title) metaTags += `<meta property="og:title" content="${title}">\n`;
        if (description) metaTags += `<meta property="og:description" content="${description}">\n`;
        if (embedUrl) metaTags += `<meta property="og:url" content="${embedUrl}">\n`;
        if (image) metaTags += `<meta property="og:image" content="${image}">\n`;
        if (thumbnail) metaTags += `<meta property="og:image" content="${thumbnail}">\n`; // Discord uses og:image for both
        if (color) metaTags += `<meta name="theme-color" content="${color}">\n`;
        if (author) metaTags += `<meta name="author" content="${author}">\n`;
        if (footer) metaTags += `<meta name="footer" content="${footer}">\n`;

        const html = `<!DOCTYPE html>
        <html lang="en">
        <head>
        ${metaTags}
        <title>${title || 'Embed'}</title>
        </head>
        <body>
        <p>This page is for generating Discord embeds.</p>
        </body>
        </html>`;

        return Promise.resolve(
            new Response(html, {
                headers: { 'Content-Type': 'text/html' }
            })
        );
    }
}
