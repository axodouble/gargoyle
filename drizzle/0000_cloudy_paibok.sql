CREATE TABLE "guild_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"experience" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "guild_users_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"prefix" text DEFAULT ',' NOT NULL,
	"autoroles" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "guilds_guild_id_unique" UNIQUE("guild_id")
);
--> statement-breakpoint
CREATE INDEX "guild_user_user_idx" ON "guild_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "guild_user_guild_idx" ON "guild_users" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "guild_user_user_guild_idx" ON "guild_users" USING btree ("user_id","guild_id");--> statement-breakpoint
CREATE INDEX "guild_idx" ON "guilds" USING btree ("guild_id");