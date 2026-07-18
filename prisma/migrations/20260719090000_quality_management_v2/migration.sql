CREATE TABLE "project_quality_inspections" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'work',
  "title" TEXT NOT NULL,
  "location" TEXT,
  "inspector" TEXT,
  "responsible_party" TEXT,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "scheduled_at" TIMESTAMP(3),
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  "decision_comment" TEXT,
  "linked_schedule_item_id" TEXT,
  "cost_code_id" TEXT,
  "linked_document_id" TEXT,
  "linked_document_version" INTEGER,
  "linked_document_version_id" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_quality_inspections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_quality_inspection_checks" (
  "id" TEXT NOT NULL,
  "inspection_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "requirement" TEXT,
  "result" TEXT NOT NULL DEFAULT 'pending',
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_quality_inspection_checks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_quality_issues" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "project_id" TEXT NOT NULL,
  "inspection_id" TEXT,
  "inspection_check_id" TEXT,
  "sequence" INTEGER NOT NULL,
  "number" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'punch',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "location" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'medium',
  "status" TEXT NOT NULL DEFAULT 'open',
  "responsible_party" TEXT,
  "due_at" TIMESTAMP(3),
  "root_cause" TEXT,
  "corrective_action" TEXT,
  "decision_comment" TEXT,
  "acceptance_blocker" BOOLEAN NOT NULL DEFAULT false,
  "cost_impact" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "schedule_impact_days" INTEGER NOT NULL DEFAULT 0,
  "linked_schedule_item_id" TEXT,
  "cost_code_id" TEXT,
  "source_daily_report_id" TEXT,
  "linked_document_id" TEXT,
  "linked_document_version" INTEGER,
  "linked_document_version_id" TEXT,
  "verification_workflow_run_id" TEXT,
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "submitted_at" TIMESTAMP(3),
  "verified_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_quality_issues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_quality_evidence" (
  "id" TEXT NOT NULL,
  "issue_id" TEXT NOT NULL,
  "phase" TEXT NOT NULL DEFAULT 'opening',
  "document_id" TEXT,
  "document_version_id" TEXT,
  "document_version" INTEGER,
  "title_snapshot" TEXT NOT NULL,
  "file_name_snapshot" TEXT,
  "note" TEXT,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_quality_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_quality_issue_events" (
  "id" TEXT NOT NULL,
  "issue_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status_before" TEXT,
  "status_after" TEXT,
  "comment" TEXT,
  "created_by" TEXT,
  "created_by_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_quality_issue_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_quality_inspections_project_id_sequence_key" ON "project_quality_inspections"("project_id", "sequence");
CREATE UNIQUE INDEX "project_quality_inspections_project_id_number_key" ON "project_quality_inspections"("project_id", "number");
CREATE INDEX "project_quality_inspections_project_id_status_scheduled_at_idx" ON "project_quality_inspections"("project_id", "status", "scheduled_at");
CREATE INDEX "project_quality_inspections_linked_schedule_item_id_idx" ON "project_quality_inspections"("linked_schedule_item_id");
CREATE INDEX "project_quality_inspections_cost_code_id_idx" ON "project_quality_inspections"("cost_code_id");
CREATE INDEX "project_quality_inspections_linked_document_id_idx" ON "project_quality_inspections"("linked_document_id");
CREATE INDEX "project_quality_inspections_linked_document_version_id_idx" ON "project_quality_inspections"("linked_document_version_id");
CREATE UNIQUE INDEX "project_quality_inspection_checks_inspection_id_sequence_key" ON "project_quality_inspection_checks"("inspection_id", "sequence");
CREATE INDEX "project_quality_inspection_checks_inspection_id_result_idx" ON "project_quality_inspection_checks"("inspection_id", "result");
CREATE UNIQUE INDEX "project_quality_issues_inspection_check_id_key" ON "project_quality_issues"("inspection_check_id");
CREATE UNIQUE INDEX "project_quality_issues_verification_workflow_run_id_key" ON "project_quality_issues"("verification_workflow_run_id");
CREATE UNIQUE INDEX "project_quality_issues_project_id_sequence_key" ON "project_quality_issues"("project_id", "sequence");
CREATE UNIQUE INDEX "project_quality_issues_project_id_number_key" ON "project_quality_issues"("project_id", "number");
CREATE INDEX "project_quality_issues_project_id_status_due_at_idx" ON "project_quality_issues"("project_id", "status", "due_at");
CREATE INDEX "project_quality_issues_inspection_id_idx" ON "project_quality_issues"("inspection_id");
CREATE INDEX "project_quality_issues_linked_schedule_item_id_idx" ON "project_quality_issues"("linked_schedule_item_id");
CREATE INDEX "project_quality_issues_cost_code_id_idx" ON "project_quality_issues"("cost_code_id");
CREATE INDEX "project_quality_issues_source_daily_report_id_idx" ON "project_quality_issues"("source_daily_report_id");
CREATE INDEX "project_quality_issues_linked_document_id_idx" ON "project_quality_issues"("linked_document_id");
CREATE INDEX "project_quality_issues_linked_document_version_id_idx" ON "project_quality_issues"("linked_document_version_id");
CREATE INDEX "project_quality_evidence_issue_id_phase_created_at_idx" ON "project_quality_evidence"("issue_id", "phase", "created_at");
CREATE INDEX "project_quality_evidence_document_id_idx" ON "project_quality_evidence"("document_id");
CREATE INDEX "project_quality_evidence_document_version_id_idx" ON "project_quality_evidence"("document_version_id");
CREATE INDEX "project_quality_issue_events_issue_id_created_at_idx" ON "project_quality_issue_events"("issue_id", "created_at");

ALTER TABLE "project_quality_inspections" ADD CONSTRAINT "project_quality_inspections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_quality_inspections" ADD CONSTRAINT "project_quality_inspections_linked_schedule_item_id_fkey" FOREIGN KEY ("linked_schedule_item_id") REFERENCES "schedule_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_inspections" ADD CONSTRAINT "project_quality_inspections_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_inspections" ADD CONSTRAINT "project_quality_inspections_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_inspections" ADD CONSTRAINT "project_quality_inspections_linked_document_version_id_fkey" FOREIGN KEY ("linked_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_inspection_checks" ADD CONSTRAINT "project_quality_inspection_checks_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "project_quality_inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "project_quality_inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_inspection_check_id_fkey" FOREIGN KEY ("inspection_check_id") REFERENCES "project_quality_inspection_checks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_linked_schedule_item_id_fkey" FOREIGN KEY ("linked_schedule_item_id") REFERENCES "schedule_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_cost_code_id_fkey" FOREIGN KEY ("cost_code_id") REFERENCES "project_cost_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_source_daily_report_id_fkey" FOREIGN KEY ("source_daily_report_id") REFERENCES "daily_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_linked_document_id_fkey" FOREIGN KEY ("linked_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_linked_document_version_id_fkey" FOREIGN KEY ("linked_document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issues" ADD CONSTRAINT "project_quality_issues_verification_workflow_run_id_fkey" FOREIGN KEY ("verification_workflow_run_id") REFERENCES "project_workflow_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_evidence" ADD CONSTRAINT "project_quality_evidence_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "project_quality_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_quality_evidence" ADD CONSTRAINT "project_quality_evidence_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_evidence" ADD CONSTRAINT "project_quality_evidence_document_version_id_fkey" FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_quality_issue_events" ADD CONSTRAINT "project_quality_issue_events_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "project_quality_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
