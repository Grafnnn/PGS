CREATE TABLE "workforce_admission_requests" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "request_number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "contractor" TEXT NOT NULL,
  "object_name" TEXT NOT NULL,
  "valid_from" TIMESTAMP(3) NOT NULL,
  "valid_until" TIMESTAMP(3),
  "work_scope" TEXT NOT NULL,
  "employment_type" TEXT NOT NULL DEFAULT 'subcontract',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "source_file_name" TEXT,
  "notes" TEXT,
  "created_by" TEXT,
  "approved_by" TEXT,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workforce_admission_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workforce_admission_requests_status_check" CHECK ("status" IN ('draft', 'approved', 'rejected')),
  CONSTRAINT "workforce_admission_requests_employment_type_check" CHECK ("employment_type" IN ('staff', 'hired', 'subcontract')),
  CONSTRAINT "workforce_admission_requests_dates_check" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from")
);

CREATE TABLE "workforce_admission_members" (
  "id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "resource_id" TEXT,
  "full_name" TEXT NOT NULL,
  "profession" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'worker',
  "birth_date" TIMESTAMP(3),
  "citizenship" TEXT,
  "document_type" TEXT,
  "document_last4" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workforce_admission_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workforce_admission_members_kind_check" CHECK ("kind" IN ('worker', 'engineer')),
  CONSTRAINT "workforce_admission_members_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "workforce_admission_members_document_last4_check" CHECK ("document_last4" IS NULL OR "document_last4" ~ '^[A-Z0-9]{2,4}$')
);

CREATE UNIQUE INDEX "workforce_admission_requests_project_id_request_number_key"
  ON "workforce_admission_requests"("project_id", "request_number");
CREATE INDEX "workforce_admission_requests_project_id_status_created_at_idx"
  ON "workforce_admission_requests"("project_id", "status", "created_at");
CREATE INDEX "workforce_admission_members_request_id_status_idx"
  ON "workforce_admission_members"("request_id", "status");
CREATE INDEX "workforce_admission_members_resource_id_idx"
  ON "workforce_admission_members"("resource_id");

ALTER TABLE "workforce_admission_requests"
  ADD CONSTRAINT "workforce_admission_requests_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workforce_admission_requests"
  ADD CONSTRAINT "workforce_admission_requests_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workforce_admission_members"
  ADD CONSTRAINT "workforce_admission_members_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "workforce_admission_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workforce_admission_members"
  ADD CONSTRAINT "workforce_admission_members_resource_id_fkey"
  FOREIGN KEY ("resource_id") REFERENCES "organization_resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
