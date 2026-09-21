# Troitsk Atlas R25v8

Public entrypoint remains `/models/troitsk-building-24`, without login.
The active immutable asset prefix is `/model-assets/troitsk-r25v8/`.
R25v5 assets remain available at their original immutable URLs. V7 was not published.

## Sealed Source

- Archive: `TROITSK_B24_ATLAS_R25_FINAL_V8_FULL.zip`.
- SHA256: `b4522e8690c9e9dce03b1109ada99fee293dd3d5bd55bfb1b74a7459de6c7b5e`.
- Size: 825715771 bytes.
- Source manifest: 30645 payloads; 30646 published files including the manifest.
- Public release: https://github.com/Grafnnn/PGS/releases/tag/atlas-r25v8
- Preparation: `node scripts/prepare-atlas-r25v5.mjs v8` verifies the archive and every source payload before packing. The existing script name is retained for compatibility.
- The V8 manifest uses `size`; V5 uses `bytes`. Both are validated against sealed release metadata.
- User authorized online publication of V8 on 2026-09-21.

## Changes And Limits

Original V8 files are published unchanged: building/level/section navigation, separate historical models, named labels, and the 47-item unplaced queue. This task integrates the Atlas owner's sealed release and does not modify geometry or source files.

2760 catalogue packages and 10412 active world bodies are preserved. No new world placements are claimed. 47 packages lack confirmed placement, four historical R11_CF profiles remain unrecovered, and primary source evidence for 2566 is incomplete. This is not engineering approval. Source warnings and review states remain intact.

No project data, authentication, provider settings, database schema or Render configuration changes. No live AI or project mutation smoke.

## Verification Before Publication

- Archive SHA256 and all 30645 source payloads verified. Generated 25 packs / 878962672 bytes, preserving 30646 original file URLs including MANIFEST.json.
- 1165 tests in 264 files passed (`vitest run --no-cache` for shared read-only local dependencies); TypeScript, lint and production build passed. Build reported the known missing local DATABASE_URL warning.
- Real browser against the production build: whole building 10412 bodies / 1218148 triangles / WebGL; level 3 filters to 511 bodies; unplaced queue has 47 records; search 2566 opens its real 452-triangle model.
- Mobile viewport 390x844: drawer and level selection work, roof-access level shows 109 bodies, named labels visible, no document horizontal overflow. Physical iPhone not tested.
- No console errors observed. These are local checks; online verification follows deployment.
