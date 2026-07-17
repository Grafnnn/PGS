# PGS Project Log

## 2026-07-17 - Change Order Management v2 deploy GO

Status: Change Order Management v2 is shipped on Render after PR #127. Projects now have a persistent commercial change register with VOR-linked cost lines, evidence snapshots, explicit lifecycle decisions and optional Workflow Designer approval runs.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `c30d042b5f87282168442ef8ddd259ffb66ab9cf`
- Render deploy: `dep-d9ckq0beo5us73avstb0`
- PR: #127
- Decision: DEPLOY GO / HTTP CORE FOLLOW-UP
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- persistent project `CHG-###` register for potential, request, owner, subcontract and directive changes;
- commercial scope classification, source references, counterparty, schedule impact, due date and exact document/version evidence snapshot;
- VOR-linked cost lines with estimated, proposed, submitted, approved and committed values;
- explicit draft, open, submitted, revision, approved, executed, rejected and void lifecycle;
- optional approval workflow snapshot with protection against bypassing active workflow decisions;
- transactional audit history, optimistic duplicate-action protection and project cascade cleanup;
- responsive Change Order workspace integrated into the Budget/VOR area.

Online verification:

- Render marked deploy `dep-d9ckq0beo5us73avstb0` live on the exact expected commit;
- migration `20260716090000_change_order_management_v2` applied successfully;
- Prisma reported 15 migrations and `All migrations have been successfully applied`;
- the Next.js service started successfully and Render reported the primary URL live;
- external `/api/health` and unauthenticated route checks were blocked in this verification environment by the public Render/client transport, so HTTP CORE GO is not claimed.

Validation and safety:

- GitHub Actions CI #259 passed;
- Vitest: 408/408 passed; ESLint, TypeScript, Prisma validate/generate, production build and `git diff --check` passed;
- local desktop and 390 px mobile browser checks passed, including candidate-to-form interaction, one mobile drawer, no horizontal page overflow and no client errors;
- no authenticated online change-order mutation, live AI, project/import/delete/upload mutation or external connector call was run;
- no Render env/secrets, auth/session model, health/provider or deploy configuration changes were made;
- no secrets were printed.

Remaining controlled follow-up:

- retry public `/api/health` and unauthenticated Change Order API guard checks when the external Render route is reachable;
- authenticated disposable lifecycle smoke covering create, submit, workflow decision, approve/execute and cleanup remains optional.

## 2026-07-15 - Workflow Designer & Approval Matrix v1 online/core GO

Status: Workflow Designer & Approval Matrix v1 is shipped on Render after PR #125. Projects now have configurable serial approval processes with role-aware decisions, deadlines, revisions, rejection, cancellation and a durable audit trail.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `e8f500b7481df461d7ac86a3f0554833d4ae5fd0`
- Render deploy: `dep-d9br24urnols73cd0bdg`
- PR: #125
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- project-scoped workflow templates with ordered work, review and approval steps, assignee roles and due-day rules;
- explicit workflow launch with immutable step snapshots, source-module references and target-workspace navigation;
- ball-in-court routing for MANAGER, ADMIN and OWNER, with controlled approve, revision, reject and cancel transitions;
- transactional audit records, history-safe template deactivation and protection against duplicate concurrent decisions;
- responsive `Процессы` workspace with contract, КС billing and major-procurement presets;
- project cascade cleanup and referential integrity across four new workflow tables.

Online verification:

- `/api/health`: HTTP 200 / `ok`; DB: `ok`; migrations: `ok`, count `14`;
- deployed SHA matched the expected main commit and Render marked deploy `dep-d9br24urnols73cd0bdg` live;
- migration `20260715190000_workflow_designer_approval_matrix_v1` applied successfully;
- unauthenticated protected pages redirect to `/login`;
- unauthenticated workflow template list/create, workflow run list/create and workflow action routes return 403.

Validation and safety:

- GitHub Actions CI #255 passed;
- Vitest: 397/397 passed; ESLint, TypeScript, Prisma validate/generate, production build and `git diff --check` passed;
- local desktop and 390 px mobile browser checks passed with zero horizontal overflow, one mobile navigation drawer and no client errors;
- no authenticated online workflow mutation, live AI, project/import/delete/upload mutation or external connector call was run;
- no Render env/secrets, auth/session model, health/provider or deploy configuration changes were made;
- no secrets were printed.

Remaining controlled follow-up:

- authenticated disposable workflow smoke covering template create, launch, approve, revision, reject/cancel and cleanup remains optional. It is not required for this core gate.

## 2026-07-15 - Portfolio Control Center v1 online/core GO

Status: Portfolio Control Center v1 is shipped on Render after PR #123. Authorized users now have one read-only management view across their available projects with comparable financial, schedule, procurement, risk and workload signals.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `873f2dd412728f7e3eabee42bd276f60cc82d4a3`
- Render deploy: `dep-d9bqa9ernols73cc60r0`
- PR: #123
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- portfolio KPIs for contract value, forecast cost and profit, margin, progress, cash exposure, risks, overdue actions, delayed works and material deficits;
- deterministic project health, attention queue, 12-month cashflow horizon and manager workload without AI or render-time mutations;
- project filtering and sorting with direct drill-down to existing workspaces;
- honest `no_data` state when evidence is incomplete instead of a false green status;
- organization-membership scope for OWNER/ADMIN and explicit project-membership scope for MANAGER/VIEWER;
- responsive Portfolio navigation and dashboard entry points using the existing PGS Studio design system.

Online verification:

- `/api/health`: HTTP 200 / `ok`; DB: `ok`; migrations: `ok`, count `13`;
- deployed SHA matched the expected main commit through `RENDER_GIT_COMMIT`;
- unauthenticated `/portfolio`, `/dashboard` and `/projects` redirect to `/login`;
- unauthenticated `/api/auth/me`: 401;
- `/login`: HTTP 200.

Validation and safety:

- GitHub Actions CI #251 passed;
- Vitest: 384/384 passed; ESLint, TypeScript, Prisma validate/generate, production build and `git diff --check` passed;
- local desktop and 390 px mobile browser checks passed, including the navigation drawer, filter interaction and zero horizontal overflow;
- no schema/migration, env/secret, auth/session, health/provider or deploy configuration changes were made;
- no live AI, online mutation, upload, project creation/deletion or external connector call was run;
- no secrets were printed.

Remaining controlled follow-up:

- authenticated portfolio smoke with multiple real staging project memberships remains optional. It is not required for this read-only core gate.

## 2026-07-15 - ERP & Accounting Bridge v1 online/core GO

Status: ERP & Accounting Bridge v1 is shipped on Render after PR #121. Projects now have a guarded exchange workspace for accounting exports, dry-run reconciliation and explicit application of safe matches with persistent history.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `2aa66c73e58ac609ab46241245ed41a776b339d3`
- Render deploy: `dep-d9bpb3u7r5hc73el0o30`
- PR: #121
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- versioned JSON export for project, contract, procurement commitments, receivables, payables and totals;
- XLSX, XLS, CSV and JSON reconciliation preview with Russian and English headers, a 5 MB limit and RUB-only validation;
- deterministic matching by external ID, direction, amount, date, counterparty and purpose;
- ambiguous, conflicting and unmatched rows remain exceptions and are not silently applied;
- explicit confirmed apply for safe matches only, with transaction, audit history and repeat-apply protection;
- persistent sync runs and external links with project cascade cleanup;
- responsive `ERP / Учёт` workspace and compact Finance entry without render-time mutations or provider calls.

Online verification:

- `/api/health`: HTTP 200 / `ok`; DB: `ok`; migrations: `ok`, count `13`;
- deployed SHA matched the expected main commit and Render marked deploy `dep-d9bpb3u7r5hc73el0o30` live;
- migration `20260715173000_erp_accounting_bridge_v1` applied successfully;
- unauthenticated `/dashboard`, `/projects` and project pages redirect to `/login`;
- unauthenticated `/api/auth/me`: 401;
- unauthenticated accounting bridge state, export, preview and apply routes: 403;
- deployed stylesheet contains the complete accounting bridge workspace, grid, metrics, sections and responsive rules.

