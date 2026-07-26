# Project module menu design QA

## Evidence

- Source visual truth: `/var/folders/ym/cxzl8g0j1xbfs89qk_h2qc800000gn/T/TemporaryItems/NSIRD_screencaptureui_TqDIfa/Снимок экрана — 2026-07-27 в 00.23.58.png`
- Source pixels: 1872 x 176. The source is a focused crop of the previous horizontal project tab strip.
- Desktop implementation: `/tmp/pgs-module-menu-desktop-final.jpg`
- Desktop pixels and CSS viewport: 1280 x 900 at 1x density.
- Mobile implementation: `/tmp/pgs-module-menu-mobile-final.jpg`
- Mobile pixels and CSS viewport: 390 x 844 at 1x density.
- Route: `http://127.0.0.1:3018/projects/project-demo`
- State: project workspace with the module menu expanded and `Документы` selected.
- Comparison method: the source crop and browser-rendered implementation were opened together in one comparison input. No density normalization was needed.

## Findings

- No remaining P0, P1, or P2 findings.
- The source establishes the placement, visual weight, labels, and icon-led navigation of the old strip. The implementation intentionally replaces that clipped strip with one translucent grouped popover; it is a product transformation rather than a literal collapsed-state clone.

## Required Fidelity Surfaces

- Fonts and typography: existing PGS Studio families, weights, hierarchy, and zero letter-spacing policy are preserved. Long labels wrap inside their own menu item without clipping.
- Spacing and layout rhythm: the trigger retains the full-width project-navigation position. The expanded menu uses four desktop columns and two compact mobile item columns. All 23 items are visible without menu scrolling at both tested viewports.
- Colors and visual tokens: existing ink, blue, accent, muted, line, and panel tokens are reused. Functional transparency uses an `rgba` surface with backdrop blur; active and focus states retain sufficient contrast.
- Image quality and asset fidelity: no raster imagery is required by this control. Existing Lucide icons are reused consistently; no handcrafted SVG or placeholder asset was introduced.
- Copy and content: all 23 existing project sections are preserved, grouped into `Управление`, `Контур работ`, `Коммерция`, and `Контроль`, with concise operational hints.

## Focused Region Comparison

The project navigation itself was compared at full readable scale because it is the only changed visual region. The final desktop capture shows all four groups, current-section state, codes, icons, translucent surface, and the relationship to the existing sidebar and project context panel.

## Interaction And Responsive Checks

- Trigger toggles open and closed.
- Selecting `Документы` updates the current section and closes the menu.
- Escape closes the menu and restores trigger focus.
- Pointer interaction outside the menu closes it.
- Desktop: 4 groups, 23 items, no internal menu scroll, no page overflow.
- Mobile: 23 items, no internal menu scroll, no page overflow, full panel repositioned below the sticky topbar.
- Exactly one project module menu and one app sidebar are rendered.
- No Next.js error overlay or visible alert was present.

## Comparison History

1. P2: the initial mobile grouping required internal scrolling, and opening the menu from the middle of the page could place its lower edge below the viewport.
   - Fix: changed mobile groups to full-width sections with two-column item grids, reduced mobile item density, and added overflow-aware menu positioning using the existing sticky offsets.
   - Post-fix evidence: the 390 x 844 browser capture contains all 23 items; menu client height equals scroll height, the panel bottom is within the viewport, and page scroll width equals viewport width.
2. P2: the first desktop open state could extend 13 px below a 1280 x 900 viewport when opened near the top of the project body.
   - Fix: generalized overflow-aware positioning and added breakpoint-specific scroll margins.
   - Post-fix evidence: trigger top is 76 px, popover bottom is 649 px, all 23 items are visible, and no internal or horizontal scroll is present.

## Implementation Checklist

- [x] Replace horizontal strip and native secondary select with one grouped menu.
- [x] Preserve all project destinations and active state.
- [x] Add transparency, backdrop blur, hover, focus, and selected states.
- [x] Verify desktop and mobile layouts in the browser.
- [x] Verify keyboard and outside-click behavior.
- [x] Add exhaustive component tests.

## Follow-up Polish

- No blocking or required polish remains for this component.

final result: passed
