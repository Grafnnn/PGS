CREATE TABLE "project_commitments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'subcontract',
  "title" TEXT NOT NULL,
  "counterparty" TEXT NOT NULL,
  "external_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "retention_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "payment_terms" TEXT,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "source_procurement_request_id" TEXT,
  "linked_document_id" TEXT,
  "linked_document_version" INTEGER,
  "linked_document_version_id" TEXT,
  "approval_workflow_run_id" TEXT,
  "decision_comment" TEXT,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "terminated_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_commitments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_commitment_lines" (
  "id" TEXT NOT NULL,
  "commitment_id" TEXT NOT NULL,
  "budget_item_id" TEXT,
  "cost_code_id" TEXT,
  "source_procurement_request_item_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "code" TEXT,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "unit" TEXT NOT NULL DEFAULT 'компл.',
  "unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "scheduled_value" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_commitment_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_payment_applications" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "commitment_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "materials_stored" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "decision_comment" TEXT,
  "submitted_at" TIMESTAMP(3),
  "approved_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_payment_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_payment_application_lines" (
  "id" TEXT NOT NULL,
  "application_id" TEXT NOT NULL,
  "commitment_line_id" TEXT NOT NULL,
  "previous_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "materials_stored" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_payment_application_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "project_change_orders" ADD COLUMN "commitment_id" TEXT;

CREATE UNIQUE INDEX "project_commitments_project_id_sequence_key" ON "project_commitments"("project_id", "sequence");
CREATE UNIQUE INDEX "project_commitments_project_id_number_key" ON "project_commitments"("project_id", "number");
CREATE UNIQUE INDEX "project_commitments_approval_workflow_run_id_key" ON "project_commitments"("approval_workflow_run_id");
CREATE INDEX "project_commitments_project_id_status_updated_at_idx" ON "project_commitments"("project_id", "status", "updated_at");
CREATE INDEX "project_commitments_source_procurement_request_id_idx" ON "project_commitments"("source_procurement_request_id");
CREATE INDEX "project_commitments_linked_document_id_idx" ON "project_commitments"("linked_document_id");
CREATE INDEX "project_commitments_linked_document_version_id_idx" ON "project_commitments"("linked_document_version_id");
CREATE UNIQUE INDEX "project_commitment_lines_commitment_id_sequence_key" ON "project_commitment_lines"("commitment_id", "sequence");
CREATE INDEX "project_commitment_lines_budget_item_id_idx" ON "project_commitment_lines"("budget_item_id");
CREATE INDEX "project_commitment_lines_cost_code_id_idx" ON "project_commitment_lines"("cost_code_id");
CREATE INDEX "project_commitment_lines_source_procurement_request_item_id_idx" ON "project_commitment_lines"("source_procurement_request_item_id");
CREATE UNIQUE INDEX "project_payment_applications_commitment_id_sequence_key" ON "project_payment_applications"("commitment_id", "sequence");
CREATE UNIQUE INDEX "project_payment_applications_commitment_id_number_key" ON "project_payment_applications"("commitment_id", "number");
CREATE UNIQUE INDEX "project_payment_applications_payment_id_key" ON "project_payment_applications"("payment_id");
CREATE INDEX "project_payment_applications_project_id_status_updated_at_idx" ON "project_payment_applications"("project_id", "status", "updated_at");
CREATE UNIQUE INDEX "project_payment_application_lines_application_id_commitment_line_id_key" ON "project_payment_application_lines"("application_id", "commitment_line_id");
CREATE INDEX "project_payment_application_lines_commitment_line_id_idx" ON "project_payment_application_lines"("commitment_line_id");
CREATE INDEX "project_change_orders_commitment_id_idx" ON "project_change_orders"("commitment_id");

ALTER TABLE "project_commitments" ADD CONSTRAINT "project_commitments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_commitments" ADD CONSTRAINT "project_commitments_source_procurement_request_id_fkey" FOREIGN KEY ("source_procurement_request_id") REFERENCES "procurement_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_commitments" ADD CONSTRAINT "project_commitments_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_commitments" ADD CONSTRAINT "project_commitments_linked_document_version_id_fkey" FOREIGN KEY ("linked_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_commitments" ADD CONSTRAINT "project_commitments_approval_workflow_run_id_fkey" FOREIGN KEY ("approval_workflow_run_id") REFERENCES "project_workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_commitment_lines" ADD CONSTRAINT "project_commitment_lines_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "project_commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_commitment_lines" ADD CONSTRAINT "project_commitment_lines_budget_item_id_fkey" FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_commitment_lines" ADD CONSTRAINT "project_commitment_lines_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_commitment_lines" ADD CONSTRAINT "project_commitment_lines_source_procurement_request_item_id_fkey" FOREIGN KEY ("source_procurement_request_item_id") REFERENCES "procurement_request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_payment_applications" ADD CONSTRAINT "project_payment_applications_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_payment_applications" ADD CONSTRAINT "project_payment_applications_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "project_commitments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_payment_applications" ADD CONSTRAINT "project_payment_applications_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_payment_application_lines" ADD CONSTRAINT "project_payment_application_lines_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "project_payment_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_payment_application_lines" ADD CONSTRAINT "project_payment_application_lines_commitment_line_id_fkey" FOREIGN KEY ("commitment_line_id") REFERENCES "project_commitment_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "project_commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
