import {
    ActionRowBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChannelType,
    GuildMember,
    MessageActionRowComponentBuilder,
    MessageFlags,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction,
    PrivateThreadChannel,
    PublicThreadChannel,
    TextInputBuilder,
    TextInputStyle,
    TextChannel
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
    getCooldownDuration,
    getCooldownEnd,
    getFaction,
    getPendingApplication,
    setCooldown
} from './_db.js';
import { ApplicationAnswer } from '@src/system/backend/database/schema.js';
import { applicationThreadMessage } from './_panels.js';

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
