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

            // Summary example:
            // VMID    Name       Status    Time      Size         Filename
            // 204     dokploy    ok        2m 36s    7.133 GiB    /var/lib/vz/dump/vzdump-lxc-204-2025_12_10-14_50_58.tar.zst
            // 123     testvm     ok        1m 15s    3.456 GiB    /var/lib/vz/dump/vzdump-lxc-123-2025_12_10-14_52_10.tar.zst
            // ....
            // ....
            //
            // Total running time: 2m 36s
            // Total size: 7.133 GiB

            // Desired
            // ✅ dokploy (204): Backup completed successfully in 2m 36s, Size: `7.133 GiB`
            // ✅ testvm (123): Backup completed successfully in 1m 15s, Size: `3.456 GiB`

            const lines = summary.split('\n').slice(2, -3); // Skip header and footer lines
            const formattedLines = lines.map((line) => {
                const parts = line.trim().split(/\s+/);
                const vmid = parts[0];
                const name = parts[1];
                const status = parts[2];
                const timeIndex = line.indexOf(status) + status.length;
                const timeAndSize = line
                    .slice(timeIndex)
                    .trim()
                    .split(/\s{2,}/);
                const time = timeAndSize[0];
                const size = timeAndSize[1];

                return `✅ ${name} (${vmid}): Backup completed successfully in ${time}, Size: \`${size}\``;
            });

            const summaryMessage = formattedLines.join('\n');

            (notifChannel as TextChannel).send({ content: `${summaryMessage}` });

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
