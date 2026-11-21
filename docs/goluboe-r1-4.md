# Goluboe R1.4

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-4/`. R1.3 and all previous releases keep their immutable direct paths. The main Goluboe alias stays on Terrain Snapshot; Troitsk and the other atlases do not change.

Only the graphics optimization module and offline manifest differ from R1.3. Smoothing starts after two animation frames. The offline cache identity is `field-e0fc8c9ac634`. Geometry, measurements, print forms, documents and qualifications are unchanged. Publication is not engineering acceptance.

- Source ZIP SHA-256: `5b9e1b2ff3632ea3491ad291148dd13ae63301e4f182c51870bc9f8b5799d968`.
- Supplied checksum list SHA-256: `e6f9b8ff45d5c5b62317418057e30453d592963baa0c40cfaf5892baec8d6089`.
- Local sealed ZIP: 23643981 bytes, SHA-256 `bf427acc553ca42a24a814879db9c4d0eab6644562f55f8dfa425f0712eea7ba`. Production reconstructs the same site from the pinned R1.3 GitHub Release archive and four exact files committed under `scripts/atlas-deltas/`. The materialized manifest and every item are verified before packing.
- Public manifest: `f6df69c6463f2decb7e3ebd50f5300ba506e2ff8aab966493f51781761459927`; 337 original files plus release metadata and manifest.
- Reproduce with `scripts/seal-goluboe-r1-4.py`, passing the source ZIP, supplied checksum list, R1.3 public manifest and a fresh output directory.
