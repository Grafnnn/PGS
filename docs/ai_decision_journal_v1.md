# AI Decision Journal & Controlled Actions v1

PGS records each structured AI Command Layer scenario as a project-scoped run. The journal makes AI output attributable and reviewable without giving the model permission to change project data.

## Recorded metadata

- project, organization, authenticated user when available;
- scenario and prompt contract version;
- sanitized user instructions;
- sanitized structured output;
- provider mode: deterministic, OpenAI, degraded, or none;
- status, duration, completion time, and sanitized error;
- user feedback and optional review comment;
- links to project actions explicitly created from recommendations.

## Safety rules

- Authentication and project permission checks run before request-body parsing.
- AI execution never creates project actions automatically.
- Creating an action requires edit access and a separate click.
- Each recommendation can create at most one linked action per AI run.
- Database URLs, provider keys, bearer tokens, passwords, and named secrets are redacted before journal storage.
- Raw provider errors are not persisted or returned.
- History and feedback remain scoped to the current project.
- Project deletion removes journal records and action links through foreign-key cascades.

## API

- `GET /api/projects/:projectId/ai-runs`
- `PATCH /api/projects/:projectId/ai-runs/:runId`
- `POST /api/projects/:projectId/ai-runs/:runId/actions`

The existing `POST /api/projects/:projectId/ai/:scenario` response now includes `journaled` and a serialized `run` when persistence succeeds. AI analysis still returns safely when journal persistence is unavailable.

## Operator notes

Apply the Prisma migration before enabling this feature in an online environment. No new environment variables, provider settings, or secrets are required.
