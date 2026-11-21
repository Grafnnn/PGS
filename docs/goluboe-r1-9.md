# Goluboe R1.9

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-9/`. The main Goluboe alias stays on Terrain Snapshot; Troitsk and prior direct release paths stay intact.

Relative to R1.8, the engine, field UI, plan controls, field overlay, waterline profile and offline manifest are the only source changes. Display geometry, project configuration and source documents are unchanged. Publication is not engineering acceptance.

- Source ZIP: 23667453 bytes, SHA-256 `6f44734eade603893e1fc41f50e519870701e2e1781e8ff2395d12729ffb4718`.
- Supplied checksum list SHA-256: `64e86a44d0a506c2f628fabda1e2f96050c86e4e815700e559ee892148a19bf1`.
- Local sealed ZIP: 23682875 bytes, SHA-256 `9f260e430f427b05133c5a42206850106f802180517697fea5abf499006ccf1b`.
- Public manifest: `42b28ffa312074b7b61ef37b26a46f025d0fd04f67a4948a23c9704ae3dbe18e`; 337 source files plus metadata and manifest.
- Offline cache: `field-91e81891091d`.

Production materializes the complete release from the pinned R1.3 archive, the R1.4 graphics module, the three R1.7 geometry chunks, the R1.8 project configuration, and the exact R1.9 overrides and metadata. Packing verifies the pinned manifest and every listed file. To reproduce the seal, run `scripts/seal-goluboe-r1-9.py` with the source ZIP, supplied checksum list, R1.8 public manifest and a fresh output directory. Keep the supplied unpacked tree beside the ZIP for byte comparison.
