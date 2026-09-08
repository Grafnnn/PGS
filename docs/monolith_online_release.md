# Monolith online release

Prepared 2026-09-09 for the existing PGS Frankfurt service at https://pgs-frankfurt.onrender.com.

## Release scope

The approved Rhythm identity, compact project navigation, Monolith dashboard and working styles cover all 26 project sections, portfolio, projects, inbox, administration and standalone forms. The protected R06 viewer retains access checks and gains the approved embedded presentation. No schema, dependency or hosting configuration changes.

Built from main `44d4ca38174eec40b228817fd3aad3c631ab73c9` in an isolated release worktree. Includes 34 source/test files and six referenced brand/photographic assets. Exploration galleries, draft PNGs, screenshots and local environment files are excluded.

## Pre-release validation

- Production Next.js build completed successfully with production auth settings and non-secret local build placeholders.
- Full Vitest suite: 256 files, 1061 tests passed.
- Full lint: no warnings or errors.
- Desktop/mobile visual review: 1280, 390 and 320 px; protected navigation, forms and table views reviewed.
- Render service: `srv-d8rr88mgvqtc73feds1g`, existing GitHub main auto-deploy, Docker, Frankfurt.
- Existing live health: HTTP 200, database/storage/migrations healthy, auth required, 38 applied migrations, SHA matching the base.
- Existing APP_ENV is staging; no SEED_DEMO_PROJECT override is set. Existing Docker startup settings are preserved. No manual seed, migration, data mutation smoke, or environment changes are part of this release.

## Post-release verification

Verify Render Live and `/api/health.version.gitSha` against the release commit, then inspect authenticated dashboard, project navigation, working modules and the 3D viewer. The previous successful deployment is `dep-dafjm615efls73av7h90` at the base SHA for provider rollback if needed.

R06 themed delivery decompresses and recompresses the protected model, so verify actual initial load on the existing free instance. No model data is published under public/.
