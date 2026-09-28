# Troitsk Building 24: V11

Only V11 is packaged for deployment. `scripts/prepare-atlas-v11.mjs` downloads the
sealed public release, verifies its SHA-256, and applies the tested PGS integration.
The generated `troitsk-r25v11` packs are not committed to Git.

Public, password-free URL: `/models/troitsk-building-24`.
Current assets: `/model-assets/troitsk-r25v11-ui1/`.

Old deployed models, UI overlays and static drawing packages have been removed.
Their public prefixes now redirect to the current model; see
`docs/atlas-legacy-links.md`. Historical source remains in Git history and release
archives, not in the running website.

See `docs/atlas-v11-release-audit.md` for drawing checks and known engineering
limitations. This is a coordination atlas, not engineering approval or an as-built
survey. No project data, authorization rules or database schema are changed.
