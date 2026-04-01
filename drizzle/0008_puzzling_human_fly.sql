ALTER TABLE "bgn_april_first" ADD COLUMN "total_protests" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bgn_april_first" ADD COLUMN "last_protest" timestamp DEFAULT '1970-01-01 00:00:00.000' NOT NULL;--> statement-breakpoint
ALTER TABLE "bgn_april_first" ADD COLUMN "total_protesters_amassed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bgn_april_first" ADD COLUMN "total_protesters_against" integer DEFAULT 0 NOT NULL;