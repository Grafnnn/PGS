# PGS staging runtime smoke

This runbook verifies authenticated staging behavior through the deployed app runtime. It avoids Render Shell, external `DATABASE_URL`, direct SQL, and printing credentials.

## Purpose

Use the runtime smoke endpoint when Render staging is live but there is no safe shell or external database connection available to Codex.

The endpoint:

- runs only when `APP_ENV=staging`;
- requires `STAGING_SMOKE_SECRET`;
- creates or rotates a synthetic `smoke+...@pgs.local` user through Prisma;
- assigns read-only project access to `project-smoke` and `project-demo`;
- logs in through `/api/auth/login`;
- checks `/api/auth/me`;
- checks read-only project access;
- checks unauthenticated AI guard returns `403`;
- checks authenticated missing-project AI guard returns `404`;
- optionally runs exactly one live AI prompt;
- optionally checks configured storage provider write/read/version/delete with synthetic `project-smoke` keys;
- optionally checks email safe mode without real delivery;
- optionally returns connector readiness statuses without token/secret values;
- optionally runs Project Data Pipeline smoke after a synthetic import on `project-smoke`;
- optionally creates a disposable `SMOKE-...` project, uploads one synthetic starting document, verifies the Documents list, deletes the project, and restores the smoke user's role;
- optionally verifies the AI decision journal lifecycle with a synthetic deterministic run, feedback, controlled action conversion, duplicate prevention, cleanup, and restoration to the smoke user's baseline `VIEWER` role;
- optionally verifies the workforce/payroll lifecycle on `project-smoke`: synthetic employee and labor-demand creation, payroll taxes, capacity and project-margin impact, API cleanup, audit cleanup, and role restoration;
- optionally verifies the Excel-to-ФОТ lifecycle on `project-smoke`: generated XLSX preview, explicit commit, labor demand and VOR allocation, payroll/tax economics, import cleanup, and role restoration;
- returns only statuses and safe metadata.

## Required Render env

Set these on the staging service only:

```bash
APP_ENV=staging
STAGING_SMOKE_SECRET=<strong random secret>
```

Do not set `STAGING_SMOKE_SECRET` in production. Do not print or paste the secret into tickets, logs, or PRs.

When `PORT` is available in the runtime, the endpoint calls app routes through `http://127.0.0.1:$PORT` instead of the public Render URL. This keeps the smoke checks inside the live service and avoids public self-fetch networking failures. Set `STAGING_SMOKE_BASE_URL` only if an operator needs to override that internal base URL for a staging provider.

## Endpoint

```text
POST /api/internal/staging-smoke
```

Authentication:

```text
Authorization: Bearer <STAGING_SMOKE_SECRET>
```

or:

```text
x-pgs-staging-smoke-secret: <STAGING_SMOKE_SECRET>
```

Outside `APP_ENV=staging`, the endpoint returns `404`.

## Read-only authenticated smoke

Run from a trusted operator shell that has the secret available as an environment variable:

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `secretsPrinted: false`;
- smoke user report contains no email, password, cookies, tokens, `DATABASE_URL`, or API keys;
- all checks are `pass`;
- live AI is `skip`.

## Optional live AI smoke

