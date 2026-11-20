# Goluboe R1.2: targeted mobile width fix

Date: 2026-11-20. Stable public entry: https://pgs-frankfurt.onrender.com/models/goluboe-vodovod

## Exact Delta

- At widths up to 1000 px, `.as-tools` no longer shrinks below the 48 px search button. Before: viewport 390 px, document 395 px. After: 390/390.
- At widths up to 480 px, profile method labels wrap. The 320 px profile document previously extended to 336 px. After: 320/320. The table itself was not the source.
- The offline manifest has a new build identity and corrected byte sizes. No blanket overflow clipping, font reduction, geometry, source figures, JavaScript behavior or PDF changes.
- 323 of 326 supplied files remain byte-identical. The three changes are `assets/atlas-shell.css`, `project/profile-waterline.html`, and generated `assets/offline-manifest.js`.
- Existing Goluboe paths redirect to the new immutable namespace. Neighboring atlases and private project assignments are unchanged.

## Integrity

- Source archive: `21ecc601029163bdf02e06406b65790387a37e6056e29bccbc093c84e1d13f2f`.
- Upstream tree: `1e5c15d19407c3f9ab644e504d07c37dc800fa1c13a331b61d4c51d6136b1431`.
- Corrected tree: `d074463af737cbcf29af87acfd7767036a4f5694f045ff875b941da8ec0442f8`.
- Sealed ZIP: 23,541,636 bytes, SHA-256 `8eb4bcda78abb786a57b7216a2971ed246d1ce540d7cc485aae92fd49f485f8a`.
- Public manifest: `b846ff31f0c086c4cfefe5c2553fff65384601853a879a94b290c2066c44cde9`; 328 files including 327 manifest entries, six PDFs and five WOFF2 fonts.
- Offline cache: `pkg-e1282708e5e4`.
- Release tag: `atlas-goluboe-vodovod-r1-2-mobile-fit`. Reproduce using `scripts/seal-goluboe-r1-2-mobile-fit.py` with the pinned original ZIP, source manifest, isolated two-CSS-edit copy and an empty successor output path.

## Verification

Local browser: main viewport/document widths match at 320, 360, 375, 390, 414, 768, 850, 1000, 1024 and 1440 px. Search and mobile menu remain inside the 320 px viewport. Profile widths match at 320, 360, 390, 768 and 1440 px. Overview, remarks, library, catalogue, UP-1 profile and KV-1 section fit at 320 and 390 px.

Local checks: 1227 tests in 262 suites passed, excluding only the two unchanged Troitsk/DOU payload suites whose local caches are absent. Next production build and its lint/type checks passed; expected local missing-DATABASE_URL warning remains. Full hosted CI is required before merge. Online verification follows deployment and is recorded in the PR discussion; this document does not claim a deployment before it occurs.

No engineering acceptance is added. Source discrepancies, adopted visualization alternatives, local/inventory-only geometry status, absent original ZnP and local-only progress remain qualified as in the supplied release. No live AI, project mutation, DB/schema, secrets or manual deployment changes.
