# Goluboe R1.2 Waterline And Well Sections

## Source And Integrity

- Approved source: `Atlas_goluboe-vodovod_R1_2.zip`, 23,496,708 bytes, 324 files.
- Source ZIP SHA256: `c12af241d8c5a531b90114758d84d5fe5b912e52b1b021240830ff89562ef223`.
- Supplied manifest SHA256: `afdbe83ecae8458b0afcb2b0fccd6478ce6aaaafa5fb660b0f73b5ca98110f23`.
- `project/plan-controls.js`: `f0cd12da1b8a2f5e4f51d5febd65c75446a5cee46cb666c0d619493a808e61dc`.
- `project/profile-up1.html`: `760f9f49b6e6f642f91c281165a7305725ea9644b4ffb859ef79754142178da5`.
- `project/profile-waterline.html`: `485308ed15e2d494eb2a369f7b55770d92fb3e59d351769140a208ec557f2cc9`.
- `project/section-kv1.html`: `c552cb4766108eb1d1c7de94004241e5feccf7d7be4c631dc399447150931977`.
- `assets/offline-manifest.js`: `4d5062e4c16bf07ba527fff54eac7a42dfbfd43f4c9a5996d47043dfaf6986dd`.
- Unchanged metadata: `8d4b8ae4af19f2802d6d6b68f0fbc45294cd6a3a791061fdd2cb4eae072ac07a`.
- CRC, all source manifest entries and extracted-copy comparisons pass. Compared with UP1_PROFILE, exactly two pages are added and three declared files changed. Geometry, elevations, registry and all six PDFs remain byte-identical.
- All 324 supplied files are preserved. Only CURRENT_RELEASE.json and MANIFEST.json are added: 326 public files, 325 manifest entries.
- Release tag: `atlas-goluboe-vodovod-r1-2-sections`.
- Delivery: `GOLUBOE_VODOVOD_ATLAS_R1_2_SECTIONS_FULL.zip`, 23,531,940 bytes.
- Delivery SHA256: `07813a7eb427fdd6dde7fff8c661615c9ee37cd2778d848a372e82d4d4131fe1`.
- Source tree SHA256: `dd9df357def9455b79a5eabd813b55a4f08a93e54fa304f36c07a906a729f1a3`.
- Sealed manifest SHA256: `708598aed468f60ce6965c053cae602a53114c33447036b7480ca09eeb3e4aed`.

## Serving Boundaries

- Visible revision remains R1.2. Anonymous stable alias: https://pgs-frankfurt.onrender.com/models/goluboe-vodovod.
- New immutable namespace: `/model-assets/goluboe-vodovod-r1-2-sections/`.
- The stable alias retains `pdSoil=1` only with `pdLocate=up1`. Other values, unsupported context and unknown query keys are discarded. Existing pdExc/pdCard/pdPlan handling is unchanged; other atlases do not receive Goluboe flags.
- Preserve scoped local-font CSP/MIME, PDF ranges, conditional caching and private-path rejection. Retire UP1_PROFILE runtime through existing project-scoped redirects and worker retirement, without deleting immutable GitHub archives.
- 154 world bodies, 40 local bodies, 264 registry records, 278 library records and 23 issues remain unchanged. No new engineering acceptance.
- Preserve approximate pickets, interpolated interval boundaries, different profile scales and calculated axis/invert convention. Missing source values remain missing.
- Preserve KV-1 model-adopted slab elevations and its 640 mm excavation/base discrepancy requiring designer verification. Preserve UP-1 geometric 34.2 m3 versus POS 27.8 m3, a 6.4 m3 discrepancy.
- Troitsk, DOU200 and Zagoryanka release pins and payloads remain unchanged. No supplied-source edits, private project mutations, live AI, auth/env/secrets/DB/schema/migration or Render configuration changes. Dirty user checkout untouched.

## Verification Gates

- Focused tests cover byte integrity, all three pages and local links, exact pipe levels, source qualifications, fonts, alias allowlisting and retired routes.
- Local regression: 1,187 tests across 260 files pass. Lint and production build pass, with the known missing local DATABASE_URL build warning. Unchanged large Troitsk/DOU payload suites are excluded locally; full Node 22 CI is required before merge.
- After automatic rollout, record exact runtime SHA, health, all online manifest sizes/SHA256, all three HTML pages and links, actual desktop/mobile canvases, interval presets, decimal-comma custom interval, invalid interval recovery and pdLocate/pdSoil on/off behavior in the PR.
- Native browser PDF rendering was previously blocked by the client. Verify unchanged PDF bytes and 206/416 HTTP behavior; do not change client security settings or claim visual PDF acceptance.
