import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import {
    ActionRowBuilder,
    ButtonStyle,
    ContainerBuilder,
    Guild,
    MessageActionRowComponentBuilder,
    MessageFlags,
    TextBasedChannel,
    TextChannel,
    TextDisplayBuilder
} from 'discord.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleButtonBuilder from '@builders/gargoyleButtonBuilder.js';
import * as schema from '@src/system/backend/database/schema.js';

export type InviteTreeRow = typeof schema.roleInviteTreeTable.$inferSelect;
export type InviteTreePanel = typeof schema.roleInviteTreePanelTable.$inferSelect;
export type InviteTreeView = { nodes: Array<{ user_id: string; parent_user_id: string | null }>; names: Record<string, string> };

function requireDb(client: GargoyleClient) {
    const db = client.db;
    if (!db?.drizzle) {
        throw new Error('Database not connected');
    }
    return db.drizzle;
}

export async function getEnabledTreeRoles(client: GargoyleClient, guildId: string): Promise<string[]> {
    requireDb(client);
    const guild = await client.db!.getGuild(guildId);
    return guild?.invite_tree_roles ?? [];
}

export async function setInviteTreeRoles(client: GargoyleClient, guildId: string, roleIds: string[]): Promise<void> {
    requireDb(client);
    await client.db!.setGuild(guildId, { invite_tree_roles: roleIds });
}

export async function getTreeRow(client: GargoyleClient, guildId: string, roleId: string, userId: string): Promise<InviteTreeRow | null> {
    const rows = await requireDb(client)
        .select()
        .from(schema.roleInviteTreeTable)
        .where(
            and(
                eq(schema.roleInviteTreeTable.guild_id, guildId),
                eq(schema.roleInviteTreeTable.role_id, roleId),
                eq(schema.roleInviteTreeTable.user_id, userId)
            )
        )
        .execute();
    return rows[0] ?? null;
}

export async function getTreeRowById(client: GargoyleClient, id: number): Promise<InviteTreeRow | null> {
    const rows = await requireDb(client).select().from(schema.roleInviteTreeTable).where(eq(schema.roleInviteTreeTable.id, id)).execute();
    return rows[0] ?? null;
}

export function listPendingTreeRows(client: GargoyleClient, guildId: string, roleId: string): Promise<InviteTreeRow[]> {
    return requireDb(client)
        .select()
        .from(schema.roleInviteTreeTable)
        .where(
            and(
                eq(schema.roleInviteTreeTable.guild_id, guildId),
                eq(schema.roleInviteTreeTable.role_id, roleId),
                eq(schema.roleInviteTreeTable.status, 'pending')
            )
        )
        .execute();
}

export async function getAcceptedTreeRows(client: GargoyleClient, guildId: string, roleId: string): Promise<InviteTreeRow[]> {
    return requireDb(client)
        .select()
        .from(schema.roleInviteTreeTable)
        .where(
            and(
                eq(schema.roleInviteTreeTable.guild_id, guildId),
                eq(schema.roleInviteTreeTable.role_id, roleId),
                eq(schema.roleInviteTreeTable.status, 'accepted')
            )
        )
        .execute();
}

export async function upsertTreeRow(
    client: GargoyleClient,
    data: {
        guild_id: string;
        role_id: string;
        user_id: string;
        parent_user_id: string | null;
        status: 'pending' | 'accepted';
        channel_id: string | null;
        message_id: string | null;
    }
): Promise<InviteTreeRow> {
    const rows = await requireDb(client)
        .insert(schema.roleInviteTreeTable)
        .values({
            guild_id: data.guild_id,
            role_id: data.role_id,
            user_id: data.user_id,
            parent_user_id: data.parent_user_id,
            status: data.status,
            channel_id: data.channel_id,
            message_id: data.message_id
        })
        .onConflictDoUpdate({
            target: [schema.roleInviteTreeTable.guild_id, schema.roleInviteTreeTable.role_id, schema.roleInviteTreeTable.user_id],
            set: {
                parent_user_id: data.parent_user_id,
                status: data.status,
                channel_id: data.channel_id,
                message_id: data.message_id,
                updated_at: new Date()
            }
        })
        .returning()
        .execute();
    return rows[0];
}

