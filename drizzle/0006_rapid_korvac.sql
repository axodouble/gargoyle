CREATE TABLE "bgn_april_first" (
	"user_id" text PRIMARY KEY NOT NULL,
	"message_rights" integer DEFAULT 5 NOT NULL,
	"mention_rights" integer DEFAULT 1 NOT NULL,
	"timeout_30" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "bgn_april_first_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "bgn_april_first" ADD CONSTRAINT "bgn_april_first_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "april_first_user_idx" ON "bgn_april_first" USING btree ("user_id");