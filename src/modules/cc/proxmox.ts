import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { TextChannel } from 'discord.js';

export default class ProxmoxUtil extends GargoyleModule {
    public override name: string = 'proxmox';
    public override category: string = 'ceraia';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder().addGuild('750209335841390642').setName('proxmox').setDescription('Proxmox related utilities')
    ];

    public override async executeApiRequest(client: GargoyleClient, request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (!process.env.PROXMOX_NOTIFY_AUTH || !process.env.PROXMOX_NOTIFY_CHANNEL_ID) {
            return Promise.resolve(new Response('Proxmox notification not configured', { status: 501, headers: { 'Content-Type': 'text/plain' } }));
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

            const vm: { vmid: string; name: string; status: string; time: string; size: string; filename: string }[] = [];
            const lines = summary.split('\n');

            for (const line of lines.slice(1, lines.length - 3)) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 6) {
                    vm.push({
                        vmid: parts[0],
                        name: parts[1],
                        status: parts[2],
                        time: parts[3],
                        size: parts[parts.length - 3],
                        filename: parts[parts.length - 1]
                    });
                }
            }
            let formattedSummary = '## Proxmox Backup Summary:\n';
            for (const v of vm) {
                formattedSummary += `- ${v.status === 'ok' ? '✅' : `❌ [${v.status}]`} ${v.name} [${v.vmid}] - Size: ${v.size} GiB\n`;
            }

            (notifChannel as TextChannel).send({ content: `${formattedSummary}` });

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
