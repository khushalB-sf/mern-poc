-- New enum values are only added here, never used (Postgres forbids using them in the same transaction).
ALTER TYPE "AuditType" ADD VALUE 'CLIENT_RESTORED';
ALTER TYPE "AuditType" ADD VALUE 'QUESTION_RESTORED';
ALTER TYPE "AuditType" ADD VALUE 'TAG_RETIRED';
ALTER TYPE "AuditType" ADD VALUE 'TAG_RESTORED';

ALTER TABLE "tag" ADD COLUMN "retired_at" TIMESTAMPTZ;
