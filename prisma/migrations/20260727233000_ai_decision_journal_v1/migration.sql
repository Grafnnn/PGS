CREATE TABLE "ai_runs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "user_id" TEXT,
  "scenario" TEXT NOT NULL,
  "prompt_version" TEXT NOT NULL,
  "input_json" JSONB,
  "output_json" JSONB,
  "status" TEXT NOT NULL DEFAULT 'running',
  "provider" TEXT NOT NULL DEFAULT 'deterministic',
  "duration_ms" INTEGER,
  "sanitized_error" TEXT,
  "feedback" TEXT,
  "feedback_comment" TEXT,
  "feedback_by" TEXT,
  "feedback_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_runs_status_check" CHECK ("status" IN ('running', 'succeeded', 'degraded', 'failed')),
  CONSTRAINT "ai_runs_provider_check" CHECK ("provider" IN ('deterministic', 'openai', 'degraded', 'none')),
  CONSTRAINT "ai_runs_feedback_check" CHECK ("feedback" IS NULL OR "feedback" IN ('helpful', 'needs_review')),
  CONSTRAINT "ai_runs_duration_check" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  CONSTRAINT "ai_runs_completion_check" CHECK (
    ("status" = 'running' AND "completed_at" IS NULL)
    OR ("status" <> 'running' AND "completed_at" IS NOT NULL)
  ),
  CONSTRAINT "ai_runs_feedback_metadata_check" CHECK (
    ("feedback" IS NULL AND "feedback_at" IS NULL)
    OR ("feedback" IS NOT NULL AND "feedback_at" IS NOT NULL)
  )
);

CREATE TABLE "ai_run_actions" (
  "id" TEXT NOT NULL,
  "ai_run_id" TEXT NOT NULL,
  "action_index" INTEGER NOT NULL,
  "action_item_id" TEXT NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_run_actions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_run_actions_action_index_check" CHECK ("action_index" >= 0)
);

CREATE INDEX "ai_runs_project_id_created_at_idx" ON "ai_runs"("project_id", "created_at");
CREATE INDEX "ai_runs_organization_id_created_at_idx" ON "ai_runs"("organization_id", "created_at");
CREATE INDEX "ai_runs_project_id_status_created_at_idx" ON "ai_runs"("project_id", "status", "created_at");
CREATE UNIQUE INDEX "ai_run_actions_action_item_id_key" ON "ai_run_actions"("action_item_id");
CREATE UNIQUE INDEX "ai_run_actions_ai_run_id_action_index_key" ON "ai_run_actions"("ai_run_id", "action_index");
CREATE INDEX "ai_run_actions_ai_run_id_created_at_idx" ON "ai_run_actions"("ai_run_id", "created_at");

ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ai_run_actions" ADD CONSTRAINT "ai_run_actions_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_run_actions" ADD CONSTRAINT "ai_run_actions_action_item_id_fkey" FOREIGN KEY ("action_item_id") REFERENCES "project_action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
