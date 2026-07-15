# Field Mobile / Offline v1

## Purpose

The project workspace now includes a dedicated `Площадка` tab for field capture on unstable connections. The workflow reuses PGS daily reports, project actions, documents, permissions, and audit logs.

## Supported offline operations

- Create a daily report draft.
- Create a site issue that becomes a Project Action Center item.
- Capture or select a photo/PDF that becomes a project document.

The browser stores pending operations in IndexedDB. Cookies, session tokens, API keys, and environment values are never copied into the queue.

## Sync contract

- Capture is explicit: the user presses `Сохранить на устройстве`.
- Server transmission is explicit: the user presses `Синхронизировать`.
- Operations are sent in FIFO order.
- Every operation has a browser-generated `clientMutationId`.
- `field_sync_receipts` makes retries idempotent per project.
- A repeated operation returns the previously created entity instead of creating a duplicate.
- Authorization is checked before JSON or multipart bodies are parsed.
- Daily reports, actions, documents, and audit entries are created through normal Prisma transactions.
- Upload storage is cleaned if its database transaction fails.

## Conflict and retry behavior

- Network and temporary server errors remain in the queue for retry.
- Authorization and validation failures remain visible with a sanitized message.
- HTTP 409/412 moves an item to `Нужна проверка`.
- The operator can return a failed/conflicting item to the queue or explicitly discard the local copy.

Offline v1 creates new records only. It does not edit server records while offline, so server-version merge conflicts are intentionally outside this release.

## PWA and caching safety

- The production app registers `/sw.js` and exposes `/manifest.webmanifest`.
- The service worker caches only the offline fallback, immutable Next.js static assets, and PWA icons.
- API responses, authenticated pages, project data, and mutation requests are not cached by the service worker.
- A closed offline navigation opens the generic offline fallback. Field capture continues in a project tab that was already open when the connection was lost.

## Verification

- Validate and generate Prisma after the migration.
- Run unit/API tests, lint, TypeScript, and production build.
- Verify desktop and mobile layouts with a real browser.
- Verify local IndexedDB capture without triggering server synchronization.
- After deployment, verify the migration and unauthenticated guards before any disposable authenticated smoke.
