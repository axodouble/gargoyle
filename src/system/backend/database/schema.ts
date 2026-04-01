import * as p from 'drizzle-orm/pg-core';

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
        p.index('guild_user_user_guild_idx').on(t.user_id, t.guild_id)
    ]
);

export const guildsTable = p.pgTable(
    'guilds',
    {
        guild_id: p.text().primaryKey().unique().notNull(),
        prefix: p.text().notNull().default(','),
        auto_roles: p.text().array().notNull().default([]),
        experience: p.boolean().notNull().default(true)
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
    (t) => [p.index('user_idx').on(t.user_id)]
);

export const aprilFirstTable = p.pgTable(
    'bgn_april_first',
    {
        user_id: p
            .text()
            .primaryKey()
            .unique()
            .notNull()
            .references(() => usersTable.user_id, { onDelete: 'cascade' }),
        message_rights: p.integer().notNull().default(5),
        mention_rights: p.integer().notNull().default(1),
        timeout_30: p.integer().notNull().default(0),
        amount_spent: p.integer().notNull().default(0),
        total_protests: p.integer().notNull().default(0),
        last_protest: p.timestamp().notNull().default(new Date(0)),
        total_protesters_amassed: p.integer().notNull().default(0),
        total_protesters_against: p.integer().notNull().default(0)
    },
    (t) => [p.index('april_first_user_idx').on(t.user_id)]
);
