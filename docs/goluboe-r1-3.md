# Goluboe R1.3

The [Goluboe field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) now points to its own `/model-assets/goluboe-vodovod-r1-3/` path. The main Goluboe alias and retired main-atlas redirects stay on the Terrain Snapshot. All earlier published field-pilot editions keep their direct paths. Troitsk, DOU200 and Zagoryanka are unchanged.

R1.3 retains the exact signed supplied site, including the display-only underground view of PK0+00 through PK0+45 and rendering updates. No new engineering approval is implied. All six source PDFs and the offline service worker match FIELD_02_UX_01 byte for byte. The offline content list and worker scope are separate from the earlier releases.

- Source ZIP SHA-256: `4541dc39a5b02e5a6436770b742ff2e51e084ba4fde9ec877ee17966d5a7131e`.
- Supplied checksum list SHA-256: `21b1ab128f55983af0a0e37d6503ea705429d7c0ea7ec0ebbc8e63d43e5d448e`.
- Sealed ZIP: 23643978 bytes; SHA-256 `721f3379631398ddab5b412768f9c821f0d4371ba1bd4e4f199316f83abb56d7`.
- Public manifest: `c967ddb475389106463e5bea52511f1fbf92cfef971aa4ac23c5c74de70f0442`; 337 supplied site files plus release metadata and the manifest.
- Offline version: `field-01319f828fba`.

Reproduce with `scripts/seal-goluboe-r1-3.py` using the source ZIP, supplied checksum list, FIELD_02_UX_01 public MANIFEST.json, and a fresh output directory.
