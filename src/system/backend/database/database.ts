import GargoyleClient from '@src/system/backend/classes/gargoyleClient.js';

import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import * as schema from './schema';
import { and, eq } from 'drizzle-orm';

class Database {
    public willConnect: boolean = true;
    private client: GargoyleClient;
    public sql: SQL | null = null;
    public drizzle: ReturnType<typeof drizzle> | null = null;
    public schema = schema;

    constructor(client: GargoyleClient) {
        this.client = client;

        if (!process.env.PG_USER || !process.env.PG_PASSWORD || !process.env.PG_DB || !process.env.PG_HOST) {
            this.client.logger.warning('No PostgreSQL credentials provided', 'No database connection will be established');
            this.willConnect = false;
            this.client.db = null;
        }
    }

    public async connect(): Promise<void> {
        this.client.logger.log('Connecting to the database...');

        try {
            if (!process.env.PG_USER || !process.env.PG_PASSWORD || !process.env.PG_DB || !process.env.PG_HOST) {
                throw new Error('Missing PostgreSQL credentials');
            }
            const sqlClient = new SQL({
                url: `postgresql://${encodeURIComponent(process.env.PG_USER)}:${encodeURIComponent(process.env.PG_PASSWORD)}@${process.env.PG_HOST}:5432/${process.env.PG_DB}`
            });
            this.sql = sqlClient;
            this.drizzle = drizzle(sqlClient, { schema });
            this.client.logger.log('Database connection established successfully');
        } catch (error) {
            this.client.logger.error('Error connecting to the database', error instanceof Error ? error.stack || error.message : String(error));
            this.willConnect = false;
            this.client.db = null;
        }
    }

