CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "parser_version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'previewed',
    "mode" TEXT,
    "sheets" JSONB,
    "mapping" JSONB,
    "summary" JSONB NOT NULL,
    "preview_json" JSONB NOT NULL,
    "warnings" JSONB,
    "errors" JSONB,
    "committed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_batches_project_id_created_at_idx" ON "import_batches"("project_id", "created_at");

ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
