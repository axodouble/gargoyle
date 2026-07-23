import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import ChattoCommandBuilder from '@src/system/backend/builders/chattoCommandBuilder';
import { createCanvas, loadImage } from 'canvas';
import { Message as ChattoMessage } from 'chatto.ts';
import {
    ApplicationCommandType,
    ApplicationIntegrationType,
    ContainerBuilder,
    ContextMenuCommandBuilder,
    InteractionContextType,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageContextMenuCommandInteraction,
    MessageFlags
} from 'discord.js';

export default class Quote extends GargoyleModule {
    public override name: string = 'quote';
    public override category: string = 'fun';

    public override contextCommands: ContextMenuCommandBuilder[] = [
        new ContextMenuCommandBuilder()
            .setName('Quote Message')
            .setType(ApplicationCommandType.Message)
            .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
            .setIntegrationTypes(ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall)
    ];

    public override chattoCommands: ChattoCommandBuilder[] = [
        new ChattoCommandBuilder().setName('quote').setDescription('Quote a message.').setUsage('quote <text> (or reply to a message)')
    ];

    public override async executeChattoCommand(client: GargoyleClient, message: ChattoMessage, ...args: string[]): Promise<void> {
        let content: string | undefined;
        let authorName: string;
        let avatarURL: string | undefined;

        if (message.inReplyTo) {
            if (!client.chatto) {
                await message.reply({ content: 'Unable to fetch the replied message right now.' });
                return;
            }

            const target = await client.chatto.messages.fetch(message.channelId, message.inReplyTo).catch(() => null);
            if (!target) {
                await message.reply({ content: 'Could not find the message to quote.' });
                return;
            }

            content = target.content;
            authorName = target.author.displayName;
            avatarURL = target.author.avatarUrl;
        } else {
            content = args.slice(1).join(' ').trim();
            authorName = message.author.displayName;
            avatarURL = message.author.avatarUrl;
        }

        if (!content) {
            await message.reply({ content: 'Nothing to quote! Reply to a message or provide some text: `quote <text>`' });
            return;
        }

        const buffer = await generateQuoteImage(client, content, authorName, avatarURL);

        await message.reply({
            files: [{ data: buffer, filename: 'quote.png', contentType: 'image/png' }]
        });
    }

    public override async executeContextMenuCommand(client: GargoyleClient, interaction: MessageContextMenuCommandInteraction): Promise<void> {
        const message = interaction.targetMessage;

        if (!message) {
            interaction.reply({ content: 'Could not find the message to quote.', flags: MessageFlags.Ephemeral });
            return;
        }

        await interaction.reply({
            components: [
                new ContainerBuilder().addMediaGalleryComponents(
                    new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://quote.gif'))
                )
            ],
            files: [
                await generateQuoteImage(
                    client,
                    message.content,
                    message.author.username,
                    message.author.displayAvatarURL({ extension: 'png', size: 512 })
                ).then((buffer) => {
                    return {
                        attachment: buffer,
                        name: 'quote.gif'
                    };
                })
            ],
            flags: MessageFlags.IsComponentsV2
        });
    }
}

/**
 * Generate a "star"-able quote gif image.
 * The GIF only contains a single frame.
 */
async function generateQuoteImage(client: GargoyleClient, message: string, author: string, avatarURL?: string): Promise<Buffer> {
    const width = 1080;
    const height = 600;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // -----------------------
    // Avatar
    // -----------------------
    const avatarSize = 180;
    const avatarX = width / 2 - avatarSize / 2;
    const avatarY = 30;

    ctx.save();

    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.clip();

    if (avatarURL) {
        const avatar = await loadImage(avatarURL);
        ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    } else {
        // Placeholder when no avatar is available (e.g. chatto users without one).
        ctx.fillStyle = '#4B5563';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }

    ctx.restore();

    // White border
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 8;
    ctx.stroke();

    // -----------------------
    // Quote text
    // -----------------------
    ctx.fillStyle = 'white';
    ctx.font = 'bold 62px Inter';
    ctx.textAlign = 'center';

    const maxWidth = width - 180;
    const lineHeight = 78;

    const lines: string[] = [];

    const words = message.split(/\s+/);

    let current = '';

    for (const word of words) {
        const test = current.length ? `${current} ${word}` : word;

        if (ctx.measureText(test).width > maxWidth) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }

    if (current.length) {
        lines.push(current);
    }

    let y = 300;

    for (const line of lines) {
        ctx.fillText(line, width / 2, y);
        y += lineHeight;
    }

    // -----------------------
    // Author
    // -----------------------

    ctx.font = 'bold 48px Inter';
    ctx.fillStyle = '#E5E7EB';
    ctx.fillText(`— ${author}`, width / 2, canvas.height - 52);

    // -----------------------
    // Watermark
    // -----------------------
    ctx.font = '14px Inter';
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillText(`Generated by ${client.user?.tag ?? 'Gargoyle'}`, width / 2, canvas.height - 100);

    return Buffer.from(canvas.toBuffer('image/png'));
}
