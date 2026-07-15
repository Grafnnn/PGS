# Portfolio Control Center v1

## Purpose

`/portfolio` is the organization-level control surface for comparing every project the current user may access. It uses existing project data and performs no writes, imports, AI calls, or provider requests during render.

## Scope

- contract value, forecast cost, profit and margin;
- planned payment exposure and paid incoming/outgoing amounts;
- schedule completion, overdue work and nearest milestone;
- active and critical risks, overdue actions and material deficits;
- manager workload across projects;
- portfolio cash-flow grouped by month;
- direct links from portfolio signals to the relevant project.

## Access model

- OWNER and ADMIN see projects in organizations where they have membership.
- MANAGER and VIEWER see only projects with explicit project membership.
- Unauthenticated users are redirected to `/login` before portfolio data is loaded.

## Honest status rules

- A project with fewer than two populated evidence groups is marked `Нет данных`.
- Missing source data never produces a green status.
- All scores are deterministic and derived from stored data; AI is not used.
- Portfolio v1 does not create actions or silently modify project state.

## Verification

- run unit/component tests, lint, TypeScript, Prisma validation/generation and production build;
- verify desktop and mobile layouts with a real browser;
- verify `/portfolio` redirects without authentication in production mode;
- after deployment, verify the expected Render SHA and read-only page/asset markers.
