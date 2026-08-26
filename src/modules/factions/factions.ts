import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonInteraction,
    ChannelType,
    ChatInputCommandInteraction,
    ContainerBuilder,
    InteractionContextType,
    MessageActionRowComponentBuilder,
    MessageEditOptions,
    MessageFlags,
    AnySelectMenuInteraction,
    ModalSubmitInteraction,
    TextChannel,
    TextDisplayBuilder,
    PermissionFlagsBits
} from 'discord.js';
import { GargoyleStringSelectMenuBuilder } from '@src/system/backend/builders/gargoyleSelectMenuBuilders.js';
import { GUILD_ID, parseDuration } from './_types.js';
import {
    createFaction,
    createFactionPanel,
    deleteFactionPanel,
    getFaction,
    getFactionByName,
    listActiveBlacklists,
    listApplicationsByUser,
    listFactionPanels,
    listFactions,
    removeBlacklists,
    setCooldownDuration,
    updateFaction,
    type FactionRow
} from './_db.js';
import { isFactionLeaderOrAdmin, isLeaderOfFactionOrAdmin } from './_permissions.js';
import { handleQuestionButton, handleQuestionModal, handleQuestionSelect, handleQuestionsCommand } from './_questions.js';
import { applyPanel, blacklistListPanel, blacklistPanel, historyPanel, leaderPanel } from './_panels.js';
import {
    handleApplyButton,
    handleApplyModal,
    handleApplyNextButton,
    handleDecisionButton,
    handleDecisionModal,
    handleThreadMemberButton
} from './_application.js';
import { handleBlacklistButton, handleBlacklistModal } from './_blacklist.js';

export default class Factions extends GargoyleModule {
    public override name: string = 'factions';
    public override category: string = 'factions';

