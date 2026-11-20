# Goluboe R1.2 Field Pilot 01

[Public field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) resolves to `/model-assets/goluboe-vodovod-r1-2-field-pilot-01/`. The permanent Goluboe link still resolves to Terrain Snapshot. The pilot is an explicit public alias, not a private project assignment. Its worker scope, cache names, and asset policy are isolated from the main atlas and PGS.

The source contains 333 site files. Root ZIP instructions, checksum list and QA evidence are not published. The six PDFs and model geometry match Terrain Snapshot. The supplied worker was replaced with the approved offline worker plus a pilot-only fix: full and Range requests to albums consult both literal and escaped parentheses in the pilot cache. The offline manifest was regenerated. No source archive was modified.

## Integrity

- Source ZIP: `6f1d57810e4f36b8c680fc18e9c9d3ded49f062d9961ce260f83d05e7b738f1d`; source SHA256SUMS: `7763dc790d62ce61073d5d31b45ff1a89f2124b41e9d7cdbb51761534dfcc330`.
- Sealed ZIP: 23610674 bytes; SHA-256 `c545e880c6f1c6042dccf5560cd9e4f9e055fd6a9853ca333ee350cb7fec6774`.
- Public manifest: `0fd2700bcab9c57b90b9af96cf55413f24a5f70bf2c70649e6429a9210155768` (334 entries, 335 total files).
- Worker: `9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259`; cache version: `field-6294cf6471b1`.

## Verification

At 390 px, used the built-in offline save, stopped the HTTP server, and reloaded the pilot card. The passport reopened to 21.5 m and measured 3.55 m (invert +200.39 m, modeled terrain +203.94 m). The three sections reopened offline. Browser fetches returned 200, Range 206 and invalid Range 416 for the stored TKR PDF with both literal and escaped parentheses. The unit test additionally covers a PDF stored under the escaped key and tests that the worker ignores the main atlas and PGS paths. This is model-derived reference, not an as-built survey.

Reproduce with `scripts/seal-goluboe-r1-2-field-pilot.py`: source ZIP, sealed Terrain Snapshot MANIFEST.json, pinned worker from Atlas Core, and a new output directory.
