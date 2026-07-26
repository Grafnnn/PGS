CREATE TABLE "organization_resources" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "profession" TEXT,
  "employment_type" TEXT NOT NULL DEFAULT 'staff',
  "headcount" INTEGER NOT NULL DEFAULT 1,
  "capacity_hours_per_month" DECIMAL(10,2) NOT NULL DEFAULT 160,
  "productivity_norm" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "productivity_unit" TEXT,
  "monthly_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "hourly_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "certifications" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_resources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organization_resources_kind_check" CHECK ("kind" IN ('worker', 'engineer', 'crew', 'equipment')),
  CONSTRAINT "organization_resources_employment_type_check" CHECK ("employment_type" IN ('staff', 'hired', 'subcontract', 'owned', 'rented')),
  CONSTRAINT "organization_resources_headcount_check" CHECK ("headcount" >= 1 AND "headcount" <= 500),
  CONSTRAINT "organization_resources_capacity_check" CHECK ("capacity_hours_per_month" >= 0),
  CONSTRAINT "organization_resources_productivity_check" CHECK ("productivity_norm" >= 0),
  CONSTRAINT "organization_resources_monthly_cost_check" CHECK ("monthly_cost" >= 0),
  CONSTRAINT "organization_resources_hourly_cost_check" CHECK ("hourly_cost" >= 0),
  CONSTRAINT "organization_resources_status_check" CHECK ("status" IN ('active', 'unavailable', 'maintenance', 'archived'))
);

CREATE TABLE "project_resource_assignments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "resource_id" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL,
  "ends_at" TIMESTAMP(3) NOT NULL,
  "allocation_percent" INTEGER NOT NULL DEFAULT 100,
  "planned_hours" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "planned_output" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_resource_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_resource_assignments_dates_check" CHECK ("ends_at" >= "starts_at"),
  CONSTRAINT "project_resource_assignments_allocation_check" CHECK ("allocation_percent" >= 1 AND "allocation_percent" <= 200),
  CONSTRAINT "project_resource_assignments_planned_hours_check" CHECK ("planned_hours" >= 0),
  CONSTRAINT "project_resource_assignments_planned_output_check" CHECK ("planned_output" >= 0),
  CONSTRAINT "project_resource_assignments_status_check" CHECK ("status" IN ('planned', 'active', 'completed'))
);

CREATE INDEX "organization_resources_organization_id_kind_status_idx" ON "organization_resources"("organization_id", "kind", "status");
CREATE INDEX "organization_resources_organization_id_name_idx" ON "organization_resources"("organization_id", "name");
CREATE UNIQUE INDEX "project_resource_assignments_project_id_resource_id_key" ON "project_resource_assignments"("project_id", "resource_id");
CREATE INDEX "project_resource_assignments_organization_id_starts_at_ends_at_idx" ON "project_resource_assignments"("organization_id", "starts_at", "ends_at");
CREATE INDEX "project_resource_assignments_resource_id_starts_at_ends_at_idx" ON "project_resource_assignments"("resource_id", "starts_at", "ends_at");

ALTER TABLE "organization_resources" ADD CONSTRAINT "organization_resources_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_resource_assignments" ADD CONSTRAINT "project_resource_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_resource_assignments" ADD CONSTRAINT "project_resource_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_resource_assignments" ADD CONSTRAINT "project_resource_assignments_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "organization_resources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
