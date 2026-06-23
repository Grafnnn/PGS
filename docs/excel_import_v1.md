# PGS Excel Import v1

Excel Import v1 turns ВОР/смета upload into a two-step server-side workflow:

1. `POST /api/projects/:projectId/imports/budget/preview`
   - Requires project `import` permission.
   - Reads `.xlsx` / `.xls` files up to 15 MB.
   - Detects sheets, header row, Russian columns, sections, budget rows, materials and schedule rows.
   - Skips hidden rows with warnings.
   - Does not execute formulas. Cached cell values are used and formula cells are reported.
   - Stores an `import_batches` preview record with parser version, mapping, summary, warnings and errors.

2. `POST /api/projects/:projectId/imports/budget/commit`
   - Requires project `import` permission.
   - Accepts only `importBatchId`, `mode` and replacement confirmation.
   - Loads the stored server-side preview from `import_batches`.
   - Rejects failed, missing or already committed batches.
   - Applies the commit in a Prisma transaction and writes audit log.

Commit modes:

- `append`
- `replace_budget`
- `replace_materials`
- `replace_schedule`
- `replace_all`

Replacement modes require `replaceConfirmed: true`.

Security notes:

- VIEWER users cannot preview or commit imports.
- Commit does not trust client-supplied rows.
- Uploaded workbook bytes are not stored by this flow.
- Secrets, cookies, database URLs and provider keys are never included in preview/commit responses.

Known MVP limits:

- Official КС forms are not generated from imported rows yet.
- Row classification is heuristic and should be reviewed in preview before commit.
- Formulas are not recalculated server-side; export files with fresh cached values from Excel before upload.
