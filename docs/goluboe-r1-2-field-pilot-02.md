# Goluboe R1.2 Field Pilot 02

The [public pilot alias](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) points to `/model-assets/goluboe-vodovod-r1-2-field-pilot-02/`. Field 01 remains directly addressable, with its own unchanged assets, worker scope and cache. The primary Goluboe Terrain Snapshot and the other atlases are untouched. Existing alias queries and measurement passport format are unchanged.

The new overlay labels both boundaries of PK0+00 to PK0+45, supports fitting that interval in 3D and plan, and is included in PNG capture when enabled. This is a 45 m demonstration of a 400 m route. Geometry, design documents, the existing field records, engine and PDF worker are byte-identical to Field 01. Model-derived values are not engineering acceptance.

- Source ZIP SHA-256: `43ff1111f98b6a2eab9c873024987a03aa0716a3e98831eae25fbfe78034d442`.
- Source SHA256SUMS: `ded18c88d416b813b5a51d2267703dea7584af9c7be8244ba3a982a5fbb94463`.
- Field 01 parent manifest: `0fd2700bcab9c57b90b9af96cf55413f24a5f70bf2c70649e6429a9210155768`.
- Sealed ZIP: 23614933 bytes, SHA-256 `10211efdf7e4a8d4bf8fba68c24414cb76ec2f304bb00d35277bac0a5948825c`. All 334 site files preserved; ZIP-root documentation and QA excluded.
- Public manifest: `1c7ef217bae4f1d5183e4b0f446493dabdf92ef01d15cd9e940585d0f230d301`; 335 manifest entries, 336 files including the manifest.
- Scope-local cache version `field-ff8a08a4414d`; worker SHA-256 `9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259`.

Reproduce using `scripts/seal-goluboe-r1-2-field-pilot-02.py` with the source ZIP, sealed Field 01 MANIFEST.json, and new output directory. Hosted and browser evidence will be recorded in the publication PR.
