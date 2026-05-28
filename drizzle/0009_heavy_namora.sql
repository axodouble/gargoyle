ALTER TABLE "bgn_april_first" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "bgn_april_first" CASCADE;--> statement-breakpoint
CREATE INDEX "guild_user_guild_user_idx" ON "guild_users" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "user_balance_idx" ON "users" USING btree ("balance");