# Troitsk Building 24: R06

The active viewer is `troitsk-b24-r06.html.gz`, packaged from the supplied
`Troitsk_B24_R06_Portable.html`, released 2026-09-08.

- Original HTML: 53,467,956 bytes.
- Gzip package: 29,501,927 bytes; generated once using Node `gzipSync` at level 9.
- Original SHA-256: `b13c1510573119e73aa9e14e8b319453df969b3bec1969b2a7bd2975012fd81f`.
- Decompression reproduces the original file byte-for-byte. Geometry, quantities,
  source drawings, embedded images, renderer and model warnings are unchanged.
- The R06 portal includes the master model, roof, stair L-1, floors, foundations,
  entrances and a separate R05I reference branch. Do not sum the reference branch
  with the main model. PDF/GLB download availability follows the portable source;
  the full external ZIP package is not hosted by this integration.

The authenticated project `model-viewer` route checks project access, serves the
precompressed payload to gzip-capable clients and decodes it for other clients.
The asset is not in `public`. Its revision-specific URL and ETag replace cached
R04. It loads only when the user opens the 3D viewer, never on project entry.
The existing sandbox and no-network CSP remain in effect. R06 has its own mobile
navigation; the removed R04-specific CSS/DOM injection must not be reapplied.

R04 remains available in Git history. The asset integrity test detects accidental
changes to the supplied R06 content.
