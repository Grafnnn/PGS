# Goluboe R1.2 General-Scene Excavations

## Approved Source

- Transport ZIP: `Atlas_goluboe-vodovod_R1_2.zip`, 23,499,088 bytes, 321 files.
- Source ZIP SHA256: `bb03067212f69191765fca10cd2ea1cc56597592bbdb313d3b7a4fe8c8cd6941`.
- Supplied manifest SHA256: `368110985861e15e6cac64375ac996fa504804e777ac9690838182183806faf1`.
- `project/plan-controls.js` SHA256: `586b88d97c4aa8d722fd2f75daaac7afacaa8bf20f882a32fef1d607bb297783`.
- `data/metadata-light.js` SHA256: `8d4b8ae4af19f2802d6d6b68f0fbc45294cd6a3a791061fdd2cb4eae072ac07a` (unchanged).
- CRC, all manifest hashes and extracted transport-copy checks pass. Against FINAL154, only `project/plan-controls.js` and `assets/offline-manifest.js` changed upstream; all geometry, elevations, registry data and PDFs are identical.
- All 321 approved source files remain byte-identical in the delivery. Add only two delivery metadata files: 323 public files.
- GitHub tag: `atlas-goluboe-vodovod-r1-2-excavations`.
- Delivery asset: `GOLUBOE_VODOVOD_ATLAS_R1_2_EXCAVATIONS_FULL.zip`, 23,515,984 bytes.
- Delivery ZIP SHA256: `c715650767d354c03dc14445b5e22774b42493dfdd5d6b5d0582ff415ec45525`.
- Source tree SHA256: `a3f3347b8fccdeb7f539d7a7f3a040b2092a4e47f51780b41f302ded6ee44e8e`.

## Serving Scope

- Keep visible revision R1.2 and stable anonymous alias https://pgs-frankfurt.onrender.com/models/goluboe-vodovod.
- Use the new immutable namespace `/model-assets/goluboe-vodovod-r1-2-excavations/`.
- Retire previous Goluboe runtime namespaces, including FINAL154, with existing project-scoped redirects and worker retirement. Historical GitHub archives stay immutable.
- Retain the existing three `pdExc` views, `pdCard` and `pdPlan`. Allow only `pdLocate=kv1|up1|vzu` on the Goluboe alias; private routes and other projects ignore these flags.
- Retain Goluboe-only local font CSP and WOFF2 MIME under the new namespace. No external fonts or changes to neighboring CSP.
- Source overview now shows rims, vertical walls, floors and shoring in the general scene. The `Выемки` panel focuses within the general model. UP-1 reference cards link to `?pdLocate=up1`; this does not isolate the excavation from its context.
- 154 world elements, 40 local bodies, 264 registry records, 23 issues and six PDFs remain. Engineering/derived-placement warnings and local-only progress are preserved. Publication is not engineering acceptance.

## Verification

- 1,174 local tests / 260 files pass, including every supplied byte, all five general-scene rims, safe locate query handling, old links, PDF sources and local fonts.
- Unchanged large Troitsk/DOU payload suites are excluded locally; full Node 22 CI is required before merge. Local bundled Node is 24.
- TypeScript, lint, diff check and production build pass. The build has the known missing local `DATABASE_URL` warning; full CI is required before merge.
- After automatic rollout, record runtime SHA/health, all online manifest hashes, default overview, UP-1 context focus, card link, specialist views, plan, actual font rendering and 390px mobile results in the PR.
- Troitsk V12.18, DOU200 R1.27 and Zagoryanka R1.0 source pins are unchanged. No source-byte edits, private project mutations, live AI, auth/env/secrets/DB/schema/migration or Render configuration changes. Dirty user checkout untouched.
