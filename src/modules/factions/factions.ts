import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import {
    ApplicationIntegrationType,
    ButtonInteraction,
    ChannelType,
    ChatInputCommandInteraction,
    InteractionContextType,
    MessageEditOptions,
    MessageFlags,
    ModalSubmitInteraction,
    TextChannel
} from 'discord.js';
import { GUILD_ID, parseDuration } from './_types.js';
import {
    createFaction,
    getFaction,
    getFactionByName,
    listActiveBlacklists,
    listApplicationsByUser,
    listFactions,
    setCooldownDuration,
    updateFaction
} from './_db.js';
import { isFactionLeaderOrAdmin, isLeaderOfFactionOrAdmin } from './_permissions.js';
import { handleQuestionButton, handleQuestionModal, handleQuestionsCommand } from './_questions.js';
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
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
            .addGuild(GUILD_ID)
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
            const factionName = interaction.options.getString('faction', true);
            const isAll = factionName.toLowerCase() === 'all';
            const faction = isAll ? null : await getFactionByName(client, GUILD_ID, factionName);
            if (!isAll && !faction) {
                await interaction.reply({ content: 'Faction not found.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const entries = await listActiveBlacklists(client, GUILD_ID, isAll ? null : faction!.id);
            const factions = await listFactions(client, GUILD_ID);
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

        if (subcommand === 'questions') {
            await handleQuestionsCommand(client, this, interaction);
        }

        if (subcommand === 'panel' || subcommand === 'leader-panel' || subcommand === 'blacklist-panel') {
            if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
                await interaction.reply({ content: 'This can only be used in a text channel.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const factions = await listFactions(client, GUILD_ID);
            if (factions.length === 0) {
                await interaction.reply({ content: 'No factions exist yet. Create one with /faction setup.', flags: [MessageFlags.Ephemeral] });
                return;
            }
            const panel =
                subcommand === 'panel'
                    ? applyPanel(this, factions)
                    : subcommand === 'leader-panel'
                      ? leaderPanel(this, factions)
                      : blacklistPanel(this, factions);
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
        if (args[0] === 'qadd' || args[0] === 'qedit' || args[0] === 'qdel' || args[0] === 'qmove') {
            await handleQuestionButton(client, this, interaction, args[0], args[1], args[2], args[3]);
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
        await interaction.message.edit(leaderPanel(this, factions) as MessageEditOptions);
        await interaction.reply({
            content: `Applications for **${faction.name}** are now ${faction.enabled ? 'disabled' : 'enabled'}.`,
            flags: [MessageFlags.Ephemeral]
        });
    }
}
