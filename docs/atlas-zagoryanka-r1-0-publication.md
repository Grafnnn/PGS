# Zagoryanka Collector Atlas R1.0 Publication

## Source And Integrity

- Publish only the approved handoff ZIP `Atlas_zagoryanka-1500_R1_0_PGS.zip`, not an earlier release folder or archive.
- Original ZIP: 15,489,553 bytes, SHA256 `408cfc2cece28aebb5cd14a6a5be29edd164f42d2b9e00751f8fc7f8ee5ea022`.
- Its 165 website files pass CRC, UTF-8 filename checks and per-file comparison against the supplied handoff manifest.
- All 165 files are byte-identical in the public package. No geometry, document, UI or assignment changes.
- Two publication metadata files are added: `CURRENT_RELEASE.json` and `MANIFEST.json`. External working directories, original estimate workbooks and service reports are not included.
- Sealed archive: `ZAGORYANKA_1500_ATLAS_R1_0_FULL.zip`, 167 files, 15,496,464 bytes.
- Sealed SHA256: `abdfb943d354372a21897f767489411fa43b16b0fdd97df0c69074cf5db4b5e6`.
- Source tree SHA256: `ff277ef1c667bd8d9ac6f4558c880530b5cc291642fcafc271176cceefc4e8da`.
- GitHub release `atlas-zagoryanka-1500-r1-0` asset size and digest match the local sealed archive.

## Independent Hosting

- Stable anonymous URL: https://pgs-frankfurt.onrender.com/models/zagoryanka-1500.
- Immutable asset namespace: `/model-assets/zagoryanka-1500-r1-0/`.
- Uses the existing release-download, hash-check and packed-response delivery contract.
- Troitsk V12.18 and DOU200 R1.27 pins, payloads and public aliases remain unchanged.
- The public allowlist includes this specific atlas only. No private PGS project is inferred, created or made public.
- Cache, worker and CSP are scoped to the atlas path; browser project storage uses `atlas:zagoryanka-1500:`.

## Model Boundaries

- 99 registry records, 111 library rows, 34 bodies: 11 in the unfolded profile and 23 in local coordinates.
- 45 planned construction stages, 11 design issues, 49 source-region variants and four PDFs.
- The route and wells do not have confirmed plan coordinates. The unfolded profile is not a surveyed site model.
- Inventory-only records, local geometry and unaccepted geometry retain their supplied statuses. Publication is not engineering acceptance.
- Construction progress is local-only; no PGS synchronization or server journal is added.

## Checks

- Local suite: 1,146 tests / 259 files pass. The unchanged Troitsk/DOU payload suites are excluded locally to avoid downloading their large archives; CI must run the full suite before merge.
- TypeScript, lint and production build pass. Build has the known local missing DATABASE_URL warning only.
- Tests check every supplied byte through the packed HTTP handler, all four PDF targets, exact page fragments, ranges, conditional requests and cross-project isolation.
- Local browser: model renders, pipe selection opens its card, and its drawing button opens TKR PDF page 12. The 390x844 card opens and remains readable; observed document width is 393px, a minor supplied 3px horizontal overflow, not silently repaired in this exact-source publication.
- Final CI, deployed SHA, Render live state and anonymous online checks are recorded in the publication PR after rollout.
- No live AI, project mutations, auth/session changes, DB/schema/migration changes, environment/secrets or Render configuration changes. Dirty user checkouts are untouched.
