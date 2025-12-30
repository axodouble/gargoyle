import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import { ChannelType, ChatInputCommandInteraction, Events, GuildBasedChannel, Message, MessageFlags } from 'discord.js';
import { spawn } from 'node:child_process';
import {
    createAudioPlayer,
    createAudioResource,
    entersState,
    joinVoiceChannel,
    VoiceConnectionStatus,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    VoiceConnection
} from '@discordjs/voice';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent.js';

export default class NoMic extends GargoyleModule {
    public override category: string = 'server';
    private guildlock = new Map<string, { speaking: boolean; idlingSince: Date; connection: VoiceConnection }>();
    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('nomic')
            .setDescription('Speak in voice channels without a microphone')
            .addStringOption((option) =>
                option.setName('text').setDescription('The text to speak').setRequired(true).setMaxLength(200)
            ) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.commandName !== 'nomic') return;

        const text = interaction.options.getString('text', true);
        const member = interaction.guild?.members.cache.get(interaction.user.id);
        const voiceChannel = member?.voice.channel;

        client.logger.trace(`Executing NoMic command for user ${interaction.user.tag} (ID: ${interaction.user.id}): "${text}"`);

        if (!voiceChannel) {
            await interaction.reply({ content: 'You must be in a voice channel to use this command.', flags: [MessageFlags.Ephemeral] });
            return;
        }

        if (this.guildlock.has(voiceChannel.guild.id)) {
            const guildState = this.guildlock.get(voiceChannel.guild.id)!;
            if (guildState.speaking) {
                await interaction.reply({
                    content: 'The bot is already speaking in this server. Please wait until it is finished.',
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
            this.guildlock.set(voiceChannel.guild.id, { speaking: true, idlingSince: new Date(), connection });
        } catch (error) {
            connection.destroy();
            this.guildlock.delete(voiceChannel.guild.id);
            await interaction.reply({ content: 'Failed to join the voice channel.', flags: [MessageFlags.Ephemeral] });
            return;
        }

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        });

        const espeak = spawn('espeak-ng', ['-s', '140', '--stdout', `${interaction.user.displayName} says ${text}`]);

        const resource = createAudioResource(espeak.stdout);
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            this.guildlock.set(voiceChannel.guild.id, { speaking: false, idlingSince: new Date(), connection });
        });

        player.on('error', (error) => {
            client.logger.error(error);
            connection.destroy();
            this.guildlock.delete(voiceChannel.guild.id);
        });

        await interaction.reply({ content: `Speaking: "${text}"`, flags: [MessageFlags.Ephemeral] });
    }

    public override init(_client: GargoyleClient): void {
        setInterval(() => {
            const now = new Date();
            for (const [guildId, state] of this.guildlock) {
                if (!state.speaking) {
                    const idleTime = now.getTime() - state.idlingSince.getTime();
                    if (idleTime > 30 * 1000) {
                        state.connection.destroy();
                        this.guildlock.delete(guildId);
                    }
                }
            }
        }, 15 * 1000);
    }

    public override events: GargoyleEvent[] = [new OnVoiceMessageEvent(this.guildlock)];
}

class OnVoiceMessageEvent extends GargoyleEvent {
    private guildLock: Map<string, { speaking: boolean; idlingSince: Date; connection: VoiceConnection }>;
    constructor(guildLock: Map<string, { speaking: boolean; idlingSince: Date; connection: VoiceConnection }>) {
        super();
        this.guildLock = guildLock;
    }
    public override event = Events.MessageCreate as const;
    public override execute(client: GargoyleClient, message: Message): void {
        if (message.author.bot || !message.member || !message.guild) return;
        const member = message.guild.members.cache.get(message.author.id);
        if (!member) return;
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) return;
        if (!((message.channel as GuildBasedChannel).name.toLowerCase().replaceAll('-', '') === 'nomic')) return;

        if (message.content) if (message.channel.type !== ChannelType.GuildText) return;

        if (this.guildLock.has(voiceChannel.guild.id)) {
            const guildState = this.guildLock.get(voiceChannel.guild.id)!;
            if (guildState.speaking) {
                return;
            }
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        entersState(connection, VoiceConnectionStatus.Ready, 30_000)
            .then(() => {
                this.guildLock.set(voiceChannel.guild.id, { speaking: true, idlingSince: new Date(), connection });
            })
            .catch(async (error) => {
                connection.destroy();
                this.guildLock.delete(voiceChannel.guild.id);
                client.logger.error(`Failed to join voice channel: ${error}`);
                return;
            });

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Pause
            }
        });

        const content = message.content
            .substring(0, 200)
            .replaceAll(
                // Replace all links with the text "link"
                /(https?:\/\/[^\s]+)/g,
                'link'
            )
            .replaceAll(
                // Replace mentions with the username
                /<@!?(\d+)>/g,
                (_, userId) => {
                    const user = message.guild?.members.cache.get(userId);
                    return user ? user.displayName : 'someone';
                }
            );

        const espeak = spawn('espeak-ng', ['-s', '140', '--stdout', `${message.member!.displayName} says ${content}`]);

        const resource = createAudioResource(espeak.stdout);
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            message.react('<:checks:1441782360583704617>').catch(() => {});

            this.guildLock.set(voiceChannel.guild.id, { speaking: false, idlingSince: new Date(), connection });
        });

        player.on('error', (error) => {
            client.logger.error(error);
            connection.destroy();
            this.guildLock.delete(voiceChannel.guild.id);
        });
    }
}
