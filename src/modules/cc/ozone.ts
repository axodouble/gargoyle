import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { fetch } from 'bun';
import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonInteraction,
    ChatInputCommandInteraction,
    InteractionContextType,
    InteractionEditReplyOptions,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageActionRowComponentBuilder,
    MessageFlags,
    TextChannel
} from 'discord.js';
import { askGargle, getGargleSubmessage, getRandomGargleFace } from './gargle';
import { randomUUID } from 'crypto';
import GargoyleButtonBuilder from '@src/system/backend/builders/gargoyleButtonBuilder';
import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder';

const IMAGE_API = process.env.IMAGE_API;
const IMAGE_API_URL = IMAGE_API ? `http://${IMAGE_API}` : '';
const IMAGE_WS_URL = IMAGE_API ? `ws://${IMAGE_API}` : '';

const IMAGE_TIMEOUT_MS = 180000;
const HISTORY_RETRY_DELAY_MS = 1500;
const TRANSIENT_RETRY_ATTEMPTS = 3;
const TRANSIENT_RETRY_DELAY_MS = 500;

type ImageJob = {
    mode: 'generate' | 'edit';
    prompt: string;
    sourceFilename?: string;
};

const promptCache = new Map<string, ImageJob>();
const MAX_EDIT_INPUT_BYTES = 8 * 1024 * 1024;
const SUPPORTED_EDIT_TYPES = ['image/png', 'image/jpeg'];

type PromptResponse = {
    prompt_id: string;
};

type ImageInfo = {
    filename: string;
    subfolder?: string;
    type: string;
};

export default class Ozone extends GargoyleModule {
    public override name: string = 'ozone';
    public override category: string = 'ceraia';

