# DOU200 Atlas R1.24: independent publication

- Public entry unchanged: `https://pgs-frankfurt.onrender.com/models/dou200`.
- Assets: `/model-assets/dou200-r1-24/`; cache packs: `src/assets/project-models/dou200-r1-24`.
- Retired R1.21 and R1.23 entry/resource links redirect directly to R1.24, retaining query and hash. Old service workers migrate only their own clients and unregister.
- Troitsk remains at `/models/troitsk-building-24`, with its unchanged V12.11 archive and legacy redirects. Neither project redirects to the other.
- Source: supplied website `DOU200/На сайт/3D_Атлас_ДОУ200_сайт_R1_24`, author release dated 13.10.2026.
- Archive: `DOU200_ATLAS_R1_24_FULL.zip`, tag `atlas-dou200-r1-24`, 288028032 bytes, 6271 files.
- Archive SHA256: `a316f42ec3d7a1e329cc52ce3c92210b1736039cc9afad62beaacbb90643ed68`.
- Supplied website inventory SHA256: `28e2ac974eb84ee646d34dc56a590fb516a219000592960f8d7a99d56e971040`.

All 6269 supplied files are retained byte-for-byte. Only `CURRENT_RELEASE.json` and `MANIFEST.json` are added. Author geometry, source assignments, UI and candidate statuses are not edited. Engineering archives and unrelated desktop files are excluded. Historical GitHub release archives remain recoverable; only the current DOU release is packaged into the service.

## Checks and Boundaries

- Separate public allowlisted alias and route; neither public atlas performs a session or private project lookup.
- Both releases are prepared for dev, test and build, with archive and pack integrity verification.
- Tests cover separate roots/revisions, CSP, PDF byte ranges, conditional requests, traversal rejection, inaccessible other-project files and service-worker cache isolation.
- Source resolver regression: GP original PDF page 19 -> part 2/page 10; EM page 73 -> part 2/page 7; NK page 10 -> part 2/page 1.
- All 749 source references are evaluated: 486 exact PDF resolutions, 64 explicitly non-exact general albums and 199 unavailable resolutions. Zero broken record-to-source references. Unavailable sources and non-exact DWG/album references are not presented as exact PDF pages.
- All 33 supplied PDFs parse (721 pages); 160 local root-HTML references resolve. Distinct sets retain separate counts: 14737 bodies in the world, 15990 total metadata bodies, 22059 original registry records, 30108 library records including parts, 5934 catalogue types and 515 remarks. No engineering acceptance is claimed.
- No DB/schema, credentials, environment, authentication, project mutations or live AI changes. Supplied originals and dirty local checkouts are untouched.

Online deployment and browser verification results are recorded on the publication PR after the merged commit is deployed.
