# Atlas V12.8 Public Publication

Date: 2026-10-04. Supplied release: final V12.8c website packaged as V12.8.

Stable anonymous URL: https://pgs-frankfurt.onrender.com/models/troitsk-building-24

Only the website from the owner's `3D_Атлас_Здание24_V12_8` online folder is
published. The adjacent original drawing folder and working archives are excluded.
Geometry and assignments remain as supplied: 11,004 active elements, 13,325
on-demand bodies, 557 nodes, 2,950 catalogue types. This is not engineering
approval; 47 positions without confirmed placement and the author's documented
search/loading limitations remain.

## Sealed Package

- Release: `atlas-r25v12-8`; asset: `TROITSK_B24_ATLAS_V12_8_FULL.zip`.
- SHA-256: `1d00f7483302c39af853f4b15927a75caaa15542f0bfc90fa6f34c914f46bc0c`.
- Archive: 321,251,124 bytes; 4,480 files.
- Source inventory SHA-256: `3023884702990e1215f9c5fa195204c2a39b494f7e48b464830ac3dea900ff4b`.
- Seal: `scripts/seal-atlas-v12-8.mjs`. Build downloads and verifies this exact
  archive. Generated packs are not committed.

Publication preserves the established integration repairs: navigation startup,
verified recovery links, split-PDF button mapping, compact toolbar and the exact
previously public R13 excerpt. Eight AS.2 printed-sheet labels retain the previous
verification against the unchanged PDF. All 333 sources are available in the
model and library; new explicit V12.8 assignments take precedence over recovery.
No new engineering assignment is inferred.

## Pre-Deployment Verification

- 1,123 tests passed across 259 files; lint, typecheck and production build passed.
  The known local missing `DATABASE_URL` warning remains; no database settings
  were changed.
- 4,468 other website files are byte-identical. Canonical model metadata is
  unchanged except for the verified sheet labels; node data is byte-identical.
- All 333 preview/PDF sources and node/element references resolve. 245 PDF links
  target valid pages in six mapped PDFs, spanning 299 unique source files.
- Browser at 1280x720 and 390x844: rendered model, MU29 card, 35 reinforcing
  elements, matching AS.2 sheet 34 / PDF page 35, loaded drawing preview,
  `АС2 24` search and library transfer (8 header results, 9 library results),
  mobile drawer open/close, no horizontal overflow or observed console warnings
  or errors.
- Tests cover all 17 legacy prefixes including V12.1, retirement of only their
  own service workers, query/hash preservation, PDF ranges, HEAD, ETag, CSP,
  asset isolation and the explicit anonymous publication allowlist.

PGS routes/build serve only V12.8. Previous application payloads are removed from
the served release; old URLs redirect to V12.8. Local originals, Git history and
historical GitHub release archives are preserved and are not served by PGS.

No project mutation, auth, environment/secrets, DB/schema/migrations or live AI
changes. Automatic Render deployment and anonymous online verification are
recorded on the publication PR afterward; local results do not claim online GO.
