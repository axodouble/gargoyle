ALTER TABLE "guild_users" ALTER COLUMN "balance" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "guild_users" ADD COLUMN "lastdaily" timestamp DEFAULT '1970-01-01 00:00:00.000' NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_users" ADD COLUMN "dailystreak" integer DEFAULT 0 NOT NULL;