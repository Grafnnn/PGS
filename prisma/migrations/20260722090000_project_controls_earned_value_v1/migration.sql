CREATE TABLE "project_control_baselines" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "data_date" TIMESTAMP(3) NOT NULL,
  "planned_start" TIMESTAMP(3) NOT NULL,
  "planned_finish" TIMESTAMP(3) NOT NULL,
  "budget_at_completion" DECIMAL(16,2) NOT NULL,
  "budget_item_count" INTEGER NOT NULL DEFAULT 0,
  "schedule_item_count" INTEGER NOT NULL DEFAULT 0,
  "linked_budget_value" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "schedule_coverage_percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "limitations" JSONB NOT NULL,
  "notes" TEXT,
  "created_by" TEXT,
  "activated_at" TIMESTAMP(3),
  "superseded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_control_baselines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_control_baseline_lines" (
  "id" TEXT NOT NULL,
  "baseline_id" TEXT NOT NULL,
  "budget_item_id" TEXT,
  "schedule_item_id" TEXT,
  "cost_code_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "planned_qty" DECIMAL(14,3) NOT NULL,
  "budget" DECIMAL(16,2) NOT NULL,
  "weight" DECIMAL(12,8) NOT NULL,
  "planned_start" TIMESTAMP(3) NOT NULL,
  "planned_finish" TIMESTAMP(3) NOT NULL,
  "source_quality" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_control_baseline_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_control_periods" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "baseline_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "data_date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'published',
  "budget_at_completion" DECIMAL(16,2) NOT NULL,
  "planned_value" DECIMAL(16,2) NOT NULL,
  "earned_value" DECIMAL(16,2) NOT NULL,
  "actual_cost" DECIMAL(16,2) NOT NULL,
  "cost_variance" DECIMAL(16,2) NOT NULL,
  "schedule_variance" DECIMAL(16,2) NOT NULL,
  "cost_performance_index" DECIMAL(12,4),
  "schedule_performance_index" DECIMAL(12,4),
  "estimate_at_completion" DECIMAL(16,2),
  "estimate_to_complete" DECIMAL(16,2),
  "variance_at_completion" DECIMAL(16,2),
  "to_complete_performance_index" DECIMAL(12,4),
  "planned_progress_percent" DECIMAL(7,2) NOT NULL,
  "earned_progress_percent" DECIMAL(7,2) NOT NULL,
  "forecast_finish" TIMESTAMP(3),
  "schedule_variance_days" INTEGER,
  "actual_cost_source" TEXT NOT NULL DEFAULT 'paid_outgoing',
  "actual_cost_allocated" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "actual_cost_coverage_percent" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "coverage" JSONB NOT NULL,
  "limitations" JSONB NOT NULL,
  "created_by" TEXT,
  "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_control_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_control_period_lines" (
  "id" TEXT NOT NULL,
  "period_id" TEXT NOT NULL,
  "baseline_line_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "planned_value" DECIMAL(16,2) NOT NULL,
  "earned_value" DECIMAL(16,2) NOT NULL,
  "actual_cost" DECIMAL(16,2) NOT NULL,
  "cost_variance" DECIMAL(16,2) NOT NULL,
  "schedule_variance" DECIMAL(16,2) NOT NULL,
  "planned_progress" DECIMAL(7,2) NOT NULL,
  "earned_progress" DECIMAL(7,2) NOT NULL,
  "actual_cost_allocated" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_control_period_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_control_baselines_project_id_sequence_key" ON "project_control_baselines"("project_id", "sequence");
CREATE UNIQUE INDEX "project_control_baselines_one_active_per_project" ON "project_control_baselines"("project_id") WHERE "status" = 'active';
CREATE INDEX "project_control_baselines_project_id_status_created_at_idx" ON "project_control_baselines"("project_id", "status", "created_at");
CREATE UNIQUE INDEX "project_control_baseline_lines_baseline_id_sequence_key" ON "project_control_baseline_lines"("baseline_id", "sequence");
CREATE INDEX "project_control_baseline_lines_budget_item_id_idx" ON "project_control_baseline_lines"("budget_item_id");
CREATE INDEX "project_control_baseline_lines_schedule_item_id_idx" ON "project_control_baseline_lines"("schedule_item_id");
CREATE INDEX "project_control_baseline_lines_cost_code_id_idx" ON "project_control_baseline_lines"("cost_code_id");
CREATE UNIQUE INDEX "project_control_periods_project_id_sequence_key" ON "project_control_periods"("project_id", "sequence");
CREATE UNIQUE INDEX "project_control_periods_baseline_id_data_date_key" ON "project_control_periods"("baseline_id", "data_date");
CREATE INDEX "project_control_periods_project_id_status_data_date_idx" ON "project_control_periods"("project_id", "status", "data_date");
CREATE UNIQUE INDEX "project_control_period_lines_period_id_sequence_key" ON "project_control_period_lines"("period_id", "sequence");
CREATE INDEX "project_control_period_lines_baseline_line_id_idx" ON "project_control_period_lines"("baseline_line_id");

ALTER TABLE "project_control_baselines" ADD CONSTRAINT "project_control_baselines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_control_baseline_lines" ADD CONSTRAINT "project_control_baseline_lines_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "project_control_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_control_baseline_lines" ADD CONSTRAINT "project_control_baseline_lines_budget_item_id_fkey" FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_control_baseline_lines" ADD CONSTRAINT "project_control_baseline_lines_schedule_item_id_fkey" FOREIGN KEY ("schedule_item_id") REFERENCES "schedule_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_control_baseline_lines" ADD CONSTRAINT "project_control_baseline_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_control_periods" ADD CONSTRAINT "project_control_periods_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_control_periods" ADD CONSTRAINT "project_control_periods_baseline_id_fkey" FOREIGN KEY ("baseline_id") REFERENCES "project_control_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_control_period_lines" ADD CONSTRAINT "project_control_period_lines_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "project_control_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_control_period_lines" ADD CONSTRAINT "project_control_period_lines_baseline_line_id_fkey" FOREIGN KEY ("baseline_line_id") REFERENCES "project_control_baseline_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
