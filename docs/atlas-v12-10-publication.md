# Troitsk Building 24 Atlas V12.10 Publication

## Source And Scope

- Owner-supplied final website: `3D_Атлас_Здание24_V12_10/сайт`, dated 2026-10-04.
- Source inventory SHA256: `60d0bcc7b87e0361a97129a7f6c39b51d8a5110af9d99b658750f630c07b6986`.
- Public entry stays https://pgs-frankfurt.onrender.com/models/troitsk-building-24, without login.
- New immutable asset prefix: `/model-assets/troitsk-r25v12-10/`.
- Only the website is published. Adjacent original drawings and full engineering archives remain local.
- Author model metadata and node register are byte-identical; no geometry or element assignment changes were made during integration.

## Sealed Payload

- Release: `atlas-r25v12-10`; asset: `TROITSK_B24_ATLAS_V12_10_FULL.zip`.
- 4,480 files; 321,317,921 bytes; SHA256: `9e339c3a635735e8c97dfedb977038b09bfd0058eeae9758dea28c57529725fc`.
- 11,004 active elements, 13,325 on-demand bodies, 557 nodes, 2,950 catalogue types, 14,108 library records.
- 333 sources resolve to 299 unique source files. All 254 PDF links reference valid physical pages in six PDFs.
- 4,469 supplied files remain byte-identical. Eight files receive established publication repairs: startup navigation, recovery links in cards/library, PDF mapping, source count and compact toolbar.
- V12.10 already has the verified eight navigation sheet labels; the sealer asserts them without rewriting model metadata.
- The exact previously public six-page R13 excerpt is retained, SHA256 `2afa4d7c3b1bb2fed48d3de1be3bc6e75add72b15b306ca4bd08db6eced6349f`.

## Old URLs

The build downloads and serves only V12.10. The V12.8 route is removed; all 18 historical PGS prefixes redirect to the current index, preserving query parameters. Old atlas service workers retire only their own registration; PGS caches and sessions are untouched.

Desktop originals, Git history and historical GitHub release archives are retained for recovery, not served as old PGS model versions.

## Pre-Deployment Checks

- Tests: 1,124/1,124; lint, TypeScript and production build passed. Build has the known local missing `DATABASE_URL` warning; no database connection or schema change was required.
- Manifest file hashes, source references, PDF pages and node references passed.
- Local production HTTP checks: stable public entry; all 299 source targets; 54 legacy redirects; 18 worker retirement responses; PDF byte ranges; isolated public assets.
- Browser: 1280x720 and 390x844; nonblank rotating canvas; no horizontal overflow; mobile drawer open/close; MU29 with 35 on-demand bodies; sheet 34 / PDF page 35 with a loaded 2200px preview; model search and library handoff.
- Canvas checks: desktop 17,537 colors / 123,508 changed pixels; mobile 11,884 colors / 56,674 changed pixels after rotation.
- No observed browser errors or warnings in the exercised flow.
- Runtime deployment SHA, anonymous online checks and final CI results must be verified after merge and recorded in the PR conversation.

## Limitations And Safety

Author limitations remain, including 47 positions without confirmed placement, incomplete canvas window contours and documented search/ruler limitations. Publication verification is not engineering approval or a claim that every author feature is defect-free.

No project mutation, live AI, auth changes, database/schema/migrations, environment/secrets or manual Render configuration changes. Dirty PGS and Monolith checkouts are untouched.
