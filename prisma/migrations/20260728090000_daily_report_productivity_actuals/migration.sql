ALTER TABLE "daily_reports"
  ADD COLUMN "work_outputs" JSONB;

CREATE INDEX "daily_reports_organization_id_status_date_idx"
  ON "daily_reports"("organization_id", "status", "date");
