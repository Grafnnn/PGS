# DOU200 Atlas R1.21: independent publication

- Public entry: `https://pgs-frankfurt.onrender.com/models/dou200`.
- Assets: `/model-assets/dou200-r1-21/`; cache packs: `src/assets/project-models/dou200-r1-21`.
- Troitsk remains at `/models/troitsk-building-24`, with its unchanged V12.11 archive and legacy redirects. No Troitsk content is removed or redirected to DOU200.
- Source: supplied website `DOU200/На сайт/3D_Атлас_ДОУ200_сайт_R1_21`, author release dated 11.10.2026.
- Archive: `DOU200_ATLAS_R1_21_FULL.zip`, tag `atlas-dou200-r1-21`, 284363594 bytes, 5959 files.
- Archive SHA256: `a4ba23ddc8a7628f4ed6f7087541c2023301affd9d61d332d41e2fad09bf2468`.
- Supplied website inventory SHA256: `78e6c14c18c12741e2fcaceee8a3090d89ed5be006db77d0bad75d450ac418e2`.

All 5957 supplied files are retained byte-for-byte. Only `CURRENT_RELEASE.json` and `MANIFEST.json` are added. Author geometry, source assignments, UI and candidate statuses are not edited. Engineering archives and unrelated desktop files are excluded.

## Checks and Boundaries

- Separate public allowlisted alias and route; neither public atlas performs a session or private project lookup.
- Both releases are prepared for dev, test and build, with archive and pack integrity verification.
- Tests cover separate roots/revisions, CSP, PDF byte ranges, conditional requests, traversal rejection, inaccessible other-project files and service-worker cache isolation.
- R1.21 source resolver regression: GP original PDF page 19 -> part 2/page 10; EM page 73 -> part 2/page 7; NK page 10 -> part 2/page 1.
- All 725 source references are evaluated: 485 exact PDF resolutions, 63 explicitly non-exact general albums and 177 unavailable resolutions. The DWG reference is not falsely labelled an exact PDF page.
- Different sets retain separate counts: 14391 bodies in the world, 15644 total metadata bodies, 21768 original registry records and 29761 library records including parts. No engineering acceptance is claimed.
- No DB/schema, credentials, environment, authentication, project mutations or live AI changes. Supplied originals and dirty local checkouts are untouched.

Online deployment and browser verification results are recorded on the publication PR after the merged commit is deployed.
