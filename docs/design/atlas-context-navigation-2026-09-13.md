# Atlas Context Navigation Review

Status: local implementation and independent native review GO; PR CI and publication pending.
Base: `434d2c8abbfb4fdd7a6d5f44c4c159f749c8593b` (PR 238).
Branch: `codex/atlas-context-navigation-ui`.

## Delivery Boundary

- One implementation in PGS. The existing `3D атлас` task coordinates design and independent review.
- Preserve the Atlas R10 palette, existing CPU rasterizer, geometry, world coordinates and source files.
- No new WebGL engine, model reconstruction, provider calls, database writes, project mutations or credential changes.
- Existing public route remains `/models/troitsk-building-24`. No new publication or second Atlas is implied by the preview.
- The design package is a reference, not product QA. Its 209 mockup checks and screenshots are not claimed as running-Atlas evidence.

## Implemented

- One compact tool row; explicit properties; mobile properties capped at 40% of the original available scene and reserved by measured height.
- Parent, full path and clear touch targets are at least 44 x 44 px on mobile.
- Eleven construction albums and the whole building, canonical crosslinks, remembered per-album context and camera.
- Desktop: expand and open are separate. Mobile: one level of the actual hierarchy at a time.
- Album-scoped parent/breadcrumb boundaries. Crosslinks do not follow the canonical source parent out of their chosen album.
- Only completed navigation saves a snapshot. Cancelled/failed loads cannot overwrite a different album's saved context.
- Whole building: 10,412 active IDs. Foundations include the actual entrance piles and children (600 unique IDs); chamber includes VC_W and VC_ROOF (249).
- Navigation does not select/highlight groups or auto-open properties. Explicit picking changes only visible outline pixels, not materials, depth or owner IDs.
- Clearing highlight and closing properties preserve inspected context for drawings.
- Drawing resolution uses direct element/alias, actual assembly ancestry and explicit audited context links. Generic containing-view inference is not used.
- Canonical block views use their actual members' sources. DETAIL_S remains a type/sample; unresolved WALL_S goes to documents/search.
- Source detail is collapsed under `Об источнике`. Native inline image/page viewer and full-document downloads remain available under production CSP/sandbox.
- Exact PDF pages are never invented. MU55's image source does not imply that the current full PDF contains it on page 49.
- One Escape arbiter closes the top internal layer before allowing the outer PGS model dialog to close.
- Required decoded blocks plus at most 8 MiB of spare decoded blocks are retained. Active blocks may exceed 8 MiB.
- The worker receives only the selected IDs' exact vertex/face/normal ranges. Diagnostics distinguish compact worker bytes from decoded block bytes.

## Verification

- Full Vitest: 262 files, 1,147 tests passed.
- Focused response/navigation checks after final source-details change: 42 passed.
- Lint passed. Production build passed with the existing local missing-DATABASE_URL warning; no database configuration changed.
- `git diff --check` passed. All 887 packaged source files and 562 geometry block hashes remain unchanged.
- Async tests cover building -> roof -> lifts with out-of-order completion before and after state assignment, plus return to roof/building.
- Resolver tests execute the same runtime function with the production confirmed-source map, not a reduced test-only map.
- Native browser at 360/390/430 x 844: no horizontal overflow; long property panel 259.59 px, real hit areas 44 px; no model/panel overlap.
- Short prepared-view properties: 171.04 px, stage ends 8 px above the panel rather than reserving the maximum height.
- Landscape 780 x 390: properties on the right, scene remains visible. Desktop 1280 x 900: full building, compact tree and controls visible.
- Chamber -> VC_W -> parent returned to chamber's 249 IDs; roof -> lifts -> roof restored the prepared roof view without highlight; whole-building action restored 10,412 IDs.
- Native actual ProjectModelViewer component in a local synthetic harness: camera/props Escape leaves the outer dialog open; next Escape closes it; drawing -> documents -> Escape leaves drawing and outer dialog open.
- This embedded check uses the real component and production Atlas response/CSP, but is not an authenticated online project workflow.
- Native source cases: F2_MU1, lift wall/group, node-A floor/plate, MU55, LP4, MB1, DETAIL_S and unresolved WALL_S. Images loaded; type/context roles checked.
- Native PDF24 (printed sheet23) opened inline as its real 3200px page image. Full PDF download produced a browser download event under sandbox.
- Native drag -> final exact frame -> new pick worked; max in-flight worker render was 1. Clear button preserved MU55 drawing context.
- Physical iPhone and physical multitouch: NOT_RUN. Gesture state-machine regression tests passed; desktop drag is not claimed as physical pinch testing.

## Measurements and Evidence

Local evidence: `/private/tmp/pgs-atlas-navigation/` (screenshots, drawing-cases.json, worker-benchmark.json, entrance-repeat.json).
Node worker comparisons use identical selected IDs/cameras, not browser FPS or total browser-memory measurements.

| Scene | Block bytes | Compact worker bytes | Triangles before / after |
| --- | ---: | ---: | ---: |
| Whole building | 26,167,212 | 26,166,660 | 1,218,172 / 1,218,148 |
| Roof | 1,479,456 | 1,479,456 | 66,408 / 66,408 |
| Entrance 1 | 6,589,368 | 824,004 | 315,168 / 39,292 |
| F2_MU1 | 24,756 | 276 | 1,164 / 12 |

Final four-scene run: 60/60 pixel + owner comparisons passed, including opacity, clipping and explicit outline selection. Entrance targeted repeat: 20 warmup pairs, 120 measured rotation pairs, 3 variants; 123/123 comparisons passed. Its p50 changed 8.142 -> 8.606 ms and p95 10.312 -> 8.911 ms. The final short run had noisy roof/F2 p95 regressions; no universal frame-rate speedup is claimed. The measurable memory/range reduction is the primary optimization.

## Before Publication

The coordinating `3D атлас` task independently approved the unchanged runtime candidate after native mobile, context/drawing and embedded Escape checks. Its three final specialist reviews passed. The suspected chamber camera-restore issue was withdrawn after full native screenshots reproduced the correct return; the clipped screenshot was not reliable evidence, and camera code was not changed.

Exact PR head, green CI and post-publication checks are still required. A portable adapter patch is not a FULL Atlas ZIP. Standalone packaging belongs to the coordinating task and must retain matching source hashes.
