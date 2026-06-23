# AI-assisted VOR Import v1

AI-assisted VOR Import v1 closes the first production workflow for uploading a ВОР/estimate into PGS:

1. Upload Excel file.
2. Detect sheets and headers.
3. Review and adjust column mapping.
4. Preview normalized rows with errors and warnings.
5. Generate AI or deterministic explanation.
6. Commit data transactionally.
7. Review import audit/history.

## Supported Formats

- `.xlsx`
- `.xls`
- `.xlsm` as workbook data only

Macros are never executed. Formula cells are not recalculated server-side; PGS reads cached values saved in the workbook.

The upload limit is 15 MB for Excel import preview.

## Wizard

The project budget tab includes a wizard:

- Upload: file picker and preview action.
- Sheets: detected sheets, row counts, sheet type, confidence and include/exclude checkbox.
- Mapping: detected source columns mapped to target fields.
- Preview: first 160 filtered rows with status, entity type, values and suspicious flags.
- AI / Explanation: AI summary when OpenAI is configured; deterministic fallback otherwise.
- Commit: append or replace modes with explicit confirmation.
- Result: commit counters and import history.

## Auto-detection

The parser detects Russian headers below title blocks, including:

- `№`, `N`, `п.п.`
- `Шифр`, `Код`, `Обоснование`, `Расценка`
- `Наименование`, `Наименование работ`, `Виды работ`, `Ресурс`, `Материал`
- `Ед. изм.`, `Ед.`
- `Количество`, `Объем`, `Кол-во`
- `Цена`, `Цена за ед.`, `Ед. расценка`
- `Стоимость`, `Сумма`, `Всего`
- `Раздел`, `Локальная смета`, `Глава`, `Этап`
- `Примечание`

Russian number formats are normalized, including `1 234,56`, `1.234,56`, `1234,56`, `1 234 567` and `1 234,00 руб.`.

## Validation

Blocking errors:

- unsupported file type;
- file too large;
- unreadable workbook;
- no importable rows;
- invalid project access;
- commit of already committed batch;
- replacement mode without confirmation;
- rows with invalid required quantity or negative price.

Warnings:

- amount mismatch between quantity x price and total;
- duplicate normalized budget rows;
- hidden rows skipped by default;
- formula cells read from cached values;
- unknown rows;
- missing or low-confidence mapping;
- skipped total rows such as `Итого`, `Всего`, `НДС`, `Сметная стоимость`.

All messages are user-facing and in Russian.

## Commit Modes

- `append`: adds new budget/material/schedule rows.
- `replace_budget`: replaces only project budget rows and sections.
- `replace_materials`: replaces only project materials.
- `replace_budget_materials`: replaces only budget and materials.

Legacy `replace_schedule` and `replace_all` are still supported by the backend for compatibility, but the wizard exposes only the safer first four modes.

Every commit is executed in a Prisma transaction. Repeated commit is blocked after the batch becomes `committed`.

## Audit And History

`ImportBatch` stores:

- file metadata;
- parser version;
- sheet and mapping summary;
- structured preview rows;
- warnings and errors;
- explanation status;
- commit result counters.

The history API returns sanitized import metadata and preview details without raw binary files.

## AI Explanation

AI is optional. Import never depends on OpenAI.

When `OPENAI_API_KEY` is set, PGS sends only a bounded sanitized import context:

- file name and size;
- sheet names and mapping;
- counts and summary;
- first 30 preview rows;
- warning/error summaries.

PGS never sends env values, cookies, tokens, passwords, `DATABASE_URL`, raw binary files or unbounded workbook content.

If OpenAI is unavailable or returns invalid output, the wizard shows deterministic fallback with degraded status.

## Security

- Preview requires project import access.
- Remap and commit require project import access.
- History/details require project view access.
- VIEWER cannot commit.
- All import batches are scoped by `projectId`.
- No upload is stored in `public`.
- No raw binary file is returned.
- Tests do not perform live OpenAI calls.

## Project Intelligence Readiness

Preview rows include structured flags for future Project Intelligence:

- `duplicate`
- `amountMismatch`
- `missingPrice`
- `missingQuantity`
- `unknownClassification`
- `skippedTotalRow`
- `hiddenRow`
- `lowConfidence`
- `negativeValue`

Future analytics can consume import warnings, normalized rows and commit history without reparsing the original workbook.

## Limitations

- Import quality still depends on the source Excel structure.
- Merged-cell section propagation is heuristic through section rows and explicit section columns.
- Supplier search, automatic procurement creation and full schedule/cashflow generation are not part of v1.
- Official КС forms are not generated from imported rows.
