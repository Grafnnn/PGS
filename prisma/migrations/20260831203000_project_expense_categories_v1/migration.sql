CREATE TABLE "project_expense_categories" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalized_name" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_expense_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_expense_categories_project_id_normalized_name_key"
  ON "project_expense_categories"("project_id", "normalized_name");

CREATE INDEX "project_expense_categories_project_id_name_idx"
  ON "project_expense_categories"("project_id", "name");

ALTER TABLE "project_expense_categories"
  ADD CONSTRAINT "project_expense_categories_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_expense_categories"
  ADD CONSTRAINT "project_expense_categories_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
