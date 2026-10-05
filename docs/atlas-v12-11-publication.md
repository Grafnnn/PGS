# Troitsk Building 24 Atlas V12.11 Publication

## Source And Scope

- Owner-supplied final website: `3D_Атлас_Здание24_V12_11/сайт`, dated 2026-10-05.
- Source inventory SHA256: `bd93ea3927ae939fe6defda27f69083c6f2ec4a288319a3807b630c52d4c0ef3`.
- Public entry stays https://pgs-frankfurt.onrender.com/models/troitsk-building-24, without login.
- New immutable asset prefix: `/model-assets/troitsk-r25v12-11/`.
- Only the supplied website is published. Adjacent original drawings and full engineering archives remain local.
- Model metadata and node register are byte-identical to the supplied release; no geometry or element assignment changes.

## Sealed Payload

- Release: `atlas-r25v12-11`; asset: `TROITSK_B24_ATLAS_V12_11_FULL.zip`.
- 4,480 files; 321,337,615 bytes; SHA256: `4444d0edfd4a519686cfe6bb20bc6ee3d93c8a10acf9fa3ed656199cd9bcf33c`.
- 11,004 active elements, 13,325 on-demand bodies, 557 nodes, 2,950 catalogue types, 14,108 library records.
- 333 sources resolve to 299 unique source files. All 254 PDF links reference valid physical pages in six PDFs.
- 4,469 supplied files remain byte-identical. Eight files receive established publication integration repairs: startup navigation, recovery links in cards/library, public excerpt mapping, source count and compact toolbar.
- Author V12.11 PDF button mapping is preserved, not replaced. A regression executes the supplied drawing-plan and PDF-open functions with actual source metadata and lazy passports: both floor cutouts and D_ZERO_BRICK open printed sheet 55 / PDF page 65; the split AR album maps page 100 to part 2 / page 24.
- Existing ROOF_SLAB_EXIST metadata points to sheets 6/22/98; it is not reassigned based on a release-report claim. Navigation verification is not engineering approval.
- The verified eight navigation sheet labels are asserted without rewriting model data. The exact previously public six-page R13 excerpt is retained, SHA256 `2afa4d7c3b1bb2fed48d3de1be3bc6e75add72b15b306ca4bd08db6eced6349f`.

## Old URLs

The build downloads and serves only V12.11. The V12.10 route is removed; all 19 historical PGS prefixes redirect to the current index, preserving query parameters. Old atlas service workers retire only their own registration; PGS caches and sessions are untouched.

Desktop originals, Git history and historical GitHub release archives remain recovery backups, not old versions served by PGS.

## Pre-Deployment Checks

- Tests: 1,125/1,125; lint, TypeScript and production build passed. TypeScript was rechecked after regenerating stale route types. Build has the known local missing DATABASE_URL warning; no database connection or schema change was required.
- Manifest hashes, source references, PDF pages and node references passed.
- Local production HTTP: stable public entry; all 299 source targets; 57 historical redirects; 19 worker retirement responses; PDF byte ranges; isolated public assets.
- Browser: 1280x720 and 390x844; nonblank rotating canvas; no horizontal overflow; mobile drawer open/close; MU29 with 35 on-demand bodies; sheet 34 / PDF page 35 with a loaded 2200px preview; model search and library handoff.
- New hover highlight is off by default in the exercised desktop UI. No observed browser errors or warnings in the checked flow.
- Runtime deployment SHA, anonymous online checks and final CI results must be verified after merge and recorded in the PR conversation.

## Limitations And Safety

Author limitations remain, including 47 positions without confirmed placement and documented search/loading/contour limitations. This is publication verification, not a full author-feature audit or new engineering approval.

No project mutation, live AI, auth changes, database/schema/migrations, environment/secrets or manual Render configuration changes. Dirty PGS and Monolith checkouts are untouched.
