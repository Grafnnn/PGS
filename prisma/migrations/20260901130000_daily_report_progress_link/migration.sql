ALTER TABLE "work_progress_entries"
  ADD COLUMN "daily_report_id" TEXT;

CREATE UNIQUE INDEX "work_progress_entries_daily_report_id_schedule_item_id_key"
  ON "work_progress_entries"("daily_report_id", "schedule_item_id");

CREATE INDEX "work_progress_entries_daily_report_id_idx"
  ON "work_progress_entries"("daily_report_id");

ALTER TABLE "work_progress_entries"
  ADD CONSTRAINT "work_progress_entries_daily_report_id_fkey"
  FOREIGN KEY ("daily_report_id") REFERENCES "daily_reports"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
