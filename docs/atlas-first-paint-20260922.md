# Atlas first-paint fix

Immutable UI3 revision: `20260922-4-first-paint`, based on UI2.
The legacy DOM remains in place for existing engine contracts, but is hidden
behind a small startup state until prototype.js finishes building the new shell
and the actual prototype stylesheet readiness marker is applied.

Inline boot code runs before linked assets. Missing CSS/scripts or an initialization
error exposes retry; a 20-second deadline prevents an endless loading state.
Late successful initialization can recover. A no-JavaScript message is included.
The ready signal does not wait for 3D geometry. No geometry, source bindings,
passports, project data, auth or environment changes. UI1/UI2 remain immutable;
UI3 has an independently versioned offline manifest and cache scope.

Local checks: 29 focused tests passed; TypeScript and production build passed
(known missing local DATABASE_URL warning). Browser QA at desktop and390x844:
normal start,8-second delayed prototype script, held initialization/loading,
missing CSS and missing JS error/retry states. Legacy header is hidden while
pending. Mobile ready shell was visible while geometry was still25/77 blocks.
MB2 search/selection/drawing linked the original PDF page67 after delayed boot.
No horizontal overflow observed. No-JS fallback inspected in source; actual
disabled-JavaScript browser coverage and frame-by-frame recording are not claimed.

CI/deployment verification must be recorded after publication.
