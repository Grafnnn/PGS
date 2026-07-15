# Workflow Designer & Approval Matrix v1

## Purpose

PGS now supports project-level configurable approval routes instead of relying only on fixed module workflows. An OWNER or ADMIN creates a serial template, a MANAGER explicitly launches a run, and the current responsible role acts through a controlled `ball in court` queue.

The implementation follows the existing PGS guardrails: deterministic workflow state, explicit mutations, project permissions, transactional updates and complete audit history. AI does not create templates, launch runs or make decisions.

## Data model

- `ProjectWorkflowTemplate` stores a project-scoped reusable route.
- `ProjectWorkflowTemplateStep` stores ordered work, review or approval steps with a responsible role and due-days target.
- `ProjectWorkflowRun` stores the subject, source module, target workspace and terminal state.
- `ProjectWorkflowRunStep` is a snapshot of the template at launch time. Later template changes cannot rewrite a running or completed route.

All records cascade with project deletion. Templates referenced by workflow history cannot be deleted; they can only be deactivated.

## Permissions

- All project roles can view templates and workflow history.
- OWNER and ADMIN can create, activate, deactivate and delete unused templates.
- OWNER, ADMIN and MANAGER can explicitly launch an active template.
- MANAGER can act only on a step assigned to MANAGER.
- OWNER and ADMIN can act on any current step and can cancel an active run.
- VIEWER is read-only.

## Workflow behavior

- `approve` advances to the next step; approval of the last step closes the run as approved.
- `request_revision` requires a comment and returns the route to the previous step. On the first step, the same step is reopened.
- `reject` requires a comment and terminates the route as rejected.
- `cancel` is OWNER/ADMIN-only and terminates the route without pretending it was approved.
- Every decision is written in the project audit log inside the same transaction as workflow state.

## UI

The project tab `Процессы` includes:

- contract, billing and procurement starter presets;
- bounded step editor with roles, step types and due days;
- active/inactive template register;
- explicit workflow launch form;
- current `ball in court`, due date and target workspace;
- approve, return, reject and cancel controls;
- terminal workflow history.

## API

- `GET|POST /api/projects/:projectId/workflow-templates`
- `PATCH|DELETE /api/projects/:projectId/workflow-templates/:templateId`
- `GET|POST /api/projects/:projectId/workflows`
- `PATCH /api/projects/:projectId/workflows/:runId`

## Safety limits

- No parallel or majority-vote routing in v1.
- No email or external connector side effects.
- No AI or provider calls.
- No automatic launch from analytical findings.
- No silent Project Action creation.
- Template editing is intentionally limited to lifecycle status after creation; create a new template for a changed route so historical intent remains clear.