Validation and safety:

- GitHub Actions CI #247 passed;
- Vitest: 376/376 passed; ESLint, TypeScript, Prisma validate/generate, production build and `git diff --check` passed;
- local desktop 1280px and mobile 390px browser checks passed without horizontal overflow or console errors;
- no real accounting import, export journal, reconciliation apply, live AI or project/import/delete/upload mutation was run online;
- no Render env/secrets, auth/session model or provider/deploy configuration changes were made;
- no secrets were printed.

Remaining controlled follow-up:

- authenticated disposable accounting reconciliation smoke with a synthetic file and explicit cleanup remains optional. It is not claimed by this core gate.

## 2026-07-15 - Document Transmittals & Approval v1 online/core GO

Status: Document Transmittals & Approval v1 is shipped on Render after PR #117. The Documents workspace now supports formal numbered issue packages with exact file-version snapshots, controlled review decisions and a complete audit trail.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `1de177528e1278bcb2cde0fe57642fb06ba86853`
- Render deploy: `dep-d9bmpifaqgkc73fh1bn0`
- PR: #117
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- sequential `TR-###` document packages with draft, issue, acknowledgement, approval/revision, reissue and close states;
- exact current document-version snapshots on issue and reissue, with version downloads and a TXT issue manifest;
- recipient, copy list, reviewer, decision due date, package purpose and formal decision comments;
- immutable workflow events and transactional project audit records for create, update, transitions and draft deletion;
- draft/revision-only editing, draft-only deletion and complete-package validation before issue;
- overdue indicators, filters and explicit escalation to the existing Action Center;
- compact responsive workspace in the project Documents tab with no render-time mutations or AI/provider calls.

Online verification:

- `/api/health`: HTTP 200 / `ok`; DB: `ok`; migrations: `ok`, count `11`;
- deployed SHA matched the expected main commit and Render marked the deploy `live`;
- unauthenticated `/dashboard` and `/projects` redirect to login;
- unauthenticated `/api/auth/me`: 401;
- unauthenticated transmittal collection and manifest routes: 403.

Validation and safety:

- GitHub Actions CI #239 passed;
- Vitest: 350/350 passed; ESLint, TypeScript, Prisma validate/generate, production build and `git diff --check` passed;
- local desktop DOM smoke confirmed the form opens and the page has no horizontal overflow;
- no authenticated online transmittal mutation, live AI, project/import/delete/upload mutation or real client file was used;
- no Render env/secrets, auth/session model or provider/deploy configuration changes were made;
- the additive database migration was applied successfully; no secrets were printed.

Remaining controlled follow-up:

- authenticated disposable workflow smoke for draft creation, issue, acknowledgement, approve/revise, reissue, manifest and close remains optional. It is not claimed by this core gate.

## 2026-07-14 - RFI & Submittals v1 online/core GO

Status: RFI & Submittals v1 is shipped on Render after PR #112. Projects now have formal, numbered registers for information requests and document/material submissions with controlled decisions and complete audit history.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `4e6f57f83d90cea16cd4d489d042d67c8aa6396f`
- Render deploy: `dep-d9b9scmrnols73e836gg`
- PR: #112
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- sequential `RFI-###` and `SUB-###` registers with draft-only editing and deletion;
- guarded RFI lifecycle: draft, open, answered, closed and controlled reopen;
- guarded submittal lifecycle: draft, submitted, approved/rejected/revise-required, resubmission revision and closed;
- required assignee/reviewer and due date before formal send/submit;
- persisted response/review history and transactional audit entries for every mutation;
- exact linked document-version snapshots with download of the submitted file version;
- overdue indicators, filters and explicit Action Center escalation without silent writes;
- responsive project workspace for desktop and mobile.

Online verification:

- `/api/health`: HTTP 200 / `ok`; DB: `ok`; migrations: `ok`, count `9`;
- deployed SHA matched the expected main commit and Render marked the deploy `live`;
- unauthenticated `/dashboard`, `/projects` and `/projects/project-smoke` redirect to `/login`;
- unauthenticated `/api/auth/me`: 401;
- unauthenticated RFI and submittal collection APIs: 403.

Validation and safety:

- GitHub Actions CI #229 passed;
- Vitest: 338/338 passed; ESLint, TypeScript, Prisma validate/generate, production build and `git diff --check` passed;
- desktop 1440px and mobile 390px browser checks passed without horizontal overflow or page errors;
- no authenticated online RFI/submittal mutation, live AI, project/import/delete/upload mutation or real client file was used;
- no Render env/secrets, auth/session model or provider/deploy configuration changes were made;
- the additive database migration was applied successfully; no secrets were printed.

Remaining controlled follow-up:

- authenticated disposable workflow smoke for RFI create/send/answer/close and submittal create/submit/review/resubmit/close remains optional. It is not claimed by this core gate.

## 2026-07-14 - Reports Workflow v2 online/core GO

Status: Reports Workflow v2 is shipped on Render after PR #110. Daily reports now follow an audited workflow, and executive weekly reports are persisted as immutable, versioned records with controlled publication and TXT export.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `63499a30c0f89c2069a442ca34e75d5d36de8d85`
- PR: #110
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- explicit daily-report draft creation, editing and draft-only deletion;
- role-aware transitions: draft, submitted, checked and approved;
- transactional audit entries for daily-report and executive-report mutations;
- persisted Executive Weekly Report versions with source-count snapshots;
- controlled draft, published and archived lifecycle; published versions are immutable;
- explicit confirmation before publishing reports with blocked or missing source data;
- TXT export, version history, copy action and click-triggered AI polish result;
- server-side authentication and project access checks before dashboard/project data loading;
- responsive reports workspace without desktop or mobile horizontal overflow.

Online verification:

- `/api/health`: HTTP 200 / `ok`; DB: `ok`; migrations: `ok`, count `8`;
- deployed SHA matched the expected main commit;
- unauthenticated `/dashboard`, `/projects` and the project Reports workspace redirect to `/login` before project data is loaded;
- unauthenticated `/api/auth/me`: 401;
- unauthenticated executive-report list and TXT export: 403;
- unauthenticated daily-report API: 403.

Validation and safety:

- Prisma validate/generate, TypeScript, ESLint and production build passed;
- Vitest: 322/322 passed;
- desktop 1440px and mobile 390px checks passed without horizontal overflow or browser errors;
- no live AI, authenticated online report mutation, project/import/delete/upload mutation or real client file was used;
- no Render env/secrets, auth/session model or provider/deploy configuration changes were made;
- the additive database migration was applied successfully; no secrets were printed.

Remaining controlled follow-up:

- authenticated disposable report smoke for daily report create/submit/check/approve and executive report generate/publish/export/archive remains optional. It requires a safe authenticated operator or staging-smoke path and is not claimed by this core gate.

## 2026-07-14 - Project Action Center v1 online/core GO

Status: Project Action Center v1 is shipped on Render after PR #107 and the browser-found auth-message fix in PR #108. PGS now has a persistent cross-module workflow register instead of only read-only recommendations.

- Online URL: https://pgs-frankfurt.onrender.com
- Online feature commit: `3b52691a43d5cce671f07795653eceebcaedea0f`
- Online final commit: `0e1e9446a74f07f0c61b36b6551e13e8433c64da`
- PRs: #107, #108
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Implemented:

- persistent actions with source module, target workspace, priority, responsible person/role and due date;
- workflow states: open, in progress, waiting approval, blocked and done;
- mandatory OWNER/ADMIN approval when configured, with approval reset after reopening;
- transactional audit entries for create, update, approval and delete;
- explicit preparation of deterministic pipeline recommendations; no silent write from analytics or AI;
- viewer read-only UI, responsive layout and project cascade cleanup;
- product gap audit and prioritized roadmap in `docs/product_gap_audit_2026_07.md`.

