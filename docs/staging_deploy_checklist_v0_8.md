# PGS v0.8 staging deploy checklist

This checklist is for deploying the current safe v0.8 baseline to a real staging environment and verifying it without touching production.

## Baseline

- Repository: `https://github.com/Grafnnn/PGS`
- Branch: `main`
- Commit: `6f8d6f228211da618ddc6c9a6077dd7968572c3a`
- PRs included: PR #2 and PR #3
- CI: GitHub Actions main CI #7 passed
- Local post-merge gate: GO for staging deploy
- Local checks already passed:
  - `pnpm install --frozen-lockfile`
  - `pnpm prisma validate`
  - `pnpm prisma generate`
  - `pnpm test` with 42/42 tests
  - `pnpm lint`
  - `pnpm exec tsc --noEmit`
  - `pnpm build`

Do not deploy any branch or commit other than the baseline above unless a new gate explicitly replaces it.

## Target assumptions

No first-class `render.yaml` or `vercel.json` exists yet. The repository currently has:

- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/staging-smoke.yml`
- `docs/staging_live_verification.md`

The preferred first staging target is a manually configured Render or Vercel staging service connected to `Grafnnn/PGS` on `main`. Do not create or mutate hosting configuration from Codex without an explicit target, service name, and approval.

Use Node.js 22 and pnpm 11.5.3 for parity with CI when the platform allows it. The current Dockerfile uses Node 20 and npm; treat Docker as available but not the primary staging path until its package-manager behavior is reviewed.

## Environment matrix

Use placeholders only in tickets, docs, and chat. Do not paste real values into GitHub issues, PRs, logs, or Codex output.

| Variable | Required for staging | Secret | Value / guidance |
| --- | --- | --- | --- |
| `NODE_ENV` | yes | no | `production` |
| `APP_ENV` | recommended | no | `staging`; used by smoke safety checks |
| `APP_URL` | yes | no | HTTPS staging URL |
| `DATABASE_URL` | yes | yes | Staging PostgreSQL URL only, never production |
| `AUTH_REQUIRED` | yes | no | `true` |
| `SESSION_SECRET` | yes | yes | Strong random value |
| `STAGING_SMOKE_SECRET` | runtime smoke only | yes | Strong random staging-only secret for `/api/internal/staging-smoke` |
| `FIRST_ADMIN_EMAIL` | first bootstrap | no | Initial staging admin email |
| `FIRST_ADMIN_PASSWORD` | first bootstrap | yes | Temporary strong password; rotate/remove after first login |
| `FIRST_ADMIN_NAME` | first bootstrap | no | Initial staging admin name |
| `EMAIL_PROVIDER` | yes | no | Start with `console` unless real delivery is approved |
| `EMAIL_FROM` | optional | no | Sender label/address for future delivery |
| `UPLOAD_STORAGE_PROVIDER` | yes | no | `local` with persistent disk, or `s3` |
| `UPLOAD_DIR` | local storage | no | Persistent mounted path, not ephemeral FS |
| `MAX_UPLOAD_MB` | optional | no | Default is `50`; keep explicit for staging |
| `S3_BUCKET` | S3 only | no | Synthetic/staging bucket |
| `S3_REGION` | S3 only | no | S3 region |
| `S3_ENDPOINT` | S3-compatible only | no | Provider endpoint if not AWS default |
| `S3_FORCE_PATH_STYLE` | S3-compatible only | no | Usually `true` for compatible providers |
| `S3_ACCESS_KEY_ID` | S3 only | yes | Staging-only access key |
| `S3_SECRET_ACCESS_KEY` | S3 only | yes | Staging-only secret key |
| `OPENAI_API_KEY` | optional | yes | Leave empty unless AI live test is approved |
| `OPENAI_CONNECTOR_MODE` | yes | no | `disabled` if no OpenAI key, otherwise `read_only` for first staging |
| `GITHUB_REPO` | yes | no | `Grafnnn/PGS` |
| `GITHUB_CONNECTOR_MODE` | yes | no | `read_only` |
| `GOOGLE_DRIVE_CONNECTOR_MODE` | yes | no | `disabled` |
| `GMAIL_CONNECTOR_MODE` | yes | no | `disabled` |
| `GOOGLE_CALENDAR_CONNECTOR_MODE` | yes | no | `disabled` |
| `RENDER_CONNECTOR_MODE` | yes | no | `disabled` unless specifically testing Render connector status |
| `VERCEL_CONNECTOR_MODE` | yes | no | `disabled` unless specifically testing Vercel connector status |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | optional | no | Default `60000` |
| `LOGIN_RATE_LIMIT_MAX` | optional | no | Default `8` |
| `RESET_RATE_LIMIT_WINDOW_MS` | optional | no | Default `900000` |
| `RESET_RATE_LIMIT_MAX` | optional | no | Default `5` |
| `GIT_SHA` | optional | no | Fallback only for non-Render environments; Render should report `RENDER_GIT_COMMIT` automatically |

`NEXTAUTH_SECRET` appears in `.env.example` for older local scaffolding but is not part of the current runtime env schema. Use `SESSION_SECRET` for the current staging requirement.

## Pre-deploy checks

Run from a clean checkout of `main@6f8d6f228211da618ddc6c9a6077dd7968572c3a`:

```bash
git status --short --branch
git rev-parse HEAD
pnpm install --frozen-lockfile
pnpm prisma validate
pnpm prisma generate
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Expected result: every command exits with code 0. If the local PostgreSQL server is unavailable, `pnpm build` may log Prisma connection errors during prerender and still exit 0; this is not sufficient for staging success. Staging health must be `200 ok` after a real DB is attached and migrated.

