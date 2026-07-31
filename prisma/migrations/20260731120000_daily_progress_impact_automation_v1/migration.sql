ALTER TABLE "daily_reports"
ADD COLUMN "material_actuals" JSONB,
ADD COLUMN "equipment_actuals" JSONB,
ADD COLUMN "impact_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "impact_applied_at" TIMESTAMP(3),
ADD COLUMN "impact_applied_by" TEXT,
ADD COLUMN "impact_summary" JSONB;

UPDATE "daily_reports"
SET "impact_status" = 'not_applicable'
WHERE "status" = 'approved';

ALTER TABLE "work_progress_entries"
ADD COLUMN "source_daily_report_id" TEXT,
ADD COLUMN "source_output_index" INTEGER;

CREATE INDEX "daily_reports_project_id_impact_status_date_idx"
ON "daily_reports"("project_id", "impact_status", "date");

CREATE INDEX "work_progress_entries_source_daily_report_id_idx"
ON "work_progress_entries"("source_daily_report_id");

CREATE UNIQUE INDEX "work_progress_entries_source_daily_report_id_source_output_index_key"
ON "work_progress_entries"("source_daily_report_id", "source_output_index");

ALTER TABLE "work_progress_entries"
ADD CONSTRAINT "work_progress_entries_source_daily_report_id_fkey"
FOREIGN KEY ("source_daily_report_id") REFERENCES "daily_reports"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
