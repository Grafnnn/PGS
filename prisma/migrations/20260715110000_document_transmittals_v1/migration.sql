CREATE TABLE "project_document_transmittals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "purpose" TEXT,
    "recipient" TEXT,
    "cc_recipients" TEXT,
    "reviewer" TEXT,
    "due_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_document_transmittals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_transmittal_items" (
    "id" TEXT NOT NULL,
    "transmittal_id" TEXT NOT NULL,
    "document_id" TEXT,
    "document_version_id" TEXT,
    "document_version" INTEGER,
    "title_snapshot" TEXT NOT NULL,
    "file_name_snapshot" TEXT,
    "category_snapshot" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_transmittal_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_transmittal_events" (
    "id" TEXT NOT NULL,
    "transmittal_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "decision" TEXT,
    "comment" TEXT,
    "created_by" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_transmittal_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_document_transmittals_project_id_sequence_key" ON "project_document_transmittals"("project_id", "sequence");
CREATE INDEX "project_document_transmittals_project_id_status_due_at_idx" ON "project_document_transmittals"("project_id", "status", "due_at");
CREATE INDEX "document_transmittal_items_transmittal_id_idx" ON "document_transmittal_items"("transmittal_id");
CREATE INDEX "document_transmittal_items_document_id_idx" ON "document_transmittal_items"("document_id");
CREATE INDEX "document_transmittal_events_transmittal_id_created_at_idx" ON "document_transmittal_events"("transmittal_id", "created_at");

ALTER TABLE "project_document_transmittals" ADD CONSTRAINT "project_document_transmittals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_transmittal_items" ADD CONSTRAINT "document_transmittal_items_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "project_document_transmittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_transmittal_items" ADD CONSTRAINT "document_transmittal_items_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_transmittal_items" ADD CONSTRAINT "document_transmittal_items_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_transmittal_events" ADD CONSTRAINT "document_transmittal_events_transmittal_id_fkey" FOREIGN KEY ("transmittal_id") REFERENCES "project_document_transmittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
