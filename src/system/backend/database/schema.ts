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
    (t) => [
        p.index('user_idx').on(t.user_id),
        p.index('user_balance_idx').on(t.balance)
    ]
);

