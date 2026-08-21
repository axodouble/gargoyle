import {
    ActionRowBuilder,
    ButtonInteraction,
    MessageFlags,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleModalBuilder from '@src/system/backend/builders/gargoyleModalBuilder.js';
import { GUILD_ID } from './_types.js';
import { createBlacklist } from './_db.js';
import { isFactionLeaderOrAdmin } from './_permissions.js';

const DURATION_PRESETS: Record<string, number> = {
    '1d': 1,
    '7d': 7,
    '30d': 30
};

export async function handleBlacklistButton(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ButtonInteraction,
    scope: string
): Promise<void> {
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!(await isFactionLeaderOrAdmin(client, interaction.guild!, member))) {
        await interaction.reply({ content: 'You need to be a faction leader or an administrator.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    await interaction
        .showModal(
            new GargoyleModalBuilder(module, 'blacklist', scope)
                .setTitle(scope === 'all' ? 'Blacklist (All Factions)' : 'Blacklist')
                .setComponents(
                    new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                        new TextInputBuilder()
                            .setLabel('User')
                            .setCustomId('user')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('<@user> or user ID')
                    ),
                    new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                        new TextInputBuilder()
                            .setLabel('Duration')
                            .setCustomId('duration')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('1d, 7d, 30d or permanent')
                    ),
                    new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                        new TextInputBuilder()
                            .setLabel('Reason (optional)')
                            .setCustomId('reason')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('Why are they being blacklisted?')
                            .setRequired(false)
                    )
                )
        )
        .catch((err) => client.logger.error(`Failed to show blacklist modal: ${err}`));
}

export async function handleBlacklistModal(
    client: GargoyleClient,
    _module: GargoyleModule,
    interaction: ModalSubmitInteraction,
    scope: string
): Promise<void> {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const member = await interaction.guild!.members.fetch(interaction.user.id);
    if (!(await isFactionLeaderOrAdmin(client, interaction.guild!, member))) {
        await interaction.editReply({ content: 'You need to be a faction leader or an administrator.' });
        return;
    }

    const rawUser = interaction.fields.getTextInputValue('user').trim();
    const mentionPattern = /<@!?(\d+)>/;
    const idPattern = /^\d{17,20}$/;
    const mentionMatch = mentionPattern.exec(rawUser);
    const userId = mentionMatch ? mentionMatch[1] : rawUser;
    if (!idPattern.test(userId)) {
        await interaction.editReply({ content: 'Could not resolve that user. Use a mention or a user ID.' });
        return;
    }

    const durationInput = interaction.fields.getTextInputValue('duration').trim().toLowerCase();
    let expiresAt: Date | null;
    if (durationInput === 'permanent') {
        expiresAt = null;
    } else {
        const days = DURATION_PRESETS[durationInput];
        if (!days) {
            await interaction.editReply({ content: 'Invalid duration. Use 1d, 7d, 30d or permanent.' });
            return;
        }
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    await createBlacklist(client, {
        guild_id: GUILD_ID,
        user_id: userId,
        faction_id: scope === 'all' ? null : parseInt(scope, 10),
        reason: reason || null,
        created_by: interaction.user.id,
        expires_at: expiresAt
    });

    await interaction.editReply({
        content:
            `<@${userId}> has been blacklisted ${scope === 'all' ? 'from all factions' : 'from the faction'}` +
            `${expiresAt ? ` until <t:${Math.floor(expiresAt.getTime() / 1000)}:F>` : ' permanently'}.`
    });
}
