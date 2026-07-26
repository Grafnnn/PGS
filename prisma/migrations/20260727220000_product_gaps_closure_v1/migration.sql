CREATE TABLE "external_collaboration_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "recipient_name" TEXT,
  "recipient_email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "response_limit" INTEGER NOT NULL DEFAULT 1,
  "response_count" INTEGER NOT NULL DEFAULT 0,
  "last_responded_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_collaboration_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_collaboration_links_entity_type_check" CHECK ("entity_type" IN ('rfi', 'submittal')),
  CONSTRAINT "external_collaboration_links_status_check" CHECK ("status" IN ('active', 'responded', 'revoked')),
  CONSTRAINT "external_collaboration_links_recipient_email_check" CHECK (char_length(trim("recipient_email")) >= 3),
  CONSTRAINT "external_collaboration_links_token_hash_check" CHECK (char_length("token_hash") = 64),
  CONSTRAINT "external_collaboration_links_expiry_check" CHECK ("expires_at" > "created_at"),
  CONSTRAINT "external_collaboration_links_response_limit_check" CHECK ("response_limit" = 1),
  CONSTRAINT "external_collaboration_links_response_count_check" CHECK ("response_count" >= 0 AND "response_count" <= "response_limit"),
  CONSTRAINT "external_collaboration_links_responded_check" CHECK ("status" <> 'responded' OR "response_count" = "response_limit"),
  CONSTRAINT "external_collaboration_links_revoked_check" CHECK ("status" <> 'revoked' OR "revoked_at" IS NOT NULL),
  CONSTRAINT "external_collaboration_links_state_check" CHECK (
    ("status" = 'active' AND "response_count" = 0 AND "revoked_at" IS NULL)
    OR ("status" = 'responded' AND "response_count" = "response_limit" AND "last_responded_at" IS NOT NULL AND "revoked_at" IS NULL)
    OR ("status" = 'revoked' AND "revoked_at" IS NOT NULL)
  )
);

CREATE TABLE "project_invoices" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "cost_code_id" TEXT,
  "commitment_id" TEXT,
  "payment_application_id" TEXT,
  "payment_id" TEXT,
  "linked_document_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "invoice_type" TEXT NOT NULL DEFAULT 'invoice',
  "counterparty" TEXT NOT NULL,
  "issue_date" TIMESTAMP(3) NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "service_period_start" TIMESTAMP(3),
  "service_period_end" TIMESTAMP(3),
  "gross_amount" DECIMAL(16,2) NOT NULL,
  "tax_amount" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "status" TEXT NOT NULL DEFAULT 'received',
  "match_status" TEXT NOT NULL DEFAULT 'unmatched',
  "match_snapshot" JSONB,
  "notes" TEXT,
  "approved_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_invoices_direction_check" CHECK ("direction" IN ('AP', 'AR')),
  CONSTRAINT "project_invoices_type_check" CHECK ("invoice_type" IN ('invoice', 'credit_note')),
  CONSTRAINT "project_invoices_status_check" CHECK ("status" IN ('received', 'approved', 'disputed', 'paid', 'void')),
  CONSTRAINT "project_invoices_match_status_check" CHECK ("match_status" IN ('unmatched', 'matched', 'variance', 'blocked')),
  CONSTRAINT "project_invoices_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "project_invoices_number_check" CHECK (char_length(trim("number")) >= 1),
  CONSTRAINT "project_invoices_counterparty_check" CHECK (char_length(trim("counterparty")) >= 2),
  CONSTRAINT "project_invoices_currency_check" CHECK (char_length(trim("currency")) BETWEEN 3 AND 8),
  CONSTRAINT "project_invoices_amount_check" CHECK ("gross_amount" >= 0 AND "tax_amount" >= 0 AND "tax_amount" <= "gross_amount"),
  CONSTRAINT "project_invoices_dates_check" CHECK ("due_date" >= "issue_date"),
  CONSTRAINT "project_invoices_service_period_check" CHECK ("service_period_end" IS NULL OR "service_period_start" IS NULL OR "service_period_end" >= "service_period_start"),
  CONSTRAINT "project_invoices_match_snapshot_check" CHECK ("match_status" = 'unmatched' OR "match_snapshot" IS NOT NULL),
  CONSTRAINT "project_invoices_approved_check" CHECK ("status" <> 'approved' OR "approved_at" IS NOT NULL),
  CONSTRAINT "project_invoices_paid_check" CHECK ("status" <> 'paid' OR "paid_at" IS NOT NULL),
  CONSTRAINT "project_invoices_void_check" CHECK ("status" <> 'void' OR "voided_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "external_collaboration_links_token_hash_key" ON "external_collaboration_links"("token_hash");
CREATE UNIQUE INDEX "external_collaboration_links_one_active_entity_key"
  ON "external_collaboration_links"("project_id", "entity_type", "entity_id")
  WHERE "status" = 'active';
CREATE INDEX "external_collaboration_links_project_id_entity_type_entity_id_idx" ON "external_collaboration_links"("project_id", "entity_type", "entity_id");
CREATE INDEX "external_collaboration_links_project_id_status_expires_at_idx" ON "external_collaboration_links"("project_id", "status", "expires_at");
CREATE INDEX "external_collaboration_links_recipient_email_idx" ON "external_collaboration_links"("recipient_email");

CREATE UNIQUE INDEX "project_invoices_project_id_sequence_key" ON "project_invoices"("project_id", "sequence");
CREATE UNIQUE INDEX "project_invoices_project_id_direction_number_key" ON "project_invoices"("project_id", "direction", "number");
CREATE INDEX "project_invoices_project_id_status_due_date_idx" ON "project_invoices"("project_id", "status", "due_date");
CREATE INDEX "project_invoices_project_id_match_status_updated_at_idx" ON "project_invoices"("project_id", "match_status", "updated_at");
CREATE INDEX "project_invoices_cost_code_id_idx" ON "project_invoices"("cost_code_id");
CREATE INDEX "project_invoices_commitment_id_idx" ON "project_invoices"("commitment_id");
CREATE INDEX "project_invoices_payment_application_id_idx" ON "project_invoices"("payment_application_id");
CREATE INDEX "project_invoices_payment_id_idx" ON "project_invoices"("payment_id");
CREATE INDEX "project_invoices_linked_document_id_idx" ON "project_invoices"("linked_document_id");

ALTER TABLE "external_collaboration_links" ADD CONSTRAINT "external_collaboration_links_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_collaboration_links" ADD CONSTRAINT "external_collaboration_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_commitment_id_fkey" FOREIGN KEY ("commitment_id") REFERENCES "project_commitments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_payment_application_id_fkey" FOREIGN KEY ("payment_application_id") REFERENCES "project_payment_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_invoices" ADD CONSTRAINT "project_invoices_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
