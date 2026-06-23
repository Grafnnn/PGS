# PGS Project Data Pipeline v1

Project Data Pipeline v1 connects a committed VOR/estimate import with the main project operating blocks. The goal is to make import output actionable without automatically changing critical project data.

## Flow

1. A user uploads a VOR/estimate through the existing Excel import wizard.
2. Preview, mapping, explanation, and commit keep using the existing import workflow.
3. After commit, the project receives a post-import action hub:
   - open Budget / VOR;
   - open Materials;
   - preview procurement drafts;
   - preview draft schedule;
   - preview draft cashflow;
   - check documents;
   - open analytics/readiness.

## What Is Automatic

- Readiness score and completeness checks.
- Post-import action list.
- Imported row evidence from `ImportBatch.previewJson`.
- Material deficit suggestions.
- Draft schedule preview grouped by budget section.
- Draft cashflow preview grouped by section.
- Document checklist status.
- Calculated risks shown in analytics.
- Deterministic assistant quick actions.

## What Requires Confirmation

- Creating procurement draft requests from material deficits.
- Creating draft schedule items from imported sections.
- Creating draft cashflow periods.
- Creating persistent risks remains manual and is not automatic in this version.

## Permissions

- `VIEWER` can read readiness, actions, document checklist, intelligence, and draft previews.
- `MANAGER`, `ADMIN`, and `OWNER` can create draft procurement, schedule, and cashflow records through existing project edit permissions.
- Project membership and project access are enforced server-side.

## Evidence Contract

Pipeline actions include evidence objects with support for:

- `entityType`
- `entityId`
- `label`
- `field`
- `value`
- `explanation`
- `importBatchId`
- `importRowId`
- `documentId`
- `page`
- `section`
- `snippet`

Document page/snippet fields are intentionally nullable for future OCR/RAG work.

## API

- `GET /api/projects/:projectId/data-readiness`
- `GET /api/projects/:projectId/post-import-actions`
- `GET /api/projects/:projectId/document-checklist`
- `GET /api/projects/:projectId/intelligence`
- `POST /api/projects/:projectId/procurement/draft-from-import`
- `POST /api/projects/:projectId/schedule/draft-from-import`
- `POST /api/projects/:projectId/finance/draft-cashflow-from-import`

Draft endpoints return preview by default. They create records only with:

```json
{ "commit": true, "confirmed": true }
```

## Limitations

- No live AI call is required.
- No supplier APIs or marketplace integrations are called.
- No embeddings, vector DB, OCR, or RAG pipeline is included.
- Import source links are derived from committed `ImportBatch.previewJson`; this version does not add destructive schema changes.
- Cashflow v1 creates coarse draft periods, not a full financial model.
- Schedule v1 groups by section and is not CPM/network planning.

## Future Steps

- Procurement v1 with supplier quote workflow.
- Schedule v1 with dependencies, baseline, and date editing before commit.
- Cashflow v1 with receivables/payables calendar and funding scenarios.
- Documents/RAG v1 with extraction, chunking, and page/snippet evidence.
- Project Intelligence v1 with persistent action tracking.
