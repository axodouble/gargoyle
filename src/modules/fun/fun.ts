import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import GargoyleButtonBuilder from '@src/system/backend/builders/gargoyleButtonBuilder.js';
import GargoyleContainerBuilder from '@src/system/backend/builders/gargoyleContainerBuilder.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import { playAudio } from '@src/system/backend/tools/voice.js';
import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonInteraction,
    ChannelType,
    ChatInputCommandInteraction,
    GuildMember,
    InteractionContextType,
    InteractionEditReplyOptions,
    InteractionResponse,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageActionRowComponentBuilder,
    MessageFlags,
    VoiceChannel
} from 'discord.js';
import { randomUUID } from 'crypto';
import { fetch } from 'bun';
import { askGargle } from '../cc/gargle';

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

export default class Fun extends GargoyleModule {
    public override name: string = 'fun';
    public override category: string = 'fun';
    public override slashCommands = [
        new GargoyleSlashCommandBuilder()
            .setName('fun')
            .setDescription('Fun related commands!')
            .setContexts(InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel)
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
            .addSubcommandGroup((subcommandGroup) =>
                subcommandGroup
                    .setName('text')
                    .setDescription('Text related commands.')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('aesthetic')
                            .setDescription('Change text to look like ｔｈｉｓ.')
                            .addStringOption((option) =>
                                option.setName('text').setDescription('The text to change.').setRequired(true).setMaxLength(2000)
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('upside-down')
                            .setDescription('Flip text.')
                            .addStringOption((option) =>
                                option.setName('text').setDescription('The text to flip.').setRequired(true).setMaxLength(2000)
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('uwu')
                            .setDescription('UwUify text.')
                            .addStringOption((option) =>
                                option.setName('text').setDescription('The text to UwUify.').setRequired(true).setMaxLength(2000)
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('mock')
                            .setDescription('Mock text.')
                            .addStringOption((option) =>
                                option.setName('text').setDescription('The text to mock.').setRequired(true).setMaxLength(2000)
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('clap')
                            .setDescription('Clap text.')
                            .addStringOption((option) =>
                                option.setName('text').setDescription('The text to clap.').setRequired(true).setMaxLength(2000)
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
                                option.setName('prompt')
                                    .setDescription('The prompt to generate text from.')
                                    .setRequired(true)
                            )
                    )
            )

            .addSubcommand((subcommand) => subcommand.setName('truth-or-dare').setDescription('Truth or dare related commands.'))
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('8ball')
                    .setDescription('Ask the magic 8ball a question.')
                    .addStringOption((option) => option.setName('question').setDescription('The question to ask the magic 8ball.').setRequired(true))
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('gong')
                    .setDescription('Play a gong sound effect. This command is only available in voice channels.')
                    .addChannelOption((option) =>
                        option
                            .setName('channel')
                            .setDescription('The voice channel to play the gong sound effect in.')
                            .addChannelTypes(ChannelType.GuildVoice)
                            .setRequired(false)
                    )
            ) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction) {
        const subcommandGroup = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand(false);

        if (subcommandGroup === 'text') {
            return textReplace(interaction);
        }

        if (subcommandGroup === 'ai') {
            return image(client, interaction, this);
        }

        if (subcommand === 'truth-or-dare') {
            return truthDare(interaction);
        }

        if (subcommand === '8ball') {
            return eightBall(interaction);
        }

        if (subcommand === 'gong') {
            if (!interaction.guild) {
                return interaction.reply({
                    content: 'This command can only be used in a guild.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
            let channel = interaction.options.getChannel('channel');
            if (!channel) {
                if ('voice' in (interaction.member ?? {})) {
                    channel = (interaction.member as GuildMember).voice.channel;
                }
            }
            if (!channel || channel.type !== ChannelType.GuildVoice) {
                return interaction.reply({
                    content: 'You must be in a voice channel or specify a valid voice channel to play the gong sound effect.',
                    flags: [MessageFlags.Ephemeral]
                });
            }
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
            await playAudio(client, channel as VoiceChannel, 'gong.mp3');
            await interaction.editReply({
                content: 'Gong'
            });
        }

        return null;
    }

    public override async executeButtonCommand(client: GargoyleClient, interaction: ButtonInteraction, ...args: string[]): Promise<void> {
        if (args[0] === 'regenerate') {
            if(interaction.user.id !== '244173330431737866') {
                await interaction.reply({
                    content: 'Image regeneration is currently in early access and is only available to select users. If you are interested in gaining access, please contact an @axodouble.',
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
}

async function image(client: GargoyleClient, interaction: ChatInputCommandInteraction, module: Fun) {
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

    if(subcommand === 'text') {
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

function buildImageReply(module: Fun, job: ImageJob, buffers: Buffer[]): InteractionEditReplyOptions {
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
            client.logger.trace(
                `Download aborted for ${promptId} (${image.filename}), retry ${attempt}/${TRANSIENT_RETRY_ATTEMPTS}`
            );
            await Bun.sleep(TRANSIENT_RETRY_DELAY_MS);
        }
    );
}

async function withAbortRetry<T>(
    operation: () => Promise<T>,
    maxAttempts: number,
    onRetry: (attempt: number) => Promise<void>
): Promise<T> {
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

function textReplace(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean>> {
    const subcommand = interaction.options.getSubcommand();
    const text = interaction.options.getString('text');

    if (!text) return Promise.reject(new Error('Text is required'));

    if (subcommand === 'aesthetic') {
        return interaction.reply({
            content: text
                .replace(/ /g, '　')
                .replace(/a/g, 'ａ')
                .replace(/b/g, 'ｂ')
                .replace(/c/g, 'ｃ')
                .replace(/d/g, 'ｄ')
                .replace(/e/g, 'ｅ')
                .replace(/f/g, 'ｆ')
                .replace(/g/g, 'ｇ')
                .replace(/h/g, 'ｈ')
                .replace(/i/g, 'ｉ')
                .replace(/j/g, 'ｊ')
                .replace(/k/g, 'ｋ')
                .replace(/l/g, 'ｌ')
                .replace(/m/g, 'ｍ')
                .replace(/n/g, 'ｎ')
                .replace(/o/g, 'ｏ')
                .replace(/p/g, 'ｐ')
                .replace(/q/g, 'ｑ')
                .replace(/r/g, 'ｒ')
                .replace(/s/g, 'ｓ')
                .replace(/t/g, 'ｔ')
                .replace(/u/g, 'ｕ')
                .replace(/v/g, 'ｖ')
                .replace(/w/g, 'ｗ')
                .replace(/x/g, 'ｘ')
                .replace(/y/g, 'ｙ')
                .replace(/z/g, 'ｚ')
                .replace(/A/g, 'Ａ')
                .replace(/B/g, 'Ｂ')
                .replace(/C/g, 'Ｃ')
                .replace(/D/g, 'Ｄ')
                .replace(/E/g, 'Ｅ')
                .replace(/F/g, 'Ｆ')
                .replace(/G/g, 'Ｇ')
                .replace(/H/g, 'Ｈ')
                .replace(/I/g, 'Ｉ')
                .replace(/J/g, 'Ｊ')
                .replace(/K/g, 'Ｋ')
                .replace(/L/g, 'Ｌ')
                .replace(/M/g, 'Ｍ')
                .replace(/N/g, 'Ｎ')
                .replace(/O/g, 'Ｏ')
                .replace(/P/g, 'Ｐ')
                .replace(/Q/g, 'Ｑ')
                .replace(/R/g, 'Ｒ')
                .replace(/S/g, 'Ｓ')
                .replace(/T/g, 'Ｔ')
                .replace(/U/g, 'Ｕ')
                .replace(/V/g, 'Ｖ')
                .replace(/W/g, 'Ｗ')
                .replace(/X/g, 'Ｘ')
                .replace(/Y/g, 'Ｙ')
                .replace(/Z/g, 'Ｚ')
        });
    }
    if (subcommand === 'upside-down') {
        return interaction.reply({
            content: text
                .split('')
                .reverse()
                .join('')
                .replace(/a/g, 'ɐ')
                .replace(/b/g, 'q')
                .replace(/c/g, 'ɔ')
                .replace(/e/g, 'ǝ')
                .replace(/f/g, 'ɟ')
                .replace(/g/g, 'ƃ')
                .replace(/h/g, 'ɥ')
                .replace(/i/g, 'ᴉ')
                .replace(/j/g, 'ɾ')
                .replace(/k/g, 'ʞ')
                .replace(/m/g, 'ɯ')
                .replace(/p/g, 'd')
                .replace(/q/g, 'b')
                .replace(/r/g, 'ɹ')
                .replace(/t/g, 'ʇ')
                .replace(/u/g, '⋳')
                .replace(/n/g, 'u')
                .replace(/⋳/g, 'n')
                .replace(/v/g, 'ʌ')
                .replace(/w/g, 'ʍ')
                .replace(/y/g, 'ʎ')
                .replace(/A/g, '∀')
                .replace(/B/g, 'q')
                .replace(/C/g, 'Ɔ')
                .replace(/D/g, 'p')
                .replace(/d/g, 'p')
                .replace(/E/g, 'Ǝ')
                .replace(/F/g, 'Ⅎ')
                .replace(/G/g, 'פ')
                .replace(/J/g, 'ſ')
                .replace(/K/g, 'ʞ')
                .replace(/L/g, '˥')
                .replace(/M/g, 'W')
                .replace(/P/g, 'Ԁ')
                .replace(/R/g, 'ɹ')
                .replace(/T/g, '┴')
                .replace(/U/g, '∩')
                .replace(/V/g, 'Λ')
                .replace(/W/g, 'M')
                .replace(/Y/g, '⅄')
        });
    }
    if (subcommand === 'uwu') {
        return interaction.reply({
            content: text
                .replace(/(?:r|l)/g, 'w')
                .replace(/(?:R|L)/g, 'W')
                .replace(/n([aeiou])/g, 'ny$1')
                .replace(/N([aeiou])/g, 'Ny$1')
                .replace(/N([AEIOU])/g, 'Ny$1')
                .replace(/ove/g, 'uv')
                .replace(/th/g, 'd')
                .replace(/Th/g, 'D')
                .replace(/TH/g, 'D')
                .replace(/ove/g, 'uv')
        });
    }
    if (subcommand === 'mock') {
        return interaction.reply({
            content: text
                .split('')
                .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                .join('')
        });
    }
    if (subcommand === 'clap') {
        return interaction.reply({ content: text.replace(/ /g, '👏') });
    }

    return interaction.reply({ content: text });
}

function truthDare(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean>> {
    const truths: string[] = [
        "What's the most embarrassing thing that's ever happened to you?",
        'Have you ever lied to get out of trouble?',
        "What's your biggest fear?",
        "What's the worst gift you've ever received?",
        "What's the most childish thing you still do?",
        "What's a secret you've never told anyone?",
        "What's the worst thing you've ever done?",
        "What's the most embarrassing thing in your room?",
        "What's the most awkward date you've been on?",
        "What's the most trouble you've gotten into at school?",
        "What's the worst thing you've ever said to someone?",
        "What's the most embarrassing nickname you've had?",
        "What's the most embarrassing thing you've done in public?",
        "What's the weirdest thing you've ever eaten?",
        "What's the most embarrassing thing you've worn?",
        "What's the most embarrassing thing you've done for a dare?",
        "What's the most embarrassing thing you've done in front of a crush?",
        'Have you ever stolen something?',
        'Have you ever cheated on a test?',
        "Have you ever told a secret you weren't supposed to share?",
        "What's the most annoying habit you have?",
        'Who was your first crush?',
        "What's the weirdest thing you've ever Googled?",
        "What's your most irrational fear?",
        "What's the worst haircut you've ever had?",
        'Have you ever been caught lying?',
        "What's the most embarrassing text you've sent?",
        'Have you ever accidentally sent a text to the wrong person?',
        'Have you ever peed in a pool?',
        "What's the most embarrassing thing your parents have caught you doing?",
        'Have you ever blamed someone else for something you did?',
        'Have you ever pretended to be sick to skip school/work?',
        "What's your most embarrassing social media post?",
        "What's the most trouble you've gotten into at home?",
        'Have you ever been caught talking to yourself?',
        "What's the weirdest dream you've ever had?",
        "What's the most ridiculous lie you've ever told?",
        "Have you ever laughed at a joke you didn't understand?",
        'Have you ever cried during a movie?',
        "What's the weirdest rumor you've heard about yourself?",
        "What's your guilty pleasure TV show or movie?",
        'Have you ever lied to a friend?',
        "What's the most disgusting food you've ever tried?",
        "What's your most embarrassing talent?",
        "What's the worst thing you've done to get someone's attention?",
        'Have you ever had an imaginary friend?',
        'Have you ever been caught singing in the shower?',
        "What's the weirdest thing you collect?",
        "What's the most awkward text you've received?",
        'Who do you have a secret crush on?',
        "What's the most embarrassing thing you've done in a relationship?",
        "What's a lie you regret telling?",
        'Have you ever had a wardrobe malfunction?',
        'Have you ever told a crush you liked them and been rejected?',
        'Have you ever done something silly to impress someone?',
        "What's a memory you wish you could erase?",
        'Have you ever been caught eavesdropping?',
        "What's the silliest thing you've been upset about?",
        "What's the most awkward conversation you've had?",
        'Have you ever accidentally insulted someone?',
        "What's a talent you wish you had?",
        'Have you ever been scared of the dark?',
        "What's your most embarrassing habit?",
        "What's the worst grade you've ever gotten?",
        'Have you ever been caught lying to your parents?',
        'Have you ever broken something and blamed someone else?',
        "What's the most childish thing you’ve done recently?",
        "Who's your least favorite teacher and why?",
        "What's the most embarrassing photo of you that exists?",
        "What's the longest you've gone without showering?",
        'Have you ever had a crush on a teacher?',
        'Have you ever been caught sleeping in class?',
        'Have you ever skipped school or work?',
        "What's the dumbest thing you've ever argued about?",
        'Have you ever made a prank call?',
        "What's your weirdest phobia?",
        'Have you ever walked into something while texting?',
        "What's the weirdest thing you've done alone?",
        'Have you ever been caught dancing when you thought no one was watching?',
        "What's the most awkward compliment you've received?",
        "What's the most awkward thing you've said on a first date?",
        'Have you ever lied to make yourself sound cooler?',
        "What's the worst thing you've done to a sibling?",
        'Have you ever ruined a surprise party?',
        "What's the most useless skill you have?",
        "Have you ever been scared of a kid's movie?",
        "What's the weirdest superstition you believe in?",
        'Have you ever eaten something off the floor?',
        "What's the most expensive thing you've broken?",
        'Have you ever been caught faking an accent?',
        "What's the most awkward thing you've done at work/school?",
        'Have you ever been mistaken for someone else?',
        "What's the worst advice you've ever given?",
        "What's the longest you've gone without brushing your teeth?",
        "What's the most ridiculous thing you've cried about?",
        'Have you ever walked in on someone accidentally?',
        'Have you ever been caught sneaking out?',
        "What's the worst lie you've told to get out of a date?",
        "What's the worst excuse you've used to cancel plans?",
        "What's the most embarrassing song on your playlist?"
    ];
    const dares: string[] = [
        'Do a handstand for 10 seconds.',
        'Act like a monkey until your next turn.',
        'Sing everything you say for the next 10 minutes.',
        'Do 20 pushups.',
        'Do 20 situps.',
        'Dance without music for 2 minutes.',
        'Call someone and sing "Happy Birthday" to them.',
        'Post an embarrassing photo on social media.',
        'Let someone tickle you for 30 seconds.',
        'Wear your socks on your hands for the next 5 minutes.',
        'Talk in an accent for the next 10 minutes.',
        'Try to lick your elbow.',
        'Act like a chicken for 1 minute.',
        'Do your best impression of someone in the room.',
        'Balance a spoon on your nose for 1 minute.',
        'Eat a spoonful of mustard.',
        'Spin around 10 times and try to walk in a straight line.',
        'Hold your breath for 20 seconds.',
        'Do a cartwheel (or attempt one).',
        'Draw a mustache on your face with a marker.',
        'Let someone write something on your forehead.',
        'Wear your clothes backward for the next 10 minutes.',
        'Speak without using your lips for 2 minutes.',
        'Do 15 jumping jacks.',
        'Eat a piece of food without using your hands.',
        'Try to juggle 3 objects.',
        "Pretend you're a cat for 5 minutes.",
        'Wear a silly hat for the next 3 rounds.',
        'Let someone redo your hairstyle.',
        'Try to do the splits.',
        'Write your name with your toes.',
        'Talk like a baby for the next 5 minutes.',
        'Take a selfie making a funny face.',
        'Walk backward everywhere for the next 3 minutes.',
        'Gargle a song for everyone to guess.',
        "Pretend to be a waiter and take everyone's “order.”",
        'Do 10 squats while holding an object on your head.',
        'Let someone tickle you for 20 seconds.',
        'Do your best evil laugh.',
        'Hold a plank position for 30 seconds.',
        'Wear sunglasses for the next 3 rounds.',
        'Pretend to be an alien and communicate without words.',
        'Do your best animal impression.',
        'Eat something blindfolded and guess what it is.',
        'Try to drink a glass of water while upside down.',
        'Speak in rhymes until your next turn.',
        "Pretend you're an old person for 2 minutes.",
        "Draw a funny picture on someone's arm.",
        'Do your best impression of a celebrity.',
        'Let someone else redo your hairstyle.',
        'Act out a scene from your favorite movie.',
        "Pretend you're invisible and narrate what's happening.",
        'Wear a piece of toilet paper like a scarf.',
        'Make a tower of objects and keep it balanced.',
        'Balance a book on your head while walking.',
        'Eat a raw onion slice.',
        'Read the next sentence you say in a robot voice.',
        'Call someone and ask them a random question.',
        'Spin around and try to point at something specific.',
        "Pretend you're a superhero.",
        'Say the alphabet backward.',
        'Hold ice in your hand until your next turn.',
        "Wear someone else's shoes until the next round.",
        'Do your best fake cry.',
        "Pretend you're a mime for the next 2 minutes.",
        'Eat a spoonful of hot sauce.',
        'Speak only in questions until your next turn.',
        'Wear socks on your hands for the next 5 minutes.',
        "Pretend you're swimming on the floor.",
        'Let someone draw something on your face.',
        'Sing a random song out loud.',
        'Attempt to balance on one leg for 30 seconds.',
        'Eat something spicy without water.',
        'Act like a baby for 2 minutes.',
        'Draw a mustache on your face.',
        'Wear underwear on your head until your next turn.',
        'Hop on one foot for 2 minutes.',
        "Pretend you're a ghost and scare someone.",
        'Stack as many items as you can on your head.',
        'Dance to a random song for 1 minute.',
        'Try to hula hoop (use an imaginary one if needed).',
        'Brush your teeth in front of everyone without water.',
        'Do your best belly dance.',
        'Recite a tongue twister five times fast.',
        'Pretend to be a statue for 1 minute.',
        'Run in place for 2 minutes.',
        'Pretend to take a phone call and act it out.',
        'Make an animal noise every time you laugh.',
        'Draw something blindfolded and guess what it is.',
        'Swap seats with someone until the next round.',
        "Pretend you're an announcer and narrate the game.",
        'Speak in a whisper until your next turn.',
        "Put on a silly outfit using what's available.",
        'Pretend to take an imaginary selfie.',
        'Hop like a frog for 1 minute.',
        'Do 20 arm circles.',
        'Close your eyes and spin in a circle for 10 seconds.',
        'Take a sip of water without using your hands.',
        'Do a runway walk around the room.',
        "Pretend you're a teacher and “lecture” the group.",
        'Do a handstand for 10 seconds.',
        'Act like a monkey until your next turn.',
        'Sing everything you say for the next 10 minutes.',
        'Do 20 pushups',
        'Do 20 situps'
    ];

    return interaction.reply({
        components: [
            new GargoyleContainerBuilder(
                `Truth or dare?\n**Truth :** ${truths[Math.floor(Math.random() * truths.length)]}\n**Dare :** ${
                    dares[Math.floor(Math.random() * dares.length)]
                }`
            )
        ],
        flags: [MessageFlags.IsComponentsV2]
    });
}

function eightBall(interaction: ChatInputCommandInteraction): Promise<InteractionResponse<boolean>> {
    const responses: string[] = [
        'It is certain.',
        'It is decidedly so.',
        'Without a doubt.',
        'Yes-definitely.',
        'You may rely on it.',
        'As I see it, yes.',
        'Most likely.',
        'Outlook is good.',
        'Yes.',
        'Signs point to yes.',
        'Reply hazy, try again.',
        'Ask again later.',
        'Better not tell you now.',
        'Cannot predict now.',
        'Concentrate and ask again.',
        "Don't count on it.",
        'My reply is no.',
        'My sources say no.',
        'Outlook is not so good.',
        'Very doubtful.'
    ];

    return interaction.reply({
        content: `-# ${interaction.options.getString('question', true)}\n${responses[Math.floor(Math.random() * responses.length)]} `,
        allowedMentions: { parse: [] }
    });
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
