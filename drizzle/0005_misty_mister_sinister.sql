ALTER TABLE "users" ADD COLUMN "balance" bigint DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "guild_users" DROP COLUMN "balance";