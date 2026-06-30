# PGS Project Log

## 2026-06-30 - PR #43 ImportPanel/data-flow API SMOKE GO

Status: API SMOKE GO for PR #43 Authenticated ImportPanel E2E + ВОР-to-Intelligence Data Flow v1 + Admin Project Delete.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `3fc08932cc9f30289b80a42622d7f5b3092bcf11`
- GitHub `main`: `3fc08932cc9f30289b80a42622d7f5b3092bcf11`
- Render SHA: `3fc08932cc9f30289b80a42622d7f5b3092bcf11`
- Result: backend/data-flow online readiness is green; full browser proof is not claimed
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- storage: local, writable
- auth required: `true`
- AI configured: `true`

Validated:

- online/core smoke passed
- authenticated runtime/API smoke passed through the protected staging smoke endpoint
- runtime login passed
- `/api/auth/me` passed under smoke auth
- `project-demo` read passed
- `project-smoke` read passed
- synthetic ВОР preview passed
- deterministic explanation passed
- explicit import commit passed
- committed 3 synthetic records
- import history read passed
- data-flow passed through readiness, post-import actions, materials, procurement preview, procurement commit, procurement cleanup, schedule draft, cashflow draft, document checklist, and intelligence
- cleanup passed
- temporary import role was restored
- unauth `/api/auth/me`: 401
- unauth import preview: 401
- unauth project DELETE: 401
- unauth AI summary: 403
- `project-demo` page remained readable after cleanup
- `project-smoke` page remained readable after cleanup
- secrets printed: `false`

Runtime import smoke details:

- project: `project-smoke`
- preview: 2 budget items, 1 material, 0 warnings, 0 errors
- commit mode: `append`
- commit result: 3 created, 0 updated, 1 skipped, 0 errors, 0 warnings
- commit split: 2 budget items, 1 material, 0 schedule items
- cleanup: `pass`
- temporary permission scope: restored

Pipeline smoke details:

- readiness: `partial`, score `40`
- procurement preview items: `1`
- procurement created: `1`
- procurement cleanup: `pass`
- schedule preview items: `1`
- cashflow preview items: `1`

Not run / not touched:

- full browser upload interaction: not claimed
- full browser commit click: not claimed
- admin browser delete execution of a disposable project: not claimed
- live AI: not run
- real client files: not used
- `project-demo`: not mutated or deleted
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- manual deploy/redeploy: not triggered
- dirty checkout `/Users/ag/Documents/PGS`: untouched

Conclusion:

- PR #43 is green for backend/data-flow online readiness.
- Full browser proof remains an optional follow-up gate requiring approved `SMOKE_EMAIL` / `SMOKE_PASSWORD` or another safe authenticated admin browser session.

## 2026-06-29 - AI-Assisted ВОР Import v1 online CORE GO

Status: online CORE GO for AI-Assisted ВОР Import v1.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `d1783b1cebfd9cc4e1a29df09cc7cce9a1b17ce9`
- Result: AI-Assisted ВОР Import v1 is merged, deployed online, and validated at the core online gate
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 200

UI and DOM markers:

- Command Center present
- Project Intelligence Drill-down present
- ВОР / Finance Intelligence present
- import entry point present, button `Импорт ВОР`
- ImportPanel / ВОР import UI: blocked by unauth/browser interaction; not SSR-visible until tab/action hydration
- Preview UI: partially visible by static markers only; full interactive preview was not run
- sidebar shell present
- mobile drawer present
- project tabs present

Unauth guards:

- `/api/auth/me`: 401
- import preview POST with empty/no file request: 401
- import commit POST with empty fake import id: 401
- AI endpoint POST: 403
- pipeline readiness: 401

AI safety:

- AI auto-call on page load observed: no
- provider response observed in unauth smoke: no
- raw internal/provider errors exposed: no
- checked for `PrismaClient`, `DATABASE_URL`, `ZodError`, and `OPENAI_API_KEY` markers; not present

Not run / not touched:

- browser/viewport smoke: blocked by local browser tooling; HTTP/DOM/static smoke used
- full authenticated ImportPanel interaction: not run
- live AI: not run
- mutation smoke: not run
- upload/commit/import mutation: not run
- deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- old stale branch `codex/ai-assisted-vor-import-v1`: untouched
- dirty checkout `/Users/ag/Documents/PGS`: untouched

Decision:

- CORE GO

Next follow-up:

- full authenticated/browser ImportPanel interaction smoke when browser/auth tooling is available

## 2026-06-29 - Project Intelligence Drill-down v1 shipped online

Status: shipped baseline for Project Intelligence Drill-down v1.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `57dcabe512279ae8162f6b553616483e70822751`
- Result: Project Intelligence Drill-down v1 is merged, deployed online, and smoke-validated at the core online gate
- Git SHA source: `RENDER_GIT_COMMIT`

Validation summary:

- health: GO
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- `/dashboard`: GO
- `/projects`: GO
- `/projects/project-demo`: GO
- Command Center present on the project overview page
- Project Intelligence Drill-down present
- Documents Intelligence present
- Risk Intelligence present
- Schedule / График Intelligence present
- ВОР / Finance Intelligence present
- Procurement / Снабжение Intelligence present
- Reports / Executive Output present
- AI Recommendations Drill-down present
- sidebar shell present
- mobile menu markup present
- project tabs present
- unauth `/api/auth/me`: 401
- unauth AI endpoint: 403
- unauth pipeline readiness endpoint: 401

