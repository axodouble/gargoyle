import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: './drizzle',
    schema: './src/system/backend/database/schema.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:5432/${process.env.PG_DB}`
    }
});
