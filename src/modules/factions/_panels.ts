import {
    ActionRowBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageActionRowComponentBuilder,
    MessageCreateOptions,
    MessageFlags,
    TextDisplayBuilder
} from 'discord.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleButtonBuilder from '@src/system/backend/builders/gargoyleButtonBuilder.js';
import { FactionRow } from './_db.js';
import { MAX_QUESTIONS } from './_types.js';

export function questionsPanel(module: GargoyleModule, faction: FactionRow): MessageCreateOptions {
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`# Application Questions — ${faction.name}\n> ${faction.questions.length}/${MAX_QUESTIONS} questions`)
    );

    faction.questions.forEach((question, index) => {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${index + 1}. ${question.label}**\n> ${question.placeholder}`));
        container.addActionRowComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleButtonBuilder(module, 'qedit', String(faction.id), String(index)).setLabel('Edit').setStyle(ButtonStyle.Secondary),
                new GargoyleButtonBuilder(module, 'qdel', String(faction.id), String(index)).setLabel('Delete').setStyle(ButtonStyle.Danger),
                new GargoyleButtonBuilder(module, 'qmove', String(faction.id), String(index), 'up')
                    .setLabel('Up')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(index === 0),
                new GargoyleButtonBuilder(module, 'qmove', String(faction.id), String(index), 'down')
                    .setLabel('Down')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(index === faction.questions.length - 1)
            )
        );
    });

    container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new GargoyleButtonBuilder(module, 'qadd', String(faction.id))
                .setLabel('Add Question')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(faction.questions.length >= MAX_QUESTIONS)
        )
    );

    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
