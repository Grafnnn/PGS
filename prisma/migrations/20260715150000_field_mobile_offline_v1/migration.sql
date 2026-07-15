CREATE TABLE "field_sync_receipts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "client_mutation_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "field_sync_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "field_sync_receipts_project_id_client_mutation_id_key"
  ON "field_sync_receipts"("project_id", "client_mutation_id");

CREATE INDEX "field_sync_receipts_project_id_created_at_idx"
  ON "field_sync_receipts"("project_id", "created_at");

ALTER TABLE "field_sync_receipts"
  ADD CONSTRAINT "field_sync_receipts_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
