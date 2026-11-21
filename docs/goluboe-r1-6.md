# Goluboe R1.6

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-6/`. All earlier releases keep their direct paths and separate worker scopes. The main Goluboe alias stays on Terrain Snapshot. Troitsk and the other atlases are unchanged.

Only the engine and offline manifest differ from R1.5. The display-only brace geometry, source PDFs, print forms and project data are unchanged. Publication does not imply engineering acceptance.

- Source ZIP: 23640197 bytes, SHA-256 `ac9b3622146ffcdd8ec37bfb5d03c2123ddb4779ec98f72c5878915686ced01e`.
- Supplied checksum list SHA-256: `8eaaa648b001dc19d2a2761d0ae982c84d68b24d902f06ec1672c8e3b65114ce`.
- Local sealed ZIP: 23655651 bytes, SHA-256 `d784873ae54b458726dd027bff6ff8ccb1db367225da1a0be40c231f0e909bf5`.
- Public manifest: `5b1a5b31141fae560f5cf09a2b764b498501572cef188167c57cc0b54273b133`; 337 source files plus metadata and manifest.
- Offline cache: `field-9aa2252b0a1e`.

Production materializes the complete site from the pinned R1.3 GitHub Release, the R1.4 graphics optimization module, R1.5 `data/geometry_02.js`, and the two exact R1.6 files and metadata under `scripts/atlas-deltas/`. The full manifest is pinned and each listed file is verified before packing. To reproduce the local seal, run `scripts/seal-goluboe-r1-6.py` with the source ZIP, supplied checksum list, R1.5 public manifest and a fresh output directory.
