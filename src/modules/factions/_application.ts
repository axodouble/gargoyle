import {
    ActionRowBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    GuildMember,
    MessageActionRowComponentBuilder,
    MessageEditOptions,
    MessageFlags,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction,
    PrivateThreadChannel,
    PublicThreadChannel,
    TextInputBuilder,
    TextInputStyle,
    TextChannel,
    ThreadChannel
} from 'discord.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleButtonBuilder from '@src/system/backend/builders/gargoyleButtonBuilder.js';
import GargoyleModalBuilder from '@src/system/backend/builders/gargoyleModalBuilder.js';
import { GUILD_ID, QUESTIONS_PER_PAGE } from './_types.js';
import {
    createApplication,
    FactionRow,
    getActiveBlacklist,
    getApplication,
    getCooldownDuration,
    getCooldownEnd,
    getFaction,
    getPendingApplication,
    setCooldown,
    updateApplication
} from './_db.js';
import { ApplicationAnswer } from '@src/system/backend/database/schema.js';
import { applicationThreadMessage } from './_panels.js';
import { isLeaderOfFactionOrAdmin } from './_permissions.js';

export async function validateApplication(client: GargoyleClient, member: GuildMember, faction: FactionRow): Promise<string | null> {
    const blacklist = await getActiveBlacklist(client, GUILD_ID, member.id, faction.id);
    if (blacklist) {
        const expiry = blacklist.expires_at ? ` until <t:${Math.floor(new Date(blacklist.expires_at).getTime() / 1000)}:F>` : ' permanently';
        return `You are blacklisted from applying to **${faction.name}**${expiry}.`;
    }

    const cooldownEnd = await getCooldownEnd(client, GUILD_ID, member.id);
    if (cooldownEnd) {
        return `You are on a cooldown from applying. You can apply again <t:${Math.floor(cooldownEnd.getTime() / 1000)}:R>.`;
    }

    const pending = await getPendingApplication(client, GUILD_ID, member.id, faction.id);
    if (pending) {
        return `You already have a pending application to **${faction.name}**${pending.thread_id ? `: <#${pending.thread_id}>` : ''}.`;
    }

    return null;
}

const DRAFT_TTL_MS = 15 * 60 * 1000;

const drafts = new Map<string, { answers: ApplicationAnswer[]; questionCount: number; expires: number }>();

function draftKey(userId: string, factionId: number): string {
    return `${userId}:${factionId}`;
}

function applyModal(module: GargoyleModule, faction: FactionRow, page: number) {
    const start = page * QUESTIONS_PER_PAGE;
    return new GargoyleModalBuilder(module, 'apply', String(faction.id), String(page))
        .setTitle(`Apply to ${faction.name} (${page + 1})`.slice(0, 45))
        .setComponents(
            faction.questions
                .slice(start, start + QUESTIONS_PER_PAGE)
                .map((question, index) =>
                    new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                        new TextInputBuilder()
                            .setLabel(question.label.slice(0, 45))
                            .setCustomId(`q${index}`)
                            .setStyle(TextInputStyle.Paragraph)
                            .setPlaceholder(question.placeholder)
                    )
                )
        );
}

