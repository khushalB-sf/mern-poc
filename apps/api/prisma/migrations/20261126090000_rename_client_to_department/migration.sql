-- Rename the department table family: client -> department. Pure rename, no data moves.
-- Constraint and index names are renamed too, so they match what Prisma generates from schema.prisma.
ALTER TABLE "client" RENAME TO "department";
ALTER TABLE "client_grant" RENAME TO "department_grant";
ALTER TABLE "client_tag" RENAME TO "department_tag";

ALTER TABLE "department_grant" RENAME COLUMN "client_id" TO "department_id";
ALTER TABLE "department_tag" RENAME COLUMN "client_id" TO "department_id";
ALTER TABLE "question" RENAME COLUMN "client_id" TO "department_id";
ALTER TABLE "tag" RENAME COLUMN "archived_by_client_id" TO "archived_by_department_id";

ALTER TABLE "department" RENAME CONSTRAINT "client_pkey" TO "department_pkey";
ALTER INDEX "client_name_key" RENAME TO "department_name_key";
ALTER TABLE "department_grant" RENAME CONSTRAINT "client_grant_pkey" TO "department_grant_pkey";
ALTER TABLE "department_grant" RENAME CONSTRAINT "client_grant_user_id_fkey" TO "department_grant_user_id_fkey";
ALTER TABLE "department_grant" RENAME CONSTRAINT "client_grant_client_id_fkey" TO "department_grant_department_id_fkey";
ALTER TABLE "department_tag" RENAME CONSTRAINT "client_tag_pkey" TO "department_tag_pkey";
ALTER TABLE "department_tag" RENAME CONSTRAINT "client_tag_tag_id_fkey" TO "department_tag_tag_id_fkey";
ALTER TABLE "department_tag" RENAME CONSTRAINT "client_tag_client_id_fkey" TO "department_tag_department_id_fkey";
ALTER TABLE "question" RENAME CONSTRAINT "question_client_id_fkey" TO "question_department_id_fkey";
ALTER TABLE "tag" RENAME CONSTRAINT "tag_archived_by_client_id_fkey" TO "tag_archived_by_department_id_fkey";

ALTER INDEX "client_tag_tag_id_idx" RENAME TO "department_tag_tag_id_idx";
ALTER INDEX "question_client_id_idx" RENAME TO "question_department_id_idx";
