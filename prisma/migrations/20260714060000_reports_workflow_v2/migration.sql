CREATE TABLE "executive_reports" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "report_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "content" JSONB NOT NULL,
    "source_snapshot" JSONB,
    "created_by" TEXT,
    "published_at" TIMESTAMP(3),
    "published_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "executive_reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "executive_reports_project_id_version_key" ON "executive_reports"("project_id", "version");
CREATE INDEX "executive_reports_project_id_status_created_at_idx" ON "executive_reports"("project_id", "status", "created_at");

ALTER TABLE "executive_reports"
ADD CONSTRAINT "executive_reports_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
