-- Technologies belong to departments (many-to-many); "retired" is renamed "archived".
ALTER TYPE "AuditType" RENAME VALUE 'TAG_RETIRED' TO 'TAG_ARCHIVED';
-- New enum values are only added here, never used (Postgres forbids using them in the same transaction).
ALTER TYPE "AuditType" ADD VALUE 'TAG_CREATED';
ALTER TYPE "AuditType" ADD VALUE 'TAG_UPDATED';
ALTER TYPE "AuditType" ADD VALUE 'TAG_LINKED';
ALTER TYPE "AuditType" ADD VALUE 'TAG_UNLINKED';

ALTER TABLE "tag" RENAME COLUMN "retired_at" TO "archived_at";

CREATE TABLE "client_tag" (
  "client_id" UUID NOT NULL,
  "tag_id" UUID NOT NULL,
  CONSTRAINT "client_tag_pkey" PRIMARY KEY ("client_id", "tag_id"),
  CONSTRAINT "client_tag_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "client_tag_tag_id_idx" ON "client_tag"("tag_id");

-- Backfill 1: the department / technology lists the seed defines.
INSERT INTO "client_tag" ("client_id", "tag_id")
SELECT c.id, t.id
FROM (VALUES
  ('MERN', 'react'),
  ('MERN', 'nodejs'),
  ('MERN', 'express'),
  ('MERN', 'mongodb'),
  ('MERN', 'typescript'),
  ('MEAN', 'angular'),
  ('MEAN', 'nodejs'),
  ('MEAN', 'express'),
  ('MEAN', 'mongodb'),
  ('MEAN', 'typescript'),
  ('Python', 'python'),
  ('Python', 'django'),
  ('Python', 'fastapi'),
  ('Python', 'postgresql'),
  ('AI-ML', 'python'),
  ('AI-ML', 'machine-learning'),
  ('AI-ML', 'pytorch'),
  ('AI-ML', 'nlp'),
  ('Data Engineering', 'sql'),
  ('Data Engineering', 'spark'),
  ('Data Engineering', 'kafka'),
  ('Data Engineering', 'airflow'),
  ('Data Engineering', 'python'),
  ('Data Engineering', 'postgresql'),
  ('DevOps', 'docker'),
  ('DevOps', 'kubernetes'),
  ('DevOps', 'aws'),
  ('DevOps', 'terraform')
) AS m(department, technology)
JOIN "client" c ON c.name = m.department
JOIN "tag_category" cat ON cat.slug = 'technology'
JOIN "tag" t ON t.category_id = cat.id AND t.value = m.technology
ON CONFLICT DO NOTHING;

-- Backfill 2: any technology a department's existing questions already carry, so nothing is hidden.
INSERT INTO "client_tag" ("client_id", "tag_id")
SELECT DISTINCT q.client_id, qt.tag_id
FROM "question_tag" qt
JOIN "question" q ON q.id = qt.question_id AND q.client_id IS NOT NULL
JOIN "tag" t ON t.id = qt.tag_id
JOIN "tag_category" cat ON cat.id = t.category_id AND cat.slug = 'technology'
ON CONFLICT DO NOTHING;
