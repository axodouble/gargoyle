import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';
import GargoyleEvent from '@src/system/backend/classes/gargoyleEvent.js';
import { ButtonInteraction } from 'discord.js';

export default class ButtonCommandHandler extends GargoyleEvent {
    public event = 'interactionCreate' as const;

    public async execute(client: GargoyleClient, interaction: ButtonInteraction): Promise<void> {
        if (!interaction.isButton()) return;
        if (interaction.user.bot) return;

        let origin = '';
        let args: string[] = [];
        if (interaction.customId.toLowerCase().startsWith('cmd')) {
            origin = interaction.customId.toLowerCase().split('-')[1];
            args = interaction.customId.toLowerCase().split('-').slice(2);
        } else if (interaction.customId.toLowerCase().startsWith('gm1')) {
            origin = interaction.customId.toLowerCase().split(':')[1];
            args = interaction.customId.toLowerCase().split(':').slice(2);
        }

        const module = client.modules.find((module) => {
            return (
                module.name.toLowerCase() === origin ||
                module.slashCommands.find((slashCommand) => {
                    return slashCommand.name.toLowerCase() === origin;
                }) ||
                module.textCommands.find((textCommand) => {
                    return textCommand.name.toLowerCase() === origin;
                })
            );
        });

        if (!module) {
            interaction.reply('Button not found!').then((msg) => {
                setTimeout(() => {
                    msg.delete();
                }, 5000);
            });
        } else {
            module.executeButtonCommand(client, interaction, ...args);
            return client.logger.trace(`${interaction.user} used the ${interaction.customId} button command.`);
        }
    }
}
