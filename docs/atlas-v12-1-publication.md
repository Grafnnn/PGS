# Atlas V12.1 Public Publication

Date: 2026-10-01. Supplied release date: 2026-09-30.

Stable anonymous URL: https://pgs-frankfurt.onrender.com/models/troitsk-building-24

Only the supplied V12.1 website is packaged. The adjacent original drawing
folder is excluded. Geometry, element assignments and the 557-node register are
unchanged from the supplied release: 10,942 active elements, 11,756 on-demand
bodies and 2,950 catalogue types. This publication is not engineering approval;
47 positions remain without confirmed placement and the author's documented
geometry/naming limitations remain.

## Reproducible Package

- Release: `atlas-r25v12-1`, asset: `TROITSK_B24_ATLAS_V12_1_FULL.zip`.
- SHA-256: `affee12d6b29122615ba535cb9d46d3062f4bd3ef07e23af7585a2e066f6ee2d`.
- Archive: 321,096,315 bytes; 4,459 files.
- Source inventory SHA-256: `60eefb99c00e707aa6ac266ce992763467985a8ea21d93cbb766b4223fb8d1ae`.
- Seal: `scripts/seal-atlas-v12-1.mjs`. Build downloads and verifies this exact
  release; generated packs remain outside Git.

Integration repairs preserve the previous publication's startup-race fix,
recovery links in cards/library, split-PDF button mapping and compact toolbar.
The exact previously public R13 excerpt is restored. Eight AS.2 printed-sheet
labels are corrected against the unchanged, previously verified PDF. All 333
sources are available in both model and library.

## Verification Before Publication

- 1,122 tests passed; lint and production build passed. Build retains the known
  local missing `DATABASE_URL` warning; no database configuration was changed.
- All 333 preview/PDF sources and element/node references resolve. All 245 PDF
  links target valid pages across six mapped PDFs.
- 4,447 other source files are byte-identical; model metadata and assignments
  are unchanged except for corrected navigation sheet labels.
- Browser: rendered/rotating model, node search, MU29 card, on-demand reinforcing,
  matching AS.2 sheet 34 / PDF page 35, library source count. No observed console
  errors/warnings. Desktop and 390x844 mobile; mobile drawer works, no horizontal
  overflow. Canvas pixel check confirms nonblank output and changed rotation.
- 48 redirects across all 16 legacy prefixes passed locally. Legacy service
  workers retire only their own atlas registrations. Old entry/assets URLs
  redirect to V12.1; their old application payloads are no longer routed or
  downloaded by the build. Query strings and client-side element hashes survive.
- PDF range responses, conditional requests, HEAD, CSP, asset isolation and
  anonymous publication allowlist remain covered by tests.

Previous local source folders, Git history and historical release archives are
preserved; they are not served by PGS. No project records, auth, secrets,
environment, schema/migrations, live AI or project mutation changes.

Online verification is recorded on the publication PR after automatic Render
deployment; local results alone do not claim online publication success.
