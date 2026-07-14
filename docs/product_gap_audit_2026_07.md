# PGS product gap audit — July 2026

## Executive view

PGS already has a strong project-level construction operating contour: Excel/VOR ingestion, budget, materials, procurement, schedule, cashflow, documents, risks, claims, acceptance/billing, field intelligence, executive reporting, AI scenarios, audit and guarded staging smoke.

The main gap is no longer another analytical dashboard. The system needs a persistent workflow layer that turns findings into accountable work: owner, due date, state, blocker, approval and audit trail. `Project Action Center v1` is the first implementation of that layer.

## Market comparison

This is a directional product audit based on public vendor materials, not a feature-by-feature procurement evaluation.

| Capability | PGS status | Market signal | Priority |
| --- | --- | --- | --- |
| Connected cost/schedule/material intelligence | Strong project-level baseline | Oracle connects cost, contract, cashflow, change and schedule controls | Maintain |
| Persistent actions and approvals | Added in Action Center v1 | Oracle emphasizes configurable workflows, approval cycles and next required actions | Highest |
| RFI / submittal workflow | Added in RFI & Submittals v1 | Autodesk exposes dedicated RFI, issue and form workflows | Maintain |
| Field mobile/offline operation | Read-oriented web contour; no offline app | Autodesk supports field reports, issues, forms and RFIs on mobile/offline | High |
| Document review/version/approval | Versions exist; formal transmittal/approval is limited | PlanRadar markets version control, approvals and audit trail | High |
| ERP/accounting integration | Connector readiness only | Procore and Oracle connect commitments, changes, invoices and ERP flows | High for commercial rollout |
| Portfolio/program controls | Project-centered | Oracle supports project, cross-project and portfolio controls | Medium |
| Configurable workflow builder | Fixed product workflows | Oracle provides no-code/low-code business-process configuration | Medium/long term |

## Implemented now: Project Action Center v1

- Persistent project action register in PostgreSQL.
- Source module and target workspace link.
- Priority, responsible person/role and due date.
- States: open, in progress, waiting approval, blocked and done.
- Optional mandatory OWNER/ADMIN approval before completion.
- Reopening invalidates the previous approval.
- Project permissions and transactional audit records.
- Read-only viewer mode and responsive UI.
- Automatic cascade cleanup with disposable project deletion.

## Recommended next trains

1. **Document Transmittals & Approval v1** — controlled packages, reviewers, revision status, approval history and distribution log.
2. **Field Mobile / Offline v1** — installable PWA, queued daily reports/photos/issues, sync status and conflict handling.
3. **ERP & Accounting Bridge v1** — export/import contracts, commitments, invoices, payments and reconciliation with explicit dry-run.
4. **Portfolio Control Center v1** — cross-project cashflow, risk, workload and milestone comparison.

## Product guardrails

- Do not convert deterministic findings into silent writes; creating actions remains explicit.
- Do not mark missing data as green.
- Keep AI advisory and click-triggered; workflow state remains deterministic and auditable.
- Keep destructive and financial mutations permissioned, confirmed and transactional.
- Treat browser/offline/mobile claims as unverified until exercised on real viewports and constrained networks.

## Public sources

- [Oracle Primavera Unifier project controls](https://www.oracle.com/construction-engineering/primavera-unifier-project-controls-asset-management/)
- [Autodesk Construction Forms](https://construction.autodesk.com/tools/construction-forms/)
- [Autodesk Construction Issues](https://construction.autodesk.com/tools/issues-software/)
- [Autodesk Construction RFIs](https://construction.autodesk.com/tools/construction-rfi-tracking/)
- [Autodesk Construction mobile app](https://construction.autodesk.com/products/construction-app/)
- [Procore Financial Management](https://www.procore.com/financial-management)
- [PlanRadar Document Management](https://www.planradar.com/us/product/document-management/)