## Deploy target setup

### Render staging

Use when a persistent web service and managed PostgreSQL are available.

- Create or select a staging web service connected to `Grafnnn/PGS`.
- Source branch: `main`.
- Source commit: `6f8d6f228211da618ddc6c9a6077dd7968572c3a`.
- Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build
```

- Start command:

```bash
pnpm start
```

- Attach staging PostgreSQL and set `DATABASE_URL`.
- For local file storage, mount a persistent disk and set `UPLOAD_STORAGE_PROVIDER=local` plus `UPLOAD_DIR` to the mounted path.
- For S3 storage, set `UPLOAD_STORAGE_PROVIDER=s3` and the S3 variables above.
- Do not configure production domains or production databases.

### Vercel staging

Use when serverless deployment is desired and external PostgreSQL/S3 are available.

- Project framework: Next.js.
- Source branch: `main`.
- Source commit: `6f8d6f228211da618ddc6c9a6077dd7968572c3a`.
- Install command:

```bash
pnpm install --frozen-lockfile
```

- Build command:

```bash
pnpm prisma generate && pnpm build
```

- Configure external PostgreSQL through `DATABASE_URL`.
- Use S3-compatible storage for documents. Do not rely on local filesystem persistence on serverless.
- Run migrations and seed outside the Vercel build unless a deliberate one-off job is configured.

### Docker/VPS staging

Use only when a staging host, HTTPS proxy, and backup process are explicitly available.

```bash
docker compose up --build
```

The bundled Dockerfile currently uses npm while CI uses pnpm. Before relying on Docker for staging, review or test the Docker path on staging infrastructure.

## Database migration and seed

Before touching the database:

- Confirm the connection string points to staging, not production.
- Confirm `APP_ENV=staging`.
- If the staging DB contains prior data, take a provider snapshot or run `scripts/db-backup.sh`.
- Confirm no raw secrets are printed to logs.

Commands:

```bash
pnpm prisma validate
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma db seed
```

Seed behavior:

- Production-like seed requires `FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD`.
- Non-production seed may create demo records for local work.
- Staging should use a temporary strong `FIRST_ADMIN_PASSWORD`.
- After first successful admin login, rotate the password and remove or replace bootstrap credentials.
- Seed should create `project-demo` and `project-smoke`; `project-smoke` is required for mutation smoke.

Health check after migration/seed:

```bash
curl -i "$APP_URL/api/health"
```

Expected:

- HTTP 200
- JSON `status` is `ok`
- `database` is `ok`
- `storage.writable` is `true`
- `missing` is empty
- migration count is available

Any `503 degraded` on staging is a blocker, not a pass.

## Smoke plan

Run in this order.

### 1. Health

```bash
curl -i "$APP_URL/api/health"
```

Require HTTP 200 and `status: ok`.

### 2. Auth

- Open `/login`.
- Login as the first staging admin.
- Verify `/api/auth/me`.
- Verify dashboard and project list access.
- Verify unauthenticated protected pages/API return redirect, 401, or 403 as appropriate.
- Verify cookie is HTTP-only and secure on HTTPS staging.

### 2a. Runtime authenticated smoke without Render Shell

If Render Shell or a safe external staging `DATABASE_URL` is unavailable, use the staging-only runtime smoke endpoint instead of direct DB access.

Prerequisites:

- `APP_ENV=staging`;
- `STAGING_SMOKE_SECRET` configured on the staging service;
- `/api/health` returns HTTP 200;
- deployed commit is confirmed through `/api/health.version.gitSha` with `gitShaSource: "RENDER_GIT_COMMIT"` or Render deploy metadata.

On Render, the runtime endpoint uses `http://127.0.0.1:$PORT` for its internal app checks when `PORT` is available. If all smoke checks fail with `fetch failed`, verify the deployed revision includes this loopback behavior before trusting the smoke result.

