# Goluboe R1.10

The [main Goluboe link](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod) and the [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) both target the same immutable `/model-assets/goluboe-vodovod-r1-10/` release. The [R1.2 Terrain Snapshot](https://pgs-frankfurt.onrender.com/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/index.html), Troitsk and prior direct release paths stay intact.

Compared with R1.9, only the engine, offline manifest, release label, field overlay, plan controls, terrain tools and underground viewer changed. Source geometry and documents are unchanged. Publication is not engineering acceptance.

- Source ZIP: 23671870 bytes, SHA-256 `4c53cac43c8074ac86982cb96bd6a5772c2f72524061bf68ee43b11f81c8b6b8`.
- Supplied checksum list SHA-256: `20bd393d6a17de0580d071c3e40b9da57c9356db47ce3940dd168ad62bacc25c`.
- Local sealed ZIP: 23687987 bytes, SHA-256 `eb4b37b4f7fc11eb574410c4c5569c28878ce127159d7ba755dfbf4d8ef3f9b0`.
- Public manifest: `47c15c45919f21d3ce2c04ccb081408a94f52da5aae47f0c1167ea7904feacd2`; 337 source files plus metadata and manifest.
- Offline cache: `field-bf0d5282df7a`.

Production materializes the complete release from the pinned R1.3 archive, graphics from R1.4, three geometry chunks from R1.7, configuration from R1.8, the field UI and waterline profile from R1.9, and the exact R1.10 overrides and metadata. Packing verifies the pinned manifest and every listed file. To reproduce the seal, run `scripts/seal-goluboe-r1-10.py` with the source ZIP, supplied checksum list, R1.9 public manifest and a fresh output directory. Keep the supplied unpacked tree beside the ZIP for byte comparison.
