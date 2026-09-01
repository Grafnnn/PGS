ALTER TABLE "procurement_requests"
  ADD COLUMN "request_number" TEXT,
  ADD COLUMN "expected_at" TIMESTAMP(3),
  ADD COLUMN "lead_time_days" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "group_key" TEXT,
  ADD COLUMN "submitted_at" TIMESTAMP(3),
  ADD COLUMN "approved_at" TIMESTAMP(3),
  ADD COLUMN "approved_by" TEXT,
  ADD COLUMN "received_at" TIMESTAMP(3);

ALTER TABLE "procurement_request_items"
  ADD COLUMN "received_qty" DECIMAL(14,3) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "procurement_requests_project_id_request_number_key"
  ON "procurement_requests"("project_id", "request_number");

CREATE INDEX "procurement_requests_project_id_status_needed_at_idx"
  ON "procurement_requests"("project_id", "status", "needed_at");
