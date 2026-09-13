import {
    ActionRowBuilder,
    AnySelectMenuInteraction,
    ButtonInteraction,
    Channel,
    ChatInputCommandInteraction,
    ContainerBuilder,
    Guild,
    MessageActionRowComponentBuilder,
    MessageFlags,
    ModalActionRowComponentBuilder,
    ModalSubmitInteraction,
    TextChannel,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleModalBuilder from '@src/system/backend/builders/gargoyleModalBuilder.js';
import { GargoyleStringSelectMenuBuilder } from '@src/system/backend/builders/gargoyleSelectMenuBuilders.js';
import {
    deleteFactionPanel,
    getFactionPanel,
    listFactions,
    listFactionPanels,
    updateFactionPanelEmbed,
    type FactionPanelRow,
    type FactionRow
} from './_db.js';
import { PanelEmbed } from '@src/system/backend/database/schema.js';
import { isFactionLeaderOrAdmin } from './_permissions.js';
import { applyPanel, panelEmbedPanel } from './_panels.js';
import { GUILD_ID } from './_types.js';

type EmbedFieldAction = 'embtitle' | 'embdesc' | 'embthumb' | 'embcolor';

const EMBED_COLOR_PATTERN = /^#?([0-9a-f]{6})$/i;

const FIELD_CONFIG: Record<EmbedFieldAction, { label: string; style: TextInputStyle; maxLength: number; placeholder: string }> = {
    embtitle: { label: 'Title', style: TextInputStyle.Paragraph, maxLength: 256, placeholder: 'Faction Applications' },
    embdesc: { label: 'Description', style: TextInputStyle.Paragraph, maxLength: 4000, placeholder: 'Write the requirements here...' },
    embthumb: { label: 'Thumbnail URL', style: TextInputStyle.Paragraph, maxLength: 500, placeholder: 'https://example.com/image.png' },
    embcolor: { label: 'Color', style: TextInputStyle.Short, maxLength: 7, placeholder: '#57f287' }
};

async function channelName(client: GargoyleClient, channelId: string): Promise<string> {
    const channel = (await client.channels.fetch(channelId).catch(() => null)) as Channel | null;
    return channel && (channel as TextChannel).name ? (channel as TextChannel).name : channelId;
}

async function assertPanelAccess(
    client: GargoyleClient,
    interaction: { user: { id: string }; guild: Guild | null },
    panelIdArg: string
): Promise<{ panel: FactionPanelRow } | { error: string }> {
    const panel = await getFactionPanel(client, parseInt(panelIdArg, 10));
    if (!panel || panel.guild_id !== GUILD_ID) {
        return { error: 'Panel not found.' };
    }
    if (!interaction.guild) {
        return { error: 'This can only be used in a guild.' };
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!(await isFactionLeaderOrAdmin(client, interaction.guild, member))) {
        return { error: 'You need to be a faction leader or an administrator to do that.' };
    }
    return { panel };
}

export async function handlePanelEmbedCommand(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ChatInputCommandInteraction
): Promise<void> {
    const panels = await listFactionPanels(client, GUILD_ID);
    if (panels.length === 0) {
        await interaction.reply({ content: 'No application panels exist yet. Send one with /faction panel first.', flags: [MessageFlags.Ephemeral] });
        return;
    }
    const visiblePanels = panels.slice(0, 25);
    const options = await Promise.all(
        visiblePanels.map(async (panel) => ({
            label: `Panel in ${await channelName(client, panel.channel_id)}`.slice(0, 100),
            value: String(panel.id)
        }))
    );
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                '# Application Panel Embeds\n> Select an application panel to configure the custom embed shown above it (title, description, thumbnail, color).'
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new GargoyleStringSelectMenuBuilder(module, 'paneledit').setPlaceholder('Select a panel to edit').setOptions(options)
            )
        );
    await interaction.reply({ components: [container], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] });
}

export async function handlePanelEmbedSelect(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: AnySelectMenuInteraction,
    panelIdArg: string
): Promise<void> {
    void panelIdArg;
    const checked = await assertPanelAccess(client, interaction, interaction.values[0]);
    if ('error' in checked) {
        await interaction.update({ content: checked.error, components: [] });
        return;
    }
    const { panel } = checked;
    const name = await channelName(client, panel.channel_id);
    await interaction.update({ ...panelEmbedPanel(module, panel, name), flags: [MessageFlags.IsComponentsV2] });
}

