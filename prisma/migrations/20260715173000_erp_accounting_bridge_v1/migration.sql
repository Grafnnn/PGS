CREATE TABLE "accounting_sync_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "source_system" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "file_name" TEXT,
  "checksum" TEXT,
  "status" TEXT NOT NULL,
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "matched_count" INTEGER NOT NULL DEFAULT 0,
  "unresolved_count" INTEGER NOT NULL DEFAULT 0,
  "summary" JSONB NOT NULL,
  "payload" JSONB,
  "created_by" TEXT,
  "applied_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "accounting_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accounting_external_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "sync_run_id" TEXT,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "external_system" TEXT NOT NULL,
  "external_id" TEXT NOT NULL,
  "metadata" JSONB,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "accounting_external_links_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accounting_sync_runs_project_id_created_at_idx"
  ON "accounting_sync_runs"("project_id", "created_at");
CREATE INDEX "accounting_sync_runs_project_id_status_idx"
  ON "accounting_sync_runs"("project_id", "status");
CREATE UNIQUE INDEX "accounting_external_links_external_id_key"
  ON "accounting_external_links"("project_id", "external_system", "entity_type", "external_id");
CREATE UNIQUE INDEX "accounting_external_links_entity_id_key"
  ON "accounting_external_links"("project_id", "external_system", "entity_type", "entity_id");
CREATE INDEX "accounting_external_links_project_id_entity_type_entity_id_idx"
  ON "accounting_external_links"("project_id", "entity_type", "entity_id");

ALTER TABLE "accounting_sync_runs"
  ADD CONSTRAINT "accounting_sync_runs_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounting_external_links"
  ADD CONSTRAINT "accounting_external_links_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounting_external_links"
  ADD CONSTRAINT "accounting_external_links_sync_run_id_fkey"
  FOREIGN KEY ("sync_run_id") REFERENCES "accounting_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
