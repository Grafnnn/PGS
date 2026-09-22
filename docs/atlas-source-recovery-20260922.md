# Atlas V8 drawing source recovery

Release: `R25_V8_UI_20260922_SOURCEFIX`, immutable asset prefix
`/model-assets/troitsk-r25v8-ui2/`. The public model alias remains unchanged.

## Scope and provenance

- Restore empty Album-2 drawing controls from original passport references only.
- Preserve all 8,557 existing active-body source bindings, original passports,
  IDs, geometry, coordinates, worldAllowed flags and the sealed V8 payload.
- Restore sources for 1,840 of 1,855 active bodies with empty controls;
  15 remain unresolved because AR sheets 5/29 are not available in verified PDFs.
  Three restored active bodies have partially unresolved references, shown in UI.
- Across active, historical and helper records: 1,907 of 1,969 empty records
  receive a verified source; 62 remain unresolved, four are partial.
- Add 43 source descriptors and 31 full-page previews. Each descriptor records
  the exact PDF path, document SHA-256, page count, physical page and printed sheet.
- MB2 uses printed AS.2 sheet 57, physical PDF page 67. The facade excerpt uses
  its actual physical pages 4/5, separately identifying original full pages 16/17.
  S08 references retain the explicitly named 03.07.2026 edition.
- This is navigation repair, not a new engineering approval. No substitute
  drawing is invented for unresolved references.

## Verification before publication

- Full suite: 1,182 tests in 266 files passed; TypeScript, lint, production build
  and whitespace checks passed. Build retained the known local DATABASE_URL warning.
- Audited 280 available original/recovered source descriptors: image paths and
  decodes, PDF existence, hash and page bounds passed without errors.
- Desktop real clicks: MB2, facade and S08 shaft; correct images displayed.
- Mobile 390 x 844: MB2 search, selection and source button passed; preview loaded
  at 2,200 px, document width remained 390 px. Full PDF link targets page 67.
- Old immutable UI assets remain unchanged; a new pack inherits sealed V8/UI1
  data, with integrity-checked source-navigation overrides only.
- Offline addendum: the new release generates its own versioned manifest and
  precaches the current UI plus registry/runtime. Redundant UI query versions
  were removed inside the new immutable prefix so the opt-in worker can cache
  those assets. The final focused regression suite passed 8/8 tests.
- Native PDF rendering was unavailable in the in-app browser. The real click
  opened the correct PDF URL; HTTP byte-range response was 206 with a valid PDF
  signature. Embedded drawing previews loaded correctly. Full offline coverage
  and native PDF-viewer rendering are not claimed.

Online deployment and smoke are to be recorded after CI/merge, not implied by
these local results. No database, secrets, auth or provider changes.
