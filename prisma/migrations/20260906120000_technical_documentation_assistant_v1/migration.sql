CREATE TABLE "project_knowledge_configs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "drive_folder_id" TEXT,
  "drive_folder_url" TEXT,
  "drive_folder_name" TEXT,
  "drive_sync_status" TEXT NOT NULL DEFAULT 'not_configured',
  "drive_sync_error" TEXT,
  "last_drive_synced_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_knowledge_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_knowledge_documents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "document_id" TEXT,
  "document_version_id" TEXT,
  "source_kind" TEXT NOT NULL,
  "external_id" TEXT,
  "source_version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "file_name" TEXT,
  "mime_type" TEXT,
  "source_url" TEXT,
  "content_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ready',
  "error" TEXT,
  "char_count" INTEGER NOT NULL DEFAULT 0,
  "chunk_count" INTEGER NOT NULL DEFAULT 0,
  "source_modified_at" TIMESTAMP(3),
  "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_knowledge_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_knowledge_chunks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "knowledge_document_id" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "locator" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "terms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "char_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_knowledge_chunks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_knowledge_configs_project_id_key"
  ON "project_knowledge_configs"("project_id");
CREATE UNIQUE INDEX "project_knowledge_documents_project_id_document_id_key"
  ON "project_knowledge_documents"("project_id", "document_id");
CREATE UNIQUE INDEX "project_knowledge_documents_project_id_source_kind_external_id_key"
  ON "project_knowledge_documents"("project_id", "source_kind", "external_id");
CREATE INDEX "project_knowledge_documents_project_id_status_indexed_at_idx"
  ON "project_knowledge_documents"("project_id", "status", "indexed_at");
CREATE UNIQUE INDEX "project_knowledge_chunks_knowledge_document_id_chunk_index_key"
  ON "project_knowledge_chunks"("knowledge_document_id", "chunk_index");
CREATE INDEX "project_knowledge_chunks_project_id_knowledge_document_id_idx"
  ON "project_knowledge_chunks"("project_id", "knowledge_document_id");
CREATE INDEX "project_knowledge_chunks_terms_gin_idx"
  ON "project_knowledge_chunks" USING GIN ("terms");

ALTER TABLE "project_knowledge_configs"
  ADD CONSTRAINT "project_knowledge_configs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_knowledge_configs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_knowledge_documents"
  ADD CONSTRAINT "project_knowledge_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_knowledge_documents_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_knowledge_documents_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_knowledge_documents_document_version_id_fkey"
  FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "project_knowledge_chunks"
  ADD CONSTRAINT "project_knowledge_chunks_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_knowledge_chunks_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "project_knowledge_chunks_knowledge_document_id_fkey"
  FOREIGN KEY ("knowledge_document_id") REFERENCES "project_knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
