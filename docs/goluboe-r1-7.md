# Goluboe R1.7

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-7/`. The main Goluboe alias stays on Terrain Snapshot. Existing atlas aliases and direct release paths are preserved.

Three geometry chunks contain display-mesh refinements for seven records. Nominal dimensions, placement, and packed bounds are unchanged. Only those chunks and the offline manifest differ from R1.6. The engine and graphics optimization module are unchanged. Publication is not engineering acceptance.

- Source ZIP: 23653201 bytes, SHA-256 `42e797de09a563e51679c75d837c92f8f3f2ad4ab074cdf32ef2d57e908456c6`.
- Supplied checksum list SHA-256: `8a71eaf132f08ac3b555c4d49860a57aa3a0459acf95961609e3ddf7fb354ee3`.
- Local sealed ZIP: 23668687 bytes, SHA-256 `78ce7cf662491073ef4a5d21ae0e151dea1342cc753a6abe5b5527ff476a2ef3`.
- Public manifest: `e5bc82605efbdc09ad25381948bed26b241c3820a09f1943fcb99a6847a7a438`; 337 source files plus metadata and manifest.
- Offline cache: `field-922182d99d5f`.

Production materializes the complete site from the pinned R1.3 archive, the R1.4 graphics module, the R1.6 engine, and the exact R1.7 files and metadata under `scripts/atlas-deltas/`. Packing verifies the pinned manifest and all listed files. To reproduce the local seal, run `scripts/seal-goluboe-r1-7.py` with the source ZIP, supplied checksum list, R1.6 public manifest and a fresh output directory.
