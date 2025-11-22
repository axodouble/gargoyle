import GargoyleSlashCommandBuilder from "@src/system/backend/builders/gargoyleSlashCommandBuilder.js";
import GargoyleClient from "@src/system/backend/classes/gargoyleClient.js";
import GargoyleModule from "@src/system/backend/classes/gargoyleModule.js";
import { ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { spawn } from "node:child_process";
import { createAudioPlayer, createAudioResource, entersState, joinVoiceChannel, VoiceConnectionStatus, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnection } from "@discordjs/voice";

export default class NoMic extends GargoyleModule {
    public override category: string = 'server';
    private guildlock = new Map<string, {speaking:boolean,idlingSince:Date,connection:VoiceConnection}>();
    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('nomic')
            .setDescription('Speak in voice channels without a microphone')
            .addGuild('750209335841390642')
            .addStringOption((option) =>
                option.setName('text').setDescription('The text to speak').setRequired(true).setMaxLength(200)
            ) as GargoyleSlashCommandBuilder
    ]

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

        if(this.guildlock.has(voiceChannel.guild.id)){
            const guildState = this.guildlock.get(voiceChannel.guild.id)!;
            if(guildState.speaking){
                await interaction.reply({ content: 'The bot is already speaking in this server. Please wait until it is finished.', flags: [MessageFlags.Ephemeral] });
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
}