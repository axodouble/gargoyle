import GargoyleTextCommandBuilder from '@builders/gargoyleTextCommandBuilder.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import { ApplicationIntegrationType, ChatInputCommandInteraction, InteractionContextType, Message } from 'discord.js';
import ChattoCommandBuilder from '@src/system/backend/builders/chattoCommandBuilder';
import { Message as CMessage } from 'chatto.ts';
export default class Ping extends GargoyleModule {
    public override name: string = 'ping';
    public override category: string = 'utilities';
    public override slashCommands = [
        new GargoyleSlashCommandBuilder()
            .setName('ping')
            .setDescription('Replies with Pong!')
            .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
    ];
    public override textCommands = [
        new GargoyleTextCommandBuilder()
            .setName('ping')
            .setDescription('Replies with Pong!')
            .addAlias('p')
            .setContexts([InteractionContextType.Guild, InteractionContextType.BotDM])
    ];
    public override chattoCommands: ChattoCommandBuilder[] = [
        new ChattoCommandBuilder().setName('ping').setDescription('Replies with Pong!').addAlias('p')
    ];

    public override async executeSlashCommand(_client: GargoyleClient, interaction: ChatInputCommandInteraction) {
        const time = Date.now();
        await interaction.reply('Ping...');
        await interaction.editReply(`Pong! API latency is ${Date.now() - time}ms.`);
    }

    public override async executeTextCommand(_client: GargoyleClient, message: Message) {
        const time = Date.now();
        const msg = await message.reply('Ping...');
        msg.edit(`Pong! API latency is ${Date.now() - time}ms.`);
    }

    public override async executeChattoCommand(_client: GargoyleClient, message: CMessage, ..._args: string[]): Promise<void> {
        const time = Date.now();
        const msg = await message.reply('Ping...');
        msg.edit(`Pong! API latency is ${Date.now() - time}ms.`);
    }
}
