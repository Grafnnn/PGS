# Goluboe R1.5

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-5/`. R1.4 and earlier releases keep their direct paths and separate worker scopes. The main Goluboe alias stays on Terrain Snapshot. Troitsk and other atlases are unchanged.

Only the engine, `data/geometry_02.js` and offline manifest differ from R1.4. R1.5 adds SSAO and shadows in WebGL High. The display-only brace update affects five records and is not engineering acceptance. Source PDFs, print forms and other project data are unchanged.

- Source ZIP: 23639610 bytes, SHA-256 `9f40d2a760af5d5cd9bab248a1f4be4ae5a42596eb475445cbc2114182334b73`.
- Supplied checksum list SHA-256: `beed8bca9b54be3a85b67706c118b2e659494b102dfda8ec7d5f5187a0aefed4`.
- Local sealed ZIP: 23655095 bytes, SHA-256 `e5982a893e6e070a4941b79227de7f4d59662497e33da6c5ded50764546e8335`.
- Public manifest: `b3e7edd1eeeed6a9955b8222a7fce192781e0dd9f40e9718ebbe9ed3f86b1388`; 337 source files plus metadata and manifest.
- Offline cache: `field-0ed55a424c70`.

Production reconstructs the exact site from the pinned R1.3 GitHub Release ZIP, the unchanged R1.4 graphics optimization module, and the R1.5 files under `scripts/atlas-deltas/`. The full manifest is pinned and each payload is verified before packaging. To reproduce the local sealed archive, run `scripts/seal-goluboe-r1-5.py` with the source ZIP, supplied checksum list, R1.4 public manifest and a fresh output directory.
