import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import GargoyleClient from '@classes/gargoyleClient.js';
import * as schema from '@src/system/backend/database/schema.js';
import { ApplicationAnswer } from '@src/system/backend/database/schema.js';

export type FactionRow = typeof schema.factionsTable.$inferSelect;
export type ApplicationRow = typeof schema.applicationsTable.$inferSelect;
export type BlacklistRow = typeof schema.blacklistsTable.$inferSelect;

function requireDb(client: GargoyleClient) {
    const db = client.db;
    if (!db?.drizzle) {
        throw new Error('Database not connected');
    }
    return db.drizzle;
}

export function listFactions(client: GargoyleClient, guildId: string): Promise<FactionRow[]> {
    return requireDb(client).select().from(schema.factionsTable).where(eq(schema.factionsTable.guild_id, guildId)).execute();
}

export async function getFaction(client: GargoyleClient, factionId: number): Promise<FactionRow | null> {
    const rows = await requireDb(client).select().from(schema.factionsTable).where(eq(schema.factionsTable.id, factionId)).execute();
    return rows[0] ?? null;
}

export async function getFactionByName(client: GargoyleClient, guildId: string, name: string): Promise<FactionRow | null> {
    const rows = await requireDb(client)
        .select()
        .from(schema.factionsTable)
        .where(and(eq(schema.factionsTable.guild_id, guildId), eq(schema.factionsTable.name, name)))
        .execute();
    return rows[0] ?? null;
}

export async function createFaction(
    client: GargoyleClient,
    data: {
        guild_id: string;
        name: string;
        description: string;
        leader_role_id: string;
        application_channel_id: string;
        accept_role_id: string | null;
        deny_role_id: string | null;
    }
): Promise<FactionRow> {
    const rows = await requireDb(client)
        .insert(schema.factionsTable)
        .values({ ...data, questions: [], enabled: true })
        .returning()
        .execute();
    return rows[0];
}

export async function updateFaction(
    client: GargoyleClient,
    factionId: number,
    data: Partial<
        Pick<
            FactionRow,
            'name' | 'description' | 'leader_role_id' | 'application_channel_id' | 'accept_role_id' | 'deny_role_id' | 'enabled' | 'questions'
        >
    >
): Promise<void> {
    await requireDb(client).update(schema.factionsTable).set(data).where(eq(schema.factionsTable.id, factionId)).execute();
}

export async function getApplication(client: GargoyleClient, applicationId: number): Promise<ApplicationRow | null> {
    const rows = await requireDb(client).select().from(schema.applicationsTable).where(eq(schema.applicationsTable.id, applicationId)).execute();
    return rows[0] ?? null;
}

export async function getPendingApplication(
    client: GargoyleClient,
    guildId: string,
    userId: string,
    factionId: number
): Promise<ApplicationRow | null> {
    const rows = await requireDb(client)
        .select()
        .from(schema.applicationsTable)
        .where(
            and(
                eq(schema.applicationsTable.guild_id, guildId),
                eq(schema.applicationsTable.user_id, userId),
                eq(schema.applicationsTable.faction_id, factionId),
                eq(schema.applicationsTable.status, 'pending')
            )
        )
        .execute();
    return rows[0] ?? null;
}

export async function createApplication(
    client: GargoyleClient,
    data: { guild_id: string; faction_id: number; user_id: string; answers: ApplicationAnswer[]; thread_id: string | null }
): Promise<ApplicationRow> {
    const rows = await requireDb(client).insert(schema.applicationsTable).values(data).returning().execute();
    return rows[0];
}

export async function updateApplication(
    client: GargoyleClient,
    applicationId: number,
    data: Partial<Pick<ApplicationRow, 'status' | 'thread_id' | 'decided_at' | 'decided_by' | 'reason'>>
): Promise<void> {
    await requireDb(client).update(schema.applicationsTable).set(data).where(eq(schema.applicationsTable.id, applicationId)).execute();
}

export function listApplicationsByUser(client: GargoyleClient, guildId: string, userId: string): Promise<ApplicationRow[]> {
    return requireDb(client)
        .select()
        .from(schema.applicationsTable)
        .where(and(eq(schema.applicationsTable.guild_id, guildId), eq(schema.applicationsTable.user_id, userId)))
        .orderBy(desc(schema.applicationsTable.submitted_at))
        .execute();
}

export async function getActiveBlacklist(client: GargoyleClient, guildId: string, userId: string, factionId: number): Promise<BlacklistRow | null> {
    const rows = await requireDb(client)
        .select()
        .from(schema.blacklistsTable)
        .where(
            and(
                eq(schema.blacklistsTable.guild_id, guildId),
                eq(schema.blacklistsTable.user_id, userId),
                or(eq(schema.blacklistsTable.faction_id, factionId), isNull(schema.blacklistsTable.faction_id)),
                or(isNull(schema.blacklistsTable.expires_at), gt(schema.blacklistsTable.expires_at, new Date()))
            )
        )
        .execute();
    return rows[0] ?? null;
}

export async function createBlacklist(
    client: GargoyleClient,
    data: { guild_id: string; user_id: string; faction_id: number | null; reason: string | null; created_by: string; expires_at: Date | null }
): Promise<BlacklistRow> {
    const rows = await requireDb(client).insert(schema.blacklistsTable).values(data).returning().execute();
    return rows[0];
}

export function listActiveBlacklists(client: GargoyleClient, guildId: string, factionId: number | null): Promise<BlacklistRow[]> {
    return requireDb(client)
        .select()
        .from(schema.blacklistsTable)
        .where(
            and(
                eq(schema.blacklistsTable.guild_id, guildId),
                factionId === null ? isNull(schema.blacklistsTable.faction_id) : eq(schema.blacklistsTable.faction_id, factionId),
                or(isNull(schema.blacklistsTable.expires_at), gt(schema.blacklistsTable.expires_at, new Date()))
            )
        )
        .execute();
}

export async function getCooldownEnd(client: GargoyleClient, guildId: string, userId: string): Promise<Date | null> {
    const rows = await requireDb(client)
        .select()
        .from(schema.applicationCooldownsTable)
        .where(and(eq(schema.applicationCooldownsTable.guild_id, guildId), eq(schema.applicationCooldownsTable.user_id, userId)))
        .execute();
    const row = rows[0];
    if (!row) {
        return null;
    }
    const until = new Date(row.until);
    return until.getTime() > Date.now() ? until : null;
}

export async function setCooldown(client: GargoyleClient, guildId: string, userId: string, until: Date, durationMs: number): Promise<void> {
    await requireDb(client)
        .insert(schema.applicationCooldownsTable)
        .values({ guild_id: guildId, user_id: userId, until, duration_ms: durationMs })
        .onConflictDoUpdate({
            target: [schema.applicationCooldownsTable.guild_id, schema.applicationCooldownsTable.user_id],
            set: { until, duration_ms: durationMs }
        })
        .execute();
}

export async function getCooldownDuration(client: GargoyleClient, guildId: string): Promise<number> {
    const db = client.db;
    if (!db) {
        throw new Error('Database not connected');
    }
    const guild = await db.getGuild(guildId, { exists: true });
    return guild.cooldown_ms;
}

export async function setCooldownDuration(client: GargoyleClient, guildId: string, ms: number): Promise<void> {
    const db = client.db;
    if (!db) {
        throw new Error('Database not connected');
    }
    await db.setGuild(guildId, { cooldown_ms: ms });
}
