# PGS: service reliability and performance audit

Date: 2026-09-08 (Europe/Moscow).
Online baseline: `81296d00ea303b78fdfb2a93cda02d014e0bc3b3`.
Target: https://pgs-frankfurt.onrender.com.

## Decision

The service is operational, but the audit is not an unconditional all-functions GO.
Confirmed workflow/navigation bugs and unnecessary loading were corrected on
`codex/service-audit-performance`. These changes are not a claim of an online release.
Dependency security maintenance and real outgoing email remain unresolved.

## Findings and corrections

| Priority | Finding | Correction in this branch |
| --- | --- | --- |
| P1 | An explicitly empty material receipt could receive the entire remaining quantity. | Reject empty receipt item arrays before any mutation. Preserve the existing omitted-items contract. |
| P2 | Command-center shortcuts tried to scroll to unmounted intelligence sections and appeared unresponsive. | Navigate directly to the relevant module; correct KPI destinations. |
| P2 | Card transitions did not consistently update the URL, and Back to a bare project URL left the previous tab selected. | Shared navigation handler and explicit overview fallback for history entries. |
| P2 | A delayed AI photo answer/error could appear after changing report, photos or question. | Ignore obsolete responses and reset analysis state on context changes. No paid analysis was needed to reproduce this. |
| P2 | Only the first six report attachments were accessible in the report card. | Keep six lazy thumbnails and expose download links for the remaining photos. |
| P2 | Almost all project modules were included in the initial JavaScript download. | Defer non-overview workspaces until selected, with a visible loading state and SSR retained. |
| P2 | Four initial summary requests independently rebuilt the same project snapshot. | One guarded intelligence response supplies readiness, actions, checklist and intelligence; no full import preview is sent. |
| P2 | Overlapping summary retries could replace fresh data with an older result. | Abort superseded reads and ignore their results; preserve previous data with an explicit failure/retry warning. |
| P3 | Dashboard loaded an unused full primary-project bundle. Pipeline reads also retrieved unused JSON columns. | Skip the unused dashboard bundle by default and select only consumed fields in pipeline loaders. |

## Performance evidence

Production build manifest measurement, summing the initial project-route assets:

| Measurement | Before | After |
| --- | ---: | ---: |
| Initial asset bytes, uncompressed | 2,076,863 | 844,356 |
| Initial asset bytes, gzip | 522,017 | 223,276 |
| Snapshot endpoint requests per production mount | 4 | 1 |

The initial compressed payload is approximately 57% smaller. This is a bundle-size
measurement, not a promise that page load time improves by the same percentage.
The development browser test observes React StrictMode effect replay; it is not a
production request-count measurement.

Bounded online GET samples from this machine, without authentication:
- Health: HTTP 200, approximately 1.23 seconds to first byte.
- Dashboard/projects/portfolio/inbox/project: HTTP 307 authentication redirects,
  approximately 1.09-1.59 seconds to first byte across three samples each.
- Auth/me: 401; project intelligence: 401; documents: 403. The single documents
  guard sample took approximately 4.06 seconds and merits follow-up timing.
- These timings include network/TLS and redirects, not authenticated page rendering.
  No load test or production p95/LCP/INP claim was made.

## Browser coverage

Authenticated read-only production checks covered four top-level pages
(dashboard, projects, inbox, portfolio) and seventeen project sections:
overview, schedule, reports, finance/expenses, procurement, payroll, technical
assistant, documents, actions, acceptance, contract, budget, proposal, RFI, risks,
accounting and closeout.

- No JavaScript page errors or warnings observed in these checks.
- Desktop: 1280px. Mobile: 390x844px, expenses, project menu and schedule.
- No page-wide horizontal overflow observed on checked surfaces.
- Mobile menu opened, selected the schedule, and closed correctly.
- Existing report photos rendered; unrequested lazy thumbnails were not counted as failures.
- The live schedule displayed 93/93 works linked and 100% estimate-value coverage.
  This is the application's displayed consistency indicator, not a new comparison
  against the source workbook or an independent financial reconciliation.

Local Chrome checks used synthetic fixtures and blocked non-GET API requests:
overview-to-schedule shortcut, Back/Forward, six lazy workspaces, summary failure,
retry and overlapping stale response, desktop/mobile overflow and menu closure.
No page errors observed. This does not replace live mutation testing.

## Open risks

1. Production dependency audit reports 38 advisories: 1 critical, 16 high,
   17 moderate and 4 low, primarily Next.js, SheetJS and transitive dependencies.
   Package-version findings are not proof of exploitation. The critical
   [Next.js middleware advisory](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw)
   applies to middleware authorization; this app uses page/API guards and no
   middleware file was found. That does not dismiss the other advisories.
   Plan a separate supported-framework/Excel-parser upgrade and full import/auth
   regression pass. No malicious workbook or exploit payload was submitted.
2. Health reports email in a non-sending mode. Real invitation/reset email delivery
   was not verified and should not be represented as working SMTP delivery.
3. Authenticated server timing, sustained load, recovery from database loss,
   restore-from-backup, external integrations, and paid AI output quality require
   separate controlled checks.

## Verification and safety

Full Vitest suite: 1033/1033 tests in 255 files passed. TypeScript, lint and the
final production build passed. The local browser regression passed after the
command-center dead-link failure was reproduced and fixed.
The local build emits the existing missing-DATABASE_URL warning while generating
pages; it does not connect to production. Local runtime is Node 24; deployment
targets Node 22, so CI remains the authoritative deployment-runtime check.

No real project creation, upload, receipt, approval, delete or other production
mutation was performed. No live AI, environment/secret/schema change, credential
output or manual deployment. `/Users/ag/Documents/PGS` was not touched.
