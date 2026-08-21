import * as p from 'drizzle-orm/pg-core';

export interface FactionQuestion {
    label: string;
    placeholder: string;
}

export interface ApplicationAnswer {
    label: string;
    value: string;
}

export const guildUsersTable = p.pgTable(
    'guild_users',
    {
        user_id: p.text().notNull(),
        guild_id: p.text().notNull(),
        last_daily: p.timestamp().notNull().default(new Date(0)),
        daily_streak: p.integer().notNull().default(0),
        experience: p.bigint({ mode: 'number' }).notNull().default(0)
    },
    (t) => [
        p.primaryKey({ columns: [t.user_id, t.guild_id], name: 'guild_users_pkey' }),
        p.index('guild_user_user_idx').on(t.user_id),
        p.index('guild_user_guild_idx').on(t.guild_id),
        p.index('guild_user_guild_user_idx').on(t.guild_id, t.user_id),
        p.index('guild_user_user_guild_idx').on(t.user_id, t.guild_id)
    ]
);

export const guildsTable = p.pgTable(
    'guilds',
    {
        guild_id: p.text().primaryKey().unique().notNull(),
        prefix: p.text().notNull().default(','),
        auto_roles: p.text().array().notNull().default([]),
        experience: p.boolean().notNull().default(true),
        cooldown_ms: p.bigint({ mode: 'number' }).notNull().default(259200000)
    },
    (t) => [p.index('guild_idx').on(t.guild_id)]
);

export const usersTable = p.pgTable(
    'users',
    {
        user_id: p.text().primaryKey().unique().notNull(),
        balance: p.bigint({ mode: 'number' }).notNull().default(100),
        disable_xp_msg: p.boolean().notNull().default(false)
    },
    (t) => [p.index('user_idx').on(t.user_id), p.index('user_balance_idx').on(t.balance)]
);

export const factionsTable = p.pgTable(
    'factions',
    {
        id: p.serial().primaryKey().notNull(),
        guild_id: p.text().notNull(),
        name: p.text().notNull(),
        description: p.text().notNull().default(''),
        leader_role_id: p.text().notNull(),
        application_channel_id: p.text().notNull(),
        accept_role_id: p.text(),
        deny_role_id: p.text(),
        enabled: p.boolean().notNull().default(true),
        questions: p.jsonb('questions').$type<FactionQuestion[]>().notNull().default([])
    },
    (t) => [p.index('faction_guild_idx').on(t.guild_id), p.unique('faction_guild_name_idx').on(t.guild_id, t.name)]
);

export const applicationsTable = p.pgTable(
    'applications',
    {
        id: p.serial().primaryKey().notNull(),
        guild_id: p.text().notNull(),
        faction_id: p
            .integer()
            .notNull()
            .references(() => factionsTable.id),
        user_id: p.text().notNull(),
        status: p.text().notNull().default('pending'),
        answers: p.jsonb('answers').$type<ApplicationAnswer[]>().notNull().default([]),
        thread_id: p.text(),
        message_id: p.text(),
        submitted_at: p.timestamp().notNull().defaultNow(),
        decided_at: p.timestamp(),
        decided_by: p.text(),
        reason: p.text()
    },
    (t) => [p.index('application_guild_user_idx').on(t.guild_id, t.user_id), p.index('application_faction_status_idx').on(t.faction_id, t.status)]
);

export const blacklistsTable = p.pgTable(
    'blacklists',
    {
        id: p.serial().primaryKey().notNull(),
        guild_id: p.text().notNull(),
        user_id: p.text().notNull(),
        faction_id: p.integer().references(() => factionsTable.id),
        reason: p.text(),
        created_by: p.text().notNull(),
        expires_at: p.timestamp(),
        created_at: p.timestamp().notNull().defaultNow()
    },
    (t) => [p.index('blacklist_guild_user_idx').on(t.guild_id, t.user_id)]
);

export const applicationCooldownsTable = p.pgTable(
    'application_cooldowns',
    {
        guild_id: p.text().notNull(),
        user_id: p.text().notNull(),
        until: p.timestamp().notNull(),
        duration_ms: p.bigint({ mode: 'number' }).notNull().default(0)
    },
    (t) => [p.primaryKey({ columns: [t.guild_id, t.user_id], name: 'application_cooldowns_pkey' })]
);
