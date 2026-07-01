import GargoyleTextCommandBuilder from '@src/system/backend/builders/gargoyleTextCommandBuilder';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule';
import { InteractionContextType, Message, TextChannel } from 'discord.js';

export default class Eval extends GargoyleModule {
    name: string = 'eval';
    category: string = 'utilities';

    public override textCommands: GargoyleTextCommandBuilder[] = [
        new GargoyleTextCommandBuilder()
            .setName('eval')
            .setPrivate(true)
            .setDescription('Evaluates JavaScript code.')
            .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel])
    ];

    public override executeTextCommand(_client: GargoyleClient, message: Message) {
        if (message.author.id !== '244173330431737866') return;
        const code = message.content.split(' ').slice(1).join(' ');
        try {
            const result = eval(code);
            (message.channel as TextChannel).send(`\`\`\`js\n${result}\n\`\`\``);
        } catch (error) {
            (message.channel as TextChannel).send(`\`\`\`js\n${error}\n\`\`\``);
        }
    }
}