Online verification:

- `/api/health`: 200 / `ok`; DB: `ok`; migrations: `ok`, count `7`;
- `/dashboard`: 200; `/projects`: 200; `/projects/project-smoke`: 200; `/projects/project-demo`: 404;
- unauthenticated `/api/projects/project-smoke/actions`: 403;
- Action Center and `Действия` markers are present;
- desktop 1440px and mobile 390px: no horizontal overflow, no page errors;
- raw `Forbidden` text was found during browser smoke, fixed in PR #108, and replaced online with a clear login-required message.

Validation and safety:

- Vitest: 295/295 passed before merge; focused regression tests, ESLint, TypeScript, Prisma generate/validate, production build and `git diff --check` passed;
- no live AI, online action mutation, project/import/delete/upload mutation or real client file was used;
- no Render env/secrets or auth/session model changes were made by the Action Center train;
- the additive database migration was applied successfully; no secrets were printed.

Remaining controlled follow-up:

- authenticated disposable browser path for workbook upload → exception resolution → project creation → populated module checks → project deletion remains blocked by the staging smoke secret not matching the rotated operator value. It is not claimed as completed by this entry.

## 2026-07-14 - Workbook Import Exception Resolution v1 online/core GO

Status: Workbook Import Exception Resolution v1 reached ONLINE/CORE GO on Render after PR #104. Workbook warnings now produce a deterministic resolution plan with required source corrections, individual user decisions, blockers, informational notes, progress, and a final create/no-create decision.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `86fdf7c262d138fd7a635c882fc95f238c574cb9`
- Render deploy: `dep-d9amqm5ckfvc73bpos0g`
- PR: #104
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health and pages:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Deployed UI and behavior:

- `Import exception resolution`, `Финальный план решений`, `нужно исправить`, `нужно решение`, and `Проверено, решение принимаю в план импорта` are present in the deployed projects bundle.
- The old global acknowledgement was replaced with individual decisions for each current warning.
- Uncertain sheet mapping requires a real role/exclusion change and recalculation; it cannot be bypassed by acknowledgement.
- Saved formula values, financial reconciliation gaps, and automatic duplicate handling can be accepted only as separate explicit decisions.
- Mapping changes and reanalysis reset stale decisions. Project creation remains blocked until the current resolution plan is ready.
- The provided example workbook was analyzed locally only: initial score 76/100, four review sheets represented one required source correction, and two acknowledgement decisions remained. After assigning those sheet roles, reanalyzing, and confirming the two current decisions, the plan reached ready/100%. The workbook was not uploaded online.

Unauthenticated guards:

- `/api/auth/me`: 401
- workbook analysis: 403
- project creation: 403
- project import preview: 401
- AI summary: 403

Validation and safety:

- Vitest: 276/276 passed; ESLint, TypeScript, Prisma generate/validate, Next production build, and `git diff --check` passed.
- Desktop 1280px and mobile 390px passed without horizontal overflow; mobile drawer opened and closed with one sidebar; browser console errors: none.
- no real online workbook upload, project creation, import commit, project deletion, or live AI call was run.
- no Render env/secrets, DB schema, migrations, auth/session model, API permissions, or deploy configuration were changed.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated disposable browser smoke: upload a synthetic workbook, resolve mapping exceptions, confirm current decisions, create the project, verify populated modules, and delete the project. Full browser file-picker interaction is not claimed by this core gate.

## 2026-07-14 - Workbook Import Quality Gate v1 online/core GO

Status: Workbook Import Quality Gate v1 reached ONLINE/CORE GO on Render after PR #102. Project creation now evaluates workbook readiness, blocks critical import failures, and requires explicit acknowledgement when data can be imported only with review.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `cfe2d717766c15519e343180c19ed91e797750c3`
- Render deploy: `dep-d9ameqd7vvec73etvogg`
- PR: #102
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health and pages:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Deployed UI and behavior:

- `Workbook import quality gate`, `Проверка качества перед созданием проекта`, `Quality score`, and `Я проверил предупреждения` are present in the deployed projects bundle.
- The deterministic gate classifies an import as `ready`, `review_required`, or `blocked` and shows recognized records, mapping review, formulas, hidden rows, cost reconciliation, module coverage, and actionable issues.
- Parser failures and workbooks without usable budget/work cost data block creation. Mapping uncertainty, duplicates, formulas, and financial reconciliation gaps require explicit user acknowledgement.
- Preview remains read-only, mapping recalculation remains explicit, and project creation remains a separate user action.
- The provided example workbook was analyzed locally only: 44 sheets, 1,115 recognized records, score 76/100, `review_required`, with four mapping-review sheets, a 15.3% reconciliation gap, and 682 formula cells. It was not uploaded online.

Unauthenticated guards:

- `/api/auth/me`: 401
- workbook analysis: 403
- project creation: 403
- project import preview: 401
- AI summary: 403

Validation and safety:

- Vitest: 272/272 passed; ESLint, TypeScript, Prisma generate/validate, Next production build, and `git diff --check` passed.
- Desktop 1280px and mobile 390px layouts passed without horizontal overflow.
- no real online workbook upload, project creation, import commit, project deletion, or live AI call was run.
- no Render env/secrets, DB schema, migrations, auth/session model, or deploy configuration were changed.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated disposable browser smoke: upload a synthetic workbook, review quality issues, acknowledge warnings, create the project, verify populated modules, and delete the project. Full browser file-picker interaction is not claimed by this core gate.

## 2026-07-14 - Workbook Import Review & Mapping v1 online/core GO

Status: Workbook Import Review & Mapping v1 reached ONLINE/CORE GO on Render after PR #100. Project onboarding now exposes every workbook sheet for review before creation, with the detected role, confidence, row counts, inclusion state, and an explicit recalculation step for manual decisions.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `53f98c02ec74df3c1e4bf9615a24fb0507310994`
- Render deploy: `dep-d9am03l7vvec73etka5g`
- PR: #100
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health and pages:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Deployed UI and behavior:

- `Import review & mapping`, `Проверьте карту листов`, `Фильтр карты листов`, and `Пересчитать карту` are present in the deployed projects bundle.
- Users can include or exclude sheets, change a detected role, filter the mapping, and explicitly recalculate the workbook analysis before project creation.
- A changed mapping blocks project creation until recalculation, and the confirmed mapping is passed to the protected import preview used by the explicit commit flow.
- Disabled sheets do not affect VAT, contract suggestions, direct-cost reconciliation, or module totals.
- Manual working roles with no recognized rows produce a warning rather than fabricated data.
- The provided example workbook was analyzed locally only and was not uploaded online.

Unauthenticated guards:

- `/api/auth/me`: 401
- workbook analysis: 403
- project creation: 403
- project import preview: 401

Not run / not touched:

- no real online project creation, workbook upload, import commit, or project deletion was run.
- no live AI call was run.
- no manual deploy/redeploy was triggered; Render auto-deploy was used.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated disposable browser smoke: upload a synthetic workbook, review and override its sheet mapping, recalculate, create the project, verify populated modules, and delete the project.

## 2026-07-14 - Universal Project Workbook Import v1 online/core GO

Status: Universal Project Workbook Import v1 reached ONLINE/CORE GO on Render after PR #98. During project creation, a user can provide one Excel workbook and PGS can classify detailed works/VOR, materials, schedule, equipment, payroll/FOT, summary, reference, and control sheets before an explicit project creation and import commit.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `098cc2b42b5d1666ce33a2e099228c0c5ee6b215`
- PR: #98
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health and pages:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Deployed UI and behavior:

- `Project Creation & Onboarding`, `Единый Excel проекта`, `.xlsx` file input, ВОР, materials, schedule, FOT, and equipment distribution markers are present.
- Summary/reference/control sheets are used for reconciliation rather than duplicate import.
- The UI exposes automatic coverage and the remaining reconciliation gap instead of inventing missing detail.
- The source workbook is intended to be stored in Documents after explicit project creation.
- Desktop page width is stable, the sidebar is not duplicated, and no browser console errors were observed.

