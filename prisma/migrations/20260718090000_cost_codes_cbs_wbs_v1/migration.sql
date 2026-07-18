CREATE TABLE "project_cost_codes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "parent_id" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "segment" TEXT NOT NULL DEFAULT 'cost',
  "cost_type" TEXT NOT NULL DEFAULT 'expense',
  "status" TEXT NOT NULL DEFAULT 'active',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_cost_codes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "budget_items" ADD COLUMN "cost_code_id" TEXT;
ALTER TABLE "schedule_items" ADD COLUMN "cost_code_id" TEXT;
ALTER TABLE "materials" ADD COLUMN "cost_code_id" TEXT;
ALTER TABLE "procurement_request_items" ADD COLUMN "cost_code_id" TEXT;
ALTER TABLE "payments" ADD COLUMN "cost_code_id" TEXT;
ALTER TABLE "project_change_order_items" ADD COLUMN "cost_code_id" TEXT;

CREATE UNIQUE INDEX "project_cost_codes_project_id_code_key" ON "project_cost_codes"("project_id", "code");
CREATE INDEX "project_cost_codes_project_id_parent_id_sort_order_idx" ON "project_cost_codes"("project_id", "parent_id", "sort_order");
CREATE INDEX "project_cost_codes_project_id_status_idx" ON "project_cost_codes"("project_id", "status");
CREATE INDEX "budget_items_cost_code_id_idx" ON "budget_items"("cost_code_id");
CREATE INDEX "schedule_items_cost_code_id_idx" ON "schedule_items"("cost_code_id");
CREATE INDEX "materials_cost_code_id_idx" ON "materials"("cost_code_id");
CREATE INDEX "procurement_request_items_cost_code_id_idx" ON "procurement_request_items"("cost_code_id");
CREATE INDEX "payments_cost_code_id_idx" ON "payments"("cost_code_id");
CREATE INDEX "project_change_order_items_cost_code_id_idx" ON "project_change_order_items"("cost_code_id");

ALTER TABLE "project_cost_codes"
  ADD CONSTRAINT "project_cost_codes_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_cost_codes"
  ADD CONSTRAINT "project_cost_codes_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "project_cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_items"
  ADD CONSTRAINT "budget_items_cost_code_id_fkey"
  FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "schedule_items"
  ADD CONSTRAINT "schedule_items_cost_code_id_fkey"
  FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "materials"
  ADD CONSTRAINT "materials_cost_code_id_fkey"
  FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "procurement_request_items"
  ADD CONSTRAINT "procurement_request_items_cost_code_id_fkey"
  FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_cost_code_id_fkey"
  FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_change_order_items"
  ADD CONSTRAINT "project_change_order_items_cost_code_id_fkey"
  FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
