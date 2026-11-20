# Goluboe R1.2: terrain and vertical depth

Public entry remains [Goluboe Atlas](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod).
The new immutable asset prefix is `/model-assets/goluboe-vodovod-r1-2-terrain-depth/`.
Existing Goluboe aliases and query behavior are retained; other atlases are unchanged.

- Contours show the existing design terrain in 0.5 m steps and stop at mesh cutouts.
- Depth measures on the vertical at the selected XY. Station mode uses the invert, while a click uses the picked object surface. No depth is invented when the terrain surface is absent.
- Local browser: 142.4 m from KV-1 gives 3.34 m; 31 m reports no terrain. Tested at 320 and 1440 px with no horizontal overflow. The publication wraps the long result message; at 320 px its panel right edge is now 303 px instead of 339 px.
- The publication-only changes are that CSS rule in `project/terrain-tools.js` and the regenerated offline identity/size. Original archive and Mobile Fit release remain immutable. Geometry, six PDFs, profile elevations, and source qualifications are unchanged.
- Model-derived display and measurements are not as-built survey or engineering acceptance.

## Integrity

- Source archive SHA-256: `d4bfb3f67612485f7a7542fe6f1661d44d270432274c92f31a6d59aff264561a`.
- Source manifest SHA-256: `6cb6860ff381d207ff16236a7afd6df8a31da80f961e36efeb46fbcd13b936e7`.
- Baseline Mobile Fit manifest SHA-256: `b846ff31f0c086c4cfefe5c2553fff65384601853a879a94b290c2066c44cde9`.
- Release ZIP: 23554838 bytes, SHA-256 `adcd8e8e367dd65168e746c6594bd5abb0d48e27324a33d03a1255981a100558`.
- Public manifest SHA-256: `85c6ad9e9f23cad53a4673f6bdbc10f669340826bad9e8ecfce85710dbc81de5`, 330 entries; 331 public files including the manifest.
- Reproduce with `scripts/seal-goluboe-r1-2-terrain-depth.py` using the source ZIP, source SHA manifest, sealed Mobile Fit MANIFEST.json, and a new output directory.

Online verification follows hosted CI, merge and automatic Render deployment.
