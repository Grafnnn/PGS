# Goluboe R1.2 UP-1 Soil Profile

## Source And Integrity

- Approved source: `Atlas_goluboe-vodovod_R1_2.zip`, 23,504,313 bytes, 322 files.
- Source ZIP SHA256: `0c4c76ee5f5bdc6fd285247e21e4c224788a2417a7aeb0120308101dd058c2cf`.
- Supplied manifest SHA256: `680d64e604303880e5a5d3343ff44bd60edce6cb0cfc8226e6ff2eeea127d06f`.
- `project/plan-controls.js` SHA256: `cf3d2891756478cec45632ac1de3ce04de947bb348b65cf09865d08657362860`.
- `project/profile-up1.html` SHA256: `34e52613bc8fbd71a9ec2e333a55b3ad536f32f0ffaf28402e018d98b8ab21d6`.
- Unchanged metadata SHA256: `8d4b8ae4af19f2802d6d6b68f0fbc45294cd6a3a791061fdd2cb4eae072ac07a`.
- CRC, every manifest entry and extracted-copy checks pass. Against the preceding excavation release, only plan-controls/offline-manifest changed and the profile HTML was added. All mesh, elevation, registry and album bytes remain identical.
- Preserve all 322 supplied files; add only CURRENT_RELEASE.json and MANIFEST.json: 324 public files.
- Release tag: `atlas-goluboe-vodovod-r1-2-up1-profile`.
- Delivery: `GOLUBOE_VODOVOD_ATLAS_R1_2_UP1_PROFILE_FULL.zip`, 23,521,315 bytes.
- Delivery SHA256: `39ad2a5f9bf889ce3cb054a38755afda754064b7bf6952c66056c2aa3062c73c`.
- Source tree SHA256: `4b4719301b90bd65010cb07bfd60e5538ebb82e1d450884dcb72da1cb2fbbf5f`.
- Sealed manifest SHA256: `3888e86c5a23f9e5ea1270ac62ba7e44bd928f31ca824e9158f6f95f719586c4`.

## Serving Boundaries

- Keep visible revision R1.2 and anonymous stable alias https://pgs-frankfurt.onrender.com/models/goluboe-vodovod.
- New immutable namespace: `/model-assets/goluboe-vodovod-r1-2-up1-profile/`.
- Retain the safe public `pdLocate`, `pdExc`, `pdCard`, `pdPlan` behavior. `pdSoil=1` is supported by the supplied direct asset URL, not newly added to the permanent alias allowlist.
- Preserve project-local font CSP/MIME in the new namespace. Retire preceding Goluboe runtime paths through existing project-scoped redirects/worker retirement; historical GitHub archives remain immutable.
- The UP-1 overview exposes the supplied soil-overlay toggle and profile link. The overlay is an illustrative contour, not a change to the 154 source bodies.
- Preserve both source figures: geometric envelope 34.2 m3 versus 27.8 m3 in the POS schedule, the 6.4 m3 discrepancy, and the explanation that top/bottom elevations are adopted/derived from source data. Publication is not engineering acceptance or confirmation of excavation quantities.
- 154 world bodies, 40 local bodies, 264 registry records, 23 issues, six PDFs and neighboring atlas pins remain unchanged.

## Verification

- 1,176 local tests / 260 files pass. This includes source-byte integrity, profile content/links, normal-scene excavations, safe aliases, fonts and retired routes.
- Unchanged large Troitsk/DOU payload suites are excluded locally; full Node 22 CI is required before merge. Local bundled Node is 24.
- TypeScript, lint, diff check and production build pass. Build has the known missing local DATABASE_URL warning; full CI is required before merge.
- After automatic rollout, record exact runtime SHA/health, pinned online manifest and all file hashes, actual soil on/off rendering, direct soil URL, desktop/mobile profile canvas and PDF/return links, preceding views/plan and actual local fonts in the PR.
- No supplied-source edits, private project mutations, live AI, auth/env/secrets/DB/schema/migration or Render configuration changes. Dirty user checkout untouched.
