import { and, eq } from 'drizzle-orm';
import {
    ActionRowBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageActionRowComponentBuilder,
    MessageFlags,
    TextBasedChannel,
    TextDisplayBuilder
} from 'discord.js';
import GargoyleClient from '@classes/gargoyleClient.js';
import GargoyleModule from '@classes/gargoyleModule.js';
import GargoyleButtonBuilder from '@builders/gargoyleButtonBuilder.js';
import * as schema from '@src/system/backend/database/schema.js';

export type InviteTreeRow = typeof schema.roleInviteTreeTable.$inferSelect;

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
