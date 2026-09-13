# Atlas 3.2: interaction and renderer patch

Scope: the existing public Atlas 3.2 delivery, based on main
`5ec5d3647b7ce8c7addb7404368e8a1cb0e0e092`. The drawing fix from PR #237 stays
in place. This is not an import of Atlas 3.3.x.

## Behavior

- One pointer rotates; Shift/right mouse drag pans. Two touch pointers zoom
  around their midpoint and pan in screen coordinates, without changing yaw.
- Pointer transitions rebase their origin. Cancel, lost capture, navigation,
  resize and document blur/visibility cleanup cannot select a stale element.
  Three contacts suspend the gesture until release. Only the model canvas
  suppresses native gestures; menu and drawing controls retain their behavior.
- Zoom is bounded to fit/20 through fit*100. Compact keyboard-accessible +/-
  buttons provide a fallback. Their position follows the actual caption height,
  including long titles and narrow viewports; mobile targets are 44x44 CSS px.
- Camera updates are coalesced by animation frames. The existing one-worker,
  one-in-flight/latest-pending contract is preserved. Completed intermediate
  frames remain visible rather than starving the view during continuous input.
- Frames from obsolete scene/viewport state are refused. Axes and labels use
  the camera of the displayed frame, not the newer input camera.
- When the full frame exceeds 28 ms, active gestures rasterize at 65% linear
  resolution (42.25% pixel area), without removing any geometry. Release/idle
  requests full CSS-pixel resolution. Only the current exact owner map permits
  selection. A tap while that final map is pending is ignored, not guessed.
- The worker reuses projected/depth scratch arrays, triangle/color temporaries,
  and transferred pixel/owner buffers returned by the main thread. It never
  reuses detached buffers. Canvas backing stores resize only when dimensions
  change. The original raster order, floating-point precision, clip and x-ray
  selection rules are preserved.

## Reproducible checks

`node scripts/atlas-performance-check.cjs bench` runs the original and adapted
worker on the same real geometry and 12 camera positions after warmup, at
1000x620 CSS pixels. JSON is written to
`/private/tmp/pgs-atlas-performance/worker-benchmark.json`.

| Scene | Original worker p50/p95 | Exact patched p50/p95 | Gesture patched p50/p95 |
| --- | --- | --- | --- |
| Whole building | 122.9 / 190.7 ms | 77.3 / 78.4 ms | 55.6 / 118.5 ms |
| F2_MU1 | 6.3 / 11.6 ms | 5.2 / 6.3 ms | 2.4 / 7.8 ms |

These are Node worker CPU measurements, not native browser FPS or iPhone results.
The small scene normally stays at full resolution because it does not exceed
the threshold. Whole-building input contains all 10,412 physical objects,
398 resident blocks, 657,886 vertices and 1,218,172 faces. Frustum/degenerate
handling is unchanged. All 12 exact RGBA/owner pairs match the original bytes
in each scene. Four additional real-scene variants (opacity, selection,
selection group, clipping/explode) also match in both scenes.

`node scripts/atlas-performance-check.cjs serve 3018` provides local native
before/after review. Open
`http://127.0.0.1:3018/model-assets/troitsk-b24-atlas-3-2/index.html?perf=1#node/building`.
Add `&baseline=1` before the hash for the original controls/rasterizer plus the
existing drawing fix. The baseline gets timing instrumentation only. Do not
run CPU-heavy builds alongside comparative browser measurements.

`?perf=1` exposes a bounded 180-frame timing history in the canvas DOM dataset:
submitted/completed/presented/dropped, measured maximum in-flight, worker,
framebuffer, geometry, receipt-to-present, present and camera-input age. No
telemetry is sent anywhere. Input age is not FPS and should be compared only
within a completed gesture; deliberate idle time is not interaction latency.

Focused tests cover pinch anchors and direction, transitions, cancellation,
third contact, mouse/Shift/right-pan, finite bounds, raster byte parity,
buffer reuse, fail-closed adapters and bounded render/picking scheduling.
Full suite: 1,127 tests across 261 files passed. Lint/types/build passed;
build emitted the known missing local DATABASE_URL warning.

Physical iPhone Safari multi-touch: **NOT_RUN**. Pointer math tests and a narrow
desktop browser viewport are not a substitute for that hardware check.

Native desktop review (1280x720, canvas 1022x630): eight pairs of real pointer
drags along the same path after three warmup pairs. Original worker p50/p95:
97.5/102.9 ms; patched: 52.6/64.1 ms. Active camera-input-to-present p50/p95:
107.7/119.7 ms before, 66.8/116.9 ms after. Including final-quality restoration,
patched input age p95 is 166.9 ms; this is not a claim of uniformly lower tail
latency. The automation delivered different event cadence/wall duration and
25 versus 121 frames, so total-series intervals are not comparable native FPS.
The final frame is exact at 1022x630, measured max in-flight is 1, all 135
submitted frames completed, zero dropped. A subsequent click selected the real
roof surface and opened its properties. No console warnings/errors observed.

Independent narrow review at actual 390x844 passed +/- hit testing above both
the building caption and a long seven-level breadcrumb, model rendering, and
drawing -> PDF page 24 / printed sheet 23 -> preview -> model return. The first
review found caption overlap; the final positioning fix was reloaded/retested.

Production-build localhost check under the unchanged sandbox/CSP passed the
small F2_MU1 view, native wheel zoom and rotation, exact final frame, source
preview, full PDF page 24 / printed sheet 23 and return to the model. No console
warnings/errors were observed. The longer automated drag completion is not
evidence that every gesture became faster: event cadence and final-quality
restoration are reported separately above.

## Portable integration

`node scripts/atlas-performance-check.cjs handoff <folder>` produces standalone
adapted album/worker source, styles and source/tests. The full worker and main
controller are one protocol: port both together, include controls CSS, preserve
the original index/data/geometry/source registry, and version the album AND
worker bundle URLs together. Do not overwrite a different standalone revision
with the generated 3.2 album: use the small anchored adapters as the contract.

All 887 frozen published source files, including the 562 geometry blocks,
remain byte-identical. Derived drawing pages and mappings are unchanged.
Public route, sandbox/CSP, authentication, backend, database, provider and
billing settings are unchanged. No live AI or project mutation is required.