export async function markInviteDecided(client: GargoyleClient, id: number, status: 'accepted' | 'denied'): Promise<void> {
    await requireDb(client)
        .update(schema.roleInviteTreeTable)
        .set({ status, updated_at: new Date() })
        .where(eq(schema.roleInviteTreeTable.id, id))
        .execute();
}

export async function setTreeMessage(client: GargoyleClient, id: number, channelId: string, messageId: string): Promise<void> {
    await requireDb(client)
        .update(schema.roleInviteTreeTable)
        .set({ channel_id: channelId, message_id: messageId })
        .where(eq(schema.roleInviteTreeTable.id, id))
        .execute();
}

export async function deleteTreeRow(client: GargoyleClient, guildId: string, roleId: string, userId: string): Promise<boolean> {
    const rows = await requireDb(client)
        .delete(schema.roleInviteTreeTable)
        .where(
            and(
                eq(schema.roleInviteTreeTable.guild_id, guildId),
                eq(schema.roleInviteTreeTable.role_id, roleId),
                eq(schema.roleInviteTreeTable.user_id, userId)
            )
        )
        .returning({ id: schema.roleInviteTreeTable.id })
        .execute();
    return rows.length > 0;
}

export async function getTreePanel(client: GargoyleClient, guildId: string, roleId: string): Promise<InviteTreePanel | null> {
    const rows = await requireDb(client)
        .select()
        .from(schema.roleInviteTreePanelTable)
        .where(and(eq(schema.roleInviteTreePanelTable.guild_id, guildId), eq(schema.roleInviteTreePanelTable.role_id, roleId)))
        .execute();
    return rows[0] ?? null;
}

export async function upsertTreePanel(
    client: GargoyleClient,
    data: { guild_id: string; role_id: string; channel_id: string; message_id: string; tree_hash: string }
): Promise<InviteTreePanel> {
    const rows = await requireDb(client)
        .insert(schema.roleInviteTreePanelTable)
        .values(data)
        .onConflictDoUpdate({
            target: [schema.roleInviteTreePanelTable.guild_id, schema.roleInviteTreePanelTable.role_id],
            set: {
                channel_id: data.channel_id,
                message_id: data.message_id,
                tree_hash: data.tree_hash,
                updated_at: new Date()
            }
        })
        .returning()
        .execute();
    return rows[0];
}

export async function setTreePanelState(client: GargoyleClient, guildId: string, roleId: string, messageId: string, treeHash: string): Promise<void> {
    await requireDb(client)
        .update(schema.roleInviteTreePanelTable)
        .set({ message_id: messageId, tree_hash: treeHash, updated_at: new Date() })
        .where(and(eq(schema.roleInviteTreePanelTable.guild_id, guildId), eq(schema.roleInviteTreePanelTable.role_id, roleId)))
        .execute();
}

export async function deleteTreePanel(client: GargoyleClient, guildId: string, roleId: string): Promise<void> {
    await requireDb(client)
        .delete(schema.roleInviteTreePanelTable)
        .where(and(eq(schema.roleInviteTreePanelTable.guild_id, guildId), eq(schema.roleInviteTreePanelTable.role_id, roleId)))
        .execute();
}

export async function listTreePanels(client: GargoyleClient): Promise<InviteTreePanel[]> {
    return requireDb(client).select().from(schema.roleInviteTreePanelTable).execute();
}

export async function invalidateInviteMessage(client: GargoyleClient, module: GargoyleModule, row: InviteTreeRow): Promise<void> {
    if (!row.channel_id || !row.message_id) {
        return;
    }
    const channel = (await client.channels.fetch(row.channel_id).catch(() => null)) as TextBasedChannel | null;
    if (!channel) {
        return;
    }
    const message = await channel.messages.fetch(row.message_id).catch(() => null);
    if (!message) {
        return;
    }
    await message
        .edit({
            components: [
                new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`<@${row.parent_user_id ?? 'Unknown'}> invited <@${row.user_id}> to <@&${row.role_id}>`)
                    )
                    .addActionRowComponents(
                        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                            new GargoyleButtonBuilder(module, 'inviteaccept', String(row.id))
                                .setLabel('Accept')
                                .setStyle(ButtonStyle.Success)
                                .setDisabled(true),
                            new GargoyleButtonBuilder(module, 'invitedeny', String(row.id))
                                .setLabel('Deny')
                                .setStyle(ButtonStyle.Danger)
                                .setDisabled(true)
                        )
                    )
            ],
            flags: [MessageFlags.IsComponentsV2]
        })
        .catch((err: unknown) => {
            client.logger.warning(`Failed to invalidate invite tree message ${row.message_id} in channel ${row.channel_id}: ${err}`);
        });
}

