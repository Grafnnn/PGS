# ERP & Accounting Bridge v1

## Scope

The bridge provides a controlled exchange boundary between PGS project controls and an accounting system. It does not connect to or mutate 1C, SBIS, Kontur, or another external provider directly.

### Export

The project workspace can produce a versioned JSON package containing:

- project and contract attributes;
- procurement commitments with estimated amounts from planned material prices;
- incoming payments as the current receivables contour;
- outgoing payments as the current payables contour;
- aggregate contract, commitment, receivable, payable, and paid totals;
- explicit limitations when a procurement line has no price or a source register is not modeled separately.

Every export creates an `accounting_sync_runs` journal record and a project audit event. The export contains no cookies, tokens, environment values, or provider credentials.

### Dry-run import

Supported input files:

- XLSX / XLS;
- UTF-8 CSV;
- JSON arrays or objects with `rows`, `payments`, or `transactions`.

The first sheet is read for spreadsheet files. Header aliases cover common Russian and English names for document number, date, counterparty, direction, amount, status, purpose, and currency. v1 accepts RUB operations only and limits files to 5 MB.

Matching is deterministic:

- a saved external ID link wins when its direction and amount still agree;
- otherwise direction and amount must match;
- date, counterparty, and purpose raise confidence;
- close candidates remain `ambiguous`;
- missing candidates remain `unmatched`;
- incompatible saved links become `conflict`.

Preview stores normalized rows and matching evidence, not the original file. Preview does not update a payment.

### Confirmed apply

Apply requires project `sync_accounting` permission and an explicit confirmation. It runs in one database transaction and:

- marks only safe matched payments as paid when the imported operation is paid;
- records the imported payment date;
- creates or refreshes external payment links;
- leaves ambiguous, unmatched, conflicting, and unknown rows unchanged;
- never creates a new payment automatically;
- finalizes the sync run and writes an audit event.

A finalized run cannot be applied again.

## Persistence

- `accounting_sync_runs` stores export/import history, summary, normalized dry-run payload, actor, and apply status.
- `accounting_external_links` stores unique external-system identifiers for PGS payment records.
- Both tables cascade with disposable project deletion.

## Current limitations

- No direct provider API or credential flow.
- No automatic posting into an external ledger.
- No separate persisted invoice, purchase order, or contract-change ledger; v1 exports the current PGS project/payment/procurement contour.
- No non-RUB reconciliation.
- Unmatched accounting rows require an operator decision outside the v1 apply action.
