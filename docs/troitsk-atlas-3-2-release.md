# Troitsk Atlas 3.2 in PGS

Date: 2026-09-13.

## Source

- User-provided extracted `Troitsk_B24_Album-2`, frozen `ATLAS_DEMO_A_FULL` (Atlas 3.2).
- All 1,616 entries matched the source manifest by size and SHA256; 1,617 files including the manifest.
- Source manifest SHA256: `0b90daba4cb11f4f2e4155525f515b0b7d69d1a6e499141053b6c5fabd7fc601`.
- Original ZIP bytes were not received; archive-level SHA verification is not claimed.
- 562 geometry blocks; 10,412 active physical objects. No geometry changes.
- Repackage with `node scripts/package-project-atlas.mjs <extracted-directory>`.

## Publication

- Stable anonymous link: `/models/troitsk-building-24#node/building`.
- The alias redirects without caching to versioned Atlas 3.2 resources. Existing `#module=master` links open the complete building.
- Project viewer authorization remains before metadata lookup or redirect. Unrelated project records are never resolved by the public route.
- 887 runtime resources are allowlisted by a generated manifest, compressed where appropriate, and checked byte-for-byte against the source. Archive history, build tools, provenance archives and QA output are not published.
- Opaque-origin iframe sandbox retained, no `allow-same-origin`, no application API/network access. Only packaged scripts, styles, drawings and a blob worker are allowed by CSP.
- The 3D model is loaded only when the existing PGS viewer is opened. Geometry is loaded by the source atlas in blocks; drawings are requested when opened.
- This remains a coordination model, not an as-built survey, a completed working-documentation package, or a claim of no clashes.

## Web Adapter

- Fixed collapsed desktop navigation: hiding the sidebar previously auto-placed the scene into a zero-width grid column. The collapsed layout now has one full-width column.
- Normalized the old public-link fragment and labeled the browser title Atlas 3.2.
- Escape respects the atlas's internal dialogs before closing the PGS viewer.
- Drawings remain inline images. Full PDFs use an explicit download because native PDF plugins cannot run inside the opaque-origin sandbox; no blank PDF iframe is left behind. Original document bytes are preserved, with HTTP range support.
- These changes are applied to the HTTP entry response, not to the user's frozen source folder or the packaged geometry/scripts.

## Verification

- Local browser: building with roof, compact/mobile 390x844, desktop 1280x720, sidebar open/close, resize back to desktop, search, linked floor element, AS.2 sheet 20/PDF page 21 image (1600x1131), return to model. No horizontal overflow or console errors observed.
- Independent browser review confirmed repeated navigation collapse/expand, 768x900-to-desktop resizing, assembly drill-down, its own drawing and return to the building.
- Tests cover source hashes, every runtime file, all 562 blocks, stable alias, anonymous access, private authorization, traversal/unpublished paths, gzip/identity, ETags, PDF ranges, PDF fallback and Escape handling.
- No project-data writes, live AI, env/secret, schema/migration or account changes.
- Production verification is performed after merge/deployment; local checks alone do not establish online availability.
