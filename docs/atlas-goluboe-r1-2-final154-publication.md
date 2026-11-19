# Goluboe R1.2 FINAL154 Publication

## Integrity

- Approved transport: `Atlas_goluboe-vodovod_R1_2.zip`, 23,497,608 bytes, 321 files.
- Source ZIP SHA256: `f60e553651333c23796a5cc6fc7859feccc03713874453ac242686c5f8e00dee`.
- Supplied manifest SHA256: `660bdacc42344e701f21e6c82ddf147c1f5cbc1bd5fd92313acf26757fc1c346`.
- `data/metadata-light.js` SHA256: `8d4b8ae4af19f2802d6d6b68f0fbc45294cd6a3a791061fdd2cb4eae072ac07a`.
- `project/plan-controls.js` SHA256: `61e25144432e6724ff4f1303024161ff630fe0a5d64879e4a162f1b87935e0f5`.
- CRC, UTF-8 paths, manifest hashes and extracted transport-copy comparison pass. All 321 supplied files remain byte-identical.
- Add only `CURRENT_RELEASE.json` and `MANIFEST.json`: 323 public files.
- Release tag: `atlas-goluboe-vodovod-r1-2-final154`.
- Delivery asset: `GOLUBOE_VODOVOD_ATLAS_R1_2_FINAL154_FULL.zip`, 23,512,556 bytes.
- Delivery SHA256: `4ce41514369e3791856b7fcd73ea27a696f56c19b15204e88999ff23ca19db90`.
- Source tree SHA256: `96bce23bde1c21850e72ff87a7d3ae3878dbf65bfb810da7bd53b360b3ab2c60`.

## Publication Scope

- Keep the anonymous stable alias https://pgs-frankfurt.onrender.com/models/goluboe-vodovod.
- Use a new immutable namespace `/model-assets/goluboe-vodovod-r1-2-final154/`, without overwriting the preceding R1.2 package.
- Retire R1.1 and the preceding R1.2 runtime payloads. Old URLs redirect within Goluboe; the retirement worker unregisters only itself and migrates old clients without clearing PGS or neighboring-project storage.
- Keep historical source archives immutable. Troitsk V12.18, DOU200 R1.27 and Zagoryanka R1.0 release pins and routes are unchanged.
- Goluboe-only response fix: permit fonts from this release namespace in CSP and serve its local WOFF2 files as `font/woff2`. Neighboring CSP remains unchanged; no external font hosts are allowed.

## Source Content And Limitations

- Visible revision R1.2; 154 world elements, 40 local bodies, 264 registry records, 278 library rows, 23 issues and six PDFs.
- Includes `NET-V-SUPPORT-UP-2`, pipe-support explanations and the three supplied excavation views `kv1`, `up1`, `vzu`.
- Preserve all source decisions adopted for visualization, derived placement, local/inventory-only statuses, discrepancies and engineering limitations.
- The original ZnP is not included. Publication is not engineering acceptance. Progress remains local-only with no PGS server synchronization.

## Verification

- 1,162 local tests / 260 files pass, including supplied-byte integrity, PDF count, excavation configuration, font policy/MIME, legacy redirects and worker isolation.
- Unchanged large Troitsk/DOU payload suites are excluded locally; full Node 22 CI is required before merge. Local bundled Node is 24.
- TypeScript, lint, diff check and production build pass. Build has the known missing local `DATABASE_URL` warning; full CI is required before merge.
- After automatic rollout, verify exact runtime SHA, health, every manifest hash, all five loaded fonts, neighboring release pins, old links, desktop/mobile scene controls, support cards and linked PDFs. Record observed results in the publication PR.
- No source geometry/UI edits, live AI, private project mutations, auth/session, env/secrets, DB/schema/migration or Render configuration changes. Dirty user checkouts untouched.
