# Troitsk Atlas R25v5 publication

- Source: sealed `R25_FINAL_V5`, 20 September 2026; owned by the separate Atlas task.
- ZIP SHA-256: `3d9e37415d6adcb24146b031c8e787d5dd20fc414ab0214b3027aa508e6c922f`.
- All 30,613 manifest payloads plus the manifest are retained byte-for-byte. The publication index maps their original relative URLs to deduplicated, individually compressed entries in bounded pack files.
- Stable public URL: `/models/troitsk-building-24`; current resources: `/model-assets/troitsk-r25v5/`.
- The project viewer uses the same release after its existing access guard. No project/DB/auth/provider changes.
- No geometry, source drawings or release UI changed. Legacy 3.2 adapters are not applied to R25v5; its old asset path remains available for compatibility.
- Catalogue: 2,760 packages; 44 new and 3 revised packages. Existing 10,412 active physical bodies preserved. New world placements: **0**. Source conflicts **1395** and **2566** remain open. Catalogue completeness is not engineering approval or placement completeness.
- Content is streamed from disk; the release is not loaded into server memory as a whole. PDF/GLB ranges, gzip negotiation, conditional requests and HEAD are supported. The optional service worker is restricted to the versioned Atlas directory.
- Offline integrity check: 22 pack hashes and 30,614 decoded payload hashes verified. Unit/regression suite: 1,157 tests passed. Lint and production build passed; local build had the existing missing-DATABASE_URL warning. Online validation is performed after deployment, not implied by these local checks.

The canonical ZIP is published as a GitHub Release asset at tag `atlas-r25v5`, not duplicated in Git history. `dev`, `test` and `build` prepare the assets automatically with `scripts/prepare-atlas-r25v5.mjs`: download the pinned archive, verify its exact size and SHA-256, extract, verify every manifest entry and package for streaming. Cached packs are verified before reuse. A failed download or integrity check stops the build; there is no silent fallback to another release.

Repackage only from the verified extraction using `node scripts/package-atlas-r25v5.mjs <directory>`. The source release itself must stay sealed. The generated `src/assets/project-models/troitsk-r25v5/` directory is excluded from Git.
