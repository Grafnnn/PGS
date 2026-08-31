ALTER TABLE "daily_reports"
  ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'closed',
  ADD COLUMN "work_category" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "planned_works" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "crew_members" JSONB;

ALTER TABLE "daily_reports"
  ADD CONSTRAINT "daily_reports_phase_check"
  CHECK ("phase" IN ('open', 'closed'));

CREATE INDEX "daily_reports_project_id_date_phase_idx"
  ON "daily_reports"("project_id", "date", "phase");

ALTER TABLE "documents"
  ADD COLUMN "daily_report_id" TEXT;

CREATE INDEX "documents_daily_report_id_idx"
  ON "documents"("daily_report_id");

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_daily_report_id_fkey"
  FOREIGN KEY ("daily_report_id") REFERENCES "daily_reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
