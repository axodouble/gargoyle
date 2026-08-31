BEGIN;

ALTER TABLE "users"
    ALTER COLUMN "disable_xp_msg" SET DEFAULT true;

UPDATE "users"
SET "disable_xp_msg" = true;

COMMIT;