Unauthenticated guards:

- `/api/auth/me`: 401
- workbook analysis: 403
- project creation: 403
- project import preview: 401

Not run / not touched:

- no real online project creation, workbook import commit, document upload, or project deletion was run.
- no live AI call was run.
- no manual deploy/redeploy was triggered; Render auto-deploy was used.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining follow-up:

- authenticated disposable create -> analyze workbook -> commit import -> verify populated modules and source document -> delete project smoke using a synthetic workbook or separately approved copy of the example workbook.

## 2026-07-13 - Claims & Notices v1 online/core GO

Status: Claims & Notices v1 reached ONLINE/CORE GO on Render after PR #96. The train adds a read-only register of notice and claim candidates from changes, schedule, risks, documents, and the project checklist. It does not send notifications, create claims, letters, supplemental agreements, or legal obligations.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `7a2870ed8a56e3c9e5499ba7b3490e642f373b53`
- PR: #96
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- storage: local and writable

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Claims & Notices`: present in the deployed project page bundle.
- `Уведомления, претензии и договорные сроки`: present in the deployed project page bundle.
- `Notice register`, `Draft guidance`, and `Preparation actions`: present in the deployed project page bundle.
- `notices`: present in the deployed Command Center bundle.

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no notice, claim, email, external correspondence, or online mutation smoke was run.
- no manual deploy/redeploy was triggered; Render auto-deploy was used.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke using disposable evidence and a review-only notice draft; any real external correspondence remains a separately approved operator action.

## 2026-07-13 - Change Orders & Variations v1 online/core GO

Status: Change Orders & Variations v1 reached ONLINE/CORE GO on Render after PR #94. The train adds a read-only register of candidates for scope, price, schedule, material, and contract-risk changes; it does not create change orders, supplemental agreements, budget rows, KS, or cashflow entries.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `1842079487285cf53d48dbdb4d460bcfe839351d`
- PR: #94
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- storage: local and writable

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Change Orders & Variations`: present in the deployed project page bundle.
- `Допработы, изменения ВОР и влияние на проект`: present in the deployed project page bundle.
- `Variation register`, `Impact signals`, and `Approval actions`: present in the deployed project page bundle.
- `changeOrders`: present in the deployed Command Center bundle.

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered; Render auto-deploy was used.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke using a disposable change candidate and a separately approved workflow for formal customer notification or supplemental agreement preparation.

## 2026-07-13 - Cost-to-Complete & Margin Forecast v1 online/core GO

Status: Cost-to-Complete & Margin Forecast v1 reached ONLINE/CORE GO on Render after PR #92. The full authenticated browser interaction with factual cost updates was not run for this read-only intelligence train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `692eff59d31371e709b93e0e3d218c84636b7fa3`
- PR: #92
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- storage: local and writable

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Cost-to-Complete & Margin Forecast`: present in the deployed project page bundle.
- `Прогноз затрат до завершения и маржи`: present in the deployed project page bundle.
- `Forecast cost`, `До завершения`, `Forecast margin`, and `Margin protection actions`: present in the deployed project page bundle.
- `costToComplete`: present in the deployed Command Center bundle.

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered; Render auto-deploy was used.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke using disposable factual costs and payments, with cleanup through the approved safe path.

## 2026-07-13 - Resources & Equipment Intelligence v1 online/core GO

Status: Resources & Equipment Intelligence v1 reached ONLINE/CORE GO on Render after PR #90. Full authenticated browser interaction with resource daily reports or equipment downtime evidence was not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `cd938c734c788a8f88c6bd929de41dcbff9e62da`
- PR: #90
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- storage: local and writable

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Resources & Equipment Intelligence`: present in the deployed project page bundle.
- `Люди / Техника / Простои`: present in the deployed project page bundle.
- `Equipment register`, `Resource signals`, and `Recovery actions`: present in the deployed project page bundle.
- `resources-equipment-workspace`: present in the deployed project page bundle.

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke for resource daily-report updates and equipment downtime evidence through the approved disposable-data path.

## 2026-07-13 - HSE / Safety & Permit Compliance v1 online/core GO

Status: HSE / Safety & Permit Compliance v1 reached ONLINE/CORE GO on Render after PR #88. Full authenticated browser interaction with disposable permits or safety evidence was not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `58b8f1962d1ecb7d0bde36fd12ee1696c7a54c52`
- PR: #88
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- storage: local and writable

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `HSE / Safety & Permit Compliance`: present in the deployed project page bundle.
- `ОТиПБ / Допуски`: present in the deployed project page bundle.
- `HSE signal register`, `Safety actions`, and `HSE handoff`: present in the deployed project page bundle.
- `hse-safety-workspace`: present in the deployed project page bundle.

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke for HSE signals, permits, and safety actions using disposable evidence, then cleaning it up through the approved safe path.

## 2026-07-13 - Quality / Issues & Punch List v1 online/core GO

Status: Quality / Issues & Punch List v1 reached ONLINE/CORE GO on Render after PR #86. Full authenticated browser interaction and real NCR/remark workflow smoke were not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `beae828cb743e2053a31391fe0037aad4203bfd2`
- PR: #86
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- storage: local and writable

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Quality / Issues & Punch List`: present in the deployed project page bundle.
- `Качество / Замечания`: present in the deployed project page bundle.
- `Issue register`, `Punch actions`, and `Quality handoff`: present in the deployed project page bundle.
- `quality-issues-workspace`: present in the deployed project page bundle.

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke for reviewing project issues and punch actions with disposable evidence, then cleaning it up through the approved safe path.

## 2026-07-10 - Photo & Evidence Capture v1 online/core GO

Status: Photo & Evidence Capture v1 reached ONLINE/CORE GO on Render after PR #84. Full authenticated upload/evidence-linking/browser smoke was not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `7054b4fc1d7f4e699cc782000c56d70e4496b4df`
- PR: #84
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- first health attempts hit Render warm-up behavior: timeout / 502.
- subsequent `/api/health` retries returned HTTP 200 / `ok`.
- deployed SHA matched the expected feature commit.
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Photo Evidence / Исполнительное подтверждение`: present in the Project Intelligence SSR/DOM.
- `Фото / evidence`: present in the Command Center SSR/DOM.
- `Photo & Evidence Capture`: present in the deployed project page bundle.
- `Фотофиксация / Evidence`: present in the deployed project page bundle.
- `Evidence register`: present in the deployed project page bundle.
- `Evidence actions`: present in the deployed project page bundle.
- `Evidence handoff`: present in the deployed project page bundle.
- `photo-evidence-workspace`, `photo-evidence-card`, and `photo-evidence-grid`: present in deployed CSS.

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no real evidence/photo upload was run.
- no OCR or Computer Vision flow was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke for uploading a disposable photo/evidence document, verifying it appears in the Documents tab and evidence workspace, then cleaning it up through the approved safe path.

## 2026-07-10 - Field Operations & Daily Reports v1 online/core GO

