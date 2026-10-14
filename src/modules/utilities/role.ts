import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@src/system/backend/classes/gargoyleModule.js';
import GargoyleButtonBuilder, { GargoyleURLButtonBuilder } from '@builders/gargoyleButtonBuilder.js';
import {
    ActionRowBuilder,
    ApplicationIntegrationType,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    ContainerBuilder,
    GuildMember,
    HexColorString,
    InteractionContextType,
    LabelBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageActionRowComponentBuilder,
    MessageFlags,
    ModalSubmitInteraction,
    Role,
    RoleSelectMenuBuilder,
    SectionBuilder,
    SendableChannels,
    TextDisplayBuilder,
    TextInputBuilder,
    TextInputStyle
} from 'discord.js';
import GargoyleSlashCommandBuilder from '@src/system/backend/builders/gargoyleSlashCommandBuilder.js';
import client from '@src/system/botClient.js';
import GargoyleModalBuilder from '@src/system/backend/builders/gargoyleModalBuilder.js';
import {
    buildInviteJumpLink,
    deleteTreeRow,
    getAcceptedTreeRows,
    getEnabledTreeRoles,
    getTreeRow,
    getTreeRowById,
    invalidateInviteMessage,
    listPendingTreeRows,
    markInviteDecided,
    renderInviteTree,
    resolveInviteRole,
    resolveManagerRole,
    setInviteTreeRoles,
    setTreeMessage,
    upsertTreeRow
} from './_inviteTree.js';