export async function handlePanelEmbedButton(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ButtonInteraction,
    action: string,
    panelIdArg: string
): Promise<void> {
    const checked = await assertPanelAccess(client, interaction, panelIdArg);
    if ('error' in checked) {
        await interaction.reply({ content: checked.error, flags: [MessageFlags.Ephemeral] });
        return;
    }
    const { panel } = checked;

    if (action === 'embclear') {
        await interaction.deferUpdate();
        const cleared = await applyEmbedChange(client, module, panel, null);
        const name = await channelName(client, cleared.channel_id);
        await interaction.editReply({ ...panelEmbedPanel(module, cleared, name), flags: [MessageFlags.IsComponentsV2] });
        return;
    }

    if (action !== 'embtitle' && action !== 'embdesc' && action !== 'embthumb' && action !== 'embcolor') {
        return;
    }
    const config = FIELD_CONFIG[action as EmbedFieldAction];
    await interaction.showModal(
        new GargoyleModalBuilder(module, action, panelIdArg)
            .setTitle(`Edit Embed ${config.label} — <#${panel.channel_id}>`)
            .setComponents(
                new ActionRowBuilder<ModalActionRowComponentBuilder>().setComponents(
                    new TextInputBuilder()
                        .setLabel(`${config.label} (leave empty to clear)`)
                        .setCustomId('value')
                        .setStyle(config.style)
                        .setMaxLength(config.maxLength)
                        .setPlaceholder(config.placeholder)
                        .setRequired(false)
                )
            )
    );
}

export async function handlePanelEmbedModal(
    client: GargoyleClient,
    module: GargoyleModule,
    interaction: ModalSubmitInteraction,
    action: string,
    panelIdArg: string
): Promise<void> {
    await interaction.deferUpdate();
    const checked = await assertPanelAccess(client, interaction, panelIdArg);
    if ('error' in checked) {
        await interaction.editReply({ content: checked.error });
        return;
    }
    const { panel } = checked;
    const raw = interaction.fields.getTextInputValue('value')?.trim() ?? '';

    let next: PanelEmbed | null;
    if (raw === '') {
        const existing = { ...panel.embed };
        if (action === 'embtitle') {
            delete existing.title;
        }
        if (action === 'embdesc') {
            delete existing.description;
        }
        if (action === 'embthumb') {
            delete existing.thumbnail;
        }
        if (action === 'embcolor') {
            delete existing.color;
        }
        next = Object.keys(existing).length > 0 ? existing : null;
    } else if (action === 'embcolor') {
        const match = EMBED_COLOR_PATTERN.exec(raw);
        if (!match) {
            await interaction.editReply({ content: 'Invalid color. Use a hex value like `#57f287`.' });
            return;
        }
        next = { ...panel.embed, color: parseInt(match[1], 16) };
    } else if (action === 'embthumb') {
        let parsed: URL;
        try {
            parsed = new URL(raw);
        } catch {
            await interaction.editReply({ content: 'Invalid thumbnail URL. Provide a full URL starting with `https://`.' });
            return;
        }
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            await interaction.editReply({ content: 'Invalid thumbnail URL. Only `https://` or `http://` URLs are supported.' });
            return;
        }
        next = { ...panel.embed, thumbnail: raw };
    } else if (action === 'embtitle' || action === 'embdesc') {
        next = { ...panel.embed, [action === 'embtitle' ? 'title' : 'description']: raw };
    } else {
        return;
    }

    const cleared = await applyEmbedChange(client, module, panel, next);
    const name = await channelName(client, cleared.channel_id);
    await interaction.editReply({ ...panelEmbedPanel(module, cleared, name), flags: [MessageFlags.IsComponentsV2] });
}

async function applyEmbedChange(
    client: GargoyleClient,
    module: GargoyleModule,
    panel: FactionPanelRow,
    embed: PanelEmbed | null
): Promise<FactionPanelRow> {
    await updateFactionPanelEmbed(client, panel.id, embed);
    const updated: FactionPanelRow = { ...panel, embed };
    try {
        const all = await listFactions(client, GUILD_ID);
        const panelFactions =
            panel.faction_ids.length > 0
                ? panel.faction_ids.map((id) => all.find((faction) => faction.id === id)).filter((faction): faction is FactionRow => Boolean(faction))
                : all;
        const channel = await client.channels.fetch(panel.channel_id);
        if (!channel || !channel.isTextBased()) {
            throw new Error(`Channel ${panel.channel_id} is not text-based`);
        }
        const message = await (channel as TextChannel).messages.fetch(panel.message_id);
        await message.edit(applyPanel(module, panelFactions, embed) as Parameters<typeof message.edit>[0]);
    } catch (err) {
        if ((err as { code?: number }).code === 10008) {
            await deleteFactionPanel(client, panel.id).catch(() => {});
            client.logger.warning(`Faction apply panel message ${panel.message_id} no longer exists, removed from panel list.`);
        } else {
            client.logger.warning(`Failed to refresh faction apply panel ${panel.message_id}: ${err}`);
        }
    }
    return updated;
}