Status: Field Operations & Daily Reports v1 reached ONLINE/CORE GO on Render after PR #82. Full authenticated browser tab smoke was not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `a0ed0f75f9dd7e49bf1745eb3c1978877abb2156`
- PR: #82
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Field Operations & Daily Reports`: present
- `Площадка / Рапорты`: present
- `Daily report snapshots`: present
- `Field signals`: present
- `Weekly field handoff`: present
- `field-operations`: present
- `field-ops-workspace`: present in deployed CSS/bundle
- `Площадка / рапорты`: present in Command Center markers

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no real photo/upload/OCR flow was run.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser tab smoke for the `Рапорты` / field operations workspace when safe auth/browser tooling is available.

## 2026-07-09 - Subcontractor & Execution Control v1 online/core GO

Status: Subcontractor & Execution Control v1 reached ONLINE/CORE GO on Render after PR #80. Full authenticated browser tab smoke was not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `fc6f03c278b21a03b043594cf4ba0c33ae3bf93f`
- PR: #80
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `Исполнение`: present
- `Подрядчики / Исполнение`: present
- `Subcontractor & Execution Control`: present
- `Contractors & owners`: present
- `Execution fronts`: present
- `Action register`: present
- `Execution handoff`: present
- `Subcontractor / Execution Control`: present
- `execution-control`: present in deployed bundle/CSS

Unauthenticated guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401

Not run / not touched:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser tab smoke for the `Исполнение` workspace when safe auth/browser tooling is available.

## 2026-07-09 - Commercial Proposal browser tab/copy smoke GO

Status: the remaining browser interaction follow-up for Commercial Proposal & Tender Submission Builder v1 reached BROWSER TAB/COPY GO on Render. This was a public/read-only browser smoke on `project-smoke`; authenticated session was not used and is not claimed.

- Online URL: https://pgs-frankfurt.onrender.com
- Runtime app commit: `3915aa609b4692f6ca51eaad733151e784c4fc26`
- Docs baseline before this record: `59c37a8a14a2124d8ae00ad51b3a079586ed36d3`
- Decision: BROWSER TAB/COPY GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Browser smoke:

- `/projects/project-smoke`: 200 on desktop and mobile
- desktop viewport: 1440 x 1000
- mobile viewport: 390 x 844
- `КП / Подача` tab: visible and clickable on desktop and mobile
- `Commercial Proposal & Tender Submission`: visible after tab click
- `Customer-facing proposal draft`: visible
- `Internal approval memo`: visible
- `Tender submission checklist`: visible
- `Price structure`: visible
- `Work/material split`: visible
- copyable proposal blocks: 2 `<pre>` blocks visible
- text selection/copy affordance: selection present on both desktop and mobile smoke
- horizontal overflow: none on desktop or mobile
- page errors: none observed

Expected guard noise:

- unauthenticated background API requests returned 401/403 in the browser console; this matches the protected API surface and was not treated as a UI failure.

Not run / not touched:

- authenticated login/session was not used.
- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke for the same `КП / Подача` flow if a safe browser auth session is explicitly required later.

## 2026-07-09 - Commercial Proposal & Tender Submission Builder v1 online/core GO

Status: Commercial Proposal & Tender Submission Builder v1 reached ONLINE/CORE GO on Render after PR #77. Full authenticated browser click/copy smoke was not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `3915aa609b4692f6ca51eaad733151e784c4fc26`
- PR: #77
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`
- storage: local writable

Pages and markers:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- `КП / Подача`: present in the deployed project workspace HTML
- `Commercial Proposal`: present in the deployed project workspace HTML
- `Project command center`: present
- `Project Intelligence`: present
- deployed bundle markers present: `Commercial Proposal & Tender Submission`, `Customer-facing proposal draft`, `Internal approval memo`, `Tender submission checklist`, `Price structure`, `Work/material split`

Guards:

- unauth `/api/auth/me`: 401
- unauth AI summary: 403
- unauth data-readiness: 401
- unauth intelligence: 401
- schedule/cashflow draft GET returned 405 and was treated as a read-only method mismatch, not a core failure.

Safety:

- no live AI call was run.
- no online mutation/import/delete/upload smoke was run.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- browser click smoke was not run because browser tooling was unavailable; HTTP/DOM/bundle smoke was used.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke for the `КП / Подача` tab, including tab click, generated text visibility, and copy/export behavior when safe browser tooling and an authenticated session are available.

## 2026-07-09 - Contract-assisted Project Creation v1 online/core GO

Status: Contract-assisted Project Creation v1 reached ONLINE/CORE GO on Render after PR #75. Full authenticated create/upload/delete smoke was not run for this train.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `891ea4bf88dbbfc3697cb21e6f2fbe09a9bf8c66`
- PR: #75
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages and markers:

- `/projects`: 200
- `/dashboard`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200
- contract upload marker: present
- `TXT/Markdown preview без AI`: present
- PDF/DOCX document-only limitation: present
- contract document category `Договор`: present
- template selector and baseline create marker: present

Guards:

- unauth `/api/auth/me`: 401
- unauth `POST /api/projects`: 403
- unauth contract-prefill preview: 403
- unauth AI summary: 403

Safety:

- deterministic TXT/Markdown prefill only.
- preview does not create a project or persist documents.
- suggestions require explicit user apply; no silent overwrite is claimed.
- uploaded contract is staged as a starting document with category `договор`.
- no live AI call was run.
- no online create/upload/delete mutation smoke was run.
- no real client files were used.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Remaining optional follow-up:

- authenticated browser smoke for selecting a contract file, applying suggestions, creating a disposable project with the starting contract document, verifying the Documents tab, and deleting the disposable project.

## 2026-07-09 - Project Creation disposable create/upload/delete smoke GO

Status: the remaining authenticated Project Creation follow-up reached FULL DISPOSABLE SMOKE GO through the guarded staging runtime smoke endpoint.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `e8de55e532c8e1bc632564cc3951757bc17d5fff`
- PR: #73
- Decision: FULL DISPOSABLE SMOKE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Runtime smoke:

- endpoint: `/api/internal/staging-smoke`
- mode: `includeProjectCreationDocumentsSmoke`
- core login/auth/project-smoke checks: pass
- unauth AI guard: 403
- authenticated missing-project AI guard: 404
- live AI: skipped
- smoke user report: safe, `secretsPrinted=false`

Disposable project flow:

- temporary smoke user admin role: granted only for the smoke operation
- project create through `/api/projects`: pass
- project open: pass
- synthetic starting PDF upload through `/documents/upload`: pass
- Documents API verification: pass
- project DELETE with exact project name confirmation: pass
- deleted-project verification: pass
- synthetic storage object cleanup: pass
- smoke user role restore: `temporary-admin-restored`
- cleanup: pass

Safety:

- only generated `SMOKE-...` project/document names were used.
- no real client files were used.
- no manual deploy/redeploy was triggered.
- no Render env/secrets were changed.
- no DB schema or migration changes were made.
- no live AI call was run.
- no secrets, cookies, tokens, provider keys, smoke secrets, session IDs, or env values were printed.

Conclusion:

- Project Creation & Onboarding now has authenticated disposable create -> upload starting docs -> verify Documents tab -> delete project smoke coverage.

## 2026-07-08 - Project Creation starting documents upload online/core GO

Status: PR #71 fixed Project Creation & Onboarding so starting documents can be attached during project creation. The fix reached ONLINE/CORE GO on Render. Full authenticated create/upload/delete GO is not claimed.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `918f376b07ab477a66a2a5c5a2fbbf92abe9fe46`
- PR: #71
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/projects`: 200
- `/dashboard`: 200
- `/projects/project-demo`: 404
- `/projects/project-smoke`: 200

Flow recorded:

- Step 4 `Чеклист` remains baseline preview.
- Step 5 `Создание` now includes `Стартовые документы`.
- Multiple files can be selected in the UI.
- Each selected file can have a category.
- After project creation, selected files are intended to upload to the new project's `Документы` tab via `/documents/upload`.

Markers confirmed in deployed page/bundle:

- Project Creation & Onboarding
- `Чеклист`
- `Создание`
- `Стартовые документы`
- `Выбрать документы`
- document category options
- `/documents/upload`
- baseline preview
- template selector
- onboarding summary

Guards:

- `/api/auth/me`: 401
- unauthenticated `POST /api/projects`: 403
- unauthenticated document upload route without file/auth: 403
- unauthenticated AI summary: 403

Not run / not touched:

- real project create: not run.
- real upload: not run.
- live AI: not run.
- manual deploy/redeploy: not triggered.
- Render env/secrets: unchanged.
- DB/schema/migrations: unchanged.
- secrets printed: `false`.

Remaining follow-up:

- Authenticated disposable create -> upload starting docs -> open project -> verify `Документы` tab -> delete disposable project smoke when a safe auth/admin session is available.

## 2026-07-08 - PGS Studio v4 sidebar design online GO

Status: PGS Studio v4 design update reached ONLINE/CORE UI GO on Render, including the left-menu duplicate fix.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `08a9bcbee79d9c198c28109176fbebf4261b6fc5`
- PR: #68
- Decision: ONLINE/CORE UI GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- deployed SHA matched expected commit
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-smoke`: 200
- `/api/auth/me` without cookies: 401 as expected

