import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { TextChannel } from 'discord.js';

export default class ProxmoxUtil extends GargoyleModule {
    public override category: string = 'utilities';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder().addGuild('750209335841390642').setName('proxmox').setDescription('Proxmox related utilities')
    ];

    public override async executeApiRequest(client: GargoyleClient, request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (!process.env.PROXMOX_NOTIFY_AUTH || !process.env.PROXMOX_NOTIFY_CHANNEL_ID) {
            return Promise.resolve(new Response('Proxmox notification not configured', { status: 500, headers: { 'Content-Type': 'text/plain' } }));
        }

        const notifChannel = await client.channels.fetch(process.env.PROXMOX_NOTIFY_CHANNEL_ID).catch(() => null);
        if (!notifChannel || !notifChannel.isTextBased()) {
            return Promise.resolve(
                new Response('Proxmox notification channel not found or invalid', { status: 500, headers: { 'Content-Type': 'text/plain' } })
            );
        }

        if (url.pathname === '/api/proxmox/notify') {
            if (request.headers.get('Content-Type') !== 'application/json') {
                return Promise.resolve(new Response('Bad Request', { status: 400, headers: { 'Content-Type': 'text/plain' } }));
            }
            const authHeader = request.headers.get('Authorization');
            if (authHeader !== `Bearer ${process.env.PROXMOX_NOTIFY_AUTH}`) {
                return Promise.resolve(new Response('Unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } }));
            }

            const payload = (await request.json()) as ProxmoxNotifyPayload;
            const summary = payload.description.split('=======')[1].split('Logs')[0].trim();

            (notifChannel as TextChannel).send({ content: `**${payload.title}**\n\`\`\`\n${summary}\n\`\`\`` });

            return Promise.resolve(new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
        } else {
            return Promise.resolve(new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } }));
        }
    }
}

type ProxmoxNotifyPayload = {
    title: string;
    description: string;
};