Release management:

- PR #39 Project Intelligence Drill-down v1 was squash-merged into `main`
- no Render env/secrets changes
- no DB/schema/migration changes
- no live AI call
- no authenticated smoke
- no mutation smoke
- no manual deploy action

Known follow-up:

- full real-browser desktop/mobile overflow smoke remains a small manual/browser-tooling follow-up
- this is not a code NO-GO because online health, deployed commit, core page responses, UI markers, and unauth guards were validated

Next product train:

- AI-Assisted ВОР Import v1
- focus: improve the working data intake layer that feeds budget, finance, schedule, procurement, risks, documents, and AI recommendations

## 2026-06-25 - Dashboard Command Center v1 shipped online

Status: shipped baseline for Dashboard / Project Overview Command Center v1.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `bb979068397328369d16d0b678e26c30558932ad`
- Result: Dashboard Command Center v1 is merged, deployed online, and smoke-validated
- Git SHA source: `RENDER_GIT_COMMIT`

Validation summary:

- health: GO
- `/dashboard`: GO
- `/projects`: GO
- `/projects/project-demo`: GO
- Command Center present on the project overview page
- AI summary and recommended apps UI present
- sidebar shell present
- desktop collapse and overlay behavior: GO
- mobile drawer open/close behavior: GO
- mobile overflow: GO, `scrollWidth=390`, `innerWidth=390`
- unauth `/api/auth/me`: 401
- unauth AI endpoint: 403
- unauth pipeline readiness endpoint: 401

Release management:

- PR #35 Dashboard Command Center v1 was squash-merged into `main`
- remote feature branch `codex/dashboard-command-center-v1` was deleted after merge
- GitHub Actions main CI run #75 completed successfully
- no Render env/secrets changes
- no DB/schema/migration changes
- no live AI call
- no mutation smoke
- no manual deploy action

Next product train:

- Project Intelligence Drill-down v1
- focus: drill-down working zones from the command center for documents, risks, schedule, budget/VOR, finance, procurement, executive reporting, and AI recommendations

## 2026-06-25 - AI Command Layer v1 production validation

Status: production promotion smoke train fully green for `main@877f94274312ae1a7e48db5b065d07ce75d29d36`.

- Production URL: https://pgs-frankfurt.onrender.com
- Validated commit: `877f94274312ae1a7e48db5b065d07ce75d29d36`
- Result: technical production blocker removed for AI Command Layer v1
- Git SHA source: `RENDER_GIT_COMMIT`

Validation summary:

- Step 1 deploy: done
- Step 2 production health: GO
- Step 3 production unauth guards: GO
- Step 4 production authenticated runtime smoke: GO
- Step 5 production live AI smoke: GO

Health:

- HTTP 200 / `ok`
- deployed commit matched the expected commit
- DB: `ok`
- migrations: `ok`, count `6`
- storage: local, writable
- auth required: `true`
- AI configured: `true`

Unauth guards:

- `/api/auth/me` returned 401 with `user: null`
- unauth existing-project AI scenario returned 403
- unauth missing-project AI scenario returned 403
- unauth pipeline protected endpoints returned 401
- internal smoke endpoint without secret returned 403
- no protected data returned
- no provider call observed for unauth AI requests

Authenticated runtime smoke:

- HTTP 200
- `ok: true`
- login: pass
- `/api/auth/me`: pass
- project-demo read: pass
- project-smoke read: pass
- unauth AI guard: pass
- authenticated missing-project AI guard: pass
- live AI skipped in Step 4
- `secretsPrinted: false`

Live AI smoke:

- HTTP 200
- `ok: true`
- authenticated runtime checks still passed
- live AI: pass
- provider response received
- response chars: `117`
- `secretsPrinted: false`
- secrets, cookies, tokens, and provider keys were not printed
- no raw provider/internal error leaked

Side effects and release management:

- no changes outside the official smoke endpoint
- official smoke user/session rotation only
- no direct DB edits
- no Render env/secrets changes
- no Prisma schema/migration changes
- no deploy/redeploy during the documentation step
- PR #35 Dashboard Command Center remains a separate feature train and stayed on HOLD during this validation

## 2026-06-24 - AI Command Layer v1 merged

Status: merged to `main`, CI-validated at PR level, awaiting staging deploy and smoke validation.

- PR: https://github.com/Grafnnn/PGS/pull/33
- Main commit: `27edc8433264b49f7ae8defb05dd1315411f12b6`
- Merge method: squash
- Validation: GitHub Actions CI #68 `validate` completed successfully

Included:

- bounded AI context builder expansion;
- structured OpenAI JSON path with Zod validation;
- safe degraded fallback for provider failure and invalid JSON;
- deterministic no-key behavior;
- scenario outputs for summary, budget/VOR, schedule, procurement, finance, risks, documents, daily reports, executive report, and draft text;
- UI result `subject` and recommended attachments;
- auth/access/provider/scenario tests.

Not included:

- Render env/secrets changes;
- staging deploy;
- live AI smoke;
- Prisma schema/migrations;
- auth model changes;
- pipeline/sidebar/health gate changes.

Branch hygiene:

- `codex/ai-command-layer-v1-refresh` was deleted after merge.
- stale `codex/ai-command-layer-v1` was deleted and must not be reused as a merge candidate.
