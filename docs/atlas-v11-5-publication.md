# Atlas V11.5 publication

## Scope

- Owner-supplied `3D_Атлас_Здание24_V11_5/сайт`, release date 2026-09-30.
- Stable anonymous URL: `/models/troitsk-building-24`.
- Current assets: `/model-assets/troitsk-r25v11-5/`.
- All 15 previous PGS asset prefixes redirect to the current entry. Old service workers migrate their own clients and unregister, without clearing PGS sessions or unrelated caches.
- Only V11.5 is packaged in new deployments. Local source folders and Git history are not deleted.
- The adjacent original-drawing folder and full engineering archive are excluded.

## Sealed Payload

- 4,419 files; archive 318,764,758 bytes.
- SHA256: `4fcc856890de6159e3fafa8349183733581bb8b726a7e79eae5057dc59a6cdfd`.
- Input website inventory SHA256: `0de2bdaa0ec71d369de84d6fffb5644fce3280e4828d50c9273c458c68a24b3c`.
- 10,703 active building elements, 1,463 on-demand reinforcement bodies, 2,950 catalogue types.
- Reproducible integration procedure: `scripts/seal-atlas-v11-5.mjs`. No geometry or element/source assignments changed from the supplied release.

## Integration Repairs

- Make review navigation insertion independent of asynchronous startup order.
- Reuse the supplied source-recovery assignments in model cards and the drawing library.
- Expose the release's additional drawing sources in the library: 329 total.
- Route alternate-page PDF buttons through the supplied split-album mapping; do not open archive-only targets.
- Restore one exact previously public PDF excerpt for two existing facade source links, verified by SHA256.
- Correct eight printed-sheet labels against the identical AS.2 PDF and update stale release/date metadata.
- Preserve the existing compact toolbar through 1,400px.

## Local Verification

- Production build, type checking, lint and all 1,120 tests passed. Local build emits the known missing DATABASE_URL warning; no database is used for Atlas delivery.
- All 329 source entries resolve their available previews/PDFs to 295 existing website files; no missing assigned source keys in model metadata.
- PDF page bounds checked against the included albums; split AR page 100 maps to part 2, page 24.
- 45 HTTP redirect checks across 15 old prefixes passed, including old asset/PDF paths; stable alias returns the new entry.
- Browser: building rendering, keyboard rotation, section navigation, 491-body on-demand reinforcement, element card and AS.2 sheet 52/PDF page 62 preview passed. Preview loaded at 2,200 x 1,555 pixels.
- Browser: 1,280px desktop and 390 x 844 mobile, working drawer, no page horizontal overflow or observed console errors. Screenshot pixel comparison confirms a nonblank moving model.
- Publication and post-deploy verification are separate from these local results.

## Limitations

47 unplaced positions and supplied engineering/naming limitations remain explicit. Navigation verification does not certify engineering correctness. This task does not change project records, auth, environment variables, database/schema, or AI behavior.
