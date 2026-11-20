# Goluboe R1.2: terrain layers in downloaded PNGs

[Permanent public entry](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod).
The asset prefix is `/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/`.
Old Goluboe links retain the existing redirects and query behavior. Other atlases are unchanged.

Ordinary and HQ PNG export paint the enabled contours, elevation labels, vertical depth line and measurement note onto the image before encoding. The overlay follows the visible scene and does not include interface controls. The engine change is confined to the supplied Goluboe package.

Local browser at 320 px: the actual PNG from Tools > Camera and view saving > Snapshot shows depth 3.34 m, point +202.50 m, terrain +205.84 m and contour labels. Geometry, profile data, mobile wrapping and the six PDFs remain identical to Terrain Depth. Model-derived values are not survey measurements.

- Source ZIP SHA-256: `a11cb956b7b39a610344b53fb1fbd7b30eebda5f0d550e1af77c8829c0d32c88`.
- Source manifest: `accfaf7bcc72f0f75faa068ad63c382d502188554f6970a32e8446bc037649c2`.
- Terrain Depth baseline manifest: `85c6ad9e9f23cad53a4673f6bdbc10f669340826bad9e8ecfce85710dbc81de5`.
- Sealed ZIP: 23557810 bytes; SHA-256 `c3c7b600be8dfc1460ed71c0a9387844b0bf114e18472e6979cc9e9d12721f4d`.
- Public manifest: `364918ef8b0a2bc112a58db48fb775720784f19c153216d73b6321a9cbc6b5eb`; 330 entries, 331 files including the manifest. All 329 supplied files preserved.
- Reproduce with `scripts/seal-goluboe-r1-2-terrain-snapshot.py` and the source ZIP, source SHA manifest, sealed Terrain Depth MANIFEST.json, and a new output path.

Online verification follows hosted CI and automatic Render deployment.
