import {
    ActionRowBuilder,
    AnySelectMenuInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    MessageFlags,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleModalBuilder from '@src/system/backend/builders/gargoyleModalBuilder.js';
import { MAX_QUESTIONS } from './_types.js';
import { getFaction, getFactionByName, updateFaction } from './_db.js';
import { isLeaderOfFactionOrAdmin } from './_permissions.js';
import { questionsPanel } from './_panels.js';

export async function handleQuestionsCommand(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const faction = await getFactionByName(client, interaction.guildId!, interaction.options.getString('faction', true));
    if (!faction) {
        await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    await interaction.reply({ ...questionsPanel(module, faction), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
}

export async function handleQuestionButton(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ButtonInteraction,
    action: string,
    factionIdArg: string
): Promise<void> {
    const faction = await getFaction(client, parseInt(factionIdArg, 10));
    if (!faction) {
        await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!(await isLeaderOfFactionOrAdmin(client, interaction.guild!, member, faction.id))) {
        await interaction.reply({ content: 'You need to be a leader of this faction or an administrator.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'qadd') {
        if (faction.questions.length >= MAX_QUESTIONS) {
            await interaction.reply({ content: `A faction can have at most ${MAX_QUESTIONS} questions.`, flags: [MessageFlags.Ephemeral] });
            return;
        }
        await interaction.showModal(questionModal(module, 'Add Question', String(faction.id)));
    }
}

export async function handleQuestionSelect(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: AnySelectMenuInteraction,
    action: string,
    factionIdArg: string
): Promise<void> {
    const faction = await getFaction(client, parseInt(factionIdArg, 10));
    if (!faction) {
        await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!(await isLeaderOfFactionOrAdmin(client, interaction.guild!, member, faction.id))) {
        await interaction.reply({ content: 'You need to be a leader of this faction or an administrator.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    const index = parseInt(interaction.values[0], 10);
    if (!faction.questions[index]) {
        await interaction.reply({ content: 'Question not found.', flags: [MessageFlags.Ephemeral] });
        return;
    }

    if (action === 'qedit') {
        await interaction.showModal(questionModal(module, 'Edit Question', String(faction.id), String(index)));
        return;
    }

    if (action !== 'qdel' && action !== 'qmoveup' && action !== 'qmovedown') {
        return;
    }

    await interaction.deferUpdate();
    const questions = [...faction.questions];

    if (action === 'qdel') {
        questions.splice(index, 1);
    } else {
        const target = action === 'qmoveup' ? index - 1 : index + 1;
        if (target < 0 || target >= questions.length) {
            await interaction.editReply({ ...questionsPanel(module, faction), flags: [MessageFlags.IsComponentsV2] });
            return;
        }
        [questions[index], questions[target]] = [questions[target], questions[index]];
    }

    await updateFaction(client, faction.id, { questions });
    await interaction.editReply({ ...questionsPanel(module, { ...faction, questions }), flags: [MessageFlags.IsComponentsV2] });
}

export async function handleQuestionModal(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ModalSubmitInteraction,
    action: string,
    factionIdArg: string,
    indexArg?: string
): Promise<void> {
    await interaction.deferUpdate();
    const faction = await getFaction(client, parseInt(factionIdArg, 10));
    if (!faction) {
        await interaction.editReply({ content: 'Faction not found.' });
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
    const label = interaction.fields.getTextInputValue('label').trim();
    const placeholder = interaction.fields.getTextInputValue('placeholder').trim();
    if (!label) {
        await interaction.editReply({ content: 'The question text cannot be empty.' });
        return;
    }
    if (label.length > 45 || placeholder.length > 100) {
        await interaction.editReply({ content: 'Question text is limited to 45 characters and placeholder to 100 (Discord limits).' });
        return;
    }
    const questions = [...faction.questions];
    if (action === 'qadd') {
        questions.push({ label, placeholder });
    } else {
        questions[parseInt(indexArg!, 10)] = { label, placeholder };
    }
    await updateFaction(client, faction.id, { questions });
    await interaction.editReply({ ...questionsPanel(module, { ...faction, questions }), flags: [MessageFlags.IsComponentsV2] });
}

function questionModal(module: GargoyleModule, title: string, factionId: string, index?: string) {
    return new GargoyleModalBuilder(module, index ? 'qedit' : 'qadd', factionId, ...(index ? [index] : []))
        .setTitle(title)
        .setComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                new TextInputBuilder()
                    .setLabel('Question')
                    .setCustomId('label')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Why do you want to join?')
            ),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                new TextInputBuilder()
                    .setLabel('Placeholder (optional)')
                    .setCustomId('placeholder')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Shown as a hint in the answer box.')
                    .setRequired(false)
            )
        );
}
