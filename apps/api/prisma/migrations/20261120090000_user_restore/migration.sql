-- New enum values are only added here, never used (Postgres forbids using them in the same transaction).
ALTER TYPE "AuditType" ADD VALUE 'USER_RESTORED';