Run from a trusted shell without printing the secret:

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{}'
```

Expected:

- HTTP 200;
- `ok: true`;
- login, `/api/auth/me`, project read, unauth AI guard, and authenticated missing-project AI guard pass;
- `liveAi.status` is `skip`;
- response contains no passwords, cookies, session tokens, `DATABASE_URL`, `OPENAI_API_KEY`, or smoke secret.

Optional one-request live AI smoke:

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeLiveAi":true}'
```

Optional readiness smoke for storage, email safe mode, and connector statuses:

```bash
curl -sS -X POST "$APP_URL/api/internal/staging-smoke" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $STAGING_SMOKE_SECRET" \
  --data '{"includeStorageSmoke":true,"includeEmailSmoke":true,"includeConnectorReadiness":true}'
```

Notes:

- `storage.status=pass` verifies the configured storage provider only. It is an S3 pass only when `storage.s3Configured=true`.
- `email.status=pass` in console mode means no real email was sent.
- Connector readiness returns sanitized status metadata only; it must not mutate OAuth providers.

Full runbook: `docs/staging_smoke.md`.

### 3. Project baseline

- Open `/dashboard`.
- Open `/projects`.
- Open `project-demo`.
- Confirm seeded admin can access project data.
- Confirm no local/demo password is used as a real staging credential.

### 4. Excel import preview auth regression

- Unauthenticated `POST /api/projects/project-demo/imports/budget/preview` returns 401 before file parsing.
- Authenticated user without project import permission returns 403.
- Owner/admin or project manager can preview a synthetic `.xlsx` or receive the expected validation error for invalid input.

Generate a synthetic fixture locally if needed:

```bash
pnpm import:fixture -- /tmp/pgs-budget-import-demo.xlsx
```

Do not commit fixture files.

### 5. Documents and storage

Run on `project-smoke` only:

- Upload a small allowed synthetic file.
- Download it.
- Upload a v2 version.
- Download both current and versioned files.
- Reject invalid MIME/extension.
- Reject too-large file according to `MAX_UPLOAD_MB`.
- Confirm no path traversal is possible through user filenames.
- Confirm audit entries exist.

### 6. AI endpoint

Without `OPENAI_API_KEY`:

- Call a project AI endpoint and verify controlled error/fallback; no crash.
- Verify project access is required.

With `OPENAI_API_KEY`, only after approval:

- Send one small prompt.
- Verify response is based on project context.
- Do not upload or send whole customer documents.

### 7. Connectors

As owner/admin:

```bash
curl -i "$APP_URL/api/connectors/status"
```

Verify:

- GitHub repo is `Grafnnn/PGS`.
- Google Drive/Gmail/Calendar are disabled by default.
- Render/Vercel are disabled by default unless intentionally changed.
- OpenAI status matches env.
- No OAuth tokens, API keys, or secrets are returned.