Design update:

- PGS Studio v4 blueprint-board background applied.
- Sidebar changed to a single desktop `.app-sidebar` with in-place peek expansion.
- Legacy `.sidebar-overlay` and `.sidebar-overlay-scrim` removed.
- Mobile drawer remains separate from the desktop sidebar.
- Topbar wrapping/search/actions adjusted for responsive layouts.

Browser smoke:

- Local production build smoke: passed.
- Online Render smoke: passed.
- Desktop viewport: 1440 x 900.
- Mobile viewport: 390 x 844.
- Desktop `.app-sidebar` count: 1.
- Visible desktop sidebar count on desktop: 1.
- Legacy `.sidebar-overlay` count: 0.
- Legacy `.sidebar-overlay-scrim` count: 0.
- Collapsed desktop sidebar opens to peek width and reveals labels.
- Desktop sidebar closes after pointer leaves the sidebar.
- Mobile `.mobile-drawer` count: 1.
- Desktop sidebar remains hidden on mobile.
- Mobile drawer opens and closes correctly.
- Horizontal overflow: none observed on desktop or mobile.
- Browser console/page errors after filtering expected unauthenticated 401/403 guard responses: none.

Validation:

- `pnpm test`: 209/209 passed.
- `pnpm lint`: passed.
- `pnpm prisma validate`: passed with dummy `DATABASE_URL`.
- `pnpm prisma generate`: passed.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm build`: passed with the expected local Prisma `DATABASE_URL` warning during static generation.
- GitHub Actions PR CI #140: success.
- GitHub Actions main CI #141: success.

Not run / not touched:

- live AI: not run.
- online mutation/import/delete/upload smoke: not run.
- project creation: not run.
- manual DB changes: none.
- Render env/secrets: unchanged.
- DB schema/migrations: unchanged.
- secrets printed: `false`.

## 2026-07-07 - Project Creation & Onboarding v1 online/core GO

Status: Project Creation & Onboarding v1 reached ONLINE/CORE GO on Render. Full online create mutation is not claimed.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `72454a128472b957ae2769a4549b547acf11dc3d`
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- deployed SHA matched expected commit
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Markers:

- Project Creation & Onboarding: present
- `Создать проект и запустить baseline`: present
- Onboarding baseline: present
- create project fields: present
- project workspace tabs/context: present
- sidebar/mobile drawer markup: present

Guards:

- `/api/auth/me`: 401
- unauthenticated AI summary: 403
- unauthenticated `POST /api/projects`: not rechecked online because the permission reviewer blocked `curl` before execution
- pre-merge tests and local smoke covered unauthenticated `POST /api/projects` as 403

Cleanup baseline:

- `project-demo` remains 404
- `project-smoke` remains available, 200
- runtime smoke target remains `project-smoke`

Not run / not touched:

- online project create mutation: not run
- disposable create/open/delete flow: not run
- live AI: not run
- uploads/import/delete: not run
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- secrets printed: `false`

Remaining follow-up:

- authenticated mutation smoke for a disposable project: create disposable project, open it, verify onboarding baseline, delete it, then verify `project-demo` remains 404 and `project-smoke` is unaffected.

## 2026-07-06 - PGS Studio redesign v2 full browser visual GO

Status: PGS Studio redesign v2 reached FULL VISUAL GO after real browser desktop/mobile viewport smoke.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit checked by `/api/health`: `0530b0ac2406667766ba6895e6aa82c621c28cec`
- Feature commit recorded earlier: `e2808a5e7d3291acb0cb3150e5f38bd531796394`
- Decision: FULL VISUAL GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Browser tooling:

- Playwright Chromium was run read-only against the online service.
- Desktop viewport: 1440 x 900
- Mobile viewport: 390 x 844
- No login, upload, project creation, delete, live AI, or mutation smoke was run.

Pages:

- `/login`: 200 on desktop and mobile
- `/dashboard`: 200 on desktop and mobile
- `/projects`: 200 on desktop and mobile
- `/projects/project-smoke`: 200 on desktop and mobile

Desktop viewport:

- app shell: visible
- sidebar: visible
- topbar: visible
- project tabs on `project-smoke`: visible
- create project form on `/projects`: visible
- horizontal overflow: none, `scrollWidth` matched `innerWidth`
- page errors: none

Mobile viewport:

- app shell: visible
- topbar: visible
- mobile menu button: visible
- mobile drawer: opens, `aria-hidden=false`
- drawer width: 304px inside 390px viewport
- project tabs on `project-smoke`: visible and contained
- create project form on `/projects`: visible and contained
- horizontal overflow: none before and after drawer open, `scrollWidth` matched `innerWidth`
- page errors: none

UI markers:

- PGS Studio branding: present
- Command Center: present where expected
- Project Intelligence: present on project workspace
- Contract / Tender: present
- `КС`: present
- Documents: present
- Risks / Reports: present
- Schedule / Cashflow: present
- Procurement / Materials: present
- AI assistant: present

Console observations:

- No hydration/page errors were captured.
- Some expected unauthenticated resource responses appeared as browser console resource errors on protected API calls: 401/403.
- These match the protected unauth guard behavior and were not treated as visual failures.

Not run / not touched:

- live AI: not run
- online mutation/import/delete/upload smoke: not run
- online project creation: not run
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- application code: unchanged
- secrets printed: `false`

Remaining optional follow-up:

- authenticated visual smoke can be run later if a safe browser auth session is explicitly provided, but the public read-only full browser visual gate is closed.

## 2026-07-06 - PGS Studio redesign v2 online/core UI GO

Status: shipped baseline for PGS Studio redesign v2 at the online/core UI gate.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `e2808a5e7d3291acb0cb3150e5f38bd531796394`
- Decision: ONLINE/CORE UI GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- First `/api/health` attempt timed out.
- Retry returned `/api/health`: HTTP 200 / `ok`.
- Deployed SHA matched expected commit.
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/login`: 200
- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

UI markers:

- PGS Studio branding: present
- dark sidebar / app shell: present
- topbar: present
- dashboard KPI / cards: present
- projects page: present
- create project form: present
- project tabs: present
- Command Center: present
- Project Intelligence: present
- Contract / Tender: present
- `КС`: present
- Documents: present
- Risks / Reports: present
- Schedule / Cashflow: present
- Procurement / Materials: present
- AI assistant: present

Create project form:

- form is present on `/projects`
- topbar anchor points to `/projects#create-project`
- online POST / create was not run

Unauth guards:

- `/api/auth/me`: 401
- `POST /api/projects`: 403
- AI summary: 403
- data-readiness: 401
- intelligence: 401
- documents: 403
- contract-review: 403
- analyze-contract: 403

Cleanup baseline:

- `project-demo`: remains 404
- `project-smoke`: target unaffected, 200
- temp delete endpoint: absent, 404

Browser / viewport limitation:

- desktop browser viewport smoke: blocked by tooling
- mobile browser viewport smoke: blocked by tooling
- horizontal overflow: not claimed
- hydration errors: not checked in a real browser
- static CSS asset loaded: 200
- responsive / mobile rules: present
- FULL VISUAL GO is not claimed; this gate is ONLINE/CORE UI GO only.

Not run / not touched:

- live AI: not run
- online mutation/import/delete/upload smoke: not run
- online project creation: not run
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- secrets printed: `false`

