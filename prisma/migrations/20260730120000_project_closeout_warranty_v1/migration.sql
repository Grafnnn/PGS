CREATE TABLE "project_closeout_packages" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "scope" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "responsible_party" TEXT,
  "due_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "handover_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "decision_comment" TEXT,
  "transmittal_id" TEXT,
  "notes" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_closeout_packages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_closeout_checklist_items" (
  "id" TEXT NOT NULL,
  "package_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "source_type" TEXT NOT NULL DEFAULT 'manual',
  "source_id" TEXT,
  "document_id" TEXT,
  "notes" TEXT,
  "confirmed_by" TEXT,
  "confirmed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_closeout_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_warranty_obligations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "package_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'workmanship',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "counterparty" TEXT,
  "responsible_party" TEXT,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "notice_days" INTEGER NOT NULL DEFAULT 30,
  "retention_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "retention_release_at" TIMESTAMP(3),
  "terms" TEXT,
  "notes" TEXT,
  "source_document_id" TEXT,
  "closed_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_warranty_obligations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_closeout_packages_project_id_sequence_key" ON "project_closeout_packages"("project_id", "sequence");
CREATE UNIQUE INDEX "project_closeout_packages_project_id_number_key" ON "project_closeout_packages"("project_id", "number");
CREATE INDEX "project_closeout_packages_project_id_status_due_at_idx" ON "project_closeout_packages"("project_id", "status", "due_at");
CREATE INDEX "project_closeout_packages_transmittal_id_idx" ON "project_closeout_packages"("transmittal_id");

CREATE UNIQUE INDEX "project_closeout_checklist_items_package_id_sequence_key" ON "project_closeout_checklist_items"("package_id", "sequence");
CREATE INDEX "project_closeout_checklist_items_package_id_status_idx" ON "project_closeout_checklist_items"("package_id", "status");
CREATE INDEX "project_closeout_checklist_items_document_id_idx" ON "project_closeout_checklist_items"("document_id");

CREATE UNIQUE INDEX "project_warranty_obligations_project_id_sequence_key" ON "project_warranty_obligations"("project_id", "sequence");
CREATE UNIQUE INDEX "project_warranty_obligations_project_id_number_key" ON "project_warranty_obligations"("project_id", "number");
CREATE INDEX "project_warranty_obligations_project_id_status_ends_at_idx" ON "project_warranty_obligations"("project_id", "status", "ends_at");
CREATE INDEX "project_warranty_obligations_package_id_idx" ON "project_warranty_obligations"("package_id");
CREATE INDEX "project_warranty_obligations_source_document_id_idx" ON "project_warranty_obligations"("source_document_id");

ALTER TABLE "project_closeout_packages" ADD CONSTRAINT "project_closeout_packages_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_closeout_packages" ADD CONSTRAINT "project_closeout_packages_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "project_document_transmittals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_closeout_checklist_items" ADD CONSTRAINT "project_closeout_checklist_items_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "project_closeout_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_closeout_checklist_items" ADD CONSTRAINT "project_closeout_checklist_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_warranty_obligations" ADD CONSTRAINT "project_warranty_obligations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_warranty_obligations" ADD CONSTRAINT "project_warranty_obligations_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "project_closeout_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_warranty_obligations" ADD CONSTRAINT "project_warranty_obligations_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