export function resolveInviteRole(heldRoleIds: string[], enabledRoleIds: string[], explicitRoleId?: string): { roleId?: string; error?: string } {
    if (explicitRoleId !== undefined) {
        if (!enabledRoleIds.includes(explicitRoleId)) {
            return { error: `<@&${explicitRoleId}> is not an invite-enabled role.` };
        }
        if (!heldRoleIds.includes(explicitRoleId)) {
            return { error: 'You do not hold that role.' };
        }
        return { roleId: explicitRoleId };
    }
    const intersection = heldRoleIds.filter((id) => enabledRoleIds.includes(id));
    if (intersection.length === 0) {
        return { error: 'You do not hold any invite-enabled roles.' };
    }
    if (intersection.length === 1) {
        return { roleId: intersection[0] };
    }
    return { error: 'You hold multiple invite-enabled roles. Specify which one with the role option.' };
}

export function resolveManagerRole(enabledRoleIds: string[], explicitRoleId?: string): { roleId?: string; error?: string } {
    if (explicitRoleId !== undefined) {
        if (!enabledRoleIds.includes(explicitRoleId)) {
            return { error: `<@&${explicitRoleId}> is not an invite-enabled role.` };
        }
        return { roleId: explicitRoleId };
    }
    if (enabledRoleIds.length === 0) {
        return { error: 'No invite-enabled roles in this guild. Enable one with /role invite enable first.' };
    }
    if (enabledRoleIds.length === 1) {
        return { roleId: enabledRoleIds[0] };
    }
    return { error: 'Multiple invite-enabled roles exist. Specify which one with the role option.' };
}

export function buildInviteJumpLink(guildId: string, channelId: string, messageId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

export function renderInviteTree(rows: Array<{ user_id: string; parent_user_id: string | null }>, names: Record<string, string>): string {
    const LIMIT = 1800;

    // Children are rendered in the order rows are passed in; callers pass rows in created_at-ascending
    // DB order, which preserves invite order. A row is a root when its parent_user_id is null or when no
    // row in the set has that user_id (orphan guard: e.g. the parent was forgotten).
    const known = new Set(rows.map((row) => row.user_id));
    const children = new Map<string, Array<{ user_id: string; parent_user_id: string | null }>>();
    const roots: Array<{ user_id: string; parent_user_id: string | null }> = [];
    for (const row of rows) {
        if (row.parent_user_id === null || !known.has(row.parent_user_id)) {
            roots.push(row);
        } else {
            const siblings = children.get(row.parent_user_id);
            if (siblings) {
                siblings.push(row);
            } else {
                children.set(row.parent_user_id, [row]);
            }
        }
    }

    const nameOf = (row: { user_id: string }): string => names[row.user_id] ?? `@${row.user_id}`;
    const lines: string[] = [];
    let length = 0;
    let rendered = 0;
    let truncated = false;

    // Appends a line if the tree so far still fits under the limit; returns false once the limit would
    // be exceeded, so rendering stops at a node boundary.
    const push = (line: string): boolean => {
        const next = lines.length > 0 ? length + 1 + line.length : line.length;
        if (next > LIMIT) {
            truncated = true;
            return false;
        }
        lines.push(line);
        length = next;
        rendered++;
        return true;
    };

    // Roots render as bare names; their subtrees start with no ancestor prefix.
    const walk = (nodes: Array<{ user_id: string; parent_user_id: string | null }>, prefix: string, depth: number): boolean => {
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const isLast = i === nodes.length - 1;
            const line = depth === 0 ? nameOf(node) : `${prefix}${isLast ? '└── ' : '├── '}${nameOf(node)}`;
            if (!push(line)) {
                return false;
            }
            const kids = children.get(node.user_id);
            if (kids && !walk(kids, depth === 0 ? '' : prefix + (isLast ? '    ' : '│   '), depth + 1)) {
                return false;
            }
        }
        return true;
    };

    walk(roots, '', 0);
    if (truncated) {
        lines.push(`… (${rows.length - rendered} more members not shown)`);
    }
    return lines.join('\n');
}

