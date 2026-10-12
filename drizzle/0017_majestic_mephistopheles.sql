CREATE TABLE "role_invite_tree" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text NOT NULL,
	"user_id" text NOT NULL,
	"parent_user_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"channel_id" text,
	"message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "role_invite_tree_guild_role_user_idx" UNIQUE("guild_id","role_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "invite_tree_roles" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "role_invite_tree_guild_role_idx" ON "role_invite_tree" USING btree ("guild_id","role_id");