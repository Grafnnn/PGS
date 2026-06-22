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
- returns only statuses and safe metadata.

## Required Render env

Set these on the staging service only:

```bash
APP_ENV=staging
STAGING_SMOKE_SECRET=<strong random secret>
```

Do not set `STAGING_SMOKE_SECRET` in production. Do not print or paste the secret into tickets, logs, or PRs.

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

## Safety notes

- The endpoint must not be used for mutation smoke.
- The synthetic user password is generated in memory and is never returned.
- Existing smoke-user sessions are revoked during rotation.
- The endpoint uses the deployed app's runtime `DATABASE_URL`; operators never need to expose that URL to Codex.
- If the endpoint returns `STAGING_SMOKE_SECRET_MISSING`, configure the secret in Render staging and redeploy/restart.
- If it returns `STAGING_SMOKE_FAILED`, inspect Render logs for sanitized errors only.
