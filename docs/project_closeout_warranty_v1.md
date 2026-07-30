# Project Closeout & Warranty v1

Project Closeout & Warranty is the controlled final stage of a PGS project. It connects existing documents, quality issues, document transmittals, acceptance/billing and project actions without copying those records into a second register.

## Workflow

1. Open the project section `Сдача / Гарантия`.
2. Select `Сформировать контур сдачи`.
3. PGS creates:
   - an initial closeout package;
   - a required checklist;
   - document candidates marked `На проверке`;
   - a warranty placeholder without invented dates or retention values.
4. The responsible manager verifies checklist evidence and closes quality blockers in the existing quality workspace.
5. A complete package can be submitted for acceptance.
6. OWNER or ADMIN accepts, rejects or returns the package from the project workspace or Approval Inbox.
7. Accepted packages can be closed and warranty obligations can be activated.
8. OWNER or ADMIN can mark the project `completed` only after every required gate and acceptance blocker is closed.

## Safety rules

- Uploaded or existing documents are candidates, not automatic proof of completion.
- Document requirements cannot be completed without a document from the same project.
- Open acceptance-blocking NCR, Punch or Defect records prevent quality-gate completion.
- Package acceptance, rejection, closure and final project completion require OWNER or ADMIN.
- Warranty dates, retention and contractual terms are never invented.
- Every mutation is protected by project permissions and written to the project audit log.
- Existing project documents, quality records, transmittals and billing data remain the source of truth.

## Data model

- `ProjectCloseoutPackage`: controlled handover package and acceptance lifecycle.
- `ProjectCloseoutChecklistItem`: required evidence or gate within a package.
- `ProjectWarrantyObligation`: warranty period, responsible party, retention and release date.

Migration:

`20260730120000_project_closeout_warranty_v1`

## Inbox signals

- submitted closeout packages appear as approval decisions for OWNER and ADMIN;
- expiring or expired warranty and retention dates appear as attention items;
- all inbox links open the project tab `Сдача / Гарантия`.

## Verification

Before deployment:

- `pnpm prisma validate`
- `pnpm prisma generate`
- `pnpm test`
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm build`

After staging migration and deploy:

1. verify `/api/health`;
2. bootstrap a disposable closeout package;
3. confirm document candidates are not auto-completed;
4. verify an open acceptance blocker prevents submission;
5. complete the checklist with synthetic evidence;
6. submit and accept the package;
7. add and activate a synthetic warranty;
8. verify Approval Inbox signals;
9. complete and delete the disposable project through the approved smoke path.