    private ozoneUnits = [
        {
            name: 'oui',
            value: '110'
        },
        {
            name: 'image',
            value: '111'
        },
        {
            name: 'llama',
            value: '112'
        }
    ];

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
            .setIntegrationTypes(ApplicationIntegrationType.UserInstall)
            .setName('ozone')
            .setDescription("Axodouble\'s Ozone Utilities")
            .addSubcommandGroup((group) =>
                group
                    .setName('units')
                    .setDescription("Commands to control Ozone's Units")
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('power')
                            .setDescription('Divert power to a specific unit')
                            .addStringOption((option) =>
                                option
                                    .setName('unit')
                                    .setDescription('Unit to control')
                                    .setRequired(true)
                                    .addChoices(...this.ozoneUnits)
                            )
                    )
            )
            .addSubcommandGroup((subcommandGroup) =>
                subcommandGroup
                    .setName('ai')
                    .setDescription('AI related commands.')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('edit')
                            .setDescription('Edit an image based on a prompt.')
                            .addAttachmentOption((option) =>
                                option.setName('image').setDescription('The image to edit. Must be a PNG or JPEG file under 8MB.').setRequired(true)
                            )
                            .addStringOption((option) =>
                                option.setName('prompt').setDescription('The prompt to edit the image with.').setRequired(true)
                            )
                            .addBooleanOption((option) =>
                                option.setName('hidden').setDescription('Whether the edited image should be hidden.').setRequired(false)
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('generate')
                            .setDescription('Generate an image based on a prompt.')
                            .addStringOption((option) =>
                                option.setName('prompt').setDescription('The prompt to generate the image from.').setRequired(true)
                            )
                            .addBooleanOption((option) =>
                                option.setName('hidden').setDescription('Whether the image should be hidden.').setRequired(false)
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('text')
                            .setDescription('Generate text using AI.')
                            .addStringOption((option) =>
                                option.setName('prompt').setDescription('The prompt to generate text from.').setRequired(true)
                            )
                    )
            ) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.user.id !== '244173330431737866') {
            await interaction.reply({
                content: "Sorry, this is Axodouble's command, this is only used to control Ozone's non-critical infrastructure.",
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }

        const subcommandGroup = interaction.options.getSubcommandGroup(false);

        if (subcommandGroup === 'units') {
            if (interaction.options.getSubcommand(false) === 'power') {
                const unitObject = this.ozoneUnits.find((u) => u.value === interaction.options.getString('unit', true))!;

                await interaction.deferReply({});
                try {
                    const unit = interaction.options.getString('unit', true);

                    await interaction.editReply({
                        content: `(1/3) Shutting down units...\n-# ${getGargleSubmessage('happy', 'working')}`
                    });
                    await this.turnOthersOff(client, unit);

                    await interaction.editReply({
                        content: `(2/3) Booting unit ${unitObject.name} (${unitObject.value})...\n-# ${getGargleSubmessage('happy', 'working')}`
                    });
                    await fetch(`${process.env.PROXMOX_HOST}/lxc/${unit}/status/start`, {
                        method: 'POST',
                        headers: {
                            Authorization: `PVEAPIToken=${process.env.PROXMOX_KEY}`
                        },
                        tls: {
                            rejectUnauthorized: false
                        }
                    });
                    await interaction.editReply({
                        content: `(3/3) Unit ${unitObject.name} (${unitObject.value}) is starting.\n-# ${getGargleSubmessage('happy', 'success')}`
                    });
                } catch (error) {
                    await interaction.editReply({
                        content: `Failed to divert units, this is logged.\n-# ${getRandomGargleFace('sad')} Logged to Ozone, we will investigate the issue.`
                    });
                }
            }
        } else if (subcommandGroup === 'ai') {
            return image(client, interaction, this);
        }
    }

    public override async executeButtonCommand(client: GargoyleClient, interaction: ButtonInteraction, ...args: string[]): Promise<void> {
        if (args[0] === 'regenerate') {
            if (interaction.user.id !== '244173330431737866') {
                await interaction.reply({
                    content:
                        'Image regeneration is currently in early access and is only available to select users. If you are interested in gaining access, please contact an @axodouble.',
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }
            const job = promptCache.get(args[1]);

            if (!job) {
                await interaction.reply({
                    content: 'This generation has expired. Please use `/fun image` to generate a new one.',
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            await interaction.deferUpdate();

            try {
                const imageBuffers =
                    job.mode === 'edit' && job.sourceFilename
                        ? await editImages(client, job.prompt, job.sourceFilename)
                        : await generateImages(client, job.prompt);
                await interaction.editReply(buildImageReply(this, job, imageBuffers));
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                client.logger.error(`Image regeneration failed: ${errorMessage}`);

                await interaction.followUp({
                    content: 'Image regeneration failed. Please try again in a moment.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
        }
    }

    private async turnOthersOff(client: GargoyleClient, excludeUnit: string) {
        for (const unit of this.ozoneUnits) {
            const url = `${process.env.PROXMOX_HOST}/lxc/${unit.value}/status/shutdown`;
            if (unit.value !== excludeUnit) {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        Authorization: `PVEAPIToken=${process.env.PROXMOX_KEY}`
                    },
                    tls: {
                        rejectUnauthorized: false
                    }
                });
                client.logger.info(`Sent shutdown command to unit ${unit.name}`);

                if (!res.ok && res.status !== 500) {
                    throw new Error(`Failed to shutdown unit ${unit.name} with status ${res.status}, at ${url}`);
                }
            }
        }
        return true;
    }

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

async function image(client: GargoyleClient, interaction: ChatInputCommandInteraction, module: Ozone) {
    if (interaction.user.id !== '244173330431737866') {
        await interaction.reply({
            content:
                'Image generation is currently in early access and is only available to select users. If you are interested in gaining access, please contact an @axodouble.',
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    const prompt = interaction.options.getString('prompt', true);
    const subcommand = interaction.options.getSubcommand(true);
    const hidden = interaction.options.getBoolean('hidden') ? MessageFlags.Ephemeral : undefined;

    if (subcommand === 'text') {
        await interaction.deferReply({ flags: hidden });
        try {
            const response = await askGargle(prompt);
            await interaction.editReply({ content: response });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            client.logger.error(`Text generation failed: ${errorMessage}`);

            await interaction.editReply({
                content: 'Text generation failed. Please try again in a moment.'
            });
        }
    }

    if (!IMAGE_API) {
        await interaction.reply({
            content: 'Image generation is not configured on this bot instance. Please contact an administrator.'
        });
        return;
    }

    await interaction.deferReply({ flags: hidden });

    try {
        if (subcommand === 'edit') {
            const inputImage = interaction.options.getAttachment('image', true);
            const validationError = validateEditImageInput(inputImage.contentType ?? null, inputImage.size);

            if (validationError) {
                await interaction.editReply({ content: validationError });
                return;
            }

            const attachmentResponse = await fetch(inputImage.url);
            if (!attachmentResponse.ok) {
                throw new Error(`Failed to fetch source image with status ${attachmentResponse.status}`);
            }

            const sourceImageBuffer = Buffer.from(await attachmentResponse.arrayBuffer());
            const uploadedFilename = await uploadImage(sourceImageBuffer, inputImage.name ?? 'input.png');
            const imageBuffers = await editImages(client, prompt, uploadedFilename);

            await interaction.editReply(buildImageReply(module, { mode: 'edit', prompt, sourceFilename: uploadedFilename }, imageBuffers));
            return;
        }

        const imageBuffers = await generateImages(client, prompt);
        await interaction.editReply(buildImageReply(module, { mode: 'generate', prompt }, imageBuffers));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        client.logger.error(`Image generation failed: ${errorMessage}`);

        await interaction.editReply({
            content: 'Image generation failed. Please try again in a moment.'
        });
    }
}

function buildImageReply(module: Ozone, job: ImageJob, buffers: Buffer[]): InteractionEditReplyOptions {
    const cacheKey = randomUUID();
    promptCache.set(cacheKey, job);
    const prompt = job.prompt;

    const gallery = new MediaGalleryBuilder();
    for (let i = 0; i < buffers.length; i++) {
        gallery.addItems(new MediaGalleryItemBuilder().setURL(`attachment://generated_${i}.png`));
    }

    const container = new GargoyleContainerBuilder(`-# ${prompt.slice(0, 200)}${prompt.length > 200 ? '...' : ''}`)
        .addMediaGalleryComponents(gallery)
        .addActionRowComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleButtonBuilder(module, 'regenerate', cacheKey).setLabel('🔄 Regenerate')
            )
        );

    return {
        components: [container],
        files: buffers.map((buf, i) => ({ attachment: buf, name: `generated_${i}.png` })),
        flags: [MessageFlags.IsComponentsV2]
    };
}

function validateEditImageInput(contentType: string | null, size: number): string | null {
    if (!contentType || !SUPPORTED_EDIT_TYPES.includes(contentType)) {
        return 'Please provide a PNG or JPEG image.';
    }

    if (size > MAX_EDIT_INPUT_BYTES) {
        return 'The source image is too large. Please upload an image under 8MB.';
    }

    return null;
}

async function generateImages(client: GargoyleClient, prompt: string): Promise<Buffer[]> {
    const promptData = generatePrompt(prompt);
    const clientId = randomUUID();

    const request = await fetch(`${IMAGE_API_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptData, client_id: clientId })
    });

    if (!request.ok) {
        throw new Error(`Image queue request failed with status ${request.status}`);
    }

    const response = (await request.json()) as PromptResponse;

    if (!response.prompt_id) {
        throw new Error('Image queue response did not include a prompt id');
    }

    client.logger.info(`Queued image: ${response.prompt_id}`);

    try {
        await waitForCompletion(client, response.prompt_id, clientId, IMAGE_TIMEOUT_MS);
    } catch (error) {
        throw stageError('execution stage failed', error);
    }

    const imageInfos = await getImageInfos(client, response.prompt_id, IMAGE_TIMEOUT_MS);

    if (imageInfos.length === 0) {
        throw new Error('No generated images were returned');
    }

    const selectedImages = imageInfos.slice(0, 4);

    try {
        return await Promise.all(selectedImages.map((image) => downloadImageWithRetry(client, response.prompt_id, image)));
    } catch (error) {
        throw stageError('download stage failed', error);
    }
}

async function editImages(client: GargoyleClient, prompt: string, sourceFilename: string): Promise<Buffer[]> {
    const promptData = editPrompt(prompt, sourceFilename);
    const clientId = randomUUID();

    const request = await fetch(`${IMAGE_API_URL}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptData, client_id: clientId })
    });

    if (!request.ok) {
        throw new Error(`Image edit queue request failed with status ${request.status}`);
    }

    const response = (await request.json()) as PromptResponse;

    if (!response.prompt_id) {
        throw new Error('Image edit queue response did not include a prompt id');
    }

    client.logger.info(`Queued image edit: ${response.prompt_id}`);

    try {
        await waitForCompletion(client, response.prompt_id, clientId, IMAGE_TIMEOUT_MS);
    } catch (error) {
        throw stageError('execution stage failed', error);
    }

    const imageInfos = await getImageInfos(client, response.prompt_id, IMAGE_TIMEOUT_MS);

    if (imageInfos.length === 0) {
        throw new Error('No edited images were returned');
    }

    const selectedImages = imageInfos.slice(0, 4);

    try {
        return await Promise.all(selectedImages.map((image) => downloadImageWithRetry(client, response.prompt_id, image)));
    } catch (error) {
        throw stageError('download stage failed', error);
    }
}

async function waitForCompletion(client: GargoyleClient, promptId: string, clientId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${IMAGE_WS_URL}/ws?clientId=${encodeURIComponent(clientId)}`);
        const timeout = setTimeout(() => {
            ws.close();
            reject(new Error(`Image generation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        let settled = false;

        const finish = (fn: () => void) => {
            if (settled) {
                return;
            }

            settled = true;
            clearTimeout(timeout);
            fn();
        };

        ws.onopen = () => {
            client.logger.trace(`Connected to image websocket for prompt ${promptId}`);
        };

        ws.onmessage = (event) => {
            const payload = typeof event.data === 'string' ? event.data : event.data.toString();
            const msg = JSON.parse(payload) as {
                type?: string;
                data?: {
                    prompt_id?: string;
                    node?: string | null;
                    value?: number;
                    max?: number;
                };
            };

            if (msg.data?.prompt_id && msg.data.prompt_id !== promptId) {
                return;
            }

            if (msg.type === 'progress') {
                client.logger.trace(`Image progress ${msg.data?.value ?? 0}/${msg.data?.max ?? 0} for ${promptId}`);
            }

            if (msg.type === 'execution_success') {
                client.logger.trace(`Image execution completed for prompt ${promptId}`);
                ws.close();
                finish(resolve);
                return;
            }

            if (msg.type === 'execution_error') {
                ws.close();
                finish(() => reject(new Error('ComfyUI execution failed')));
            }
        };

        ws.onerror = () => {
            finish(() => reject(new Error('Image websocket connection failed')));
        };

        ws.onclose = () => {
            client.logger.trace(`Image websocket closed for prompt ${promptId}`);
        };
    });
}

async function getImageInfos(client: GargoyleClient, promptId: string, timeoutMs: number): Promise<ImageInfo[]> {
    const start = Date.now();
    let attempt = 0;

    while (Date.now() - start < timeoutMs) {
        attempt++;
        let res: Response;
        try {
            res = await fetch(`${IMAGE_API_URL}/history/${promptId}`);
        } catch (error) {
            if (isAbortError(error)) {
                client.logger.trace(`History fetch aborted for ${promptId}, retry ${attempt}`);
                await Bun.sleep(HISTORY_RETRY_DELAY_MS);
                continue;
            }

            throw stageError('history stage failed', error);
        }

        if (!res.ok) {
            throw new Error(`history stage failed: fetch returned status ${res.status}`);
        }

        let json: Record<
            string,
            {
                outputs?: Record<
                    string,
                    {
                        images?: ImageInfo[];
                    }
                >;
            }
        >;
        try {
            json = (await res.json()) as Record<
                string,
                {
                    outputs?: Record<
                        string,
                        {
                            images?: ImageInfo[];
                        }
                    >;
                }
            >;
        } catch (error) {
            throw stageError('history stage failed', error);
        }

        const entry = json[promptId];

        if (entry?.outputs) {
            const allImages: ImageInfo[] = [];
            for (const nodeId of Object.keys(entry.outputs)) {
                const node = entry.outputs[nodeId];
                if (node.images && node.images.length > 0) {
                    allImages.push(...node.images);
                }
            }
            if (allImages.length > 0) {
                return allImages;
            }
        }

        client.logger.trace(`No image output yet for ${promptId}, retry ${attempt}`);
        await Bun.sleep(HISTORY_RETRY_DELAY_MS);
    }

    throw new Error(`history stage failed: no images found in output history within ${timeoutMs}ms`);
}

async function downloadImage(image: ImageInfo): Promise<Buffer> {
    const url = new URL(`${IMAGE_API_URL}/view`);
    url.searchParams.set('filename', image.filename);
    url.searchParams.set('type', image.type);
    if (image.subfolder) {
        url.searchParams.set('subfolder', image.subfolder);
    }

    const res = await fetch(url.toString());

    if (!res.ok) {
        throw new Error(`Failed to download image with status ${res.status}`);
    }

    return Buffer.from(await res.arrayBuffer());
}

async function downloadImageWithRetry(client: GargoyleClient, promptId: string, image: ImageInfo): Promise<Buffer> {
    return withAbortRetry(
        () => downloadImage(image),
        TRANSIENT_RETRY_ATTEMPTS,
        async (attempt) => {
            client.logger.trace(`Download aborted for ${promptId} (${image.filename}), retry ${attempt}/${TRANSIENT_RETRY_ATTEMPTS}`);
            await Bun.sleep(TRANSIENT_RETRY_DELAY_MS);
        }
    );
}

async function withAbortRetry<T>(operation: () => Promise<T>, maxAttempts: number, onRetry: (attempt: number) => Promise<void>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (!isAbortError(error) || attempt === maxAttempts) {
                throw error;
            }

            await onRetry(attempt);
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Unknown retry error');
}

async function uploadImage(file: Buffer, filename: string): Promise<string> {
    const form = new FormData();

    form.append('image', new Blob([file]), filename);

    const res = await fetch(`${IMAGE_API_URL}/upload/image`, {
        method: 'POST',
        body: form
    });

    if (!res.ok) {
        throw new Error(`Failed to upload source image with status ${res.status}`);
    }

    const json = (await res.json()) as { name: string };

    if (!json.name) {
        throw new Error('Image upload response did not include a filename');
    }

    return json.name;
}

function isAbortError(error: unknown): boolean {
    if (!(error instanceof Error)) {
        return false;
    }

    const name = error.name.toLowerCase();
    const message = error.message.toLowerCase();
    return name.includes('abort') || message.includes('aborted');
}

function stageError(stage: string, error: unknown): Error {
    if (error instanceof Error) {
        return new Error(`${stage}: ${error.message}`);
    }

    return new Error(`${stage}: Unknown error`);
}

function generatePrompt(prompt: string) {
    return {
        '9': {
            inputs: {
                filename_prefix: 'z-image-turbo',
                images: ['57:8', 0]
            },
            class_type: 'SaveImage',
            _meta: {
                title: 'Save Image'
            }
        },
        '57:30': {
            inputs: {
                clip_name: 'qwen_3_4b.safetensors',
                type: 'lumina2',
                device: 'default'
            },
            class_type: 'CLIPLoader',
            _meta: {
                title: 'Load CLIP'
            }
        },
        '57:29': {
            inputs: {
                vae_name: 'ae.safetensors'
            },
            class_type: 'VAELoader',
            _meta: {
                title: 'Load VAE'
            }
        },
        '57:33': {
            inputs: {
                conditioning: ['57:27', 0]
            },
            class_type: 'ConditioningZeroOut',
            _meta: {
                title: 'ConditioningZeroOut'
            }
        },
        '57:8': {
            inputs: {
                samples: ['57:3', 0],
                vae: ['57:29', 0]
            },
            class_type: 'VAEDecode',
            _meta: {
                title: 'VAE Decode'
            }
        },
        '57:28': {
            inputs: {
                unet_name: 'z_image_turbo_bf16.safetensors',
                weight_dtype: 'default'
            },
            class_type: 'UNETLoader',
            _meta: {
                title: 'Load Diffusion Model'
            }
        },
        '57:27': {
            inputs: {
                text: prompt,
                clip: ['57:30', 0]
            },
            class_type: 'CLIPTextEncode',
            _meta: {
                title: 'CLIP Text Encode (Prompt)'
            }
        },
        '57:13': {
            inputs: {
                width: 1024,
                height: 1024,
                batch_size: 4
            },
            class_type: 'EmptySD3LatentImage',
            _meta: {
                title: 'EmptySD3LatentImage'
            }
        },
        '57:11': {
            inputs: {
                shift: 3,
                model: ['57:28', 0]
            },
            class_type: 'ModelSamplingAuraFlow',
            _meta: {
                title: 'ModelSamplingAuraFlow'
            }
        },
        '57:3': {
            inputs: {
                seed: 475419654095006,
                steps: 8,
                cfg: 1,
                sampler_name: 'res_multistep',
                scheduler: 'simple',
                denoise: 1,
                model: ['57:11', 0],
                positive: ['57:27', 0],
                negative: ['57:33', 0],
                latent_image: ['57:13', 0]
            },
            class_type: 'KSampler',
            _meta: {
                title: 'KSampler'
            }
        }
    };
}

function editPrompt(prompt: string, filename: string) {
    return {
        '136': {
            inputs: {
                filename_prefix: 'ComfyUI',
                images: ['192:8', 0]
            },
            class_type: 'SaveImage',
            _meta: {
                title: 'Save Image'
            }
        },
        '190': {
            inputs: {
                image: filename
            },
            class_type: 'LoadImage',
            _meta: {
                title: 'Load Image'
            }
        },
        '192:39': {
            inputs: {
                vae_name: 'ae.safetensors'
            },
            class_type: 'VAELoader',
            _meta: {
                title: 'Load VAE'
            }
        },
        '192:38': {
            inputs: {
                clip_name1: 'clip_l.safetensors',
                clip_name2: 't5xxl_fp8_e4m3fn_scaled.safetensors',
                type: 'flux',
                device: 'default'
            },
            class_type: 'DualCLIPLoader',
            _meta: {
                title: 'DualCLIPLoader'
            }
        },
        '192:135': {
            inputs: {
                conditioning: ['192:6', 0]
            },
            class_type: 'ConditioningZeroOut',
            _meta: {
                title: 'ConditioningZeroOut'
            }
        },
        '192:8': {
            inputs: {
                samples: ['192:31', 0],
                vae: ['192:39', 0]
            },
            class_type: 'VAEDecode',
            _meta: {
                title: 'VAE Decode'
            }
        },
        '192:124': {
            inputs: {
                pixels: ['192:42', 0],
                vae: ['192:39', 0]
            },
            class_type: 'VAEEncode',
            _meta: {
                title: 'VAE Encode'
            }
        },
        '192:35': {
            inputs: {
                guidance: 2.5,
                conditioning: ['192:177', 0]
            },
            class_type: 'FluxGuidance',
            _meta: {
                title: 'FluxGuidance'
            }
        },
        '192:37': {
            inputs: {
                unet_name: 'flux1-dev-kontext_fp8_scaled.safetensors',
                weight_dtype: 'default'
            },
            class_type: 'UNETLoader',
            _meta: {
                title: 'Load Diffusion Model'
            }
        },
        '192:177': {
            inputs: {
                conditioning: ['192:6', 0],
                latent: ['192:124', 0]
            },
            class_type: 'ReferenceLatent',
            _meta: {
                title: 'ReferenceLatent'
            }
        },
        '192:146': {
            inputs: {
                direction: 'right',
                match_image_size: true,
                spacing_width: 0,
                spacing_color: 'white',
                image1: ['190', 0]
            },
            class_type: 'ImageStitch',
            _meta: {
                title: 'Image Stitch'
            }
        },
        '192:42': {
            inputs: {
                image: ['192:146', 0]
            },
            class_type: 'FluxKontextImageScale',
            _meta: {
                title: 'FluxKontextImageScale'
            }
        },
        '192:31': {
            inputs: {
                seed: 21681712044228,
                steps: 20,
                cfg: 1,
                sampler_name: 'euler',
                scheduler: 'simple',
                denoise: 1,
                model: ['192:37', 0],
                positive: ['192:35', 0],
                negative: ['192:135', 0],
                latent_image: ['192:124', 0]
            },
            class_type: 'KSampler',
            _meta: {
                title: 'KSampler'
            }
        },
        '192:6': {
            inputs: {
                text: prompt,
                clip: ['192:38', 0]
            },
            class_type: 'CLIPTextEncode',
            _meta: {
                title: 'CLIP Text Encode (Positive Prompt)'
            }
        }
    };
}
