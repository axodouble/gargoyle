CREATE TABLE "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"disablexpmsg" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "guilds" ADD COLUMN "experience" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "user_idx" ON "users" USING btree ("user_id");