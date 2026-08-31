CREATE TABLE "project_expenses" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "cost_code_id" TEXT,
  "receipt_document_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "expense_date" TIMESTAMP(3) NOT NULL,
  "merchant" TEXT NOT NULL,
  "document_number" TEXT,
  "category" TEXT NOT NULL,
  "payment_method" TEXT NOT NULL DEFAULT 'unknown',
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "gross_amount" DECIMAL(16,2) NOT NULL,
  "tax_amount" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "recognition_status" TEXT NOT NULL DEFAULT 'not_applicable',
  "recognition_confidence" TEXT,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_expenses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_expenses_amount_check" CHECK ("gross_amount" >= 0 AND "tax_amount" >= 0),
  CONSTRAINT "project_expenses_source_check" CHECK ("source" IN ('manual', 'receipt')),
  CONSTRAINT "project_expenses_recognition_status_check" CHECK ("recognition_status" IN ('not_applicable', 'recognized', 'edited')),
  CONSTRAINT "project_expenses_recognition_confidence_check" CHECK ("recognition_confidence" IS NULL OR "recognition_confidence" IN ('low', 'medium', 'high'))
);

CREATE TABLE "project_expense_items" (
  "id" TEXT NOT NULL,
  "expense_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "unit" TEXT NOT NULL DEFAULT 'шт',
  "unit_price" DECIMAL(16,2) NOT NULL,
  "amount" DECIMAL(16,2) NOT NULL,
  "tax_amount" DECIMAL(16,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_expense_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_expense_items_amount_check" CHECK ("quantity" >= 0 AND "unit_price" >= 0 AND "amount" >= 0 AND "tax_amount" >= 0)
);

CREATE UNIQUE INDEX "project_expenses_project_id_sequence_key" ON "project_expenses"("project_id", "sequence");
CREATE INDEX "project_expenses_project_id_expense_date_idx" ON "project_expenses"("project_id", "expense_date");
CREATE INDEX "project_expenses_project_id_category_expense_date_idx" ON "project_expenses"("project_id", "category", "expense_date");
CREATE INDEX "project_expenses_cost_code_id_idx" ON "project_expenses"("cost_code_id");
CREATE INDEX "project_expenses_receipt_document_id_idx" ON "project_expenses"("receipt_document_id");
CREATE UNIQUE INDEX "project_expense_items_expense_id_sequence_key" ON "project_expense_items"("expense_id", "sequence");

ALTER TABLE "project_expenses"
  ADD CONSTRAINT "project_expenses_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_expenses"
  ADD CONSTRAINT "project_expenses_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_expenses"
  ADD CONSTRAINT "project_expenses_cost_code_id_fkey"
  FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_expenses"
  ADD CONSTRAINT "project_expenses_receipt_document_id_fkey"
  FOREIGN KEY ("receipt_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_expense_items"
  ADD CONSTRAINT "project_expense_items_expense_id_fkey"
  FOREIGN KEY ("expense_id") REFERENCES "project_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
