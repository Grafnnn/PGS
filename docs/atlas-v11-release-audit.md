# Atlas V11 publication audit

Date: 2026-09-28. Source: the supplied 2026-09-27 V11 website release.
Public alias remains `/models/troitsk-building-24`; the repaired asset prefix is
`/model-assets/troitsk-r25v11-ui1/`. Publication of the web model and its drawings
in the public Grafnnn/PGS GitHub Release was explicitly confirmed by the owner.

## Integrity and scope

- Original website ZIP SHA-256: `c28af9ec92f5abd68febddc05bc3ad9a7398a62c6e35586f78c1c0e35fbbeac9`.
- Sealed ZIP SHA-256: `1efa1c3087b19e9bb7aa85493323c016c82b029531d9d5e437221f667b03e3f8`.
- Release tag `atlas-r25v11`, 4,351 files, 288,520,181 ZIP bytes.
- Geometry and original element-to-source assignments are unchanged.
- The full engineering archive is excluded. Three exact, hash-verified PDF
  excerpts required by published source references are included instead.
- No changes to DB, schema, authentication, credentials or Render settings.

## Repaired defects

1. Eighteen source references pointed to three PDFs omitted from the website.
   The excerpt files now resolve within the published asset prefix and retain
   their original page fragments.
2. Eight AS.2 navigation labels used the first sheet in a multi-sheet title,
   rather than the page opened. Corrected PDF-page/printed-sheet pairs:
   66/56, 67/57, 90/80, 91/81, 94/84, 153/143, 154/144, 157/147.
3. Alternate-sheet card buttons bypassed package link mapping and opened a
   missing archive path. Runtime packaging applies the existing mapping.
4. The V11 card and library ignored the supplied source-recovery registry.
   They now reuse its existing verified links and 43 additional sources.
   Previously assigned links are never replaced; unknown records remain
   unassigned. No new engineering associations are inferred.
5. Existing compact toolbar mode is applied through 1,400 px to prevent label
   overlap with the inspector open.

`seal-atlas-v11.mjs` reproduces the sealed source website. The bounded runtime
overrides in `prepare-atlas-v11.mjs` are separately versioned and included in
the delivered manifest; the uploaded release ZIP remains immutable.

## Verification

- 237 original plus 43 recovered sources: all preview/PDF paths resolve inside
  V11. All original record-source keys and recovery-group keys resolve.
- Sheet labels checked against independent single-sheet records and PDF stamps.
- Targeted tests cover release integrity, links, labels, recovery precedence,
  byte-range delivery, CSP, traversal rejection and the unchanged public alias.
- Local browser: building scene renders; roof section selects an element;
  VS01_BR opens AS.2 sheet 98 / PDF 108 with a loaded image; the same recovered
  source can be found and opened in the drawing library.
- 390 px mobile and 1,440 px desktop frames: no document horizontal overflow;
  mobile section drawer, card and drawing modal exercised. No console errors
  observed. The embedded browser's native PDF viewer did not render the PDF;
  PDF bytes/ranges and locally rendered page stamps were verified separately.

## Limits

This is delivery/navigation validation, not new engineering approval. The
source's 47 unplaced positions and coverage limitations remain explicit.
Historical archive-only links remain marked as archive references. A valid
source path does not by itself certify the underlying design or placement.

## First production-load finding

PR #250 passed CI #523 (1,215 tests) and main CI #524, but its production browser
check found a startup race. The original engine inserted controls into `#left`
assuming `#studyNavigation` was already a direct child; the initial HTML nests
it inside navigation. Metadata can resolve before the UI moves that node.
The repair inserts beside the node in its current parent and covers all three
parent states. A new immutable URL prefix prevents browsers reusing the old
engine from cache. No geometry or assignment changes accompany this repair.

The startup repair must pass CI and a fresh production browser check before
declaring V11 online.
