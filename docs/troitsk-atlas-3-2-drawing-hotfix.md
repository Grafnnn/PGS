# Troitsk Atlas 3.2: drawing navigation hotfix

## Scope

The public 3.2 route and R10 remain available. The frozen source package, model geometry, project records, database, authentication, provider configuration, and secrets are unchanged.

The delivery adapter previously replaced the selected drawing preview with a PDF iframe. Its sandbox compatibility fallback then removed that iframe, leaving only a download link. Sources without a registered PDF page had no opening action at all.

## Behavior

- Every registered source has a persistent **Open drawing** action and clickable preview, including image-only JPG/PNG/SVG sources.
- Preview enlargement is reversible. Opening a drawing does not remove the preview or alter the model/camera state.
- A plain click opens a full-screen native dialog with zoom, fit, and close. Escape closes only the sheet and restores focus to its opening link; the underlying preview and camera stay intact. This primary flow needs neither a popup nor a native PDF plugin.
- Modified clicks retain a bookmarkable standalone image viewer with zoom, fit, download, and close. Neither viewer accesses application APIs.
- For 149 confirmed PDF references, **Open sheet** displays exactly the registered PDF page. The 116 distinct pages are rendered offline at 3200 px maximum dimension into lossless WebP (27,971,900 bytes total). Images load on request, not during model startup. The original PDFs remain separate downloads.
- Image-only sources do not gain fabricated PDF page numbers.
- The exact source recovery allowlist covers 189 previously empty object records and their declared own-body nodes. Existing links take precedence. Each recovered record's `props.source` is checked against the frozen block data in a regression test.
- `section:roof` uses the verified `roof::overview` plan, explicitly labelled as a general plan, not a detail drawing. No plan is assigned to the entire building or unrelated descendants.
- Other partial or unresolved references remain unresolved. Placement/navigation sheets retain their source titles; they are not described as a complete detail design.

## Delivery and Verification

The frozen manifest is unchanged. Derived sheets have their own manifest with the original PDF SHA, physical page number, dimensions, and derived image SHA. `scripts/package-atlas-drawing-pages.py` reproduces them offline using pypdfium2 and Pillow; these are not runtime dependencies.

The entry and adapted script use a content-derived adapter revision. The entry references the revisioned script URL to avoid stale immutable caches. The standalone drawing viewer is revalidated by its own HTML hash. CSP, opaque-origin sandbox, path allowlists, PDF range requests, and attachment downloads remain enforced.

Local verification: full application tests, focused drawing/race/cache/byte-integrity tests, lint, typecheck, production build. The local build has the known absent `DATABASE_URL` warning and does not validate a live database. Native browser acceptance and publication are separate checks recorded in the PR; a successful HTTP response alone is not drawing-viewer acceptance.

## Transfer to the Standalone Atlas Maintainer

Use `atlasDrawingRenderer` in `src/lib/project-atlas-drawing-adapter.ts` to replace only the active `openSource()` function; insert `atlasConfirmedDrawingLinks` before its existing ancestor fallback. The adapter checks its anchors and fails closed on source drift. The exact recovery IDs and evidence are in `troitsk-b24-atlas-3-2.source-links.json`.

For standalone packaging, include `atlasDrawingStyles`, the derived page mapping from `troitsk-b24-atlas-3-2.drawings.json`, and the image assets. Provide the equivalent `drawing.html?source=<registered-key>&view=page` viewer for modified clicks, or use source-image links without a PDF-page claim. Do not copy PGS-specific routing imports, weaken sandbox protections, or turn an unverified source into a confirmed detail. This change is for 3.2 and does not publish the separately developed 3.3.1 candidate.
