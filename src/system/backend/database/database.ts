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
                url: `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:5432/${process.env.PG_DB}`
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

    public async getGuild(guildId: string) {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const guild = await this.drizzle.select().from(schema.guildsTable).where(eq(schema.guildsTable.guild_id, guildId)).execute();
        return guild[0] || null;
    }

    public async getGuildUser(userId: string, guildId: string) {
        if (!this.drizzle) {
            throw new Error('Database not connected');
        }

        const guildUser = await this.drizzle
            .select()
            .from(schema.guildUsersTable)
            .where(and(eq(schema.guildUsersTable.user_id, userId), eq(schema.guildUsersTable.guild_id, guildId)))
            .execute();
        return guildUser[0] || null;
    }
}

export default Database;
