import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import GargoyleEmbedBuilder from '@builders/gargoyleEmbedBuilder.js';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent.js';
import {
    ChannelType,
    ChatInputCommandInteraction,
    ClientEvents,
    Events,
    GuildMember,
    Message,
    MessageCreateOptions,
    MessageFlags,
    TextBasedChannel,
    TextChannel,
    VoiceChannel
} from 'discord.js';
import { playAudio } from '@src/system/backend/tools/voice.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import { ChattoClient, User as CUser } from 'chatto.ts';
import { sanitizeNameString } from '@src/system/backend/tools/server';

export default class Entropy extends GargoyleModule {
    public override name: string = 'entropy';
    public override category: string = 'entropy';
    public fourthClient: ChattoClient | null = null;

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('bell')
            .addGuild('1009048008857493624')
            .setDescription('For whom the bell tolls')
            .addChannelOption((option) =>
                option
                    .setName('channel')
                    .setDescription('The voice channel to ring the bell in')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildVoice)
            ) as GargoyleSlashCommandBuilder
    ];

    public override executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): void {
        if (interaction.guild?.id !== '1009048008857493624') {
            interaction.reply({ content: 'This command can only be used in the Entropy server.', flags: MessageFlags.Ephemeral });
            return;
        }

        const channel = interaction.options.getChannel('channel') as VoiceChannel;
        if (!channel) {
            interaction.reply({ content: 'Please specify a valid voice channel.', flags: MessageFlags.Ephemeral });
            return;
        }

        playAudio(client, channel, 'bell.mp3');
        interaction.reply({ content: `Ringing the bell in ${channel.name}!`, flags: MessageFlags.Ephemeral });
    }

    public override async init(client: GargoyleClient): Promise<void> {
        if (!process.env.FOURTH_INSTANCE || !process.env.FOURTH_USER || !process.env.FOURTH_PASS) {
            client.logger.warning('No fourth instance registered, not using.');
            return;
        }
        this.fourthClient = await ChattoClient.login({
            baseUrl: process.env.FOURTH_INSTANCE || '',
            login: process.env.FOURTH_USER || '',
            password: process.env.FOURTH_PASS || ''
        });
        this.fourthClient.connect();

        this.fourthClient.on('messageCreate', async (message) => {
            if (message.channel.name.toLowerCase() === 'lounge') {
                if (!message.content || message.content == '') return;
                if (message.author.username.toLowerCase() === 'entropy') return;
                const channel = (await client.channels.fetch('1434726432201773056')) as TextBasedChannel | undefined;
                if (!channel) return;
                sendAsUser({ content: message.content }, channel, message.author);
            }
        });
    }

    public override events = [new RolePrefix(), new LeaveLog(), new ChattoSync(this)];
}

class ChattoSync extends GargoyleEvent {
    public override event: keyof ClientEvents = Events.MessageCreate;
    private module: Entropy;
    constructor(module: Entropy) {
        super();
        this.module = module;
    }

    public override async execute(_client: GargoyleClient, message: Message, ..._args: any[]): Promise<void> {
        if (message.guildId !== '1009048008857493624') return;
        if (message.channel.type === ChannelType.GuildText && message.channel.name.toLowerCase() === 'lounge') {
            if (message.author.bot) return;
            const room = await this.module.fourthClient?.rooms.fetch('R8EH1nmXXADGngG');
            if (!room || message.content == '') return;
            await room.send(`\`${message.author.displayName}\`: ${message.content}`);
        }
    }
}

class RolePrefix extends GargoyleEvent {
    public event = Events.GuildMemberUpdate as const;
    private lastChanged = new Map<string, number>();

    public async execute(_client: GargoyleClient, member: GuildMember): Promise<void> {
        if (member.guild.id !== '1009048008857493624') return;

        if (this.lastChanged.has(member.id) && Date.now() - this.lastChanged.get(member.id)! < 10000) return;

        const updatedMember = await member.fetch(true);
        let namePrefix = '[';

        const roles = updatedMember.roles.cache.sort((a, b) => b.position - a.position);

        roles.forEach((role) => {
            if (role.name === '@everyone') return;
            // If role starts with a single letter and then a space
            if (role.name.match(/^[a-zA-Z0-9] /)) namePrefix += role.name.split('')[0].toUpperCase();
        });

        let username = updatedMember.nickname?.split(' ').slice(1).join(' ') || updatedMember.user.username;

        namePrefix += `] ${username}`;

        updatedMember.setNickname(namePrefix).catch(() => {});
    }
}

class LeaveLog extends GargoyleEvent {
    public event = Events.GuildMemberRemove as const;

    public execute(_client: GargoyleClient, member: GuildMember): void {
        if (member.guild.id !== '1009048008857493624') return;

        const channel = member.guild.systemChannel as TextChannel;
        if (!channel) return;

        channel.send({ embeds: [new GargoyleEmbedBuilder().setDescription(`User ${member.user.tag} (<@!${member.user.id}>) has left the server.`)] });
    }
}

export async function sendAsUser(message: MessageCreateOptions, channel: TextBasedChannel, user: CUser): Promise<Message | null> {
    const target = channel.isThread() ? channel.parent : channel;
    if (!target || target.isDMBased()) return Promise.resolve(null);
    const webhooks = await target.fetchWebhooks();

    let webhook;

    webhook = webhooks.find((webhook) => webhook.owner && webhook.owner.id === target.client.user.id);

    if (!webhook) {
        webhook = await target.createWebhook({
            name: sanitizeNameString(`${user.username} from 4th.group`),
            reason: 'Server Message'
        });
    }

    try {
        return await webhook.send({
            avatarURL: user.avatarUrl,
            username: sanitizeNameString(`${user.username} from 4th.group`),
            threadId: channel.isThread() ? channel.id : undefined,
            ...message
        });
    } catch (err) {
        return null;
    }
}
