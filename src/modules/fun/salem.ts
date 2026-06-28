import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { ChatInputCommandInteraction, MessageFlags, TextChannel } from 'discord.js';

export default class Salem extends GargoyleModule {
    public override name: string = 'salem';
    public override category: string = 'fun';

    private messageQueue: string[] = [];

    public override slashCommands: GargoyleSlashCommandBuilder[] = [
        new GargoyleSlashCommandBuilder()
            .setName('salem')
            .addGuilds('1475065895742214267')
            .setDescription('Simple salem helper')
            .addSubcommand((s=>s.setName('message').setDescription('Queue a message for Sunrise').addStringOption((o) => o.setName('message').setDescription('Send a salem message').setRequired(true)) ))
            .addSubcommand((s=>s.setName('sunrise').setDescription('Trigger sunrise'))) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.options.getSubcommand(true) === 'message') {
            await interaction.reply({
                content: 'Queueing message',
                flags: MessageFlags.Ephemeral
            });

            this.messageQueue.push(interaction.options.getString('message', true));
        } if (interaction.options.getSubcommand(true) === 'sunrise') {
            await interaction.reply({
                content: "Sending messages"
            })

            for (const message of this.messageQueue){
                await (interaction.channel as TextChannel).send({ content: message, allowedMentions: { parse: [] } })
            }

            this.messageQueue = [];
        }
    }
}
