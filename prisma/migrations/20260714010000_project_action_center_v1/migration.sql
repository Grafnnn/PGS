CREATE TABLE "project_action_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_by" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_module" TEXT NOT NULL DEFAULT 'manual',
    "target_tab" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignee" TEXT,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "requires_approval" BOOLEAN NOT NULL DEFAULT false,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_action_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_action_items_project_id_status_due_at_idx" ON "project_action_items"("project_id", "status", "due_at");
CREATE INDEX "project_action_items_project_id_assignee_idx" ON "project_action_items"("project_id", "assignee");

ALTER TABLE "project_action_items" ADD CONSTRAINT "project_action_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