/**
 * Builds the full tree view for a role: accepted rows plus founding fathers (holders of the role
 * with no tree row) rendered as roots, and a display-name map. Returns null when the role no
 * longer exists. Shared by the tree command and the auto-updating tree panels.
 */
export async function getInviteTreeView(client: GargoyleClient, guild: Guild, roleId: string): Promise<InviteTreeView | null> {
    const rows = await getAcceptedTreeRows(client, guild.id, roleId);
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
        return null;
    }

    // role.members is a cache-backed collection; with the full GuildMembers intent the cache is
    // complete, so no REST call is needed for founding-father roots.
    const nodes: Array<{ user_id: string; parent_user_id: string | null }> = [];
    const names: Record<string, string> = {};
    const rowIds = new Set(rows.map((row) => row.user_id));
    for (const [id, member] of role.members) {
        names[id] = member.displayName;
        if (!rowIds.has(id)) {
            nodes.push({ user_id: id, parent_user_id: null });
        }
    }
    for (const row of rows) {
        nodes.push({ user_id: row.user_id, parent_user_id: row.parent_user_id });
    }

    // Skip ids already resolvable from the member cache and cap the fetch set: the tree renders at
    // most 1800 chars, so names past this cap are mostly truncated away, and fetching every member
    // of a large tree would exceed Discord's interaction deadline. Uncapped ids fall back to @id.
    const ids = [...new Set(rows.map((row) => row.user_id))];
    const toFetch: string[] = [];
    for (const id of ids) {
        if (names[id]) continue;
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

    return { nodes, names };
}

export function hashTreeContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
}

export function renderTreePanelContent(roleId: string, view: InviteTreeView): string {
    const footer = '-# This panel updates automatically when the tree changes.';
    if (view.nodes.length === 0) {
        return `**<@&${roleId}> invite tree** (0 members)\nNo members in the tree yet.\n${footer}`;
    }
    return `**<@&${roleId}> invite tree** (${view.nodes.length} members)\n\`\`\`\n${renderInviteTree(view.nodes, view.names)}\n\`\`\`\n${footer}`;
}

/**
 * Re-renders a stored tree panel in place: edits the message only when the rendered tree differs
 * from the stored hash, re-posts the message if it was deleted, and drops the panel row (and the
 * message, best-effort) if the role no longer exists.
 */
export async function syncTreePanel(client: GargoyleClient, panel: InviteTreePanel): Promise<void> {
    const guild = await client.guilds.fetch(panel.guild_id).catch(() => null);
    if (!guild) {
        return;
    }

    const role = await guild.roles.fetch(panel.role_id).catch(() => null);
    if (!role) {
        const channel = (await client.channels.fetch(panel.channel_id).catch(() => null)) as TextBasedChannel | null;
        const message = await channel?.messages.fetch(panel.message_id).catch(() => null);
        await message?.delete().catch(() => null);
        await deleteTreePanel(client, panel.guild_id, panel.role_id);
        return;
    }

    const view = await getInviteTreeView(client, guild, panel.role_id);
    if (!view) {
        return;
    }
    const content = renderTreePanelContent(panel.role_id, view);
    const hash = hashTreeContent(content);

    const channel = (await client.channels.fetch(panel.channel_id).catch(() => null)) as TextChannel | null;
    if (!channel) {
        client.logger.warning(
            `Invite tree panel channel ${panel.channel_id} for role ${panel.role_id} is not available; will retry on the next sweep.`
        );
        return;
    }

    const existing = panel.message_id ? await channel.messages.fetch(panel.message_id).catch(() => null) : null;
    if (existing && existing.content === content) {
        return;
    }

    let message = existing;
    if (existing) {
        message = await existing.edit({ content }).catch(() => null);
        if (!message) {
            client.logger.error(`Failed to edit invite tree panel message ${panel.message_id} in channel ${panel.channel_id}`);
            return;
        }
    } else {
        message = await channel.send({ content }).catch(() => null);
        if (!message) {
            client.logger.error(`Failed to send invite tree panel message in channel ${panel.channel_id}`);
            return;
        }
    }

    await setTreePanelState(client, panel.guild_id, panel.role_id, message.id, hash);
}
