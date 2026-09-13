ALTER TABLE "factions" ADD COLUMN "accept_role_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "factions" SET "accept_role_ids" = to_jsonb(ARRAY["accept_role_id"]) WHERE "accept_role_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "factions" DROP COLUMN "accept_role_id";