### 8. Read-only smoke script

```bash
APP_URL="$APP_URL" \
SMOKE_EMAIL="$SMOKE_EMAIL" \
SMOKE_PASSWORD="$SMOKE_PASSWORD" \
pnpm smoke:staging
```

Expected: no `FAIL`. Mutation steps should be skipped unless explicitly enabled.

## Mutation smoke guard

Mutation smoke is allowed only after explicit staging approval.

Requirements:

- `APP_ENV=staging`
- target project is `project-smoke`
- never production
- synthetic files and data only
- admin smoke user only

Command:

```bash
APP_URL="$APP_URL" \
SMOKE_EMAIL="$SMOKE_EMAIL" \
SMOKE_PASSWORD="$SMOKE_PASSWORD" \
SMOKE_ALLOW_MUTATION=true \
pnpm smoke:staging
```

Cleanup immediately after mutation smoke:

```bash
APP_URL="$APP_URL" \
SMOKE_CLEANUP_CONFIRM=project-smoke \
pnpm smoke:cleanup
```

Cleanup must remove only `SMOKE-...` and `smoke+...` records in `project-smoke`.

## Rollback plan

If deployment fails before traffic:

- Stop or cancel the deployment.
- Keep the previous staging deployment active.
- Do not run mutation smoke.

If deployment fails after startup:

- Capture failing health response and logs without secrets.
- Disable mutation smoke.
- Revert connector modes to `disabled` or `read_only`.
- Roll back hosting service to the previous successful deployment.

If migrations or seed fail:

- Stop the web service or keep it offline.
- Do not retry against an unknown database.
- Restore provider snapshot or `scripts/db-restore.sh` backup if data was modified.
- Re-run `pnpm prisma migrate deploy` only after identifying the exact error.

Backup/restore commands for staging shells:

```bash
DATABASE_URL="postgresql://..." scripts/db-backup.sh
RESTORE_CONFIRM=pgs-restore DATABASE_URL="postgresql://..." scripts/db-restore.sh ./backups/pgs-YYYYMMDD-HHMMSS.dump
```

Do not commit backup files.

## Known not verified before first staging deploy

- Live PostgreSQL migrate/seed
- Live S3 upload/download/version/delete
- Real staging URL
- Authenticated staging smoke
- Mutation smoke
- Real email delivery
- Real OAuth/connector flows
- Real OpenAI prompt on staging
- Hosting platform logs and health checks

## GO / NO-GO decision table

| Area | GO | NO-GO |
| --- | --- | --- |
| Source | Deployed from `main@6f8d6f228211da618ddc6c9a6077dd7968572c3a` | Any other commit without a new gate |
| CI | Latest main CI green | CI missing, pending, or failed |
| Env | Required staging env set with no production secrets | Missing `DATABASE_URL`, `AUTH_REQUIRED`, `SESSION_SECRET`, or production DB detected |
| DB | `migrate deploy` and seed complete | Migration/seed failed or target DB uncertain |
| Health | `/api/health` returns 200 `ok` | 503 `degraded` or missing health |
| Auth | First admin login works; protected routes blocked for anonymous users | Login broken or anonymous users can access protected project data |
| Storage | Local persistent disk or S3 writable | Ephemeral upload path for persistent staging docs, or S3 unverified |
| Excel preview | 401/403 regression confirmed | Unauthenticated preview can parse files |
| Read-only smoke | No `FAIL` | Any `FAIL` |
| Mutation smoke | Explicitly approved, `project-smoke` only, cleanup succeeds | Any production mutation risk or cleanup uncertainty |
| Connectors | Disabled/read-only and no secrets returned | External mutation enabled without approval or secrets exposed |

## Final staging report template

After live verification, report:

- Staging URL
- Commit deployed
- Hosting target/service
- DB migration/seed result
- Health result
- Auth result
- Storage mode and verification result
- Read-only smoke result
- Mutation smoke result, if explicitly approved
- Cleanup result, if mutation smoke ran
- Known limitations
- GO/NO-GO for broader staging review