Remaining optional follow-up:

- full browser visual/viewport smoke for desktop and mobile when safe browser tooling is available.

## 2026-07-06 - Contract & Tender Intelligence v1 online/core GO

Status: shipped baseline for Contract & Tender Intelligence v1 at the online/core gate.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `a4235bb90c20c0e473b1c024a0f4b471f249e27f`
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok`
- deployed SHA matched expected commit
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Markers:

- `Договор / Тендер`: present
- Contract / Tender: present
- Project Intelligence: present
- Command Center: present
- `AI-помощник`: present
- `КС`: present
- `Документы`: present
- app shell / project tabs: present
- deployed CSS contains `contract-tender-*` workspace classes

Unauth guards:

- `/api/auth/me`: 401
- contract-review AI route: 403
- analyze-contract alias: 403
- data-readiness: 401
- intelligence: 401

Cleanup baseline:

- `project-demo`: remains 404
- `project-smoke`: remains available, 200
- runtime smoke target remains `project-smoke`
- `SEED_DEMO_PROJECT` gate remains intact

Not run / not touched:

- live AI: not run
- online mutation/import/delete smoke: not run
- uploads: none
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- secrets printed: `false`

Remaining optional follow-up:

- authenticated/browser project-page smoke for full Contract & Tender workspace interaction when safe auth/browser tooling is available.

## 2026-07-05 - КС / Acceptance & Billing Workflow v1 online/core GO

Status: shipped baseline for КС / Acceptance & Billing Workflow v1 at the online/core gate.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `071046f154a7c0012f798e9224ff9d9e91baffa4`
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- First `/api/health` attempt timed out after 40s with HTTP `000` / 0 bytes.
- Retry returned `/api/health`: HTTP 200 / `ok`.
- Third attempt returned `/api/health`: HTTP 200 / `ok`.
- Deployed SHA matched expected commit.
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Markers:

- `КС`: present
- Acceptance/Billing: present
- Ready to bill: present
- Blocked billing: present
- `КС package draft`: present
- Required package: present
- Billing cashflow impact: present
- Project Intelligence: present
- Command Center / shell markers: present
- Documents / Risks / Reports / sidebar / project tabs: present

Unauth guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401
- documents: 403
- schedule draft: 401
- cashflow draft: 401
- acceptance/billing endpoint: not applicable, no separate endpoint added
- project DELETE: not run because online mutation/delete calls were forbidden

Cleanup baseline:

- `project-demo`: remains 404
- `project-smoke`: remains available, 200
- temporary delete endpoint: GET 404, absent

Not run / not touched:

- browser smoke: not run; HTTP/DOM/bundle smoke used
- live AI: not run
- online mutation/import/delete smoke: not run
- uploads: none
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- secrets printed: `false`

Remaining optional follow-up:

- authenticated/browser project-page smoke for full КС / Acceptance & Billing workflow interaction when safe auth/browser tooling is available.

## 2026-07-04 - Documents & Executive Compliance v1 online/core GO

Status: shipped baseline for Documents & Executive Compliance v1 at the online/core gate.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `9d3ad89cf1228fb634e9e894579dc802d41d18e9`
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok` on 3 attempts
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Markers:

- `Документы`: present
- `Рапорты`: present
- `Риски`: present
- `Project Intelligence`: present
- `График`: present
- `Финансы`: present
- `Материалы`: present
- Procurement: present
- project tabs / sidebar / app shell: present
- deployed document compliance bundle markers present: `document-compliance`, Compliance risks, Risk Register, Executive Weekly, `План сбора документов`
- some project-specific document labels were not visible in the current public DOM because the public smoke data/page state does not expose every compliance panel; not treated as a core failure
- browser smoke: project page opens, no horizontal overflow

Unauth guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401
- schedule draft: 403
- cashflow draft: 403
- documents GET: 403
- project DELETE: not executed because online delete/mutation calls were forbidden
- temp delete endpoint: GET 404, absent

Cleanup baseline:

- `project-demo`: remains 404
- `project-smoke`: remains available
- temporary delete endpoint: absent

Not run / not touched:

- live AI: not run
- online mutation/import/delete smoke: not run
- uploads: none
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- secrets printed: `false`

Remaining optional follow-up:

- authenticated/browser project-page smoke for full Documents/Compliance panel coverage when safe auth/browser tooling is available.

## 2026-07-04 - Documents & Executive Compliance v1 PR validation

Status: feature train prepared for PR review; not merged and not shipped online yet.

- Branch: `codex/documents-executive-compliance-v1`
- Base: `main@07d88c12f0205467b62b7fc54aa4f01370b14d42`
- Purpose: deterministic document compliance workspace for required documents, work package document map, КС/closeout readiness, executive document package, weekly collection plan, and document-driven risk/report signals.

Implemented:

- pure document compliance intelligence model;
- required documents checklist inferred from project, ВОР, график, materials, procurement, uploads, checklist, and import history;
- missing documents and unknown-row document signals;
- work package document map with conservative classifications for structure, engineering, earthworks, finishing, roofing, material, and unknown packages;
- КС / closeout readiness and executive document package readiness;
- weekly document collection plan and compliance risk register;
- Documents tab workspace integration;
- Project Command Center document compliance status/action integration;
- Project Intelligence drill-down document compliance, КС readiness, executive package, blocking package, and weekly action signals;
- Risks & Executive Reports document compliance risk integration.

Validation:

- `pnpm test`: 184/184 passed;
- targeted document/compliance, command-center, drill-down, and risk/executive tests passed;
- `pnpm lint`: passed;
- `pnpm prisma generate`: passed;
- `pnpm prisma validate` with dummy `DATABASE_URL`: passed;
- `pnpm exec tsc --noEmit`: passed after `next build` generated `.next/types`;
- `pnpm build`: passed with the known local Prisma `DATABASE_URL` warning during static generation.

Local smoke:

- dev server: `http://127.0.0.1:3004`;
- `/dashboard`: 200;
- `/projects`: 200;
- `/projects/project-demo`: 200 in local fallback demo mode;
- project HTML markers: `Documents Intelligence`, `КС readiness`, `Executive package`, and `Project Intelligence` present;
- `/api/projects/project-demo/ai/summary`: 200 deterministic response, no live provider call;
- `/api/projects/project-demo/data-readiness` and `/api/projects/project-demo/intelligence`: 500 in local mode because `DATABASE_URL` is not set, recorded as local DB availability limitation;
- `/api/auth/me`: 200 local fallback user with `authenticated:false`, recorded as local fallback behavior, not an online auth gate;
- project DELETE guard smoke: not run because delete requests are prohibited in this train.

Not run / not touched:

- deploy/redeploy: not run;
- online smoke: not run;
- live AI: not run;
- online mutation/import/delete smoke: not run;
- uploads / real client files: none;
- Render env/secrets: unchanged;
- DB/schema/migrations: unchanged;
- auth/session/health/provider config: unchanged;
- dirty checkout `/Users/ag/Documents/PGS`: untouched;
- secrets printed: `false`.

Next gate:

- Draft PR CI → review gate → ready-state → final merge gate → online/core smoke.

## 2026-07-03 - Risks & Executive Reports v1 online/core GO