export default class RoleCommand extends GargoyleModule {
    public override name: string = 'role';
    public override category: string = 'utilities';
    public override slashCommands = [
        new GargoyleSlashCommandBuilder()
            .setName('role')
            .setDescription('Role related commands')
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
            .addSubcommandGroup((group) =>
                group
                    .setName('give')
                    .setDescription('give a role')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('all')
                            .setDescription('Give a role to all users in a guild')
                            .addRoleOption((option) => option.setName('role').setDescription('The role to give to everyone').setRequired(true))
                    )
            )
            .addSubcommandGroup((group) =>
                group
                    .setName('create')
                    .setDescription('Create a role')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('color')
                            .setDescription('Create a role with a color')
                            .addStringOption((option) => option.setRequired(true).setName('color').setDescription('The color of the role'))
                    )
            )
            .addSubcommandGroup((group) =>
                group
                    .setName('invite')
                    .setDescription('Invite tree role management')
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('enable')
                            .setDescription('Enable the invite tree for a role')
                            .addRoleOption((option) => option.setRequired(true).setName('role').setDescription('The role to enable'))
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('disable')
                            .setDescription('Disable the invite tree for a role')
                            .addRoleOption((option) => option.setRequired(true).setName('role').setDescription('The role to disable'))
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('invite')
                            .setDescription('Invite a member into an invite-enabled role')
                            .addUserOption((option) => option.setRequired(true).setName('user').setDescription('The member to invite'))
                            .addRoleOption((option) =>
                                option.setName('role').setDescription('The invite-enabled role (required when you hold multiple)')
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('adopt')
                            .setDescription('Force-adopt a member into an invite-enabled role (no offer)')
                            .addUserOption((option) => option.setRequired(true).setName('user').setDescription('The member to adopt'))
                            .addUserOption((option) =>
                                option.setRequired(true).setName('parent').setDescription('The member who becomes their parent in the tree')
                            )
                            .addRoleOption((option) =>
                                option.setName('role').setDescription('The invite-enabled role (required when multiple are enabled)')
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('forget')
                            .setDescription('Remove a member from an invite tree (severs their link)')
                            .addUserOption((option) => option.setRequired(true).setName('user').setDescription('The member to remove from the tree'))
                            .addRoleOption((option) =>
                                option.setName('role').setDescription('The invite-enabled role (required when multiple are enabled)')
                            )
                    )
                    .addSubcommand((subcommand) =>
                        subcommand
                            .setName('tree')
                            .setDescription('Show the invite tree for a role (who invited whom)')
                            .addRoleOption((option) =>
                                option.setName('role').setDescription('The invite-enabled role (required when multiple are enabled)')
                            )
                    )
            )
            .addSubcommand((subcommand) =>
                subcommand
                    .setName('delete')
                    .setDescription('Delete a role')
                    .addRoleOption((option) => option.setRequired(true).setName('role').setDescription('The role to delete'))
            )
            .addSubcommand((subcommand) => subcommand.setName('panel').setDescription('Create a role panel'))
            .setContexts([InteractionContextType.Guild]) as GargoyleSlashCommandBuilder
    ];

    public override async executeSlashCommand(client: GargoyleClient, interaction: ChatInputCommandInteraction) {
        if (interaction.options.getSubcommandGroup() === 'give') {
            if (interaction.options.getSubcommand() === 'all') {
                const role = interaction.options.getRole('role', true) as Role;
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!role.editable) {
                    await interaction.reply({
                        content: 'I do not have permission to assign that role to everyone.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const members = await interaction.guild!.members.fetch();
                let successCount = 0;
                let failureCount = 0;

                for (const [_id, member] of members) {
                    try {
                        if (!member.roles.cache.has(role.id)) {
                            await member.roles.add(role, `Role given to all members by ${interaction.user.tag}`);
                            successCount++;
                        }
                    } catch {
                        failureCount++;
                    }
                }

                await interaction.editReply({
                    content: `Successfully given the role <@&${role.id}> to ${successCount} members. Failed to give the role to ${failureCount} members.`,
                    allowedMentions: { parse: [] }
                });
            }
        } else if (interaction.options.getSubcommandGroup() === 'create') {
            if (interaction.options.getSubcommand() === 'color') {
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                // Check with regex if the color is a valid hex color
                const color = interaction.options.getString('color', false);
                if (color && !/^#[0-9A-F]{6}$/i.test(color)) {
                    await interaction.reply({
                        content: 'The color you provided is not a valid hex color.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                const response = await fetch('https://www.thecolorapi.com/id?hex=' + color?.substring(1));
                const data = (await response.json()) as ColorApiResponse;
                const colorName = data.name.value;

                const role = await interaction.guild?.roles.create({
                    name: `Color - ${colorName}`,
                    color: color as HexColorString,
                    reason: `Color role created by ${interaction.user.tag}`,
                    permissions: [],
                    mentionable: false
                });

                if (!role) {
                    await interaction.reply({
                        content: 'Failed to create role.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                await interaction.reply({
                    content: `Created role ${role} with color ${colorName}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        } else if (interaction.options.getSubcommandGroup() === 'invite') {
            if (interaction.options.getSubcommand() === 'enable') {
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!client.db) {
                    await interaction.reply({ content: 'Database not connected. Please try again later.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const role = interaction.options.getRole('role', true) as Role;
                const guild = interaction.guild!;

                const list = await getEnabledTreeRoles(client, guild.id);
                if (list.includes(role.id)) {
                    await interaction.reply({ content: 'This role is already enabled for invites.', flags: MessageFlags.Ephemeral });
                    return;
                }

                await setInviteTreeRoles(client, guild.id, [...list, role.id]);
                await interaction.reply({ content: `Enabled the invite tree for <@&${role.id}>.`, flags: MessageFlags.Ephemeral });
            } else if (interaction.options.getSubcommand() === 'disable') {
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!client.db) {
                    await interaction.reply({ content: 'Database not connected. Please try again later.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const role = interaction.options.getRole('role', true) as Role;
                const guild = interaction.guild!;

                const list = await getEnabledTreeRoles(client, guild.id);
                if (!list.includes(role.id)) {
                    await interaction.reply({ content: 'This role is not enabled for invites.', flags: MessageFlags.Ephemeral });
                    return;
                }

                await setInviteTreeRoles(
                    client,
                    guild.id,
                    list.filter((id) => id !== role.id)
                );

                for (const row of await listPendingTreeRows(client, guild.id, role.id)) {
                    await invalidateInviteMessage(client, this, row);
                }

                await interaction.reply({ content: `Disabled the invite tree for <@&${role.id}>.`, flags: MessageFlags.Ephemeral });
            } else if (interaction.options.getSubcommand() === 'invite') {
                if (!client.db) {
                    await interaction.reply({ content: 'Database not connected. Please try again later.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const guild = interaction.guild!;
                const enabled = await getEnabledTreeRoles(client, guild.id);
                const member = interaction.member as GuildMember | null;
                const held = [...(member?.roles.cache.keys() ?? [])].filter((id) => enabled.includes(id));

                const explicit = interaction.options.getRole('role');
                const resolved = resolveInviteRole(held, enabled, explicit?.id);
                if (resolved.error) {
                    await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
                    return;
                }
                const roleId = resolved.roleId!;

                const target = interaction.options.getUser('user', true);
                if (!interaction.options.getMember('user')) {
                    await interaction.reply({ content: 'That user is not a member of this guild.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const targetMember = await guild.members.fetch(target.id).catch(() => null);
                if (!targetMember) {
                    await interaction.reply({ content: 'Could not fetch that member.', flags: MessageFlags.Ephemeral });
                    return;
                }

                if (targetMember.roles.cache.has(roleId)) {
                    await interaction.reply({ content: 'They already have that role.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const existing = await getTreeRow(client, guild.id, roleId, target.id);
                if (existing?.status === 'accepted') {
                    await interaction.reply({ content: 'They are already in the role tree.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (existing?.status === 'pending') {
                    await invalidateInviteMessage(client, this, existing);
                }

                const role = await guild.roles.fetch(roleId).catch(() => null);
                if (!role) {
                    await interaction.reply({ content: 'The role no longer exists.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (!role.editable) {
                    await interaction.reply({ content: 'I cannot manage that role.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const row = await upsertTreeRow(client, {
                    guild_id: guild.id,
                    role_id: roleId,
                    user_id: target.id,
                    parent_user_id: interaction.user.id,
                    status: 'pending',
                    channel_id: null,
                    message_id: null
                });

                const container = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `<@${interaction.user.id}> invited <@${target.id}> to <@&${roleId}> — accept or deny below.`
                        )
                    )
                    .addActionRowComponents(
                        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                            new GargoyleButtonBuilder(this, 'inviteaccept', String(row.id)).setLabel('Accept').setStyle(ButtonStyle.Success),
                            new GargoyleButtonBuilder(this, 'invitedeny', String(row.id)).setLabel('Deny').setStyle(ButtonStyle.Danger)
                        )
                    );

                const message = await (interaction.channel as SendableChannels)
                    .send({ components: [container], flags: [MessageFlags.IsComponentsV2] })
                    .catch(() => {
                        client.logger.error('Failed to send role invite message');
                        return null;
                    });

                if (!message) {
                    await deleteTreeRow(client, guild.id, roleId, target.id);
                    await interaction.reply({ content: 'I could not post the invite message in this channel.', flags: MessageFlags.Ephemeral });
                    return;
                }

                await setTreeMessage(client, row.id, message.channelId, message.id);

                const targetUser = await client.users.fetch(target.id).catch(() => null);
                if (targetUser) {
                    await targetUser
                        .send({
                            content: `<@${interaction.user.id}> invited you to the role <@&${roleId}> in **${guild.name}**. Accept or deny:`,
                            components: [
                                new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                                    new GargoyleURLButtonBuilder(buildInviteJumpLink(guild.id, message.channelId, message.id)).setLabel('Respond')
                                )
                            ],
                            flags: [MessageFlags.IsComponentsV2]
                        })
                        .catch(() => {
                            client.logger.warning(`Could not DM ${target.id} for an invite; they may have DMs disabled.`);
                        });
                }

                await interaction.reply({
                    content: `Invite sent to <@${target.id}> for <@&${roleId}>.`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.options.getSubcommand() === 'adopt') {
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!client.db) {
                    await interaction.reply({ content: 'Database not connected. Please try again later.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const guild = interaction.guild!;
                const enabled = await getEnabledTreeRoles(client, guild.id);

                const explicit = interaction.options.getRole('role');
                const resolved = resolveManagerRole(enabled, explicit?.id);
                if (resolved.error) {
                    await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
                    return;
                }
                const roleId = resolved.roleId!;

                const target = interaction.options.getUser('user', true);
                if (!interaction.options.getMember('user')) {
                    await interaction.reply({ content: 'That user is not a member of this guild.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const parent = interaction.options.getUser('parent', true);
                const parentMember = await guild.members.fetch(parent.id).catch(() => null);
                if (!parentMember || !parentMember.roles.cache.has(roleId)) {
                    await interaction.reply({ content: 'The parent does not hold that role.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const role = await guild.roles.fetch(roleId).catch(() => null);
                if (!role) {
                    await interaction.reply({ content: 'The role no longer exists.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const existing = await getTreeRow(client, guild.id, roleId, target.id);
                if (existing?.status === 'accepted') {
                    await interaction.reply({ content: 'They are already in the role tree. Forget them first.', flags: MessageFlags.Ephemeral });
                    return;
                }
                if (existing?.status === 'pending') {
                    await invalidateInviteMessage(client, this, existing);
                }

                const targetMember = await guild.members.fetch(target.id).catch(() => null);
                if (!targetMember) {
                    await interaction.reply({ content: 'Could not fetch that member.', flags: MessageFlags.Ephemeral });
                    return;
                }

                if (!targetMember.roles.cache.has(roleId)) {
                    const granted = await targetMember.roles.add(role).catch(() => null);
                    if (!granted) {
                        await interaction.reply({ content: 'I could not grant the role, I may lack permissions.', flags: MessageFlags.Ephemeral });
                        return;
                    }
                }

                await upsertTreeRow(client, {
                    guild_id: guild.id,
                    role_id: roleId,
                    user_id: target.id,
                    parent_user_id: parent.id,
                    status: 'accepted',
                    channel_id: null,
                    message_id: null
                });

                await interaction.reply({
                    content: `Adopted <@${target.id}> into <@&${roleId}> under <@${parent.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.options.getSubcommand() === 'forget') {
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if (!client.db) {
                    await interaction.reply({ content: 'Database not connected. Please try again later.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const guild = interaction.guild!;
                const enabled = await getEnabledTreeRoles(client, guild.id);

                const explicit = interaction.options.getRole('role');
                const resolved = resolveManagerRole(enabled, explicit?.id);
                if (resolved.error) {
                    await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
                    return;
                }
                const roleId = resolved.roleId!;

                const target = interaction.options.getUser('user', true);

                const row = await getTreeRow(client, guild.id, roleId, target.id);
                if (!row) {
                    await interaction.reply({ content: 'They are not in the role tree.', flags: MessageFlags.Ephemeral });
                    return;
                }

                if (row.status === 'pending') {
                    await invalidateInviteMessage(client, this, row);
                }

                const deleted = await deleteTreeRow(client, guild.id, roleId, target.id);
                if (!deleted) {
                    await interaction.reply({ content: 'Something went wrong, try again.', flags: MessageFlags.Ephemeral });
                    return;
                }

                await interaction.reply({
                    content: `Removed <@${target.id}> from the role tree for <@&${roleId}>. They keep the role itself if they have it.`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.options.getSubcommand() === 'tree') {
                if (!client.db) {
                    await interaction.reply({ content: 'Database not connected. Please try again later.', flags: MessageFlags.Ephemeral });
                    return;
                }

                const guild = interaction.guild!;
                const enabled = await getEnabledTreeRoles(client, guild.id);

                const explicit = interaction.options.getRole('role');
                const resolved = resolveManagerRole(enabled, explicit?.id);
                if (resolved.error) {
                    await interaction.reply({ content: resolved.error, flags: MessageFlags.Ephemeral });
                    return;
                }
                const roleId = resolved.roleId!;

                const rows = await getAcceptedTreeRows(client, guild.id, roleId);
                if (rows.length === 0) {
                    await interaction.reply({ content: `No accepted members in the <@&${roleId}> tree yet.`, flags: MessageFlags.Ephemeral });
                    return;
                }

                const ids = [...new Set(rows.map((row) => row.user_id))];
                // Skip ids already resolvable from the member cache and cap the fetch set: the tree
                // renders at most 1800 chars, so names past this cap are mostly truncated away, and
                // fetching every member of a large tree would exceed Discord's interaction deadline.
                // Uncapped ids fall back to @id in the rendered tree.
                const names: Record<string, string> = {};
                const toFetch: string[] = [];
                for (const id of ids) {
                    const displayName = guild.members.cache.get(id)?.displayName;
                    if (displayName) {
                        names[id] = displayName;
                    } else if (toFetch.length < 100) {
                        toFetch.push(id);
                    }
                }
                const fetched = await Promise.all(toFetch.map((id) => client.users.fetch(id).catch(() => null)));
                toFetch.forEach((id, i) => {
                    names[id] = fetched[i]?.username ?? `@${id}`;
                });

                await interaction.reply({
                    content: `**<@&${roleId}> invite tree** (${rows.length} members)\n\`\`\`\n${renderInviteTree(rows, names)}\n\`\`\``
                });
            }
        } else if (interaction.options.getSubcommandGroup(false) == null) {
            if (interaction.options.getSubcommand() === 'delete') {
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                const role = interaction.options.getRole('role', false);
                if (!role) {
                    await interaction.reply({
                        content: 'The role you provided is not valid.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                if ('delete' in role) {
                    await role.delete(`Role deleted by ${interaction.user.tag}`);
                } else {
                    await interaction.reply({
                        content: 'The role you provided cannot be deleted.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                await interaction.reply({
                    content: `Deleted role ${role.name}`,
                    flags: MessageFlags.Ephemeral
                });
            } else if (interaction.options.getSubcommand() === 'panel') {
                if (!interaction.memberPermissions?.has('ManageRoles')) {
                    await interaction.reply({
                        content: 'You do not have the required permissions to use this command.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }

                await interaction
                    .showModal(
                        new GargoyleModalBuilder(this, 'panel')
                            .setTitle('Make a Role Panel')
                            .addLabelComponents(
                                new LabelBuilder()
                                    .setLabel('Panel Image URL')
                                    .setDescription('The image URL to display on the role panel (optional, and also needs to be a direct image link)')
                                    .setTextInputComponent(
                                        new TextInputBuilder()
                                            .setMaxLength(1000)
                                            .setStyle(TextInputStyle.Short)
                                            .setRequired(false)
                                            .setCustomId('image')
                                    ),
                                new LabelBuilder()
                                    .setLabel('Panel Text')
                                    .setDescription('The text to show above the role select menu (optional)')
                                    .setTextInputComponent(
                                        new TextInputBuilder()
                                            .setMaxLength(1000)
                                            .setStyle(TextInputStyle.Paragraph)
                                            .setRequired(false)
                                            .setCustomId('text')
                                    ),
                                new LabelBuilder()
                                    .setLabel('Roles')
                                    .setDescription('The roles to include in the panel (max 10)')
                                    .setRoleSelectMenuComponent(
                                        new RoleSelectMenuBuilder().setMaxValues(10).setMinValues(1).setRequired(true).setCustomId('roles')
                                    ),
                                new LabelBuilder()
                                    .setLabel('Panel Color')
                                    .setDescription('The accent color of the panel (optional, hex color, e.g. #ff0000)')
                                    .setTextInputComponent(
                                        new TextInputBuilder()
                                            .setMinLength(7)
                                            .setMaxLength(7)
                                            .setStyle(TextInputStyle.Short)
                                            .setRequired(false)
                                            .setCustomId('color')
                                    )
                            )
                    )
                    .catch((error: Error) => {
                        client.logger.error('Failed to show role panel modal', error.stack || error.message);
                    });
            }
        }
    }

    public override async executeButtonCommand(client: GargoyleClient, interaction: ButtonInteraction, ...args: string[]): Promise<void> {
        if (args[0] === 'addrole') {
            const role = await interaction.guild?.roles.fetch(args[1]);
            if (!role) return;

            const member = await interaction.guild?.members.fetch(interaction.user.id);

            if (member?.roles.cache.has(role.id)) {
                await member?.roles
                    .remove(role)
                    .catch(() => {
                        interaction.reply({
                            content: `Failed to remove role ${role.name}, I may not have the correct permissions to take it away from you.`,
                            flags: MessageFlags.Ephemeral
                        });
                    })
                    .then(() => {
                        interaction.reply({ content: `Removed role ${role.name}`, flags: MessageFlags.Ephemeral });
                    });
            } else {
                await member?.roles
                    .add(role)
                    .catch(() => {
                        interaction.reply({
                            content: `Failed to add role ${role.name}, I may not have the correct permissions to give it to you.`,
                            flags: MessageFlags.Ephemeral
                        });
                    })
                    .then(() => {
                        interaction.reply({ content: `Added role ${role.name}`, flags: MessageFlags.Ephemeral });
                    });
            }
        } else if (args[0] === 'inviteaccept' || args[0] === 'invitedeny') {
            if (!client.db) {
                await interaction.reply({ content: 'Database not connected. Please try again later.', flags: MessageFlags.Ephemeral });
                return;
            }

            const row = await getTreeRowById(client, Number(args[1]));
            if (!row) {
                await interaction.reply({ content: 'This invite no longer exists.', flags: MessageFlags.Ephemeral });
                return;
            }

            if (interaction.guildId !== row.guild_id) {
                await interaction.reply({ content: 'This invite is not for you.', flags: MessageFlags.Ephemeral });
                return;
            }

            if (interaction.user.id !== row.user_id) {
                await interaction.reply({ content: 'This invite is not for you.', flags: MessageFlags.Ephemeral });
                return;
            }

            if (row.status !== 'pending') {
                await interaction.reply({ content: 'This invite has already been decided.', flags: MessageFlags.Ephemeral });
                return;
            }

            if (args[0] === 'inviteaccept') {
                const enabled = await getEnabledTreeRoles(client, row.guild_id);
                if (!enabled.includes(row.role_id)) {
                    await interaction.reply({
                        content: 'This role is no longer enabled for invites, so this invite is no longer valid.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            const role = await interaction.guild?.roles.fetch(row.role_id).catch(() => null);
            if (!role) {
                await interaction.reply({ content: 'The role no longer exists.', flags: MessageFlags.Ephemeral });
                return;
            }

            if (args[0] === 'invitedeny') {
                await markInviteDecided(client, row.id, 'denied');
                await invalidateInviteMessage(client, this, row);
                await interaction.reply({ content: `You have denied the invite for <@&${row.role_id}>.`, flags: MessageFlags.Ephemeral });
                return;
            }

            const member = await interaction.guild!.members.fetch(interaction.user.id).catch(() => null);
            if (member && !member.roles.cache.has(role.id)) {
                const granted = await member.roles.add(role).catch(() => null);
                if (!granted) {
                    await interaction.reply({ content: 'I could not grant the role, I may lack permissions.', flags: MessageFlags.Ephemeral });
                    return;
                }
            }

            await markInviteDecided(client, row.id, 'accepted');
            await invalidateInviteMessage(client, this, row);
            await interaction.reply({ content: `You have accepted the invite for <@&${row.role_id}>.`, flags: MessageFlags.Ephemeral });
        }
    }

    public override async executeModalCommand(_client: GargoyleClient, interaction: ModalSubmitInteraction, ...args: string[]): Promise<void> {
        if (args[0] === 'panel') {
            if (!interaction.guild) {
                await interaction.reply({ content: 'An unexpected error occured, are you in a guild?', flags: MessageFlags.Ephemeral });
                return;
            }
            const image = interaction.fields.getTextInputValue('image');
            const text = interaction.fields.getTextInputValue('text');
            const roles = interaction.fields.getSelectedRoles('roles', true);
            let color = interaction.fields.getTextInputValue('color');

            if (color && !/^#[0-9A-F]{6}$/i.test(color)) {
                await interaction.reply({ content: 'The color you provided is not a valid hex color.', flags: MessageFlags.Ephemeral });
                return;
            }

            const fetchedRoles: Role[] = [];
            for (const role of roles) {
                if (role[1] instanceof Role) fetchedRoles.push(role[1]);
            }

            const highestRole = (await interaction.guild!.members.fetch(interaction.user.id)).roles.highest.position;

            for (const role of fetchedRoles) {
                if (role.position >= highestRole) {
                    await interaction.reply({
                        content: `You cannot include the role ${role.name} as it is higher than your highest role.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            if (!color) {
                color = averageRoleColor(fetchedRoles).toString(16);
            }

            const newColor = parseInt(color.replace('#', ''), 16);
            if (isNaN(newColor) || newColor < 0 || newColor > 0xffffff) {
                color = '2b2d31'; // Discord default color
            } else {
                color = color.replace('#', '');
            }

            const container = new ContainerBuilder().setAccentColor(newColor);

            // Check if image is a valid image url
            if (image && /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)$/.test(image)) {
                container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(image)));
            }

            if (text) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
            }

            for (const role of fetchedRoles) {
                container.addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${role.id}>`))
                        .setButtonAccessory(new GargoyleButtonBuilder(this, 'addrole', role.id).setLabel('Add Role').setStyle(ButtonStyle.Secondary))
                );
            }

            const message = (interaction.channel as SendableChannels)
                .send({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } })
                .catch((err: Error) => {
                    client.logger.error('Failed to send role panel message', err.stack || err.message);
                    return undefined;
                });

            if (!message) {
                await interaction.reply({
                    content: 'I do not appear to have permissions to send messages in this channel.',
                    flags: [MessageFlags.Ephemeral]
                });
                return;
            }

            interaction.reply({
                content:
                    'Sent new role panel!\n-# If you want to disguise the message as a message sent by your server, use the `/server bot disguise` command!',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
}

function averageRoleColor(roles: Role[]) {
    const roleColors = roles.map((role) => role.color).filter((color) => color !== undefined && typeof color === 'number' && color !== 0);

    if (roleColors.length === 0) return 0x2b2d31; // Default to discord default color if no roles are found

    const rgbValues = roleColors.map((color) => {
        const r = (color >> 16) & 0xff;
        const g = (color >> 8) & 0xff;
        const b = color & 0xff;
        return { r, g, b };
    });

    const averageRgb = rgbValues.reduce(
        (acc, rgb) => {
            acc.r += rgb.r;
            acc.g += rgb.g;
            acc.b += rgb.b;
            return acc;
        },
        { r: 0, g: 0, b: 0 }
    );

    averageRgb.r = Math.round(averageRgb.r / rgbValues.length);
    averageRgb.g = Math.round(averageRgb.g / rgbValues.length);
    averageRgb.b = Math.round(averageRgb.b / rgbValues.length);

    return (averageRgb.r << 16) + (averageRgb.g << 8) + averageRgb.b;
}

interface ColorApiResponse {
    hex: {
        value: string;
        clean: string;
    };
    rgb: {
        fraction: {
            r: number;
            g: number;
            b: number;
        };
        r: number;
        g: number;
        b: number;
        value: string;
    };
    hsl: {
        fraction: {
            h: number;
            s: number;
            l: number;
        };
        h: number;
        s: number;
        l: number;
        value: string;
    };
    hsv: {
        fraction: {
            h: number;
            s: number;
            v: number;
        };
        h: number;
        s: number;
        v: number;
        value: string;
    };
    name: {
        value: string;
        closest_named_hex: string;
        exact_match_name: boolean;
        distance: number;
    };
    cmyk: {
        fraction: {
            c: number;
            m: number;
            y: number;
            k: number;
        };
        value: string;
        c: number;
        m: number;
        y: number;
        k: number;
    };
    XYZ: {
        fraction: {
            X: number;
            Y: number;
            Z: number;
        };
        value: string;
        X: number;
        Y: number;
        Z: number;
    };
    image: {
        bare: string;
        named: string;
    };
    contrast: {
        value: string;
    };
    _links: {
        self: {
            href: string;
        };
    };
    _embedded: Record<string, unknown>;
}
