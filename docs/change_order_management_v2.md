# Change Order Management v2

## Purpose

PGS previously detected possible scope, price, schedule, material and contract-risk changes, but the result was advisory only. Change Order Management v2 adds a persistent and audited register that carries a candidate from draft through submission, approval and execution.

## Record model

Each project change has:

- sequential project number `CHG-###`;
- type: potential, request, owner, subcontractor or directive;
- commercial scope: in scope, budget only, out of scope or contingency;
- source and reference, reason, counterparty, due date and schedule impact;
- optional exact document/version snapshot;
- cost lines optionally linked to existing VOR/budget rows;
- estimated, proposed, submitted, approved and committed values;
- optional approval workflow run from Workflow Designer;
- complete project audit history.

## Lifecycle and permissions

`draft -> open -> submitted -> approved -> executed`

Additional controlled states are `revision_required`, `rejected` and `void`.

- OWNER, ADMIN and MANAGER can create and edit pre-submission records.
- OWNER and ADMIN decide revision, approval, rejection, execution and voiding.
- Only an unsubmitted draft can be deleted.
- A linked workflow must reach `approved` before the change can be approved.
- Requests are guarded before body parsing, and transitions use optimistic conflict protection.

## Financial safety

- Submission requires at least one priced cost item and a reason or evidence document.
- Approval copies submitted values to approved values.
- Execution copies approved values to committed values.
- Execution does not silently change VOR, contract value, cashflow, KS, payments or procurement.
- A later train may add explicit, separately confirmed application of an executed change to financial baselines.

## UI

The Budget/VOR workspace now combines deterministic change candidates with a persistent register. A user can create a draft from a candidate, price cost lines, link evidence, select an approval template and use explicit status actions. Desktop and mobile layouts use the existing PGS Studio design system.

## API

- `GET /api/projects/:projectId/change-orders`
- `POST /api/projects/:projectId/change-orders`
- `PATCH /api/projects/:projectId/change-orders/:changeOrderId`
- `DELETE /api/projects/:projectId/change-orders/:changeOrderId`

## Known limits

- One primary evidence document/version can be linked in v2; additional evidence remains available in the Documents and RFI/Submittals workspaces.
- No external signature, email delivery or owner portal is introduced.
- No automatic budget or contract amendment is performed.
