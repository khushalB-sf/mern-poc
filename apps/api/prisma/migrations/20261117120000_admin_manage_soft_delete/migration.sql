-- New enum values are only added here, never used (Postgres forbids using them in the same transaction).
ALTER TYPE "AuditType" ADD VALUE 'QUESTION_DELETED';
ALTER TYPE "AuditType" ADD VALUE 'USER_CREATED';
ALTER TYPE "AuditType" ADD VALUE 'USER_UPDATED';
ALTER TYPE "AuditType" ADD VALUE 'USER_DELETED';
ALTER TYPE "AuditType" ADD VALUE 'CLIENT_UPDATED';
ALTER TYPE "AuditType" ADD VALUE 'CLIENT_DELETED';

ALTER TABLE "app_user" ADD COLUMN "deleted_at" TIMESTAMPTZ;
ALTER TABLE "client" ADD COLUMN "description" TEXT, ADD COLUMN "deleted_at" TIMESTAMPTZ;
ALTER TABLE "question" ADD COLUMN "deleted_at" TIMESTAMPTZ;