export async function handleApplyButton(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ButtonInteraction,
    factionIdArg: string
): Promise<void> {
    const faction = await getFaction(client, parseInt(factionIdArg, 10));
    if (!faction || faction.guild_id !== GUILD_ID || !faction.enabled) {
        await interaction.reply({ content: 'This application is not available.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    if (faction.questions.length === 0) {
        await interaction.reply({
            content: 'This faction has no application questions set up yet. Please try again later.',
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }
    const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
        await interaction.reply({ content: 'You must be a member of the server to apply.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const error = await validateApplication(client, member, faction);
    if (error) {
        await interaction.reply({ content: error, flags: [MessageFlags.Ephemeral] });
        return;
    }
    await interaction.showModal(applyModal(module, faction, 0)).catch((err) => client.logger.error(`Failed to show application modal: ${err}`));
}

export async function handleApplyNextButton(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ButtonInteraction,
    factionIdArg: string,
    pageArg: string
): Promise<void> {
    const faction = await getFaction(client, parseInt(factionIdArg, 10));
    if (!faction || !faction.enabled) {
        await interaction.reply({ content: 'This application is no longer available.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const key = draftKey(interaction.user.id, faction.id);
    const draft = drafts.get(key);
    if (!draft || draft.expires < Date.now() || draft.questionCount !== faction.questions.length) {
        drafts.delete(key);
        await interaction.reply({
            content: 'Your application draft expired or the questions changed. Please apply again.',
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }
    draft.expires = Date.now() + DRAFT_TTL_MS;
    await interaction
        .showModal(applyModal(module, faction, parseInt(pageArg, 10)))
        .catch((err) => client.logger.error(`Failed to show application modal: ${err}`));
}

export async function handleApplyModal(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ModalSubmitInteraction,
    factionIdArg: string,
    pageArg: string
): Promise<void> {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const faction = await getFaction(client, parseInt(factionIdArg, 10));
    if (!faction || !faction.enabled) {
        await interaction.editReply({ content: 'This application is no longer available.' });
        return;
    }
    const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
        await interaction.editReply({ content: 'You must be a member of the server to apply.' });
        return;
    }

    const page = parseInt(pageArg, 10);
    const start = page * QUESTIONS_PER_PAGE;
    const key = draftKey(member.id, faction.id);

    if (page === 0) {
        const error = await validateApplication(client, member, faction);
        if (error) {
            await interaction.editReply({ content: error });
            return;
        }
        drafts.delete(key);
    } else {
        const existing = drafts.get(key);
        if (!existing || existing.expires < Date.now() || existing.questionCount !== faction.questions.length) {
            drafts.delete(key);
            await interaction.editReply({ content: 'Your application draft expired or the questions changed. Please apply again.' });
            return;
        }
        existing.expires = Date.now() + DRAFT_TTL_MS;
    }

    const pageAnswers: ApplicationAnswer[] = faction.questions.slice(start, start + QUESTIONS_PER_PAGE).map((question, index) => ({
        label: question.label,
        value: interaction.fields.getTextInputValue(`q${index}`)
    }));

    const draft = drafts.get(key);
    if (draft) {
        draft.answers.push(...pageAnswers);
    } else {
        drafts.set(key, { answers: pageAnswers, questionCount: faction.questions.length, expires: Date.now() + DRAFT_TTL_MS });
    }

    const nextStart = start + QUESTIONS_PER_PAGE;
    if (nextStart < faction.questions.length) {
        await interaction.editReply({
            content: `Page ${page + 1} saved. ${faction.questions.length - nextStart} questions remaining.`,
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    new GargoyleButtonBuilder(module, 'applynext', String(faction.id), String(page + 1))
                        .setLabel('Continue')
                        .setStyle(ButtonStyle.Primary)
                )
            ]
        });
        return;
    }

    const answers = drafts.get(key)!.answers;
    drafts.delete(key);

    const error = await validateApplication(client, member, faction);
    if (error) {
        await interaction.editReply({ content: error });
        return;
    }

    const channel = await client.channels.fetch(faction.application_channel_id).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
        client.logger.error(`Application channel ${faction.application_channel_id} for faction ${faction.id} could not be found.`);
        await interaction.editReply({ content: 'There is a problem with this application channel. Please contact a faction leader.' });
        return;
    }

    let thread: PrivateThreadChannel | PublicThreadChannel<false>;
    try {
        thread = await (channel as TextChannel).threads.create({
            name: member.user.username,
            type: ChannelType.PrivateThread,
            invitable: true,
            autoArchiveDuration: 1440
        });
    } catch (err) {
        client.logger.error(`Failed to create application thread: ${err}`);
        await interaction.editReply({ content: 'Failed to create the application thread. Please try again later.' });
        return;
    }

    const application = await createApplication(client, {
        guild_id: GUILD_ID,
        faction_id: faction.id,
        user_id: member.id,
        answers,
        thread_id: thread.id
    });

    await thread.send(applicationThreadMessage(module, faction, application.id, member.id, answers));

    const duration = await getCooldownDuration(client, GUILD_ID);
    if (duration > 0) {
        await setCooldown(client, GUILD_ID, member.id, new Date(Date.now() + duration), duration);
    }

    await interaction.editReply({ content: `Application submitted! A faction leader has been notified in <#${thread.id}>.` });
}

export async function handleDecisionButton(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ButtonInteraction,
    decision: 'accept' | 'deny',
    applicationIdArg: string
): Promise<void> {
    const application = await getApplication(client, parseInt(applicationIdArg, 10));
    if (!application || application.guild_id !== GUILD_ID) {
        await interaction.reply({ content: 'Application not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const faction = await getFaction(client, application.faction_id);
    if (!faction) {
        await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!(await isLeaderOfFactionOrAdmin(client, interaction.guild!, member, faction.id))) {
        await interaction.reply({ content: 'You need to be a leader of this faction or an administrator.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    if (application.status !== 'pending') {
        await interaction.reply({ content: 'This application has already been decided.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    await interaction
        .showModal(
            new GargoyleModalBuilder(module, decision, String(application.id))
                .setTitle(decision === 'accept' ? 'Reason for Accepting' : 'Reason for Denying')
                .setComponents(
                    new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                        new TextInputBuilder()
                            .setStyle(TextInputStyle.Paragraph)
                            .setCustomId('reason')
                            .setLabel(decision === 'accept' ? 'Reason for Accepting' : 'Reason for Denying')
                            .setPlaceholder('Optional, but recommended.')
                    )
                )
        )
        .catch((err) => client.logger.error(`Failed to show decision modal: ${err}`));
}

export async function handleDecisionModal(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ModalSubmitInteraction,
    decision: 'accept' | 'deny',
    applicationIdArg: string
): Promise<void> {
    await interaction.deferUpdate();

    const application = await getApplication(client, parseInt(applicationIdArg, 10));
    if (!application || application.status !== 'pending') {
        await interaction.followUp({ content: 'This application has already been decided.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const faction = await getFaction(client, application.faction_id);
    if (!faction) {
        await interaction.followUp({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!(await isLeaderOfFactionOrAdmin(client, interaction.guild!, member, faction.id))) {
        await interaction.followUp({
            content: 'You need to be a leader of this faction or an administrator.',
            flags: [MessageFlags.Ephemeral]
        });
        return;
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    const status: 'accepted' | 'denied' = decision === 'accept' ? 'accepted' : 'denied';

    await updateApplication(client, application.id, {
        status,
        decided_at: new Date(),
        decided_by: interaction.user.id,
        reason: reason || null
    });

    if (decision === 'deny') {
        const duration = await getCooldownDuration(client, GUILD_ID);
        if (duration > 0) {
            await setCooldown(client, GUILD_ID, application.user_id, new Date(Date.now() + duration), duration);
        }
    }

    const roleToAdd = decision === 'accept' ? faction.accept_role_id : faction.deny_role_id;
    let roleNote = '';
    if (roleToAdd) {
        const applicant = await interaction.guild!.members.fetch(application.user_id).catch(() => null);
        const role = interaction.guild!.roles.cache.get(roleToAdd);
        if (applicant && role) {
            await applicant.roles.add(role).catch(() => {
                roleNote = `\n-# I could not add the <@&${roleToAdd}> role, please add it manually.`;
            });
        } else {
            roleNote = '\n-# The configured role could not be found, please add it manually.';
        }
    }

    if (application.thread_id) {
        const thread = (await client.channels.fetch(application.thread_id).catch(() => null)) as ThreadChannel | null;
        if (thread) {
            const starterMessage = await thread.fetchStarterMessage().catch(() => null);
            if (starterMessage) {
                await starterMessage
                    .edit(
                        applicationThreadMessage(module, faction, application.id, application.user_id, application.answers, {
                            status,
                            decidedBy: interaction.user.id,
                            reason
                        }) as MessageEditOptions
                    )
                    .catch((err) => client.logger.error(`Failed to update application thread message: ${err}`));
            }
        }
    }

    const applicantUser = await client.users.fetch(application.user_id).catch(() => null);
    if (applicantUser) {
        await applicantUser
            .send(
                `Your application to **${faction.name}** has been ${status === 'accepted' ? 'accepted' : 'denied'} by <@!${interaction.user.id}>.${
                    reason ? `\n> Reason: ${reason}` : ''
                }${status === 'accepted' ? '\n\n> A faction leader will contact you soon.' : ''}`
            )
            .catch(() => {
                client.logger.warning(`Could not DM ${application.user_id} about their ${faction.name} application, they may have DMs disabled.`);
            });
    }

    await interaction.followUp({
        content: `Application ${status === 'accepted' ? 'accepted' : 'denied'}.${roleNote}`,
        flags: [MessageFlags.Ephemeral],
        allowedMentions: { roles: [] }
    });
}

export async function handleThreadMemberButton(
    client: GargoyleClient,
    _module: GargoyleModule,
    interaction: ButtonInteraction,
    add: boolean,
    applicationIdArg: string
): Promise<void> {
    const application = await getApplication(client, parseInt(applicationIdArg, 10));
    if (!application || application.guild_id !== GUILD_ID) {
        await interaction.reply({ content: 'Application not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const faction = await getFaction(client, application.faction_id);
    if (!faction) {
        await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!(await isLeaderOfFactionOrAdmin(client, interaction.guild!, member, faction.id))) {
        await interaction.reply({ content: 'You need to be a leader of this faction or an administrator.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    if (!application.thread_id) {
        await interaction.reply({ content: 'The application thread could not be found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const thread = (await client.channels.fetch(application.thread_id).catch(() => null)) as PrivateThreadChannel | null;
    if (!thread) {
        await interaction.reply({ content: 'The application thread could not be found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    if (add) {
        await thread.members.add(application.user_id).catch(() => {});
        await interaction.reply({ content: `<@!${application.user_id}> has been added to the thread.`, flags: [MessageFlags.Ephemeral] });
    } else {
        await thread.members.remove(application.user_id).catch(() => {});
        await interaction.reply({ content: `<@!${application.user_id}> has been removed from the thread.`, flags: [MessageFlags.Ephemeral] });
    }
}
