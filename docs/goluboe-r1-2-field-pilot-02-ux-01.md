# Goluboe R1.2 Field Pilot 02 UX 01

The [stable pilot link](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) now targets `/model-assets/goluboe-vodovod-r1-2-field-pilot-02-ux-01/`. FIELD_01, FIELD_02, the main terrain snapshot and neighboring atlases remain independently available.

This release contains the field UX audit corrections: station cards, measurement controls and passport, both A4 print forms and field offline progress. It preserves all 334 site paths, geometry, PDFs and the existing worker; eight presentation and offline-script files changed. Geometry and model values are not engineering acceptance.

- Source ZIP SHA-256: `b63456d28031fafd10a02eba7d7725c2ca2a9ffa3a5b76a0167de7359d5a5ef1`.
- Source SHA256SUMS: `63a2612d4c34c147b2279c010c7a9324a6153cdd9d913252c56ed9c8de2b46a2`.
- FIELD_02 public parent manifest: `1c7ef217bae4f1d5183e4b0f446493dabdf92ef01d15cd9e940585d0f230d301`.
- Sealed ZIP: 23627927 bytes; SHA-256 `0aa27fb0377e8ec98de65f7988bd021b1c70a347eb1bc41c634111b21b5c5f45`.
- Public manifest: `64862d0b28d32c43469f3b1ef3a7c77590c41d6d976ec59bd1a74c486e2f67b5`; 335 checked entries, 336 files including the manifest. Root support and QA files are excluded.
- Offline version: `field-e58fc482c96a`, independent worker scope.

Reproduce with `scripts/seal-goluboe-r1-2-field-pilot-02-ux-01.py` using the source ZIP, FIELD_02 public MANIFEST.json, and a fresh output directory.
