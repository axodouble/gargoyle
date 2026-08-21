import {
    ActionRowBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageActionRowComponentBuilder,
    MessageCreateOptions,
    MessageFlags,
    SectionBuilder,
    TextDisplayBuilder,
    User
} from 'discord.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleButtonBuilder from '@src/system/backend/builders/gargoyleButtonBuilder.js';
import { GargoyleStringSelectMenuBuilder } from '@src/system/backend/builders/gargoyleSelectMenuBuilders.js';
import { ApplicationRow, BlacklistRow, FactionRow } from './_db.js';
import { ApplicationAnswer } from '@src/system/backend/database/schema.js';
import { MAX_QUESTIONS } from './_types.js';

export function questionsPanel(module: GargoyleModule, faction: FactionRow): MessageCreateOptions {
    const list = faction.questions.length
        ? faction.questions.map((question, index) => `**${index + 1}. ${question.label}**\n> ${question.placeholder}`).join('\n')
        : '> No questions yet. Add the first one below.';

    const questionOptions = faction.questions.map((question, index) => ({
        label: `${index + 1}. ${question.label}`.slice(0, 100),
        value: String(index),
        ...(question.placeholder ? { description: question.placeholder.slice(0, 100) } : {})
    }));

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# Application Questions — ${faction.name}\n> ${faction.questions.length}/${MAX_QUESTIONS} questions`
            ),
            new TextDisplayBuilder().setContent(list)
        )
        .addActionRowComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleButtonBuilder(module, 'qadd', String(faction.id))
                    .setLabel('Add Question')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(faction.questions.length >= MAX_QUESTIONS)
            ),
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleStringSelectMenuBuilder(module, 'qedit', String(faction.id))
                    .setPlaceholder('Select a question to edit')
                    .setDisabled(faction.questions.length === 0)
                    .setOptions(questionOptions)
            ),
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleStringSelectMenuBuilder(module, 'qdel', String(faction.id))
                    .setPlaceholder('Select a question to delete')
                    .setDisabled(faction.questions.length === 0)
                    .setOptions(questionOptions)
            ),
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleStringSelectMenuBuilder(module, 'qmoveup', String(faction.id))
                    .setPlaceholder('Select a question to move up')
                    .setDisabled(faction.questions.length < 2)
                    .setOptions(questionOptions)
            ),
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleStringSelectMenuBuilder(module, 'qmovedown', String(faction.id))
                    .setPlaceholder('Select a question to move down')
                    .setDisabled(faction.questions.length < 2)
                    .setOptions(questionOptions)
            )
        );

    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

export function applyPanel(module: GargoyleModule, factions: FactionRow[]): MessageCreateOptions {
    const enabled = factions.filter((faction) => faction.enabled);
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            '# Faction Applications\n> Interested in joining a faction? Click one of the buttons below to apply.\n> Please make sure you have read the faction rules before applying.'
        )
    );

    for (const faction of enabled) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${faction.name}**\n> ${faction.description || 'No description.'}`))
                .setButtonAccessory(
                    new GargoyleButtonBuilder(module, 'apply', String(faction.id)).setLabel(`Apply — ${faction.name}`).setStyle(ButtonStyle.Primary)
                )
        );
    }

    if (enabled.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# No applications are currently open. Check back later!'));
    }

    return { components: [container], flags: [MessageFlags.IsComponentsV2] };
}

export function leaderPanel(module: GargoyleModule, factions: FactionRow[]): MessageCreateOptions {
    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            '# Application Management\n> Toggle applications per faction. Disabled factions cannot be applied to, but keep their questions and history.'
        )
    );

    for (const faction of factions) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**${faction.name}** — ${faction.enabled ? '✅ Open' : '⛔ Closed'}\n> ${faction.questions.length} question${
                            faction.questions.length === 1 ? '' : 's'
                        } configured`
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
        new TextDisplayBuilder().setContent(
            '# Blacklist Management\n> Blacklist a user from applying to one faction or all factions. Preset durations: 1d, 7d, 30d or permanent.'
        )
    );

    for (const faction of factions) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${faction.name}**`))
                .setButtonAccessory(
                    new GargoyleButtonBuilder(module, 'blacklist', String(faction.id))
                        .setLabel(`Blacklist from ${faction.name}`.slice(0, 80))
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

export function applicationThreadMessage(
    module: GargoyleModule,
    faction: FactionRow,
    applicationId: number,
    applicantId: string,
    answers: ApplicationAnswer[],
    decision?: { status: 'accepted' | 'denied'; decidedBy: string; reason: string }
): MessageCreateOptions {
    const answerText = answers
        .map((answer) => `**${answer.label}**\n> ${answer.value ? answer.value.replaceAll('\n', '\n> ') : '(no answer)'}`)
        .join('\n\n');

    const components: ContainerBuilder[] = [
        new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### 📋 Application — ${faction.name}\n**Applicant:** <@!${applicantId}>\n-# Notifying <@&${faction.leader_role_id}>`
            )
        ),
        new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Answers\n\n${answerText}`)),
        new ContainerBuilder().addActionRowComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleButtonBuilder(module, 'accept', String(applicationId))
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(Boolean(decision)),
                new GargoyleButtonBuilder(module, 'deny', String(applicationId))
                    .setLabel('Deny')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(Boolean(decision)),
                new GargoyleButtonBuilder(module, 'add', String(applicationId)).setLabel('Add Applicant').setStyle(ButtonStyle.Secondary),
                new GargoyleButtonBuilder(module, 'remove', String(applicationId)).setLabel('Remove Applicant').setStyle(ButtonStyle.Secondary)
            )
        )
    ];

    if (decision) {
        components.push(
            new ContainerBuilder()
                .setAccentColor(decision.status === 'accepted' ? 0x57f287 : 0xed4245)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### ${decision.status === 'accepted' ? '✅ Accepted' : '❌ Denied'} by <@!${decision.decidedBy}>${
                            decision.reason ? `\n> ${decision.reason}` : ''
                        }`
                    )
                )
        );
    }

    return { components, flags: [MessageFlags.IsComponentsV2] };
}

