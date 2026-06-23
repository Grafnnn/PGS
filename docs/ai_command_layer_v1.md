# PGS AI Command Layer v1

AI Command Layer turns the project AI area into scenario-based management assistance instead of a free-form chat only.

## Scenarios

Supported server scenarios:

- `POST /api/projects/:id/ai/summary`
- `POST /api/projects/:id/ai/budget-review`
- `POST /api/projects/:id/ai/schedule-review`
- `POST /api/projects/:id/ai/procurement-review`
- `POST /api/projects/:id/ai/finance-review`
- `POST /api/projects/:id/ai/risk-review`
- `POST /api/projects/:id/ai/document-review`
- `POST /api/projects/:id/ai/daily-report-summary`
- `POST /api/projects/:id/ai/executive-report`
- `POST /api/projects/:id/ai/draft-text`

Backward-compatible aliases are kept for older callers where possible.

## Context

The AI context is built server-side and bounded:

- project metadata;
- aggregated budget/ВОР signals;
- delayed and upcoming schedule work;
- deficit and over-budget materials;
- active procurement requests;
- finance totals and overdue payments;
- open risks;
- daily report summaries;
- document metadata only.

Large tables are limited to top problem rows and section aggregates. Document OCR/text extraction is not implemented yet, so document analysis clearly reports that limitation.

## OPENAI_API_KEY

If `OPENAI_API_KEY` is absent, endpoints return deterministic structured management analysis and do not fail. This keeps health, smoke, tests, and local development independent from live AI.

If `OPENAI_API_KEY` is present, scenarios reuse the existing safe OpenAI wrapper to enrich the scenario summary. Provider failures return degraded deterministic results without leaking secrets.

## Guardrails

AI endpoints:

- require an authenticated/local allowed user;
- check project access through `canProject(user, projectId, "view")`;
- do not write to the database;
- do not create risks, procurement requests, documents, or payments automatically;
- return drafts and recommendations only;
- do not log API keys, database URLs, cookies, or session tokens.

## UI

The project AI tab shows scenario cards. Each card lists the data used, runs one scenario, and renders:

- status;
- summary;
- findings;
- recommended actions;
- optional draft text;
- data limitations;
- copy/retry actions.

## Smoke

Without live AI:

```bash
pnpm test
pnpm build
```

Manual endpoint check:

```bash
curl -X POST "$APP_URL/api/projects/project-demo/ai/summary" \
  -H "content-type: application/json" \
  --data '{}'
```

Live AI smoke should be explicitly approved and should run one read-only scenario on `project-demo`.

## Next Step

The natural next step is persistent `AiRun` history with prompt version, status, output JSON, sanitized error, duration, and user/project metadata. That requires a Prisma migration and should be reviewed separately.
