import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';

export default class ProxmoxUtil extends GargoyleModule {
    public override category: string = 'utilities';

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder().addGuild('750209335841390642').setName('proxmox').setDescription('Proxmox related utilities')
    ];

    public override async executeApiRequest(client: GargoyleClient, request: Request): Promise<Response> {
        const url = new URL(request.url);

        if (url.pathname === '/api/proxmox/notify') {
            if (request.headers.get('Content-Type') !== 'application/json') {
                return Promise.resolve(new Response('Bad Request', { status: 400, headers: { 'Content-Type': 'text/plain' } }));
            }

            const payload = (await request.json()) as ProxmoxNotifyPayload;
            client.logger.log(`Proxmox Notification - Title: ${payload.title}, Description: ${payload.description}`);

            return Promise.resolve(new Response('Linked', { status: 200, headers: { 'Content-Type': 'text/plain' } }));
        } else {
            return Promise.resolve(new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } }));
        }
    }
}

type ProxmoxNotifyPayload = {
    title: string;
    description: string;
};