Run only after health says AI is configured and a single live AI request is approved:

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeLiveAi":true}'
```

This performs exactly one authenticated AI request to `project-smoke`.

## Optional readiness smoke

Run only after core smoke is green. This does not call OAuth providers and does not send real email. Storage uses synthetic `project-smoke/runtime-smoke/...` keys and deletes them before returning.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeStorageSmoke":true,"includeEmailSmoke":true,"includeConnectorReadiness":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `storage.status: pass` for the configured storage provider;
- `storage.s3Configured: true` only when `UPLOAD_STORAGE_PROVIDER=s3`;
- `email.status: pass` when `EMAIL_PROVIDER=console`; real providers are skipped by this safe smoke;
- `connectors.status: pass`;
- no passwords, cookies, session tokens, S3 credentials, OAuth tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret.

## Optional Project Data Pipeline smoke

Run only after core smoke is green. This creates a synthetic VOR import on `project-smoke`, commits it, checks the post-import pipeline, and cleans up synthetic budget/material/procurement records before returning.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeImportSmoke":true,"includePipelineSmoke":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `importSmoke.status: pass`;
- `importSmoke.pipeline.status: pass`;
- import operations include preview, deterministic explanation, commit, history, pipeline smoke, cleanup, and role restore;
- pipeline operations include readiness, post-import actions, materials, procurement preview/commit/read/cleanup, schedule preview, cashflow preview, document checklist, and intelligence;
- `liveAi.status: skip`;
- no passwords, cookies, session tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret.

## Optional project creation + starting documents smoke

Run only after core smoke is green and a disposable create/upload/delete check is explicitly approved. This creates one synthetic `SMOKE-...` project through `/api/projects`, uploads one synthetic PDF through `/documents/upload`, verifies it is visible through the project's Documents API, deletes the disposable project through the standard project DELETE route with exact name confirmation, removes the synthetic storage object, and restores the smoke user back to its previous role.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeProjectCreationDocumentsSmoke":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `projectCreationDocumentsSmoke.status: pass`;
- operations include temporary admin role, project create, project open, document upload, documents read, project delete, deleted verification, storage cleanup, and role restore;
- `projectCreationDocumentsSmoke.cleanup: pass`;
- `projectCreationDocumentsSmoke.permissionScope: temporary-admin-restored`;
- the project name starts with `SMOKE-`;
- no real client files, live AI calls, arbitrary project mutations, passwords, cookies, session tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret.

## Optional Project Controls + Earned Value smoke

Run only after core smoke is green. This check temporarily creates one synthetic cost code, VOR line, schedule activity, approved progress entry, and paid outgoing cost on `project-smoke`. It then verifies baseline preview/activation, reporting-period preview/publication/lock, removes every synthetic record, restores the prior active baseline, and restores the smoke user's project role.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeProjectControlsSmoke":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `projectControlsSmoke.status: pass`;
- baseline preview and activation are `true`;
- period preview, publication, and lock are `true`;
- `projectControlsSmoke.cleanup: pass`;
- `projectControlsSmoke.permissionScope: temporary-project-owner-restored`;
- `projectControlsSmoke.previousActiveBaselineRestored: true`;
- `liveAi.status: skip`;
- no real project records, provider calls, passwords, cookies, session tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret.

## Optional AI decision journal smoke

Run only after core smoke is green. This check creates one deterministic synthetic AI run on `project-smoke` without calling a provider. It reads the run through the journal API, records `needs_review` feedback, converts the first recommendation into a project action through the normal API, verifies that a second conversion returns the existing action instead of creating a duplicate, removes the run/action/audit records, and restores the smoke user to its baseline `VIEWER` project role.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeAiDecisionJournalSmoke":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `aiDecisionJournalSmoke.status: pass`;
- the run is created, listed, and marked for review;
- the action is created once and the duplicate request reuses it;
- `aiDecisionJournalSmoke.cleanup: pass`;
- `aiDecisionJournalSmoke.permissionScope: temporary-project-manager-restored`;
- `liveAi.status: skip`;
- no provider calls, real project actions, passwords, cookies, session tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret remain or are returned.

## Optional workforce + payroll lifecycle smoke

Run only after core smoke is green. This check temporarily grants the smoke user project-manager access to `project-smoke`, creates one bounded synthetic staff engineer and one synthetic labor demand through the normal project APIs, and reads the resulting workforce model. It verifies gross payroll, employer insurance and accident contributions, personal income tax withholding, net payroll, total employer cost, capacity, and adjusted project forecast/margin through the production calculation module. It then deletes the demand and assignment through the normal APIs, removes the synthetic organization resource and related audit rows, verifies cleanup, and restores the previous project role.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeWorkforcePayrollSmoke":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `workforcePayrollSmoke.status: pass`;
- the resource and demand are created, listed, and cleaned;
- payroll figures include gross payroll, employer contributions, withheld personal income tax, net payroll, and total employer cost;
- capacity increases while the synthetic rows exist;
- adjusted forecast cost increases and margin decreases when the project has a positive contract amount;
- `workforcePayrollSmoke.cleanup: pass`;
- `workforcePayrollSmoke.permissionScope: temporary-project-manager-restored`;
- `liveAi.status: skip`;
- no synthetic workforce, labor-demand, assignment, allocation, or audit rows remain;
- no passwords, cookies, session tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret are returned.

## Optional approved-report productivity feedback smoke

Run only after core smoke is green. This check temporarily grants the smoke user project-owner access to `project-smoke`, creates two synthetic daily reports through the standard API, and moves each report through `draft → submitted → checked → approved`. Both reports contain the same unique profession and measurable output with different actual volumes. The workforce read model must then expose a two-sample `actual` productivity benchmark calculated with the project's current working-hours policy. The check removes the approved synthetic reports and their audit rows through the guarded runtime cleanup, verifies that the benchmark disappears, and restores the previous project role.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeProductivityFeedbackSmoke":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `productivityFeedbackSmoke.status: pass`;
- two reports are created, submitted, checked, and approved;
- the resulting benchmark has `basis: actual`, `sampleCount: 2`, and `autoApplicable: true`;
- with a `160` hour policy the expected average is `110`; other policies are calculated dynamically;
- `productivityFeedbackSmoke.cleanup: pass`;
- `productivityFeedbackSmoke.benchmark.cleared: true`;
- `productivityFeedbackSmoke.permissionScope: temporary-project-owner-restored`;
- `liveAi.status: skip`;
- no synthetic daily reports, benchmark inputs, or related audit rows remain;
- no passwords, cookies, session tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret are returned.

## Optional Excel-to-ФОТ import lifecycle smoke

Run only after core smoke is green. This check builds a generated XLSX in memory with one synthetic ВОР row and one ФОТ row, previews it through the standard Excel import API, and commits it explicitly through the standard budget import API. It verifies the imported payroll budget, labor demand, 100% ВОР allocation, gross payroll, employer contributions, personal income tax, net payroll, and project cost calculation. It then removes the import batch, budget/schedule/labor/allocation/audit rows and any payroll policy created only for the smoke, verifies that no synthetic rows remain, and restores the prior project role.

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeWorkforcePayrollImportSmoke":true}'
```