    public override slashCommands = [
        new GargoyleSlashCommandBuilder()
            .setName('faction')
            .setDescription('Faction application management')
            .setContexts(InteractionContextType.Guild)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
            .addGuild(GUILD_ID)
            .addGuild('622843951329574942')
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('setup')
                    .setDescription('Create a new faction')
                    .addStringOption((option) => option.setName('name').setDescription('Faction name').setRequired(true))
                    .addRoleOption((option) => option.setName('leader-role').setDescription('Role of the faction leaders').setRequired(true))
                    .addChannelOption((option) =>
                        option
                            .setName('channel')
                            .setDescription('Channel where application threads are created')
                            .addChannelTypes(ChannelType.GuildText)
                            .setRequired(true)
                    )
                    .addStringOption((option) => option.setName('description').setDescription('Shown on the apply button').setRequired(false))
                    .addRoleOption((option) => option.setName('accept-role').setDescription('Role given on acceptance').setRequired(false))
                    .addRoleOption((option) => option.setName('deny-role').setDescription('Role given on denial').setRequired(false))
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('edit')
                    .setDescription('Edit an existing faction')
                    .addStringOption((option) => option.setName('faction').setDescription('Faction name').setRequired(true))
                    .addStringOption((option) => option.setName('new-name').setDescription('New faction name').setRequired(false))
                    .addStringOption((option) => option.setName('description').setDescription('Shown on the apply button').setRequired(false))
                    .addBooleanOption((option) =>
                        option.setName('clear-description').setDescription('Remove the faction description').setRequired(false)
                    )
                    .addRoleOption((option) => option.setName('leader-role').setDescription('Role of the faction leaders').setRequired(false))
                    .addChannelOption((option) =>
                        option
                            .setName('channel')
                            .setDescription('Channel where application threads are created')
                            .addChannelTypes(ChannelType.GuildText)
                            .setRequired(false)
                    )
                    .addRoleOption((option) => option.setName('accept-role').setDescription('Role given on acceptance').setRequired(false))
                    .addRoleOption((option) => option.setName('deny-role').setDescription('Role given on denial').setRequired(false))
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('questions')
                    .setDescription('View and edit faction application questions')
                    .addStringOption((option) => option.setName('faction').setDescription('Faction name').setRequired(true))
            )
            .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Send the apply-here panel to this channel'))
            .addSubcommand((subcommand) => subcommand.setName('leader-panel').setDescription('Send the leader management panel to this channel'))
            .addSubcommand((subcommand) => subcommand.setName('blacklist-panel').setDescription('Send the blacklist panel to this channel'))
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('history')
                    .setDescription('View the application history of a user')
                    .addUserOption((option) => option.setName('user').setDescription('The user to look up').setRequired(true))
            )
            .addSubcommandGroup((group) =>
                group
                    .setName('blacklist')
                    .setDescription('Faction blacklist management')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('list')
                            .setDescription('List active blacklists')
                            .addStringOption((option) => option.setName('faction').setDescription('Faction name, or "all"').setRequired(true))
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('remove')
                            .setDescription('Remove a blacklist')
                            .addUserOption((option) => option.setName('user').setDescription('The user to unblacklist').setRequired(true))
                            .addStringOption((option) =>
                                option.setName('faction').setDescription('Faction name, or omit to remove from all factions')
                            )
                    )
            )
            .addSubcommandGroup((group) =>
                group
                    .setName('cooldown')
                    .setDescription('Application cooldown management')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('set')
                            .setDescription('Set the application cooldown duration')
                            .addStringOption((option) => option.setName('duration').setDescription('e.g. 12h, 3d, or 0 to disable').setRequired(true))
                    )
            )
    ] as GargoyleSlashCommandBuilder[];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction): Promise<void> {
        if (interaction.guildId !== GUILD_ID) {
            await interaction.reply({ content: 'This command can only be used in Brads Faction Discord.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (!interaction.guild) {
            await interaction.reply({ content: 'This can only be used in a guild.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!(await isFactionLeaderOrAdmin(client, interaction.guild, member))) {
            await interaction.reply({
                content: 'You need to be a faction leader or an administrator to use this command.',
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }

        if (interaction.options.getSubcommandGroup() === 'blacklist') {
            const subcommand = interaction.options.getSubcommand();
            const factionName = interaction.options.getString('faction');
            const isAll = subcommand === 'remove' ? !factionName : factionName!.toLowerCase() === 'all';
            const faction = isAll ? null : await getFactionByName(client, GUILD_ID, factionName!);
            if (!isAll && !faction) {
                await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const factions = await listFactions(client, GUILD_ID);

            if (subcommand === 'remove') {
                const user = interaction.options.getUser('user', true);
                const active = await listActiveBlacklists(client, GUILD_ID, faction === null ? null : faction.id);
                const relevant = active.filter((entry) => entry.user_id === user.id);
                await removeBlacklists(client, GUILD_ID, user.id, faction === null ? null : faction.id);
                if (relevant.length === 0) {
                    await interaction.reply({
                        content: `<@${user.id}> has no active blacklist ${isAll ? 'from all factions' : `from **${faction!.name}**`}.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                } else {
                    await interaction.reply({
                        content: `<@${user.id}> has been unblacklisted ${isAll ? 'from all factions' : `from **${faction!.name}**`}.`,
                        flags: [MessageFlags.Ephemeral]
                    });
                }
                return;
            }

            const entries = await listActiveBlacklists(client, GUILD_ID, isAll ? null : faction!.id);
            await interaction.reply({
                ...blacklistListPanel(isAll ? 'All Factions' : faction!.name, entries, factions),
                flags: [MessageFlags.IsComponentsV2]
            });
            return;
        }

        if (interaction.options.getSubcommandGroup() === 'cooldown') {
            const durationInput = interaction.options.getString('duration', true);
            const ms = parseDuration(durationInput);
            if (ms === null) {
                await interaction.reply({
                    content: 'Invalid duration. Use a number followed by h or d (e.g. 12h, 3d), or 0 to disable.',
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }
            await setCooldownDuration(client, GUILD_ID, ms);
            await interaction.reply({
                content: ms === 0 ? 'Application cooldown disabled.' : `Application cooldown set to ${durationInput}.`,
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            const name = interaction.options.getString('name', true);
            const existing = await getFactionByName(client, GUILD_ID, name);
            if (existing) {
                await interaction.reply({ content: 'A faction with that name already exists.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const channel = interaction.options.getChannel('channel', true);
            if (!channel || channel.type !== ChannelType.GuildText) {
                await interaction.reply({ content: 'The channel must be a text channel.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const leaderRole = interaction.options.getRole('leader-role', true);
            await createFaction(client, {
                guild_id: GUILD_ID,
                name,
                description: interaction.options.getString('description') ?? '',
                leader_role_id: leaderRole.id,
                application_channel_id: channel.id,
                accept_role_id: interaction.options.getRole('accept-role')?.id ?? null,
                deny_role_id: interaction.options.getRole('deny-role')?.id ?? null
            });
            await interaction.reply({
                content: `Faction **${name}** created. Add application questions with /faction questions ${name}.`,
                flags: [MessageFlags.Ephemeral]
            });
            return;
        }

        if (subcommand === 'edit') {
            const faction = await getFactionByName(client, GUILD_ID, interaction.options.getString('faction', true));
            if (!faction) {
                await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!(await isLeaderOfFactionOrAdmin(client, interaction.guild!, member, faction.id))) {
                await interaction.reply({ content: 'You need to be a leader of this faction or an administrator.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            const updates: Parameters<typeof updateFaction>[2] = {};
            const changed: string[] = [];

            const newName = interaction.options.getString('new-name');
            if (newName !== null && newName !== faction.name) {
                const existing = await getFactionByName(client, GUILD_ID, newName);
                if (existing) {
                    await interaction.reply({ content: 'A faction with that name already exists.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                updates.name = newName;
                changed.push(`name → **${newName}**`);
            }

            const clearDescription = interaction.options.getBoolean('clear-description') ?? false;
            if (clearDescription && interaction.options.getString('description') !== null) {
                await interaction.reply({
                    content: 'Use either `description` or `clear-description`, not both.',
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            if (clearDescription || interaction.options.getString('description') !== null) {
                updates.description = clearDescription ? '' : interaction.options.getString('description', true);
                changed.push(`description → ${updates.description ? `**${updates.description}**` : '(cleared)'}`);
            }

            const leaderRole = interaction.options.getRole('leader-role');
            if (leaderRole) {
                updates.leader_role_id = leaderRole.id;
                changed.push(`leader role → <@&${leaderRole.id}>`);
            }

            const channel = interaction.options.getChannel('channel');
            if (channel) {
                if (channel.type !== ChannelType.GuildText) {
                    await interaction.reply({ content: 'The channel must be a text channel.', flags: [MessageFlags.Ephemeral] });
                    return;
                }
                updates.application_channel_id = channel.id;
                changed.push(`application channel → <#${channel.id}>`);
            }

            const acceptRole = interaction.options.getRole('accept-role');
            if (acceptRole) {
                updates.accept_role_id = acceptRole.id;
                changed.push(`accept role → <@&${acceptRole.id}>`);
            }

            const denyRole = interaction.options.getRole('deny-role');
            if (denyRole) {
                updates.deny_role_id = denyRole.id;
                changed.push(`deny role → <@&${denyRole.id}>`);
            }

            if (changed.length === 0) {
                await interaction.reply({ content: 'Nothing to change — provide at least one option.', flags: [MessageFlags.Ephemeral] });
                return;
            }

            await updateFaction(client, faction.id, updates);
            const factions = await listFactions(client, GUILD_ID);
            await interaction.reply({
                content: `Updated **${updates.name ?? faction.name}**:\n${changed.map((entry) => `- ${entry}`).join('\n')}`,
                flags: [MessageFlags.Ephemeral]
            });
            await this.refreshPanels(client, factions);
            return;
        }

        if (subcommand === 'questions') {
            await handleQuestionsCommand(client, this, interaction);
        }

        if (subcommand === 'panel') {
            if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
                await interaction.reply({ content: 'This can only be used in a text channel.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const factions = await listFactions(client, GUILD_ID);
            if (factions.length === 0) {
                await interaction.reply({ content: 'No factions exist yet. Create one with /faction setup.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '# Send Application Panel\n> Select which factions should appear on the panel, then it will be sent to this channel.'
                    )
                )
                .addActionRowComponents(
                    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                        new GargoyleStringSelectMenuBuilder(this, 'panelsend', interaction.channelId)
                            .setPlaceholder('Select factions to include')
                            .setMinValues(1)
                            .setMaxValues(factions.length)
                            .setOptions(
                                factions.map((faction) => ({
                                    label: faction.name,
                                    value: String(faction.id),
                                    ...(faction.description ? { description: faction.description.slice(0, 100) } : {})
                                }))
                            )
                    )
                );
            await interaction.reply({ components: [container], flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] });
            return;
        }

        if (subcommand === 'leader-panel' || subcommand === 'blacklist-panel') {
            if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
                await interaction.reply({ content: 'This can only be used in a text channel.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const factions = await listFactions(client, GUILD_ID);
            if (factions.length === 0) {
                await interaction.reply({ content: 'No factions exist yet. Create one with /faction setup.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const panel = subcommand === 'leader-panel' ? leaderPanel(this, factions) : blacklistPanel(this, factions);
            try {
                await (interaction.channel as TextChannel).send(panel);
                await interaction.reply({ content: 'Panel sent to this channel.', flags: [MessageFlags.Ephemeral] });
            } catch (err) {
                client.logger.error(`Failed to send faction panel: ${err}`);
                await interaction.reply({ content: 'Failed to send the panel.', flags: [MessageFlags.Ephemeral] });
            }
        }

        if (subcommand === 'history') {
            const user = interaction.options.getUser('user', true);
            const applications = await listApplicationsByUser(client, GUILD_ID, user.id);
            const factions = await listFactions(client, GUILD_ID);
            await interaction.reply({ ...historyPanel(user, applications, factions), flags: [MessageFlags.IsComponentsV2] });
        }
    }

    public override async executeButtonCommand(client: GargoyleClient, interaction: ButtonInteraction, ...args: string[]): Promise<void> {
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (args[0] === 'qadd') {
            await handleQuestionButton(client, this, interaction, args[0], args[1]);
        }
        if (args[0] === 'toggle') {
            await this.handleToggle(client, interaction, args[1]);
        }
        if (args[0] === 'apply') {
            await handleApplyButton(client, this, interaction, args[1]);
        }
        if (args[0] === 'blacklist') {
            await handleBlacklistButton(client, this, interaction, args[1]);
        }
        if (args[0] === 'applynext') {
            await handleApplyNextButton(client, this, interaction, args[1], args[2]);
        }
        if (args[0] === 'accept' || args[0] === 'deny') {
            await handleDecisionButton(client, this, interaction, args[0] as 'accept' | 'deny', args[1]);
        }
        if (args[0] === 'add' || args[0] === 'remove') {
            await handleThreadMemberButton(client, this, interaction, args[0] === 'add', args[1]);
        }
    }

    public override async executeSelectMenuCommand(client: GargoyleClient, interaction: AnySelectMenuInteraction, ...args: string[]): Promise<void> {
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (args[0] === 'qedit' || args[0] === 'qdel' || args[0] === 'qmoveup' || args[0] === 'qmovedown') {
            await handleQuestionSelect(client, this, interaction, args[0], args[1]);
        }
        if (args[0] === 'panelsend') {
            await this.handlePanelSend(client, interaction, args[1]);
        }
    }

    private async handlePanelSend(client: GargoyleClient, interaction: AnySelectMenuInteraction, channelIdArg: string): Promise<void> {
        const selectedIds = interaction.values.map((value) => parseInt(value, 10));
        const all = await listFactions(client, GUILD_ID);
        const selected = selectedIds
            .map((id) => all.find((faction) => faction.id === id))
            .filter((faction): faction is FactionRow => Boolean(faction));
        if (selected.length === 0) {
            await interaction.update({ content: 'No valid factions were selected. Run /faction panel again.', components: [] });
            return;
        }
        const channel = await client.channels.fetch(channelIdArg);
        if (!channel || !channel.isTextBased()) {
            await interaction.update({ content: 'The channel this panel was created in no longer exists.', components: [] });
            return;
        }
        try {
            const message = await (channel as TextChannel).send(applyPanel(this, selected));
            await createFactionPanel(client, {
                guild_id: GUILD_ID,
                channel_id: channelIdArg,
                message_id: message.id,
                faction_ids: selected.map((faction) => faction.id)
            });
            await interaction.update({ content: `Panel sent to <#${channelIdArg}> with ${selected.length} faction(s).`, components: [] });
        } catch (err) {
            client.logger.error(`Failed to send faction panel: ${err}`);
            await interaction.update({ content: 'Failed to send the panel.', components: [] });
        }
    }

    public override async executeModalCommand(client: GargoyleClient, interaction: ModalSubmitInteraction, ...args: string[]): Promise<void> {
        if (!client.db) {
            await interaction.reply({ content: 'Database not connected. Please try again later.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        if (args[0] === 'qadd' || args[0] === 'qedit') {
            await handleQuestionModal(client, this, interaction, args[0], args[1], args[2]);
        }
        if (args[0] === 'apply') {
            await handleApplyModal(client, this, interaction, args[1], args[2]);
        }
        if (args[0] === 'blacklist') {
            await handleBlacklistModal(client, this, interaction, args[1]);
        }
        if (args[0] === 'accept' || args[0] === 'deny') {
            await handleDecisionModal(client, this, interaction, args[0] as 'accept' | 'deny', args[1]);
        }
    }

    private async handleToggle(client: GargoyleClient, interaction: ButtonInteraction, factionIdArg: string): Promise<void> {
        const faction = await getFaction(client, parseInt(factionIdArg, 10));
        if (!faction || faction.guild_id !== GUILD_ID) {
            await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        const member = await interaction.guild!.members.fetch(interaction.user.id);
        if (!(await isLeaderOfFactionOrAdmin(client, interaction.guild!, member, faction.id))) {
            await interaction.reply({ content: 'You need to be a leader of this faction or an administrator.', flags: [MessageFlags.Ephemeral] });
            return;
        }
        await updateFaction(client, faction.id, { enabled: !faction.enabled });
        const factions = await listFactions(client, GUILD_ID);
        await interaction.update(leaderPanel(this, factions) as MessageEditOptions);

        await this.refreshPanels(client, factions);
        await interaction.followUp({
            content: `Applications for **${faction.name}** are now ${faction.enabled ? 'disabled' : 'enabled'}.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    private async refreshPanels(client: GargoyleClient, factions: FactionRow[]): Promise<void> {
        const panels = await listFactionPanels(client, GUILD_ID);
        for (const panel of panels) {
            try {
                const panelFactions =
                    panel.faction_ids.length > 0
                        ? panel.faction_ids.map((id) => factions.find((f) => f.id === id)).filter((f): f is (typeof factions)[number] => Boolean(f))
                        : factions;
                const channel = await client.channels.fetch(panel.channel_id);
                if (!channel || !channel.isTextBased()) {
                    throw new Error(`Channel ${panel.channel_id} is not text-based`);
                }
                const message = await channel.messages.fetch(panel.message_id);
                await message.edit(applyPanel(this, panelFactions) as MessageEditOptions);
            } catch (err) {
                if ((err as { code?: number }).code === 10008) {
                    await deleteFactionPanel(client, panel.id).catch(() => {});
                }
                client.logger.warning(`Failed to refresh faction apply panel ${panel.message_id}: ${err}`);
            }
        }
    }
}
