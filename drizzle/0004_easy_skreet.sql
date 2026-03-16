ALTER TABLE "guild_users" RENAME COLUMN "lastdaily" TO "last_daily";--> statement-breakpoint
ALTER TABLE "guild_users" RENAME COLUMN "dailystreak" TO "daily_streak";--> statement-breakpoint
ALTER TABLE "guilds" RENAME COLUMN "autoroles" TO "auto_roles";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "disablexpmsg" TO "disable_xp_msg";