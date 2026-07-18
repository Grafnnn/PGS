# Contract Commitments v1

## Purpose

Contract Commitments turns approved commercial agreements into a persistent project record. It covers owner contracts, subcontracts, purchase orders and service orders without treating procurement estimates as executed obligations.

## Record model

Each project commitment contains:

- project sequence `COM-###`, type, counterparty and optional external number;
- fixed Schedule of Values lines linked to VOR, Cost Codes and procurement items;
- retention percent, payment terms and optional start/end dates;
- source procurement request and exact document/version snapshot;
- approved/executed change orders;
- optional Workflow Designer approval run;
- payment applications `APP-###` by period and SOV line;
- project audit history for every create, decision, link and delete action.

## Lifecycle and permissions

Commitments use:

`draft -> submitted -> approved -> active -> completed`

Controlled alternative states are `revision_required`, `rejected`, `terminated` and `void`.

- OWNER, ADMIN and MANAGER can create and edit draft/revision records.
- OWNER and ADMIN decide approval, activation, completion, termination and void.
- A linked workflow must be approved before the commitment can be approved.
- Only an unsubmitted and unused draft can be deleted.
- Only approved/executed change orders can amend an obligation.
- Requests check project access before request-body parsing.

Payment applications use:

`draft -> submitted -> approved -> paid`

Rejection and void are explicit states. Marking an application paid requires an existing project payment that is already `paid`, has the expected incoming/outgoing direction and covers the net application amount.

## Financial controls

- Submission requires priced SOV, a counterparty and contract evidence/requisites.
- Applications cannot exceed an individual SOV line.
- Prior approved/paid applications are included in overbilling checks.
- Retention defaults from the commitment percent and can never exceed the line gross amount.
- Approved changes update revised commitment value only through an explicit link.
- No payment, posting, VOR row, procurement record or cashflow row is created automatically.
- Missing or draft data is not counted as committed value.

## Integrations

- Cost Codes coverage and assignment include commitment lines.
- Change Order Management exposes optional commitment linkage.
- ERP / Accounting export uses approved/active/completed commitments when the register is available, while procurement estimates remain a separate fallback dataset.
- Document/version and Workflow Designer links preserve commercial evidence and approval history.

## UI and API

The workspace is embedded in the existing `Договор / Тендер` tab to avoid another navigation item. It provides a compact register, SOV details, lifecycle controls, change links and payment applications.

- `GET|POST /api/projects/:projectId/commitments`
- `PATCH|DELETE /api/projects/:projectId/commitments/:commitmentId`
- `POST /api/projects/:projectId/commitments/:commitmentId/payment-applications`
- `PATCH|DELETE /api/projects/:projectId/commitments/:commitmentId/payment-applications/:applicationId`

## Known limits

- v1 supports one primary contract document/version per commitment.
- SOV amendments are explicit edits before submission; approved change value is not automatically allocated across SOV lines.
- External signature, supplier portal, invoice OCR and direct ERP postings are outside v1.
- Production/staging mutation validation must use a disposable project and an approved authenticated smoke path.