    public async getGuild(guildId: string, options: { exists: true }): Promise<typeof schema.guildsTable.$inferSelect>;
    public async getGuild(guildId: string, options?: { exists?: false | undefined }): Promise<typeof schema.guildsTable.$inferSelect | null>;
    public async getGuild(guildId: string, options?: { exists?: boolean }): Promise<typeof schema.guildsTable.$inferSelect | null> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const guild = await this.drizzle.select().from(schema.guildsTable).where(eq(schema.guildsTable.guild_id, guildId)).execute();
        if (options?.exists && guild.length === 0) {
            await this.drizzle.insert(schema.guildsTable).values({ guild_id: guildId }).execute();
            return (await this.getGuild(guildId, { exists: true })) as typeof schema.guildsTable.$inferSelect;
        }
        return guild[0] || null;
    }

    public async setGuild(
        guildId: string,
        data: Partial<Omit<typeof schema.guildsTable.$inferInsert, 'guild_id'>>
    ): Promise<typeof schema.guildsTable.$inferSelect> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const existingGuild = await this.getGuild(guildId, { exists: true });
        if (existingGuild) {
            await this.drizzle.update(schema.guildsTable).set(data).where(eq(schema.guildsTable.guild_id, guildId)).execute();
        } else {
            await this.drizzle
                .insert(schema.guildsTable)
                .values([{ guild_id: guildId, ...data }])
                .execute();
        }
        return await this.getGuild(guildId, { exists: true });
    }

    public async getGuildUser(userId: string, guildId: string, options: { exists: true }): Promise<typeof schema.guildUsersTable.$inferSelect>;
    public async getGuildUser(
        userId: string,
        guildId: string,
        options?: { exists?: false | undefined }
    ): Promise<typeof schema.guildUsersTable.$inferSelect | null>;
    public async getGuildUser(
        userId: string,
        guildId: string,
        options?: { exists?: boolean }
    ): Promise<typeof schema.guildUsersTable.$inferSelect | null> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const guildUser = await this.drizzle
            .select()
            .from(schema.guildUsersTable)
            .where(and(eq(schema.guildUsersTable.user_id, userId), eq(schema.guildUsersTable.guild_id, guildId)))
            .execute();
        if (options?.exists && guildUser.length === 0) {
            await this.drizzle.insert(schema.guildUsersTable).values({ user_id: userId, guild_id: guildId }).execute();
            return (await this.getGuildUser(userId, guildId, { exists: true })) as typeof schema.guildUsersTable.$inferSelect;
        }
        return guildUser[0] || null;
    }

    public async setGuildUser(
        userId: string,
        guildId: string,
        data: Partial<Omit<typeof schema.guildUsersTable.$inferInsert, 'user_id' | 'guild_id'>>
    ): Promise<typeof schema.guildUsersTable.$inferSelect> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const existingUser = await this.getGuildUser(userId, guildId, { exists: true });
        if (existingUser) {
            await this.drizzle
                .update(schema.guildUsersTable)
                .set(data)
                .where(and(eq(schema.guildUsersTable.user_id, userId), eq(schema.guildUsersTable.guild_id, guildId)))
                .execute();
        } else {
            await this.drizzle
                .insert(schema.guildUsersTable)
                .values([{ user_id: userId, guild_id: guildId, ...data }])
                .execute();
        }
        return await this.getGuildUser(userId, guildId, { exists: true });
    }

    public async getUser(userId: string, options: { exists: true }): Promise<typeof schema.usersTable.$inferSelect>;
    public async getUser(userId: string, options?: { exists?: false | undefined }): Promise<typeof schema.usersTable.$inferSelect | null>;
    public async getUser(userId: string, options?: { exists?: boolean }): Promise<typeof schema.usersTable.$inferSelect | null> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const user = await this.drizzle.select().from(schema.usersTable).where(eq(schema.usersTable.user_id, userId)).execute();
        if (options?.exists && user.length === 0) {
            await this.drizzle.insert(schema.usersTable).values({ user_id: userId }).execute();
            return (await this.getUser(userId, { exists: true })) as typeof schema.usersTable.$inferSelect;
        }
        return user[0] || null;
    }

    public async setUser(
        userId: string,
        data: Partial<Omit<typeof schema.usersTable.$inferInsert, 'user_id'>>
    ): Promise<typeof schema.usersTable.$inferSelect> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const existingUser = await this.getUser(userId, { exists: true });
        if (existingUser) {
            await this.drizzle.update(schema.usersTable).set(data).where(eq(schema.usersTable.user_id, userId)).execute();
        } else {
            await this.drizzle
                .insert(schema.usersTable)
                .values([{ user_id: userId, ...data }])
                .execute();
        }
        return await this.getUser(userId, { exists: true });
    }

    /**
     * This will set multiple users at once in a single transaction.
     * This is necessary for transactions which require atomicity,
     * such as transferring balance.
     * @param users The users to set
     */
    public async setUsers(
        users: Array<{ user_id: string } & Omit<Partial<typeof schema.usersTable.$inferInsert>, 'user_id'>>
    ): Promise<Array<typeof schema.usersTable.$inferSelect>> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        await this.drizzle.transaction(async (tx) => {
            for (const user of users) {
                if (!user.user_id) {
                    throw new Error('User ID is required');
                }
                const existingUser = await tx.select().from(schema.usersTable).where(eq(schema.usersTable.user_id, user.user_id)).execute();
                if (existingUser.length > 0) {
                    await tx.update(schema.usersTable).set(user).where(eq(schema.usersTable.user_id, user.user_id)).execute();
                } else {
                    await tx
                        .insert(schema.usersTable)
                        .values(user as typeof schema.usersTable.$inferInsert)
                        .execute();
                }
            }
        });

        const data: Array<typeof schema.usersTable.$inferSelect> = [];
        for (const user of users) {
            if (!user.user_id) {
                throw new Error('User ID is required');
            }
            const updatedUser = await this.getUser(user.user_id, { exists: true });
            if (updatedUser) {
                data.push(updatedUser);
            }
        }
        return data;
    }

    public async getFullUser(
        userId: string,
        guildId: string
    ): Promise<{ user: typeof schema.usersTable.$inferSelect; guildUser: typeof schema.guildUsersTable.$inferSelect }> {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const user = await this.getUser(userId, { exists: true });
        const guildUser = await this.getGuildUser(userId, guildId, { exists: true });

        if (!user || !guildUser) {
            throw new Error('User or guild user not found');
        }

        return { user, guildUser };
    }
}

export default Database;
