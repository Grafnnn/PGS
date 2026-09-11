# PGS Obsidian Release

## Source And Scope

The user requested publication of the completed design from the task
"Создай лучший UI". The selected source is the Obsidian working tree in
`PGS-monolith-release`, not the earlier Bureau prototype or the old PGS checkout.
Only the existing presentation files and their referenced assets were transferred
onto main `fc8e50072953ffbc0f11d8791440b976ceade2cd`.

- Graphite surfaces, compact Golos Text typography, restrained blue-gray accents.
- Existing Monolith layout, navigation, 26 project modules and workflows retained.
- Twelve CSS files and three chart color configurations updated.
- Golos Text is served locally with its OFL license; the contour image is local.
- R10 public viewer, private model guard and project model registry unchanged.
- No API, project data, authentication, environment, schema or migration changes.
- Source checkout and its uncommitted work preserved. Local environment files and
  experimental prototypes are not part of this release.

## Pre-Release Verification

- 1076 tests in 258 files passed; production build and lint passed.
- Build has the existing local missing-database warning, not a compilation error.
- Browser: project overview, navigation groups, expandable Gantt, material register
  and search, document register/upload form, project creation form, login, dashboard.
- Viewports: 1440, 1024, 390 and 320 CSS pixels across relevant screens.
- No page-wide horizontal overflow observed. Wizard steps keep their existing
  horizontally scrollable container on small screens.
- Local browser used the built-in development demo fallback without a database.
  Database warnings stayed visible; this is not authenticated mutation coverage.
- No forms submitted, files uploaded, live AI called or project records changed.
- Independent review identified legacy light surfaces in intelligence signals and
  Excel mapping warnings. Scoped theme overrides and regression tests cover these
  states, including disabled worksheet rows; semantic status colors remain distinct.

## Publication Gate

Merge only after PR CI and release review pass. Verify the deployed Git SHA,
health, published CSS/font assets, core pages, and anonymous auth guards after
Render's normal main-branch deployment. Do not alter Render settings or data.
