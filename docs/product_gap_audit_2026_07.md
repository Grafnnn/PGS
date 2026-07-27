# PGS product gap audit — July 2026

## Executive view

PGS already has a strong project-level construction operating contour: Excel/VOR ingestion, budget, materials, procurement, schedule, cashflow, documents, risks, claims, acceptance/billing, field intelligence, executive reporting, AI scenarios, audit and guarded staging smoke.

The main gap is no longer another analytical dashboard. PGS is moving from advisory intelligence to controlled operational records: accountable actions, configurable approvals, formal document issue, accounting exchange and persistent commercial change management.

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
| Configurable workflow builder | Added in Workflow Designer & Approval Matrix v1 | Oracle provides configurable business-process routes and approval steps | Maintain |
| Change orders / variations | Added in Change Order Management v2 | Autodesk and Oracle connect potential changes, cost items, approvals, evidence and executed commitments | Maintain |
| Cost codes / CBS-WBS | Added in Cost Codes / CBS-WBS v1 | Oracle and Autodesk use hierarchical cost structures to connect scope, cost and change records | Maintain |
| Contract commitments / SOV | Added in Contract Commitments v1 | Procore and Oracle connect commitments, changes, invoices, retention and ERP flows | Maintain |

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

## Implemented now: Workflow Designer & Approval Matrix v1

- Project-level reusable serial workflow templates.
- Work, review and approval steps with responsible project roles and due-day targets.
- Snapshot steps on launch so template lifecycle changes do not rewrite history.
- Ball-in-court control, revision return, rejection, cancellation and terminal approval.
- OWNER/ADMIN template administration and role-aware decisions.
- Transactional workflow state and project audit history.

## Implemented now: Change Order Management v2

- Persistent `CHG-###` register replacing the previous advisory-only handoff.
- Cost lines linked to VOR rows with estimated, proposed, submitted, approved and committed values.
- Evidence document/version snapshot, source reference, counterparty and schedule impact.
- Explicit draft, submission, revision, approval, rejection, execution and void lifecycle.
- Optional Workflow Designer approval run and OWNER/ADMIN decision gates.
- No silent writes into VOR, contract, cashflow, KS, payments or procurement.

## Implemented now: Cost Codes / CBS-WBS v1

- Project-owned hierarchical WBS/CBS classifier with active/inactive lifecycle.
- Deterministic VOR baseline preview and separately confirmed commit.
- Explicit mappings for VOR, schedule, materials, procurement, payments and change orders.
- Propagation from linked VOR rows to schedule and change-order lines.
- Cost Code context in the accounting export package.
- Role-aware mutations, deletion safeguards and transactional audit records.

## Implemented now: Contract Commitments v1

- Persistent owner contract, subcontract, purchase-order and service-order register.
- Fixed SOV lines linked to VOR, Cost Codes and procurement source items.
- Explicit approval, activation, completion, termination and void lifecycle.
- Document/version evidence and optional Workflow Designer approval run.
- Payment applications with prior-certified amount, retention and SOV overbilling protection.
- Paid status requires a matching existing paid project payment; no payment or posting is created automatically.
- Approved change-order linkage and real commitment data in the ERP accounting export.

## Implemented in the product-gap closure branch

### External Collaboration v1

- OWNER/ADMIN creates a time-limited, one-response link for exactly one open RFI or submitted submittal.
- The database stores only a SHA-256 token hash; the raw link is returned once.
- The public page exposes only the selected item and a minimal project label, never the project workspace.
- External answers and decisions are rate-limited, transactional and audited.
- Expired, responded and revoked links cannot be reused; one active link per entity is enforced in PostgreSQL.

### Cost Forecast by Cost Code v1

- Read-only BAC, approved changes, revised budget, EV, paid actual cost, open commitments, ETC, EAC and VAC by Cost Code.
- Uses the active Project Controls baseline and latest published period when available, with VOR fallback.
- Missing baseline, control periods and unclassified financial data are explicit limitations rather than false green.
- No budget, commitment, payment or accounting records are created or changed by the forecast.

### Invoice / AP-AR Reconciliation v1

- Persistent AP/AR invoice register linked to Cost Codes, commitments, payment applications, payments and documents.
- Explicit three-way reconciliation with amount, counterparty, source-document and payment-direction checks.
- All linked records must belong to the same project.
- Reconciliation is separately confirmed and audited; it never creates a payment or posting.
- Paid status requires an already linked paid project payment.

## Next validation gates

1. Review and merge the feature PR after CI is green.
2. Apply the PostgreSQL migration on staging through the normal Render deploy path.
3. Run authenticated disposable smoke for link response, AP/AR reconciliation and cleanup.

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
