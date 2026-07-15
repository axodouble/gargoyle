import ChattoEvent from '@src/system/backend/classes/chattoEvent';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import { Message } from 'chatto.ts';

export const chattoPrefixes = [`/c:`, ',', `@${process.env.CHATTO_USER?.toLowerCase()} `];

export default class TextCommandHandler extends ChattoEvent {
    public event = 'messageCreate' as const;
    private prefix = chattoPrefixes;

    public async execute(client: GargoyleClient, message: Message): Promise<void> {
        const authorDisplayName = message.author.displayName.toLowerCase();
        const authorUsername = message.author.username.toLowerCase();
        if (
            authorDisplayName.includes('bot') ||
            authorDisplayName.includes(process.env.CHATTO_USER!) ||
            authorUsername.includes('bot') ||
            authorUsername.includes(process.env.CHATTO_USER!)
        )
            return;

        if (!message.content) return;

        for (const p of this.prefix) {
            if (!message.content.toLowerCase().startsWith(p)) continue;

            let commandName = message.content.slice(p.length).split(' ')[0].toLowerCase().trim();

            const command = client.modules.find((command) => {
                return command.chattoCommands.find(
                    (chattoCommand) => chattoCommand.name === commandName || chattoCommand.aliases.includes(commandName)
                );
            });

            if (!command) {
                message
                    .reply(`Hey there! Run ${this.prefix.map((p) => `\`${p}help\``).join(' or ')} to get started with my commands!`)
                    .then((msg) => {
                        setTimeout(() => {
                            msg.delete();
                        }, 15000);
                    });
            } else {
                if (message.content.toLowerCase().startsWith(p)) {
                    Promise.resolve(command.executeChattoCommand(client, message, ...message.content.slice(p.length).trim().split(' '))).catch(
                        (error) => {
                            client.logger.error(`Error executing chatto command ${command.name}: ${error}`);
                        }
                    );
                }

                client.logger.trace(`${message.author.username} used the ${command.name} chatto command.`);
            }
        }
    }
}
