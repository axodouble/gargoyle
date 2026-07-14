import ChattoEvent from '@src/system/backend/classes/chattoEvent';
import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import { Message } from 'chatto.ts';

export const chattoPrefixes = [`/c:`, ',']

export default class TextCommandHandler extends ChattoEvent {
    public event = 'messageCreate' as const;
    private mentionPrefix = `@${process.env.CHATTO_USER}`;
    private prefix = chattoPrefixes

    public async execute(client: GargoyleClient, message: Message): Promise<void> {
        if (message.author.displayName.toLowerCase().includes('bot') || message.author.username.toLowerCase().includes('bot')) return;
        if (!message.content) return;

        for (const p of this.prefix) {
            if (!message.content.toLowerCase().startsWith(p) && !message.content.toLowerCase().startsWith(this.mentionPrefix)) continue;

            let commandName = '';
            if (message.content.toLowerCase().startsWith(p)) {
                commandName = message.content.slice(p.length).split(' ')[0].toLowerCase().trim();
            }
            if (message.content.toLowerCase().startsWith(this.mentionPrefix)) {
                commandName = message.content
                    .slice(this.mentionPrefix.length + 1)
                    .split(' ')[0]
                    .toLowerCase()
                    .trim();
            }

            const command = client.modules.find((command) => {
                return command.chattoCommands.find((chattoCommand) => chattoCommand.name === commandName || chattoCommand.aliases.includes(commandName));
            });

            if (!command) {
                message.reply(`Hey there! Run ${this.prefix.map((p) => `\`${p}help\``).join(' or ')} to get started with my commands!`).then((msg) => {
                    setTimeout(() => {
                        msg.delete();
                    }, 15000);
                });
            } else {
                if (message.content.toLowerCase().startsWith(p)) {
                    Promise.resolve(command.executeChattoCommand(client, message, ...message.content.slice(this.prefix.length).trim().split(' '))).catch((error) => {
                        client.logger.error(`Error executing chatto command ${command.name}: ${error}`);
                    });
                }
                if (message.content.toLowerCase().startsWith(this.mentionPrefix)) {
                    Promise.resolve(
                        command.executeChattoCommand(
                            client,
                            message,
                            ...message.content
                                .slice(this.mentionPrefix.length + 1)
                                .trim()
                                .split(' ')
                        )
                    ).catch((error) => {
                        client.logger.error(`Error executing chatto command ${command.name}: ${error}`);
                    });
                }

                client.logger.trace(`${message.author.username} used the ${command.name} chatto command.`);
            }
        }
    }
}
