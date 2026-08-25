CREATE TABLE "faction_panels" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "faction_panels_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE INDEX "faction_panel_guild_idx" ON "faction_panels" USING btree ("guild_id");