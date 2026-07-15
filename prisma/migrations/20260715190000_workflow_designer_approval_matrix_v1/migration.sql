-- CreateTable
CREATE TABLE "project_workflow_templates" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_template_steps" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "step_type" TEXT NOT NULL DEFAULT 'review',
    "assignee_role" TEXT NOT NULL DEFAULT 'MANAGER',
    "due_days" INTEGER NOT NULL DEFAULT 3,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_workflow_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "template_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_module" TEXT NOT NULL DEFAULT 'manual',
    "target_tab" TEXT,
    "reference_type" TEXT,
    "reference_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "started_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_workflow_run_steps" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "template_step_id" TEXT,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "step_type" TEXT NOT NULL DEFAULT 'review',
    "assignee_role" TEXT NOT NULL DEFAULT 'MANAGER',
    "due_days" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "due_at" TIMESTAMP(3),
    "decision_comment" TEXT,
    "acted_by" TEXT,
    "acted_by_name" TEXT,
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_workflow_run_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_templates_project_id_name_key" ON "project_workflow_templates"("project_id", "name");

-- CreateIndex
CREATE INDEX "project_workflow_templates_project_id_status_idx" ON "project_workflow_templates"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_template_steps_template_id_sequence_key" ON "project_workflow_template_steps"("template_id", "sequence");

-- CreateIndex
CREATE INDEX "project_workflow_template_steps_template_id_idx" ON "project_workflow_template_steps"("template_id");

-- CreateIndex
CREATE INDEX "project_workflow_runs_project_id_status_updated_at_idx" ON "project_workflow_runs"("project_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "project_workflow_runs_template_id_idx" ON "project_workflow_runs"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_workflow_run_steps_run_id_sequence_key" ON "project_workflow_run_steps"("run_id", "sequence");

-- CreateIndex
CREATE INDEX "project_workflow_run_steps_run_id_status_due_at_idx" ON "project_workflow_run_steps"("run_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "project_workflow_run_steps_template_step_id_idx" ON "project_workflow_run_steps"("template_step_id");

-- AddForeignKey
ALTER TABLE "project_workflow_templates" ADD CONSTRAINT "project_workflow_templates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_workflow_template_steps" ADD CONSTRAINT "project_workflow_template_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "project_workflow_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_workflow_runs" ADD CONSTRAINT "project_workflow_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_workflow_runs" ADD CONSTRAINT "project_workflow_runs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "project_workflow_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_workflow_run_steps" ADD CONSTRAINT "project_workflow_run_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "project_workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_workflow_run_steps" ADD CONSTRAINT "project_workflow_run_steps_template_step_id_fkey" FOREIGN KEY ("template_step_id") REFERENCES "project_workflow_template_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
