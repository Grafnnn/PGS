ALTER TABLE "schedule_items"
  ADD COLUMN "manual_actual_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN "report_actual_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "progress_mode" TEXT NOT NULL DEFAULT 'quantity',
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "is_current" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "superseded_at" TIMESTAMP(3);

UPDATE "schedule_items" AS schedule
SET "unit" = budget."unit"
FROM "budget_items" AS budget
WHERE schedule."budget_item_id" = budget."id"
  AND NULLIF(BTRIM(budget."unit"), '') IS NOT NULL;

UPDATE "schedule_items" AS schedule
SET "report_actual_qty" = COALESCE(progress.total_qty, 0),
    "manual_actual_qty" = GREATEST(schedule."actual_qty" - COALESCE(progress.total_qty, 0), 0),
    "actual_qty" = GREATEST(schedule."actual_qty", COALESCE(progress.total_qty, 0))
FROM (
  SELECT "schedule_item_id", SUM("qty") AS total_qty
  FROM "work_progress_entries"
  WHERE "schedule_item_id" IS NOT NULL AND "status" = 'approved'
  GROUP BY "schedule_item_id"
) AS progress
WHERE schedule."id" = progress."schedule_item_id";

UPDATE "schedule_items"
SET "manual_actual_qty" = "actual_qty"
WHERE "report_actual_qty" = 0;

CREATE INDEX "schedule_items_project_id_is_current_starts_at_idx"
ON "schedule_items"("project_id", "is_current", "starts_at");