Status: shipped baseline for Risks & Executive Reports v1 at the online/core gate.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `72ce5499397f1b78728e9e0c73cd5e35cd8abc9c`
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok` after retry
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 200

Markers:

- `Риски`: present in public shell/navigation
- `Рапорты`: present in public shell/navigation
- `Project Intelligence`: present in public shell/navigation
- `График`: present in public shell/navigation
- `Финансы`: present in public shell/navigation
- `Материалы` / Procurement: present in public shell/navigation
- sidebar: present
- Risk Executive deployed bundle markers present: Risk Register, Decision Register, Recommended Actions, Executive Weekly Report, Report readiness, AI executive polish
- full tab interaction/browser DOM marker smoke: blocked by unavailable browser tooling, not treated as a core failure

Unauth guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401
- project DELETE: 401
- schedule draft: 401
- cashflow draft: 401
- temp delete endpoint: 404

Cleanup baseline:

- `project-demo`: remains 404
- `project-smoke`: target unaffected
- temporary delete endpoint: absent

Not run / not touched:

- live AI: not run
- online mutation/import/delete smoke: not run
- uploads: none
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- browser smoke: blocked by tooling; HTTP/DOM/bundle smoke used
- secrets printed: `false`

Remaining optional follow-up:

- authenticated/browser project-page smoke for full Risks/Reports tab interaction when safe auth/browser tooling is available.

## 2026-07-03 - Risks & Executive Reports v1 PR validation

Status: feature train prepared for PR review; not merged and not shipped online yet.

- Branch: `codex/risks-executive-reports-v1`
- Base: `main@faeed86cf65de0fb2c64272da4be45f75befe7f6`
- Purpose: deterministic risk register, decision register, recommended actions, and executive weekly report on top of existing project intelligence data.

Implemented:

- pure risk/executive intelligence model;
- Risk Register workspace;
- Decision Register panel;
- Recommended Actions panel;
- deterministic Russian executive weekly report with copyable text;
- Project Intelligence and Command Center integration;
- empty/degraded states for missing ВОР, procurement, schedule, cashflow, and document data.

Validation:

- `pnpm test`: 175/175 passed;
- `pnpm lint`: passed;
- `pnpm prisma generate`: passed;
- `pnpm prisma validate` with dummy `DATABASE_URL`: passed;
- `pnpm exec tsc --noEmit`: passed;
- `pnpm build`: passed with the known local Prisma `DATABASE_URL` warning.

Local smoke:

- `/dashboard`: 200;
- `/projects`: 200;
- `/projects/project-demo`: 200 in local fallback demo mode;
- `/projects/project-smoke`: 404 due local DB/seed availability, not a code failure;
- Risks / Executive UI markers: present in local project HTML;
- unauth guard smoke: limited by local fallback auth mode and missing local `DATABASE_URL`.

Not run / not touched:

- deploy/redeploy: not run;
- online smoke: not run;
- live AI: not run;
- online mutation/import/delete smoke: not run;
- uploads / real client files: none;
- Render env/secrets: unchanged;
- DB/schema/migrations: unchanged;
- secrets printed: `false`.

Next gate:

- PR review → ready-state → final merge gate → online/core smoke → shipped project-log entry.

## 2026-07-03 - Schedule & Cashflow Intelligence v1 online/core GO

Status: shipped baseline for Schedule & Cashflow Intelligence v1 at the online/core gate.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `eccee8462ad9d66e117a7c74ef4f313167568809`
- Decision: ONLINE/CORE GO
- Git SHA source: `RENDER_GIT_COMMIT`

Health:

- `/api/health`: HTTP 200 / `ok` on three retry attempts
- DB: `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 404 as expected
- `/projects/project-smoke`: 404, public-read/project availability limitation, not a core failure

Markers:

- `График`: present in shell/navigation
- `Финансы`: present in shell/navigation
- `Материалы` / Procurement: partially present as operations/procurement navigation
- sidebar: present
- Project Intelligence / Executive Weekly Plan / weekly schedule-cashflow markers: blocked by lack of a valid public project page, not treated as a core failure

Unauth guards:

- `/api/auth/me`: 401
- AI summary: 403
- data-readiness: 401
- intelligence: 401
- project DELETE: 401
- schedule draft endpoint: 401
- cashflow draft endpoint: 401

Not run / not touched:

- live AI: not run
- online mutation/import/delete smoke: not run
- uploads: none
- manual deploy/redeploy: not triggered
- Render env/secrets: unchanged
- DB/schema/migrations: unchanged
- browser smoke: blocked by tooling; HTTP/DOM smoke used
- secrets printed: `false`

Remaining optional follow-up:

- authenticated project-page/browser smoke for full Schedule/Cashflow workspace markers when safe auth/browser tooling is available

## 2026-07-01 - Demo project removal online fix

Status: demo project removal fix merged; Render redeploy trigger recorded.

- Target URL: https://pgs-frankfurt.onrender.com
- Cleanup baseline commit: `24c2ce047a0e7e3db38f7016769d274f4feac9d2`
- Trigger type: docs-only project log update
- Reason: Render still served previous cleanup commit `e7c975e04259b6c5de9265a57ae38a84bd5d3d76` after the final temporary endpoint removal commit reached `main`

Root causes fixed:

- project pages now opt out of build-time static fallback with dynamic rendering
- staging seed no longer creates `project-demo` unless `SEED_DEMO_PROJECT=true`
- runtime smoke uses `project-smoke` by default instead of `project-demo`
- sidebar operation links point to `/projects` instead of hardcoded `project-demo`
- temporary staging delete endpoint was removed after the final cleanup deletion

Safety:

- no Render env/secrets changes
- no DB/schema/migration changes
- no live AI run
- no direct SQL
- no real client files used
- secrets printed: `false`

Follow-up gate:

- confirm Render deployed this entry's commit or a later main commit
- confirm `/projects/project-demo` returns 404
- confirm `/api/internal/staging-delete-demo-project` returns 404
- confirm `/projects` remains 200
- confirm runtime smoke still passes with `project-smoke` only

## 2026-07-01 - Procurement & Materials Intelligence v1 online CORE GO

Status: shipped baseline for Procurement & Materials Intelligence v1.

- Online URL: https://pgs-frankfurt.onrender.com
- Online commit: `a73046c52eb1082a56164d9565c521b0a7447a80`
- Feature commit: `1663e363b02093adfba1f78574fda5b07daca003`
- PR: #45 Procurement & Materials Intelligence v1
- Result: Procurement & Materials Intelligence v1 is merged, deployed online, and validated at the core online gate
- Git SHA source: `RENDER_GIT_COMMIT`

Deployment note:

- Render did not auto-deploy immediately after PR #45 merge.
- Empty trigger commit `a73046c52eb1082a56164d9565c521b0a7447a80` was pushed to `main` to retrigger Render deploy.
- The trigger commit changes no application code; it contains PR #45 through parent commit `1663e363b02093adfba1f78574fda5b07daca003`.

Health:

- `/api/health`: HTTP 200 / `ok`
- migrations: `ok`, count `6`
- auth required: `true`
- AI configured: `true`

Pages:

- `/dashboard`: 200
- `/projects`: 200
- `/projects/project-demo`: 200

UI and DOM markers:

- `Материалы`: present
- Procurement / `Снабжение` / `Заявки`: present
- Project Intelligence: present
- `Импорт` / `ВОР`: present
- procurement workspace SSR marker: not visible in static HTML fetch because the project workspace is client-rendered; covered by component render tests

Unauth guards:

- `/api/auth/me`: 401
- unauth procurement preview: 401
- unauth procurement commit: 401
- unauth AI summary: 403
- unauth project DELETE: 401

Safety:

- preview remains read-only
- procurement commit remains an explicit authenticated user action
- unknown/incomplete rows are not silently inserted into supply draft items
- no live AI run
- no authenticated mutation smoke
- no upload/import/procurement commit run
- no Render env/secrets changes
- no DB/schema/migration changes
- no real client files used
- secrets printed: `false`

Validation already passed before merge:

- GitHub Actions CI #91: success
- `pnpm test`: 151/151
- `pnpm lint`: pass
- `pnpm prisma generate`: pass
- `pnpm prisma validate`: pass
- `pnpm exec tsc --noEmit`: pass
- `pnpm build`: pass

Known follow-up:

- Full browser/hydration viewport proof is not claimed in this gate because local Playwright/Chrome tooling was unavailable.
- Authenticated procurement mutation smoke remains optional and should use a disposable project/session only.

Conclusion:

- Procurement & Materials Intelligence v1 is online/core green and recorded as shipped baseline.

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
