-- v0.4 audit and document metadata
ALTER TABLE "documents"
  ADD COLUMN "file_name" TEXT,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "size_bytes" INTEGER,
  ADD COLUMN "storage_key" TEXT,
  ADD COLUMN "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "audit_log"
  ADD COLUMN "project_id" TEXT,
  ADD COLUMN "actor_name" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "before_json" JSONB,
  ADD COLUMN "after_json" JSONB;

CREATE INDEX "audit_log_project_id_created_at_idx" ON "audit_log"("project_id", "created_at");

ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
