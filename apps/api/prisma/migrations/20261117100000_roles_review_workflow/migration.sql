-- New enum values are only added here, never used: Postgres forbids using a value added in the same transaction.
ALTER TYPE "Role" ADD VALUE 'ADMIN';
ALTER TYPE "AuditType" ADD VALUE 'QUESTION_APPROVED';
ALTER TYPE "AuditType" ADD VALUE 'QUESTION_REJECTED';
ALTER TYPE "AuditType" ADD VALUE 'USER_ROLE_CHANGED';
ALTER TYPE "AuditType" ADD VALUE 'USER_CLIENTS_CHANGED';
ALTER TYPE "AuditType" ADD VALUE 'CLIENT_CREATED';

CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Questions that exist before the review workflow were already live: backfill them as APPROVED,
-- then make PENDING the default for everything created from now on.
ALTER TABLE "question"
    ADD COLUMN "status" "QuestionStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "review_note" TEXT,
    ADD COLUMN "reviewed_by_id" UUID,
    ADD COLUMN "reviewed_at" TIMESTAMPTZ;
ALTER TABLE "question" ALTER COLUMN "status" SET DEFAULT 'PENDING';

CREATE INDEX "question_status_idx" ON "question"("status");

ALTER TABLE "question" ADD CONSTRAINT "question_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
