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

This performs exactly one authenticated AI request to `project-demo`.

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
- The synthetic user password is generated in memory and is never returned.
- Existing smoke-user sessions are revoked during rotation.
- The endpoint uses the deployed app's runtime `DATABASE_URL`; operators never need to expose that URL to Codex.
- If every HTTP check returns `fetch failed`, confirm the deployed revision includes loopback smoke routing and that `PORT` is present in the runtime.
- Storage readiness verifies the configured provider. A local-provider pass is not an S3-provider pass.
- Email readiness intentionally avoids real delivery unless a dedicated live-provider smoke is added later.
- If the endpoint returns `STAGING_SMOKE_SECRET_MISSING`, configure the secret in Render staging and redeploy/restart.
- If it returns `STAGING_SMOKE_FAILED`, inspect Render logs for sanitized errors only.