Expected:

- HTTP `200`;
- `ok: true`;
- `workforcePayrollImportSmoke.status: pass`;
- preview contains a payroll item, labor demand, and labor allocation whose shares total `100`;
- commit persists the import batch, payroll budget, labor demand, and linked ВОР allocation;
- workforce read model contains the imported demand while the smoke is running;
- economics include gross payroll, employer contributions, withheld personal income tax, net payroll, total employer cost, payroll budget, and adjusted forecast cost;
- `workforcePayrollImportSmoke.cleanup: pass`;
- `workforcePayrollImportSmoke.permissionScope: temporary-project-manager-restored`;
- `liveAi.status: skip`;
- no synthetic import batch, budget section/item, schedule, labor demand/allocation, audit, or smoke-only payroll policy remains;
- no real workbook, provider request, password, cookie, session token, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret is used or returned.

## Browser session handoff

For a controlled browser-only staging smoke, request a short-lived session without exposing a password or session token in JSON:

```bash
curl -sS -c /tmp/pgs-browser-smoke.cookies \
  -X POST \
  -H "x-pgs-staging-smoke-secret: $STAGING_SMOKE_SECRET" \
  "$APP_URL/api/internal/staging-smoke/browser-session"
```

The endpoint is available only when `APP_ENV=staging`, grants the synthetic smoke user temporary admin access for 20 minutes, and places an `HttpOnly` session cookie in the caller's cookie jar. Use a disposable browser profile and only synthetic projects/files.

Always close the handoff after the browser flow. This revokes all active smoke-user sessions and restores `VIEWER`:

```bash
curl -sS -b /tmp/pgs-browser-smoke.cookies \
  -X DELETE \
  -H "x-pgs-staging-smoke-secret: $STAGING_SMOKE_SECRET" \
  "$APP_URL/api/internal/staging-smoke/browser-session"
```

Delete the temporary cookie jar after cleanup. Production returns `404`; missing or invalid smoke secrets return `403`.

## Safety notes

- The endpoint must not be used for arbitrary mutation smoke; only built-in synthetic `project-smoke` checks with cleanup are allowed.
- The disposable project creation smoke is allowed only for generated `SMOKE-...` project names and must restore the synthetic smoke user role before returning.
- The Project Controls smoke must use only generated `SMOKE-PC-...` source rows, restore any previously active smoke baseline, and remove its baseline, period, audit, source, and role changes before returning.
- The AI decision journal smoke must use only its freshly created synthetic run on `project-smoke`, remove its linked action and audit rows, and restore the smoke user's baseline `VIEWER` role before returning.
- The workforce/payroll smoke must use only generated `SMOKE-WORKFORCE-...` rows on `project-smoke`, enforce its bounded synthetic payroll limit, remove resource/demand/assignment/allocation/audit rows, and restore the prior project role.
- The Excel-to-ФОТ smoke must use only its generated `SMOKE-FOT-IMPORT-...` workbook on `project-smoke`, commit through the normal import API, remove every synthetic import/budget/schedule/labor/allocation/audit row, and restore the prior project role.
- The synthetic user password is generated in memory and is never returned.
- Existing smoke-user sessions are revoked during rotation.
- The endpoint uses the deployed app's runtime `DATABASE_URL`; operators never need to expose that URL to Codex.
- If every HTTP check returns `fetch failed`, confirm the deployed revision includes loopback smoke routing and that `PORT` is present in the runtime.
- Storage readiness verifies the configured provider. A local-provider pass is not an S3-provider pass.
- Email readiness intentionally avoids real delivery unless a dedicated live-provider smoke is added later.
- If the endpoint returns `STAGING_SMOKE_SECRET_MISSING`, configure the secret in Render staging and redeploy/restart.
- If it returns `STAGING_SMOKE_FAILED`, inspect Render logs for sanitized errors only.