const STATUS_EMOJI: Record<string, string> = { pending: '⏳', accepted: '✅', denied: '❌' };

export function historyPanel(user: User, applications: ApplicationRow[], factions: FactionRow[]): MessageCreateOptions {
    if (applications.length === 0) {
        return {
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# Application History — ${user.username}\n> No applications found.`)
                )
            ],
            flags: [MessageFlags.IsComponentsV2]
        };
    }
    const entries = applications.map((application) => {
        const factionName = factions.find((faction) => faction.id === application.faction_id)?.name ?? `Faction #${application.faction_id}`;
        const emoji = STATUS_EMOJI[application.status] ?? '📄';
        const submitted = `<t:${Math.floor(new Date(application.submitted_at).getTime() / 1000)}:F>`;
        const lines = [`**${emoji} ${factionName}** — ${application.status.toUpperCase()}`, `-# Submitted ${submitted}`];
        if (application.decided_at) {
            const decided = `-# Decided <t:${Math.floor(new Date(application.decided_at).getTime() / 1000)}:F> by <@${
                application.decided_by ?? 'unknown'
            }>`;
            lines.push(decided);
        }
        if (application.reason) {
            lines.push(`> **Reason:** ${application.reason}`);
        }
        if (application.thread_id) {
            lines.push(`> **Discussion:** <#${application.thread_id}>`);
        }
        return lines.join('\n');
    });
    return {
        components: [
            new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# Application History — ${user.username}\n\n${entries.join('\n\n')}`)
            )
        ],
        flags: [MessageFlags.IsComponentsV2]
    };
}

export function blacklistListPanel(scopeName: string, entries: BlacklistRow[], factions: FactionRow[]): MessageCreateOptions {
    if (entries.length === 0) {
        return {
            components: [
                new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`# Blacklist — ${scopeName}\n> No active blacklists.`)
                )
            ],
            flags: [MessageFlags.IsComponentsV2]
        };
    }
    const nameFor = (id: number | null) => (id === null ? 'All factions' : (factions.find((faction) => faction.id === id)?.name ?? `Faction #${id}`));
    const lines = entries.map((entry) => {
        const expiry = entry.expires_at
            ? `expires <t:${Math.floor(new Date(entry.expires_at).getTime() / 1000)}:F> (<t:${Math.floor(new Date(entry.expires_at).getTime() / 1000)}:R>)`
            : 'permanent';
        return `- **<@${entry.user_id}>** — ${nameFor(entry.faction_id)} — ${expiry}${entry.reason ? `\n  > Reason: ${entry.reason}` : ''}`;
    });
    return {
        components: [
            new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Blacklist — ${scopeName}\n${lines.join('\n')}`))
        ],
        flags: [MessageFlags.IsComponentsV2]
    };
}
