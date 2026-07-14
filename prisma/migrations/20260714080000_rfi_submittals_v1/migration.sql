CREATE TABLE "project_rfis" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "discipline" TEXT,
    "location" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "assignee" TEXT,
    "due_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "linked_document_id" TEXT,
    "linked_document_version" INTEGER,
    "linked_document_version_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_rfis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rfi_responses" (
    "id" TEXT NOT NULL,
    "rfi_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfi_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_submittals" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "spec_section" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "reviewer" TEXT,
    "due_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "linked_document_id" TEXT,
    "linked_document_version" INTEGER,
    "linked_document_version_id" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_submittals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "submittal_reviews" (
    "id" TEXT NOT NULL,
    "submittal_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "created_by" TEXT,
    "created_by_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submittal_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_rfis_project_id_sequence_key" ON "project_rfis"("project_id", "sequence");
CREATE INDEX "project_rfis_project_id_status_due_at_idx" ON "project_rfis"("project_id", "status", "due_at");
CREATE INDEX "rfi_responses_rfi_id_created_at_idx" ON "rfi_responses"("rfi_id", "created_at");
CREATE UNIQUE INDEX "project_submittals_project_id_sequence_key" ON "project_submittals"("project_id", "sequence");
CREATE INDEX "project_submittals_project_id_status_due_at_idx" ON "project_submittals"("project_id", "status", "due_at");
CREATE INDEX "submittal_reviews_submittal_id_created_at_idx" ON "submittal_reviews"("submittal_id", "created_at");

ALTER TABLE "project_rfis" ADD CONSTRAINT "project_rfis_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_rfis" ADD CONSTRAINT "project_rfis_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_rfis" ADD CONSTRAINT "project_rfis_linked_document_version_id_fkey" FOREIGN KEY ("linked_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rfi_responses" ADD CONSTRAINT "rfi_responses_rfi_id_fkey" FOREIGN KEY ("rfi_id") REFERENCES "project_rfis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_submittals" ADD CONSTRAINT "project_submittals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_submittals" ADD CONSTRAINT "project_submittals_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_submittals" ADD CONSTRAINT "project_submittals_linked_document_version_id_fkey" FOREIGN KEY ("linked_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "submittal_reviews" ADD CONSTRAINT "submittal_reviews_submittal_id_fkey" FOREIGN KEY ("submittal_id") REFERENCES "project_submittals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
