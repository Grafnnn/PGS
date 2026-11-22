# Goluboe R1.12

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-12/` with Atlas Core 1.1.2. The field save waits for the service worker to finish a slow first installation. Main Goluboe remains at R1.10 and the R1.11 direct path is unchanged.

- Exact full ZIP: 23799074 bytes, SHA-256 `767c63c5af60e359180bd07481936947e25006321191daa0c0c99e0ab928b5b0`.
- Exact source ZIP: 23780037 bytes, SHA-256 `b00c89d9725a7698015fe79286fe3c18e9c01ad37fda4af7fe9b3d6efc70b46e`.
- Public manifest: `b995a63cc0f54851e3d9d1af2843934ef57d2f69561c1ddfcec01e1e301a1932` (345 records, 346 packaged paths). Release metadata SHA-256: `278ab2ed62088a1e019f70791ef0736988406700cc2f58a9cb97b2c036b8fa66`.
- Offline cache: `field-83cf8e941f6b`. Worker bytes and all six PDFs remain unchanged.

Cold reconstruction uses the pinned R1.3 ZIP, 58 inherited overrides, and the accepted four payload changes and two metadata files. There are no added or removed public paths. Only the field-pilot alias changes; no cross-version runtime asset requests are needed.
