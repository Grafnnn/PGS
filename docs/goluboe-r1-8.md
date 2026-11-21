# Goluboe R1.8

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-8/`. The main Goluboe alias stays on Terrain Snapshot; Troitsk and prior direct release paths remain intact.

The engine, project configuration and offline manifest are the only source files changed relative to R1.7. Display geometry and source documents are unchanged. Publication is not engineering acceptance.

- Source ZIP: 23657617 bytes, SHA-256 `2aaeb9e0fbaad217cf4c13525baae9cb9e06e5ad1a9f1bc203e20510c8e9e86c`.
- Supplied checksum list SHA-256: `aa1c7e38e03c84362cd3b14a5a11d761f4825a179c19b19ee59145a0d0cfbf0a`.
- Local sealed ZIP: 23673067 bytes, SHA-256 `1d56145ee09d45114c026e08a43b2a5c4fff32095103c04cf414e7f74c1c45da`.
- Public manifest: `f6650086a23eb7e9229e332e8c6f289df94d69ccc1ae7281c560cc84a2303486`; 337 source files plus metadata and manifest.
- Offline cache: `field-6804df33c9bc`.

Production materializes the complete release from the pinned R1.3 archive, the R1.4 graphics module, the three R1.7 geometry chunks, and the exact R1.8 files and metadata under `scripts/atlas-deltas/`. Packing verifies the pinned manifest and all listed files. To reproduce the local seal, run `scripts/seal-goluboe-r1-8.py` with the source ZIP, supplied checksum list, R1.7 public manifest and a fresh output directory.
