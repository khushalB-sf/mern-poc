-- Which department's deletion archived a technology, so a restore no longer has to guess from timestamps.
ALTER TABLE "tag" ADD COLUMN "archived_by_client_id" UUID;
ALTER TABLE "tag"
  ADD CONSTRAINT "tag_archived_by_client_id_fkey"
  FOREIGN KEY ("archived_by_client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: an archived technology whose archive time equals the deletion time of a department it is linked to.
UPDATE "tag" t
SET "archived_by_client_id" = c.id
FROM "client_tag" ct
JOIN "client" c ON c.id = ct.client_id
WHERE ct.tag_id = t.id
  AND t.archived_at IS NOT NULL
  AND c.deleted_at IS NOT NULL
  AND t.archived_at = c.deleted_at;
