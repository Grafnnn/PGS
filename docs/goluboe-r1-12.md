# Goluboe R1.12

The [field pilot](https://pgs-frankfurt.onrender.com/models/goluboe-vodovod-field-pilot) targets `/model-assets/goluboe-vodovod-r1-12/` with Atlas Core 1.1.3. The field save waits for the service worker to finish a slow first installation. Main Goluboe remains at R1.10 and the R1.11 direct path is unchanged.

- Exact full ZIP: 23799081 bytes, SHA-256 `d11b3aef7e98f04ae56e683ee78b6bc968f6f6d11f66b2920e63bc8aadf2d884`.
- Exact source ZIP: 23780037 bytes, SHA-256 `72304a2a0f12b0d9e5b56c1bec5a61647465ccb5bda93cb8836c14dd9ae4d320`.
- Public manifest: `6d7d1045e3c87b0000167311bf7ba10817b7c41bf14ecd3d07b3c8def6419f10` (345 records, 346 packaged paths). Release metadata SHA-256: `93c3aa49e044d76e498ffd0ce087dfe5adda34490c0983fe133d4a0a5a1ead1f`.
- Offline cache: `field-9188a938881d`. Worker bytes and all six PDFs remain unchanged.

Cold reconstruction uses the pinned R1.3 ZIP, 57 inherited overrides, and the accepted five payload changes and two metadata files. There are no added or removed public paths. Only the field-pilot alias changes; no cross-version runtime asset requests are needed.
