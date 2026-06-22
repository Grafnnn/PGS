# Project Intelligence v1

Project Intelligence v1 adds a deterministic analytical layer for a construction project. It works without OpenAI and only recommends actions. It does not mutate procurement, schedule, cashflow, documents, staging, or production state.

## What It Analyzes

- Budget / ВОР: missing prices, zero quantities, duplicate normalized names, top cost concentration, amount mismatch hints from comments, material/work share.
- Schedule: overdue work, missing dates, missing responsible owner, upcoming work windows, material-linked schedule risk.
- Procurement and materials: deficits, missing supplier, missing price, needed-soon materials, possible overstock, request status counts.
- Finance: planned incoming/outgoing, unpaid and overdue amounts, possible cash gap, 7/14/30 day financing windows.
- Documents: missing contract, missing estimate/ВОР, missing design documentation, uncategorized documents, stale documents.
- Risk register: open risks from the project risk table.

## Risk Levels

- `critical`: score >= 80
- `high`: score 60-79
- `medium`: score 35-59
- `low`: score 0-34

Risk radar cards show the highest signal for each area: budget, schedule, procurement, finance, documents, and risks.

## Evidence Contract

Every generated issue and recommended action carries evidence:

- `entityType`
- `entityId`
- `label`
- `field`
- `value`
- `explanation`
- `documentId`
- `page`
- `section`
- `snippet`

Deep links are not required in v1. Evidence is readable so the user can understand why a conclusion was produced.

## Action Contract

Actions are recommendations only. They include:

- `category`
- `actionType`
- `priority`
- `title`
- `description`
- `suggestedNextStep`
- `ownerRole`
- `dueDate`
- `evidence`
- optional entity references

No real procurement request, schedule item, payment, document index, or risk is created automatically.

## AI Behavior

Deterministic analytics are always available when project data is readable.

If `OPENAI_API_KEY` is absent, the UI shows:

> AI недоступен, показана расчетная сводка

If AI is available, a manager/admin/owner can explicitly click “Сформировать AI-сводку”. The request uses sanitized context only:

- no secrets
- no cookies/tokens/passwords
- no database URLs
- no raw document content
- document metadata only
- limited evidence/action context

Provider failures return a degraded deterministic summary and never expose raw provider payloads.

## Security And Privacy

- VIEWER can read deterministic intelligence.
- VIEWER cannot create AI summaries.
- Project access is checked through existing project membership/role logic.
- Tests mock OpenAI and never call the provider.
- No staging/prod env vars are changed.
- No staging smoke or live AI smoke is run by this feature.

## Future Modules Compatibility

Current v1 only analyzes and recommends.

- Procurement v1: action types such as `material_deficit`, `request_supplier_quote`, `order_material`, `confirm_delivery`, and `investigate_overstock` are prepared, but no purchase request is created automatically.
- Schedule + Cashflow v1: action types such as `overdue_task`, `missing_dates`, `upcoming_material_need`, `upcoming_payment`, and `possible_cash_gap` are prepared, but no CPM/critical path, schedule mutation, or payment creation happens.
- Documents/RAG v1: evidence supports `documentId`, `page`, `section`, and `snippet`, but no embeddings, vector DB, external indexing, or full document AI upload happens in v1.
- Excel Import v1: when import batches become part of main, import warnings/errors can be added as `import` category evidence/actions without changing the action/evidence contract.

## Known Limits

- Quality depends on completeness of budget, schedule, material, payment, and document metadata.
- Amount mismatch detection is limited because the current budget model does not store imported source total separately.
- Cashflow is a simple forecast, not a full financial model.
- Schedule forecast is not CPM/critical path.
- Documents are analyzed by metadata only.
