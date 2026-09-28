# Atlas legacy link compatibility

Public Troitsk Atlas URLs for R10, 3.2, R25v5/v7/v8, V8 UI1-UI8 and the first V11
prefix now redirect to the current release selected by `getPublicProject3dModel`.
The stable share URL remains `/models/troitsk-building-24`.

- GET/HEAD redirects use 307 and `no-store`, preserving query parameters. Browsers
  inherit the original fragment; legacy offline workers also preserve it explicitly.
- All retired page and asset URLs lead to the current model entry page. No old
  model, document or image bytes are served from those prefixes.
- Old packaged assets, UI overlays, asset-serving routes and release-specific tests
  are removed from the current repository tree. Build/test prepare only V11.
- Git history and GitHub release ZIPs remain archival snapshots, not online viewers.
- Old offline workers retire only their own registration and move old atlas windows
  to the current release. No caches, sessions or application data are erased.
- HTML now revalidates; other immutable assets retain their caching policy.

Previously cached HTML may require a hard refresh before the first server redirect
or legacy service-worker update can take effect. An already downloaded offline ZIP
cannot be changed remotely.
