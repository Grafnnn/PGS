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
  CONSTRAINT "organization_resources_pkey" PRIMARY KEY ("id")
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
  CONSTRAINT "project_resource_assignments_pkey" PRIMARY KEY ("id")
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
