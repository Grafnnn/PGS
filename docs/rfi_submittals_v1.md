# RFI & Submittals v1

## Purpose

The project workspace contains two formal, persistent registers:

- RFI for numbered questions that require a traceable answer;
- Submittals for documents, materials, equipment and samples that require review.

Both registers are project-scoped, permissioned and audited. Analytics and AI never create or advance workflow records automatically.
An overdue item can be converted into an explicit high-priority Project Action by the user; no escalation record is written silently.

## RFI lifecycle

1. A manager creates `RFI-001` as a draft.
2. Draft fields and the optional linked project document can be edited.
3. An assignee and answer due date are required; `Send` moves the RFI to `open`, records the send timestamp and snapshots the linked document version when present.
4. `Answer` requires response text, stores it in response history and moves the RFI to `answered`.
5. `Close` moves an answered RFI to `closed`.
6. Answered or closed RFIs can be reopened without deleting response history.

Only drafts can be deleted, and deletion requires OWNER or ADMIN permission.

## Submittal lifecycle

1. A manager creates `SUB-001` as a draft.
2. A project document, reviewer and decision due date are required before submission.
3. `Submit` moves the record to `submitted` and snapshots the linked document version.
4. Review records one of three decisions: `approved`, `rejected` or `revise_required`.
5. `revise_required` can be resubmitted, incrementing the revision number while preserving review history.
6. Approved or rejected records can be closed.

Only drafts can be deleted. Every workflow mutation is written to the project audit log.

## Safety and scope

- Linked documents must belong to the same project.
- Number generation runs in a serializable transaction and has a project-level unique constraint.
- Status transitions are enforced by server code, not only by UI controls.
- Published answers and review history are retained when an item is reopened or resubmitted.
- This version does not send external email or grant external customer access.
