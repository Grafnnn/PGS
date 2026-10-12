# DOU200 Atlas R1.23: independent publication

- Public entry unchanged: `https://pgs-frankfurt.onrender.com/models/dou200`.
- Assets: `/model-assets/dou200-r1-23/`; cache packs: `src/assets/project-models/dou200-r1-23`.
- Retired R1.21 entry/resource links redirect to the current DOU200 entry, retaining query and hash. The old service worker migrates only its own clients and unregisters.
- Troitsk remains at `/models/troitsk-building-24`, with its unchanged V12.11 archive and legacy redirects. No Troitsk content is removed or redirected to DOU200.
- Source: supplied website `DOU200/На сайт/3D_Атлас_ДОУ200_сайт_R1_23`, author release dated 12.10.2026.
- Archive: `DOU200_ATLAS_R1_23_FULL.zip`, tag `atlas-dou200-r1-23`, 287404098 bytes, 6262 files.
- Archive SHA256: `47e7258af3aa020fe0c8837969f4ce056a398c924fc7cd77a8685ec2d630470c`.
- Supplied website inventory SHA256: `39d7961e60c5a26795082ea208d6c4b9517fae9e404654875a81b90a8a931bd9`.

All 6260 supplied files are retained byte-for-byte. Only `CURRENT_RELEASE.json` and `MANIFEST.json` are added. Author geometry, source assignments, UI and candidate statuses are not edited. Engineering archives and unrelated desktop files are excluded. Historical GitHub release archives remain recoverable; only the current DOU release is packaged into the service.

## Checks and Boundaries

- Separate public allowlisted alias and route; neither public atlas performs a session or private project lookup.
- Both releases are prepared for dev, test and build, with archive and pack integrity verification.
- Tests cover separate roots/revisions, CSP, PDF byte ranges, conditional requests, traversal rejection, inaccessible other-project files and service-worker cache isolation.
- R1.23 source resolver regression: GP original PDF page 19 -> part 2/page 10; EM page 73 -> part 2/page 7; NK page 10 -> part 2/page 1.
- All 744 source references are evaluated: 484 exact PDF resolutions, 64 explicitly non-exact general albums and 196 unavailable resolutions. Unavailable sources and non-exact DWG/album references are not presented as exact PDF pages.
- All 33 supplied PDFs parse (721 pages). Distinct sets retain separate counts: 14714 bodies in the world, 15967 total metadata bodies, 22058 original registry records, 30083 library records including parts, 5925 catalogue types and 515 remarks. No engineering acceptance is claimed.
- No DB/schema, credentials, environment, authentication, project mutations or live AI changes. Supplied originals and dirty local checkouts are untouched.

Online deployment and browser verification results are recorded on the publication PR after the merged commit is deployed.
