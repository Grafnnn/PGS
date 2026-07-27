ALTER TABLE "organization_resources"
  ADD COLUMN "gross_monthly_salary" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "organization_resources"
SET "gross_monthly_salary" = CASE
  WHEN "kind" IN ('worker', 'engineer', 'crew') AND "employment_type" <> 'subcontract' AND "headcount" > 0
    THEN ROUND("monthly_cost" / "headcount", 2)
  ELSE 0
END;

CREATE TABLE "project_payroll_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "insurance_contribution_rate" DECIMAL(6,3) NOT NULL DEFAULT 30,
  "accident_contribution_rate" DECIMAL(6,3) NOT NULL DEFAULT 0,
  "personal_income_tax_rate" DECIMAL(6,3) NOT NULL DEFAULT 13,
  "working_hours_per_month" DECIMAL(8,2) NOT NULL DEFAULT 160,
  "source_year" INTEGER NOT NULL DEFAULT 2026,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_payroll_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_payroll_policies_rates_check" CHECK (
    "insurance_contribution_rate" >= 0 AND "insurance_contribution_rate" <= 100
    AND "accident_contribution_rate" >= 0 AND "accident_contribution_rate" <= 100
    AND "personal_income_tax_rate" >= 0 AND "personal_income_tax_rate" <= 100
  ),
  CONSTRAINT "project_payroll_policies_hours_check" CHECK ("working_hours_per_month" > 0)
);

CREATE TABLE "project_labor_demands" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "import_batch_id" TEXT,
  "category" TEXT NOT NULL,
  "profession" TEXT NOT NULL,
  "function" TEXT,
  "gross_monthly_salary" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "peak_headcount" DECIMAL(10,3) NOT NULL DEFAULT 0,
  "person_months" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "planned_hours" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "productivity_norm" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "productivity_unit" TEXT,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "monthly_profile" JSONB,
  "source" TEXT NOT NULL,
  "source_sheet" TEXT,
  "source_row" INTEGER,
  "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_labor_demands_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_labor_demands_category_check" CHECK ("category" IN ('worker', 'engineer', 'crew')),
  CONSTRAINT "project_labor_demands_values_check" CHECK (
    "gross_monthly_salary" >= 0
    AND "peak_headcount" >= 0
    AND "person_months" >= 0
    AND "planned_hours" >= 0
    AND "productivity_norm" >= 0
    AND "confidence" >= 0
    AND "confidence" <= 1
  ),
  CONSTRAINT "project_labor_demands_dates_check" CHECK ("ends_at" >= "starts_at")
);

CREATE TABLE "project_labor_allocations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "labor_demand_id" TEXT NOT NULL,
  "budget_item_id" TEXT,
  "work_code" TEXT,
  "work_name" TEXT NOT NULL,
  "share_percent" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "person_months" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "planned_hours" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "required_headcount" DECIMAL(10,3) NOT NULL DEFAULT 0,
  "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_labor_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_labor_allocations_values_check" CHECK (
    "share_percent" >= 0
    AND "share_percent" <= 100
    AND "person_months" >= 0
    AND "planned_hours" >= 0
    AND "required_headcount" >= 0
    AND "confidence" >= 0
    AND "confidence" <= 1
  )
);

CREATE UNIQUE INDEX "project_payroll_policies_project_id_key"
  ON "project_payroll_policies"("project_id");
CREATE INDEX "project_payroll_policies_organization_id_idx"
  ON "project_payroll_policies"("organization_id");
CREATE INDEX "project_labor_demands_project_id_category_idx"
  ON "project_labor_demands"("project_id", "category");
CREATE INDEX "project_labor_demands_project_id_starts_at_ends_at_idx"
  ON "project_labor_demands"("project_id", "starts_at", "ends_at");
CREATE INDEX "project_labor_demands_import_batch_id_idx"
  ON "project_labor_demands"("import_batch_id");
CREATE INDEX "project_labor_allocations_project_id_budget_item_id_idx"
  ON "project_labor_allocations"("project_id", "budget_item_id");
CREATE INDEX "project_labor_allocations_labor_demand_id_idx"
  ON "project_labor_allocations"("labor_demand_id");

ALTER TABLE "project_payroll_policies"
  ADD CONSTRAINT "project_payroll_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_payroll_policies"
  ADD CONSTRAINT "project_payroll_policies_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_labor_demands"
  ADD CONSTRAINT "project_labor_demands_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_labor_demands"
  ADD CONSTRAINT "project_labor_demands_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_labor_demands"
  ADD CONSTRAINT "project_labor_demands_import_batch_id_fkey"
  FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_labor_allocations"
  ADD CONSTRAINT "project_labor_allocations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_labor_allocations"
  ADD CONSTRAINT "project_labor_allocations_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_labor_allocations"
  ADD CONSTRAINT "project_labor_allocations_labor_demand_id_fkey"
  FOREIGN KEY ("labor_demand_id") REFERENCES "project_labor_demands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_labor_allocations"
  ADD CONSTRAINT "project_labor_allocations_budget_item_id_fkey"
  FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
