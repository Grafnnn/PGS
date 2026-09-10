# Troitsk Building 24: R10 local

Published source: `Troitsk_B24_R10_local_Portable.html`, 2026-09-10,
from the task "3D модель — восстановление и завершение".
Source SHA-256: `466259334b6d4e251035ba9e4dfd14e071062edf046ec4a65f3a08e99f6afdd7`.

- Working coordination model, not an as-built or completed transfer of all drawings.
- 14 modules; 11,281 master objects; 10,396 current physical export objects.
- R05I reference branch is separate and must not be summed with the main model.
- Old R08 thumbnails are retained references, not new R10 screenshots.
- Full external PDF/GLB/working archives are not published by this integration.

`scripts/package-project-model.mjs` packages the supplied portable file. Its data-URI
image table entries are replaced with content-addressed assets under `public/model-assets/troitsk-b24-r10`.
Images are requested when displayed, rather than embedded in the initial download.
Geometry, properties, module mappings, renderer and warnings are not changed.
The manifest records every asset hash. The integrity test reconstructs the exact
original 165,938,838-byte portable HTML and verifies its SHA-256.
Initial HTML gzip: 7,815,641 bytes. This is not the total size of all model assets.
PDF/XLSX/CSV/JSON already embedded in the supplied viewer stay as data URIs so
downloads preserve filenames and do not navigate away from the sandboxed model.
A narrow web-only CSS adjustment keeps the R10 header within mobile viewports.

Public, password-free URL: `/models/troitsk-building-24#module=master` opens the actual
3D scene immediately, not a historical thumbnail. This allowlisted route has
no project DB query, login, edit or other project API access. It serves the published
viewer with a sandbox/no-network CSP; source images come from the same origin.
The existing project API still checks project access before reading files or sending
304. The in-service viewer offers an "Общая ссылка" link. ETags include the revision.

R06 remains in Git history. No project records or authorization rules are migrated.
