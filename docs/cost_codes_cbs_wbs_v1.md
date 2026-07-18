# Cost Codes / CBS-WBS v1

## Purpose

Cost Codes provide one project classification axis across the VOR budget, schedule, materials, procurement, payments and change orders. The hierarchy combines:

- WBS nodes for work scope and project sections;
- CBS leaf nodes for cost categories;
- explicit links from operational records to one active project code.

## VOR baseline

The baseline generator is deterministic and uses existing VOR fields:

1. Section becomes the first WBS level.
2. Subsection becomes the second WBS level.
3. Budget kind becomes the CBS leaf.
4. Each VOR row is proposed for assignment to its leaf code.

Preview is read-only. Commit requires a separate explicit confirmation. Conflicting existing code/name combinations block commit instead of being overwritten.

When committed, the assigned VOR code is propagated to schedule and change-order lines already linked to that VOR item. Other module gaps remain visible for manual classification.

## Permissions and audit

- Project viewers can read the hierarchy and coverage.
- OWNER, ADMIN and MANAGER roles can create codes, run baseline and edit assignments.
- Only OWNER and ADMIN can delete an unused code.
- A code with children or operational links cannot be deleted.
- Create, update, delete, baseline commit and assignment changes are written to project audit history.

## Accounting export

The accounting JSON package includes the resolved Cost Code code/name for procurement lines and payments when assigned. The export remains advisory and does not create external postings.

## Guardrails

- No AI/provider call is made by Cost Codes.
- No classification is committed during preview.
- No financial posting, payment or procurement record is created.
- Missing coverage is shown as a gap, not a green status.
- Inactive codes remain in history but cannot receive new assignments.
- Project deletion cascades the project-owned hierarchy; global users remain unaffected.

## Market direction

The implementation follows common project-controls patterns: hierarchical CBS codes, active/inactive lifecycle, import/baseline generation, and synchronization between work breakdown and cost structures.

- [Oracle Primavera Unifier CBS codes](https://docs.oracle.com/en/industries/construction-engineering/primavera-unifier/26/admin-help/cbscodes-10284772a.html)
- [Oracle CBS code integration](https://docs.oracle.com/en/industries/construction-engineering/primavera-unifier/26/integration-interface/cbscodemethods-10280478a.html)
- [Autodesk cost-item hierarchy](https://help.autodesk.com/cloudhelp/ENU/Build-Cost/files/change-orders/Cost_Cost_Items.html)
