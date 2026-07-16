-- CreateTable
CREATE TABLE "project_change_orders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'potential',
    "scope" TEXT NOT NULL DEFAULT 'out_of_scope',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "source_type" TEXT,
    "source_ref" TEXT,
    "counterparty" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "schedule_impact_days" INTEGER NOT NULL DEFAULT 0,
    "estimated_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "proposed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "submitted_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approved_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "committed_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "linked_document_id" TEXT,
    "linked_document_version" INTEGER,
    "linked_document_version_id" TEXT,
    "approval_workflow_run_id" TEXT,
    "decision_comment" TEXT,
    "due_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_change_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_change_order_items" (
    "id" TEXT NOT NULL,
    "change_order_id" TEXT NOT NULL,
    "budget_item_id" TEXT,
    "sequence" INTEGER NOT NULL,
    "code" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'компл.',
    "estimated_unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "proposed_unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "submitted_unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "approved_unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "committed_unit_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_change_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_change_orders_project_id_sequence_key" ON "project_change_orders"("project_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "project_change_orders_project_id_number_key" ON "project_change_orders"("project_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "project_change_orders_approval_workflow_run_id_key" ON "project_change_orders"("approval_workflow_run_id");

-- CreateIndex
CREATE INDEX "project_change_orders_project_id_status_updated_at_idx" ON "project_change_orders"("project_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "project_change_orders_linked_document_id_idx" ON "project_change_orders"("linked_document_id");

-- CreateIndex
CREATE INDEX "project_change_orders_linked_document_version_id_idx" ON "project_change_orders"("linked_document_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_change_order_items_change_order_id_sequence_key" ON "project_change_order_items"("change_order_id", "sequence");

-- CreateIndex
CREATE INDEX "project_change_order_items_budget_item_id_idx" ON "project_change_order_items"("budget_item_id");

-- AddForeignKey
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_linked_document_version_id_fkey" FOREIGN KEY ("linked_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_approval_workflow_run_id_fkey" FOREIGN KEY ("approval_workflow_run_id") REFERENCES "project_workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_order_items" ADD CONSTRAINT "project_change_order_items_change_order_id_fkey" FOREIGN KEY ("change_order_id") REFERENCES "project_change_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_order_items" ADD CONSTRAINT "project_change_order_items_budget_item_id_fkey" FOREIGN KEY ("budget_item_id") REFERENCES "budget_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
