# Troitsk Building 24 Atlas V12.18 Publication

## Source And Scope

- Owner-supplied website V12.18, dated 2026-10-23: 4,658 supplied files.
- Source inventory SHA256: `5c8acf1ec95b5524e18923b765e9d4b46da3c0c2e570fba1cecbbe18def1cf15`.
- Stable anonymous URL: https://pgs-frankfurt.onrender.com/models/troitsk-building-24.
- Current immutable prefix: `/model-assets/troitsk-r25v12-18/`.
- Only the website is published. Adjacent original drawings and engineering archives remain local.
- Model geometry, metadata and element assignments remain byte-identical to the supplied website.
- DOU200 R1.27 remains independently pinned and unchanged.

## Sealed Payload

- GitHub release: `atlas-r25v12-18`.
- Archive: `TROITSK_B24_ATLAS_V12_18_FULL.zip`.
- 4,661 files; 419,472,395 bytes.
- SHA256: `329b84daa82dbd74b1b7153dc0ccb891a3f27dbab9f1f0a9d3cd22eac7c407f5`.
- All supplied files remain unchanged except five established source-link integration files.
- The previously public R13 excerpt is retained with its existing SHA256; no additional original drawing archive is exposed.
- 396 drawing sources and 559 unique nodes are checked against published assets and metadata.
- All 222 OV.ITP pages retain their mappings into the six lossless PDF parts.
- V12.16 and V12.17 join the historical URL redirects. Only V12.18 and DOU R1.27 have active payload routes. Old workers retire only their own registrations.

## Construction Progress Boundary

- Supplied Atlas core 1.0.18 includes the construction progress interface, 20,840 item records, 10,961 body IDs and a 14-stage plan.
- The supplied plan passes its own schema validator. No journal events are included in the release.
- Current main has no `/api/progress/<slug>` server implementation. This publication does not add it, change the database or relax the asset-only CSP.
- Local browser storage and exports are not PGS project progress. Server synchronization, authenticated journal mutations and payroll/report integration are not claimed.

## Verification And Safety

- Sealer verifies the source inventory and byte preservation, and checks the sealed archive manifest.
- Focused regressions cover drawing recovery, PDF mappings, the supplied plan, public asset isolation, stable URLs, worker retirement and separate DOU routing.
- Local suite: 260 test files, 1,158 tests passed. TypeScript, lint and production build passed, with only the known missing local DATABASE_URL warning at static generation.
- Local browser: model renders and rotates at 1280x720; 390x844 has no horizontal overflow and the model drawer opens/closes. OV.ITP sheet 26 preview loads at 2200x1556 and opens part 2 / page 15 (original PDF page 31).
- Construction progress opens, selects the roof stage and shows the supplied 360-body scope without writing project facts. No browser errors observed in the checked local flow.
- Final CI, production build, desktop/mobile browser evidence and deployed runtime SHA are recorded in the publication PR after verification.
- Author limitations remain, including 47 positions without confirmed placement and open engineering questions. Publication is not engineering acceptance.
- No live AI, project mutation, auth/session changes, DB/schema/migrations, environment/secrets or manual infrastructure changes. Dirty user checkouts are untouched.
