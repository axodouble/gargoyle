ALTER TABLE "guild_users"
DROP CONSTRAINT "guild_users_user_id_unique";
--> statement-breakpoint

ALTER TABLE "guild_users"
ADD CONSTRAINT "guild_users_pkey" PRIMARY KEY ("user_id", "guild_id");