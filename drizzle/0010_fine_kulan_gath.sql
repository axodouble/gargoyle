CREATE TABLE "application_cooldowns" (
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"until" timestamp NOT NULL,
	"duration_ms" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "application_cooldowns_pkey" PRIMARY KEY("guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"faction_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"answers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thread_id" text,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "blacklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"faction_id" integer,
	"reason" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"leader_role_id" text NOT NULL,
	"application_channel_id" text NOT NULL,
	"accept_role_id" text,
	"deny_role_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "faction_guild_name_idx" UNIQUE("guild_id","name")
);
--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "cooldown_ms" bigint DEFAULT 259200000 NOT NULL;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklists" ADD CONSTRAINT "blacklists_faction_id_factions_id_fk" FOREIGN KEY ("faction_id") REFERENCES "public"."factions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_guild_user_idx" ON "applications" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "application_faction_status_idx" ON "applications" USING btree ("faction_id","status");--> statement-breakpoint
CREATE INDEX "blacklist_guild_user_idx" ON "blacklists" USING btree ("guild_id","user_id");--> statement-breakpoint
CREATE INDEX "faction_guild_idx" ON "factions" USING btree ("guild_id");