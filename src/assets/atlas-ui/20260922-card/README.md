# Selected-element engineering card

UI4 overlay on UI3 first-paint/source recovery, 2026-09-22.

Read-only explicit passport fields. Materials/grades, source/bar dimensions,
plate dimensions, signed elevations, orientation and parent are labeled separately.
World-axis model bounds are explicitly not fabrication dimensions. Parent nominal
dimensions, holes, free-text dimensions and model volume are not converted into
part dimensions or procurement quantities. Missing material remains unknown.
Source notes, incomplete geometry and unmodeled anchor holes remain visible.
Specification and long placement basis are collapsed initially.

Only the selected passport is requested through AtlasPassports' existing cache.
Generation checks discard stale successes and errors; retry uses current selection.
Title observation covers initial/hash selections; no geometry or passport changes.
The source/drawing button remains independent of passport loading.

Verification: 30 focused tests pass, TypeScript and Next production build pass
(known missing local DATABASE_URL warning during static generation).
Browser: roof L1_ROOF_TYPE2, rebar R10L_GROUND_PM3_R1_UP_X_042_04,
masonry R10L_VK_SE_H_W1, steel R10L_F148_ST1_R1_C3_BASE.
Desktop 1280 and mobile 390: no horizontal overflow observed; mobile inspector
scrolls, original drawing opens with PDF link. Model remains rendered.
Race behavior is covered by deterministic tests, not browser timing claims.
All unchanged UI3 asset hashes, including geometry/passports/source recovery,
match in UI4. No DB/auth/env changes, live AI or project mutations.
