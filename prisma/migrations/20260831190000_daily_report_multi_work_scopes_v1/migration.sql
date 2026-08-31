ALTER TABLE "daily_reports"
  ADD COLUMN "work_scopes" JSONB;

UPDATE "daily_reports"
SET "work_scopes" = jsonb_build_array(
  jsonb_build_object(
    'workName', btrim("work_category"),
    'source', 'manual'
  )
)
WHERE btrim("work_category") <> '';
