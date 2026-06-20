# Render staging Blueprint

This repo now includes `render.yaml` for a first-pass PGS staging environment on Render.

## What it creates

- Render Project: `PGS`
- Environment: `staging`
- Web Service: `pgs-grafnnn-staging`
- PostgreSQL: `pgs-grafnnn-staging-db`
- Region: `frankfurt`
- Branch: `main`
- Auto deploy trigger: only after checks pass

The web service runs:

```bash
corepack enable && corepack prepare pnpm@11.5.3 --activate && pnpm install --frozen-lockfile && pnpm prisma generate && pnpm build
pnpm prisma migrate deploy
pnpm start -- -H 0.0.0.0 -p $PORT
```

On the first successful deploy, Render runs:

```bash
pnpm prisma db seed
```

## Required owner step

Render MCP requires the account owner to select the active workspace. Codex must not choose a workspace for the user.

After selecting the workspace, apply the Blueprint from:

```text
https://dashboard.render.com/blueprint/new?repo=https://github.com/Grafnnn/PGS
```

During Blueprint creation, fill:

- `FIRST_ADMIN_EMAIL`
- `FIRST_ADMIN_PASSWORD`

Use a temporary strong staging password, sign in once, rotate it, and then remove or replace the bootstrap password in Render env.

## Storage note

The Blueprint intentionally uses local ephemeral storage:

```text
UPLOAD_STORAGE_PROVIDER=local
UPLOAD_DIR=/tmp/pgs/uploads
```

This is enough for first health/smoke verification, but uploaded files are not preserved across redeploys. Before storing real staging documents, switch to one of:

- S3-compatible storage with staging-only credentials.
- A paid Render web service with a persistent disk and `UPLOAD_DIR` under that mount path.

## Verification

After the deploy is live:

```bash
curl -i "$APP_URL/api/health"
```

Expected:

- HTTP 200
- `status: "ok"`
- `database: "ok"`
- `storage.writable: true`
- `missing: []`

Then run read-only staging smoke:

```bash
APP_URL=https://pgs-grafnnn-staging.onrender.com \
SMOKE_EMAIL=<FIRST_ADMIN_EMAIL> \
SMOKE_PASSWORD=<FIRST_ADMIN_PASSWORD> \
pnpm smoke:staging
```

Do not run mutation smoke until the staging URL, database, and storage target are confirmed.
