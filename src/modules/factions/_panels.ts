import {
    ActionRowBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageActionRowComponentBuilder,
    MessageCreateOptions,
    MessageFlags,
    SectionBuilder,
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

export function applyPanel(module: GargoyleModule, factions: FactionRow[]): MessageCreateOptions {
    const enabled = factions.filter((faction) => faction.enabled);
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            '# Faction Applications\n> Click a faction below to apply. Make sure you have read the faction rules before applying.'
        )
    );

    for (const faction of enabled) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${faction.name}\n> ${faction.description || 'No description.'}`))
                .setButtonAccessory(
                    new GargoyleButtonBuilder(module, 'apply', String(faction.id)).setLabel(faction.name).setStyle(ButtonStyle.Primary)
                )
        );
    }

    if (enabled.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# No applications are currently open.'));
    }

    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

export function leaderPanel(module: GargoyleModule, factions: FactionRow[]): MessageCreateOptions {
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# Faction Application Management\n> Enable or disable individual applications.')
    );

    for (const faction of factions) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ${faction.name}\n> ${faction.enabled ? '✅ Applications enabled' : '⛔ Applications disabled'}`
                    )
                )
                .setButtonAccessory(
                    new GargoyleButtonBuilder(module, 'toggle', String(faction.id))
                        .setLabel(faction.enabled ? 'Disable' : 'Enable')
                        .setStyle(faction.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
                )
        );
    }

    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

export function blacklistPanel(module: GargoyleModule, factions: FactionRow[]): MessageCreateOptions {
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# Faction Blacklists\n> Blacklist users from applying to a specific faction or all factions.')
    );

    for (const faction of factions) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${faction.name}`))
                .setButtonAccessory(
                    new GargoyleButtonBuilder(module, 'blacklist', String(faction.id))
                        .setLabel(`Blacklist from ${faction.name}`)
                        .setStyle(ButtonStyle.Danger)
                )
        );
    }

    container.addActionRowComponents(
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new GargoyleButtonBuilder(module, 'blacklist', 'all').setLabel('Blacklist from All Factions').setStyle(ButtonStyle.Danger)
        )
    );

    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}
