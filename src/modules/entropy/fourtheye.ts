import { GargoyleURLButtonBuilder } from '@src/system/backend/builders/gargoyleButtonBuilder.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { Canvas, loadImage } from 'canvas';
import {
    ChatInputCommandInteraction,
    ContainerBuilder,
    Events,
    Guild,
    Message,
    MessageCreateOptions,
    MessageEditOptions,
    MessageFlags,
    RGBTuple,
    SectionBuilder,
    TextChannel,
    TextDisplayBuilder
} from 'discord.js';
import z from 'zod';

const entropyGuildId = '1009048008857493624';

export default class FourthEye extends GargoyleModule {
    public override name: string = 'fourtheye';
    public override category: string = 'entropy';
    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('fourtheye')
            .setDescription("Use Entropy's Fourth Eye moderation tools")
            .addGuild(entropyGuildId)
            .addSubcommand((subcommand) => subcommand.setName('rules').setDescription('Get the server rules')) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.options.getSubcommand() === 'rules') {
            if (!interaction.guild) {
                interaction.reply({ content: 'This command can only be used in a server.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            const rules = (await this.rulesMessage(interaction.guild)) as MessageCreateOptions;
            (interaction.channel as TextChannel).send(rules);
            await interaction.reply({ content: 'Posted the server rules.', flags: [MessageFlags.Ephemeral] });
            return;
        }
    }

    private async rulesMessage(guild: Guild): Promise<MessageCreateOptions | MessageEditOptions> {
        const container = new ContainerBuilder();

        if (guild.iconURL({ extension: 'png', size: 1024 })) {
            container.setAccentColor(await getAverageColor(guild.iconURL({ extension: 'png', size: 1024 })!));
        }

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# Rules in this Discord` +
                    `\n-# To be followed by all members of ${guild.name}` +
                    `\n## Follow Discord's TOS and Community Guidelines.` +
                    `\n-# [Discord TOS](https://discord.com/terms), [Hateful Conduct](https://discord.com/safety/hateful-conduct-policy-explainer)`
            )
        );

        return {
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        };
    }

    public override events: GargoyleEvent[] = [];
}

async function getAverageColor(imageUrl: string): Promise<RGBTuple> {
    const canvas = new Canvas(1, 1);
    const ctx = canvas.getContext('2d');

    const image = await loadImage(imageUrl);
    ctx.drawImage(image, 0, 0, 1, 1);
    const imageData = ctx.getImageData(0, 0, 1, 1).data;

    const r = imageData[0];
    const g = imageData[1];
    const b = imageData[2];

    return [r, g, b];
}

// @ts-ignore
class FourthEyeClassification extends GargoyleEvent {
    constructor() {
        super();
        this.checkQueue();
    }
    private client: GargoyleClient | null = null;
    public override event = Events.MessageCreate as const;
    /**
     * A queue to store messages for classification
     * Key: Channel ID
     * Value: Message object
     */
    private messageQueue: Message[] = [];
    public override execute(client: GargoyleClient, message: Message): void {
        /**
         * This is a proprietary module and is not fully open source.
         * However, this service is run by Ceraia and does not store any data.
         * It uses the `GPT-OSS:20B` to classify messages to flag a moderator if it believes the message is harmful.
         * This runs only on servers owned by Axodouble, however a similar implementation can be made for other servers upon request.
         */
        this.client = client;
        if (message.author.bot) return;
        if (message.guildId !== entropyGuildId) return; // Only run on Entropy's Server
        this.messageQueue.push(message);
        // // If more than 2000 characters in the queue, check immediately
        // const totalLength = (this.messageQueue.get(message.channel.id) || []).reduce((acc, msg) => acc + msg.content.length, 0);
        // if (totalLength >= 2000) {
        //     this.checkChannel(message.channel.id);
        //     return;
        // }
    }

    private checkQueue(): void {
        // Check every 1 minute
        setInterval(async () => {
            const modChannel = this.getModeratorChannel();
            if (!modChannel) return;

            const messagesResponse = await this.uploadCheck(this.messageQueue);
            for (const messageResponse of messagesResponse || []) {
                if (messageResponse.sentimentAnalysis.category !== FourthEyeCategories.Safe) {
                    const message = this.messageQueue.find((msg) => msg.id === messageResponse.id);
                    if (!message) continue;
                    modChannel.send({
                        components: [
                            new ContainerBuilder()
                                .setAccentColor([255, 0, 0])
                                .addSectionComponents(
                                    new SectionBuilder()
                                        .setButtonAccessory(new GargoyleURLButtonBuilder(message.url).setLabel('Message'))
                                        .addTextDisplayComponents(
                                            new TextDisplayBuilder().setContent(
                                                `:warning: Message by <@${message.author.id}> classified as **${messageResponse.sentimentAnalysis.category}** by Fourth Eye:\n` +
                                                    `> ${message.content.replaceAll('\n', '\n> ')}\n`
                                            )
                                        )
                                )
                        ],
                        flags: [MessageFlags.IsComponentsV2]
                    });
                }
            }

            this.messageQueue = [];
        }, 60000);
    }

    private getModeratorChannel(): TextChannel | null {
        if (!this.client) return null;
        const guild = this.client.guilds.cache.get(entropyGuildId);
        if (!guild) return null;
        if (!guild.systemChannel) return null;
        return guild.systemChannel;
    }

    private async uploadCheck(messages: Message[]): Promise<ClassifyResponse | null> {
        if (messages.length === 0) return [];
        const response = await fetch('https://api.cer.sh/api/v2/ai/classify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Gargoyle: `${process.env.CERSH_API_KEY}`
            },
            body: JSON.stringify({ messages: messages.map((msg) => ({ id: msg.id, content: msg.content })) })
        });

        if (!response.ok) {
            this.client?.logger.error(`FourthEye classification upload failed: ${response.statusText}`);
            return null;
        }

        const responseData = await response.text();
        return classifyResponse.parse(JSON.parse(responseData));
    }
}

enum FourthEyeCategories {
    Error = 'Error',
    Safe = 'Safe',
    Racist = 'Racist',
    Homophobic = 'Homophobic',
    Pornographic = 'Pornographic'
}

const classifyResponse = z.array(
    z.object({
        id: z.string(),
        content: z.string(),
        sentimentAnalysis: z.object({
            category: z.enum(['Error', 'Safe', 'Racist', 'Homophobic', 'Pornographic'])
        })
    })
);

type ClassifyResponse = z.infer<typeof classifyResponse>;
