# PGS Construction Platform

Локальный MVP онлайн-системы управления строительным проектом по концепции EfA: проект → бюджет / ВОР → график → факт → материалы → снабжение → финансы → рапорты → риски → AI-помощник.

Официальный GitHub repository: `https://github.com/Grafnnn/PGS`.

## Что реализовано

- Next.js / React / TypeScript приложение.
- DB-backed auth: bcrypt password hashes, opaque session cookie, server-side sessions.
- First-admin bootstrap через `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD`, `FIRST_ADMIN_NAME`.
- Админка пользователей `/admin/users`: создание, роли, активация и reset temporary password.
- Invite/reset-password foundation: hash-only tokens, страницы `/invite/accept` и `/reset-password`, безопасный console email provider.
- Админка интеграций `/admin/integrations` и protected endpoint `/api/connectors/status`.
- Дашборд компании и список проектов.
- Health endpoint `/api/health` для проверки env, PostgreSQL, AI и storage-настроек.
- Роли `OWNER`, `ADMIN`, `MANAGER`, `VIEWER` с централизованной проверкой permissions.
- Project-level permissions через `ProjectMember` и effective role.
- Карточка проекта с вкладками:
  - Обзор;
  - Бюджет / ВОР;
  - График;
  - Материалы;
  - Заявки;
  - Финансы;
  - Рапорты;
  - Риски;
  - Документы;
  - Участники;
  - История;
  - AI-помощник.
- Локальные формы добавления бюджетных позиций, работ, материалов, платежей, рапортов и рисков.
- Расчетный слой KPI: себестоимость, прибыль, маржинальность, готовность, материалы, кассовый разрыв, авто-риски.
- REST-like API routes под `/api/...`.
- Prisma/PostgreSQL multi-tenant схема.
- Prisma CRUD API для ключевых сущностей проекта.
- Excel import preview для ВОР/сметы без автосохранения непроверенных данных.
- Транзакционный commit импорта в `BudgetSection`, `BudgetItem`, `Material`, `ScheduleItem`.
- Inline edit/delete для ВОР, материалов и графика.
- Audit trail для импорта и ключевых CRUD-операций.
- Local document upload/download/delete через storage adapter, метаданные и `DocumentVersion` в PostgreSQL.
- S3-compatible storage adapter с SigV4 signing.
- JSON export проекта и истории изменений.
- Dedicated `project-smoke` для staging smoke mutation и `pnpm smoke:cleanup`.
- GitHub Actions CI и manual staging smoke workflow.
- Demo seed для организации “Демо Строй”.
- SQL migration в `prisma/migrations/20260619183000_v0_2_baseline`.
- Docker Compose для PostgreSQL + web.
- OpenAI API key берется только из env и не коммитится.

## Архитектура

Выбран единый Next.js MVP, потому что он быстрее дает проверяемую онлайн-систему с UI и API в одном приложении. Prisma/PostgreSQL уже заложены отдельно, поэтому следующий этап может безболезненно перенести demo state на реальные таблицы и расширить backend.

Основные файлы:

- `src/app/dashboard/page.tsx` - дашборд компании.
- `src/app/projects/page.tsx` - список проектов.
- `src/app/projects/[id]/page.tsx` - карточка проекта.
- `src/components/project-workspace.tsx` - основной рабочий интерфейс объекта.
- `src/app/api/[...path]/route.ts` - API endpoints с Prisma CRUD и Zod-валидацией.
- `src/app/api/health/route.ts` - staging health check.
- `src/app/api/auth/login/route.ts` - DB-backed login с server-side session.
- `src/app/admin/users/page.tsx` - минимальная админка пользователей.
- `src/app/admin/integrations/page.tsx` - readiness-страница внешних коннекторов.
- `src/app/api/admin/users` - user management API без `passwordHash` и session tokens.
- `src/app/api/admin/invites/route.ts` - создание invite-token без реальной email-отправки по умолчанию.
- `src/app/api/auth/reset-password/route.ts` - single-use reset-token flow.
- `src/app/api/connectors/status/route.ts` - protected connector readiness endpoint.
- `src/app/api/projects/[projectId]/members` - ProjectMember API.
- `src/app/api/projects/[projectId]/documents` - upload/download/delete документов.
- `src/lib/auth/permissions.ts` - базовая модель ролей и прав.
- `src/lib/auth/session.ts` - opaque session tokens и DB session lookup.
- `src/lib/auth/password.ts` - bcrypt hash/verify.
- `src/lib/auth/tokens.ts` - hash-only one-time invite/reset tokens.
- `src/lib/auth/project-permissions.ts` - effective project role через global role + ProjectMember.
- `src/lib/connectors` - readiness config/status для GitHub, Google, Gmail, Calendar, Render, Vercel, OpenAI.
- `src/lib/email` - console email adapter и future Gmail/SMTP provider boundary.
- `src/lib/rate-limit.ts` - MVP in-memory rate limiter для login/reset.
- `src/lib/smoke/cleanup.ts` - safety helpers для smoke mutation/cleanup.
- `src/lib/env.ts` - централизованная валидация env.
- `src/lib/storage` - local/S3-compatible storage adapter.
- `src/lib/calculations.ts` - расчетный слой.
- `src/lib/ai.ts` - AI context builder и OpenAI вызов.
- `src/lib/prisma.ts` - Prisma Client singleton.
- `src/lib/project-data.ts` - чтение project bundle из PostgreSQL.
- `src/lib/serializers.ts` - преобразование Prisma Decimal/Date в JSON.
- `src/lib/validation.ts` - серверная валидация входных данных.
- `src/lib/audit.ts` - безопасная запись журнала изменений.
- `src/lib/excel/import-parser.ts` - чтение `.xlsx/.xls` и сбор preview.
- `src/lib/excel/import-classifier.ts` - deterministic-классификация строк.
- `src/lib/excel/import-normalizer.ts` - распознавание заголовков, чисел и дат.
- `src/lib/demo-data.ts` - demo seed для UI/API.
- `prisma/schema.prisma` - PostgreSQL модель данных.
- `prisma/seed.ts` - загрузка demo данных в БД.

## Локальный запуск

В этой desktop-сессии Node.js доступен через bundled runtime. Если в обычном терминале установлен Node.js 20+, можно использовать стандартные команды:

```bash
pnpm install
cp .env.example .env.local
pnpm db:up
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

Если используете bundled pnpm из Codex:

```bash
PATH=/Users/ag/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:/Users/ag/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin:$PATH pnpm dev
```

Откройте:

```text
http://localhost:3000
```

## Environment

Пример переменных лежит в `.env.example`.

Минимум для локального запуска UI:

```bash
DATABASE_URL="postgresql://pgs:pgs_local_password@localhost:5432/pgs_local?schema=public"
NEXTAUTH_SECRET="change-me-in-local-dev"
AUTH_REQUIRED="false"
SESSION_SECRET="change-me-before-staging"
DEMO_ADMIN_EMAIL="demo@pgs.local"
DEMO_ADMIN_PASSWORD="demo-password-change-me"
OPENAI_API_KEY=""
UPLOAD_DIR="./storage/uploads"
MAX_UPLOAD_MB="50"
UPLOAD_STORAGE_PROVIDER="local"
FIRST_ADMIN_EMAIL="admin@pgs.local"
FIRST_ADMIN_PASSWORD="pgs-admin-local"
FIRST_ADMIN_NAME="PGS Admin"
S3_BUCKET=""
S3_REGION=""
S3_ENDPOINT=""
S3_FORCE_PATH_STYLE="true"
S3_PUBLIC_BASE_URL=""
S3_ACCESS_KEY_ID=""
S3_SECRET_ACCESS_KEY=""
EMAIL_PROVIDER="console"
EMAIL_FROM="PGS <no-reply@pgs.local>"
APP_URL="http://localhost:3000"
GITHUB_REPO="Grafnnn/PGS"
GITHUB_CONNECTOR_MODE="read_only"
GOOGLE_DRIVE_CONNECTOR_MODE="disabled"
GMAIL_CONNECTOR_MODE="disabled"
GOOGLE_CALENDAR_CONNECTOR_MODE="disabled"
RENDER_CONNECTOR_MODE="disabled"
VERCEL_CONNECTOR_MODE="disabled"
OPENAI_CONNECTOR_MODE="disabled"
LOGIN_RATE_LIMIT_WINDOW_MS="60000"
LOGIN_RATE_LIMIT_MAX="8"
RESET_RATE_LIMIT_WINDOW_MS="900000"
RESET_RATE_LIMIT_MAX="5"
APP_ENV="development"
```

`.env.local` не коммитится.

Для production/staging:

- `NODE_ENV=production`;
- `AUTH_REQUIRED=true`;
- `SESSION_SECRET` задан длинным случайным значением;
- `FIRST_ADMIN_EMAIL` и `FIRST_ADMIN_PASSWORD` заданы для первого bootstrap, затем пароль нужно сменить/убрать из env;
- `DATABASE_URL` указывает на live PostgreSQL;
- `UPLOAD_STORAGE_PROVIDER=local` допустим только для VPS/volume, для serverless нужен S3-compatible storage;
- для S3 задать `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, а `S3_ENDPOINT` для совместимого провайдера;
- `OPENAI_API_KEY` задается только если нужны AI endpoints.
- `EMAIL_PROVIDER=console` безопасен для dev/staging проверки, но не отправляет реальные письма;
- внешние Google/Gmail/Calendar/Render/Vercel modes по умолчанию disabled/read-only и не выполняют мутаций.

## Auth, Sessions и First Admin

Система использует DB-backed auth:

- пароль хранится только как bcrypt hash в `users.password_hash`;
- cookie `pgs_session` содержит только случайный opaque token;
- в таблице `sessions` хранится SHA-256 hash token, `expires_at`, `revoked_at`, user agent и IP;
- logout отзывает session и очищает cookie;
- `/api/auth/me` читает session и возвращает текущего пользователя без `passwordHash`.

Seed создает первого OWNER:

- если заданы `FIRST_ADMIN_EMAIL` и `FIRST_ADMIN_PASSWORD`, используется эта пара;
- в dev, если они не заданы, создается local-only `admin@pgs.local` / `pgs-admin-local`;
- в production небезопасный пароль автоматически не создается.

В non-production seed также обновляет demo-пользователя `demo@pgs.local` с паролем из `DEMO_ADMIN_PASSWORD`, чтобы локальный сценарий оставался удобным.

## Roles и Permissions

Роли приложения хранятся в `users.app_role`:

- `OWNER` - все действия;
- `ADMIN` - все операции по проектам, без будущих owner-only системных действий;
- `MANAGER` - редактирование данных проекта, Excel import, upload документов, просмотр audit;
- `VIEWER` - read-only, скачивание документов и просмотр audit;
- anonymous - нет доступа при `AUTH_REQUIRED=true`; local fallback только при `AUTH_REQUIRED=false`.

Все write/import/upload/delete endpoints проходят через `src/lib/auth/permissions.ts`.

Project-level permissions:

- global `OWNER` и `ADMIN` управляют всеми проектами;
- authenticated `MANAGER` и `VIEWER` получают проектные права через `ProjectMember`;
- dev fallback при `AUTH_REQUIRED=false` сохраняет локальную работу без БД-сессии;
- backend endpoints участников: `GET/POST /api/projects/:id/members`, `PATCH/DELETE /api/projects/:id/members/:memberId`.
- UI управления участниками находится во вкладке “Участники” карточки проекта.
- нельзя удалить или понизить последнего проектного `OWNER`.

## Управление Пользователями

Откройте:

```text
http://localhost:3000/admin/users
```

Доступ только `OWNER/ADMIN`. Возможности:

- создать пользователя и получить temporary password один раз в response/UI;
- изменить имя и роль;
- активировать/деактивировать;
- выдать новый temporary password;
- создать invite-link через console email provider;
- выдать single-use reset-link без хранения raw token;
- защитить последнего активного `OWNER` от деактивации или понижения.

API не возвращает `passwordHash`, session tokens или секреты. Reset password отзывает активные sessions пользователя. Invite/reset tokens хранятся только как SHA-256 hash и показываются только один раз в dev/admin response.

## PostgreSQL, миграции и seed

Запуск БД:

```bash
pnpm db:up
```

Миграции и seed:

```bash
npx prisma migrate dev
npx prisma db seed
npx prisma studio
```

Через pnpm:

```bash
pnpm prisma:migrate
pnpm prisma:seed
pnpm prisma:studio
```

Если PostgreSQL уже запущен отдельно, достаточно чтобы `DATABASE_URL` указывал на него. Для текущего локального профиля используется:

```text
postgresql://pgs:pgs_local_password@localhost:5432/pgs_local?schema=public
```

Дополнительные команды:

```bash
pnpm db:down
pnpm db:reset
pnpm db:seed
pnpm import:fixture
pnpm smoke:staging
SMOKE_CLEANUP_CONFIRM=project-smoke pnpm smoke:cleanup
pnpm auth:cleanup-sessions
```

Live DB flow для local/staging:

```bash
pnpm install
pnpm prisma validate
pnpm prisma generate
docker compose config
docker compose up -d db
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
APP_URL=http://127.0.0.1:3000 SMOKE_EMAIL=admin@pgs.local SMOKE_PASSWORD=... pnpm smoke:staging
```

Если Docker/PostgreSQL недоступны, `/api/health` должен возвращать `503 degraded`, а `pnpm test/lint/build` должны проходить.

Seed создает два проекта:

- `project-demo` - демонстрационный объект для ручной работы;
- `project-smoke` - безопасный объект для staging mutation smoke, помечен `isSmokeProject=true`.

## API endpoints

Next.js routes имеют префикс `/api`.

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:userId`
- `POST /api/admin/users/:userId/reset-password`
- `POST /api/admin/users/:userId/deactivate`
- `POST /api/admin/users/:userId/activate`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `GET /api/projects/:id/budget`
- `POST /api/projects/:id/budget`
- `PATCH /api/projects/:id/budget/:itemId`
- `DELETE /api/projects/:id/budget/:itemId`
- `PATCH /api/budget/:itemId`
- `DELETE /api/budget/:itemId`
- `POST /api/projects/:id/budget/import`
- `POST /api/projects/:id/imports/budget/preview`
- `POST /api/projects/:id/imports/budget/commit`
- `GET /api/projects/:id/schedule`
- `POST /api/projects/:id/schedule`
- `PATCH /api/projects/:id/schedule/:itemId`
- `DELETE /api/projects/:id/schedule/:itemId`
- `GET /api/projects/:id/materials`
- `POST /api/projects/:id/materials`
- `PATCH /api/projects/:id/materials/:materialId`
- `DELETE /api/projects/:id/materials/:materialId`
- `GET /api/projects/:id/procurement`
- `POST /api/projects/:id/procurement`
- `PATCH /api/projects/:id/procurement/:requestId`
- `DELETE /api/projects/:id/procurement/:requestId`
- `GET /api/projects/:id/finance`
- `POST /api/projects/:id/finance`
- `POST /api/projects/:id/payments`
- `PATCH /api/projects/:id/finance/:paymentId`
- `DELETE /api/projects/:id/finance/:paymentId`
- `GET /api/projects/:id/daily-reports`
- `POST /api/projects/:id/daily-reports`
- `PATCH /api/projects/:id/daily-reports/:reportId`
- `DELETE /api/projects/:id/daily-reports/:reportId`
- `GET /api/projects/:id/executive-reports`
- `POST /api/projects/:id/executive-reports`
- `PATCH /api/projects/:id/executive-reports/:reportId`
- `DELETE /api/projects/:id/executive-reports/:reportId`
- `GET /api/projects/:id/executive-reports/:reportId/export`
- `GET /api/projects/:id/risks`
- `POST /api/projects/:id/risks`
- `PATCH /api/projects/:id/risks/:riskId`
- `DELETE /api/projects/:id/risks/:riskId`
- `GET /api/projects/:id/documents`
- `POST /api/projects/:id/documents`
- `PATCH /api/projects/:id/documents/:documentId`
- `DELETE /api/projects/:id/documents/:documentId`
- `POST /api/projects/:id/documents/upload`
- `GET /api/projects/:id/documents/:documentId/download`
- `DELETE /api/projects/:id/documents/:documentId`
- `GET /api/projects/:id/documents/:documentId/versions`
- `POST /api/projects/:id/documents/:documentId/versions`
- `GET /api/projects/:id/documents/:documentId/versions/:versionId/download`
- `GET /api/projects/:id/members`
- `POST /api/projects/:id/members`
- `PATCH /api/projects/:id/members/:memberId`
- `DELETE /api/projects/:id/members/:memberId`
- `GET /api/projects/:id/export/json`
- `GET /api/projects/:id/audit/export/json`
- `GET /api/projects/:id/audit`
- `GET /api/projects/:id/audit?entityType=budget&action=update&limit=25&from=2026-06-01&to=2026-06-30`
- `POST /api/projects/:id/ai/chat`
- `POST /api/projects/:id/ai/summary`
- `POST /api/projects/:id/ai/analyze-budget`
- `POST /api/projects/:id/ai/analyze-contract`
- `POST /api/projects/:id/ai/procurement-suggestion`
- `POST /api/projects/:id/ai/risk-review`

## Проверки

```bash
npm run test
npm run lint
npm run build
docker compose up --build
```

В этой сессии проверки запускались через pnpm:

```bash
pnpm prisma:generate
npx prisma validate
pnpm test
pnpm lint
pnpm build
pnpm smoke:staging
```

Health check:

```bash
curl -i http://localhost:3000/api/health
```

При недоступной БД endpoint возвращает `503` и JSON со статусом `degraded`, не ломая приложение.

Health response показывает:

- `status`: `ok` или `degraded`;
- `database`: `ok` или `unavailable`;
- `auth.required` и `auth.mode`;
- `storage.provider`, `storage.writable`, `storage.maxUploadMb`;
- `ai.configured`;
- `version.appVersion`, `version.gitSha` и `version.gitShaSource`;
- `migrations.status/count`, если PostgreSQL доступен;
- `missing` для обязательных production/staging env.

На Render `version.gitSha` берется из `RENDER_GIT_COMMIT`. Ручной `GIT_SHA` используется только как fallback для окружений, где платформа не предоставляет commit SHA.

AI key, `DATABASE_URL`, `SESSION_SECRET`, S3 secrets и абсолютный upload path не раскрываются.

## Staging Smoke Test

Smoke script запускается командой:

```bash
APP_URL=http://127.0.0.1:3000 pnpm smoke:staging
```

Опционально для auth:

```bash
APP_URL=https://staging.example.com \
SMOKE_EMAIL=admin@pgs.local \
SMOKE_PASSWORD=... \
pnpm smoke:staging
```

По умолчанию smoke не мутирует production/staging данные. Для локальной проверки upload можно явно включить:

```bash
SMOKE_ALLOW_MUTATION=true SMOKE_EMAIL=admin@pgs.local SMOKE_PASSWORD=... pnpm smoke:staging
```

Вывод имеет статусы `PASS`, `FAIL`, `SKIP`; любой `FAIL` завершает процесс с non-zero exit code.

Mutation mode дополнительно проверяет upload/download документа, upload/download новой версии и delete smoke-документа. В production mutation запрещен без отдельного explicit override.

## AI-помощник

AI endpoint собирает контекст проекта:

- summary проекта;
- бюджетные итоги;
- график и просрочки;
- материалы с дефицитом;
- финансы и кассовый разрыв;
- риски.

Если `OPENAI_API_KEY` есть, `/api/projects/project-demo/ai/chat` отправляет контекст в OpenAI. Если ключ отсутствует, endpoint не падает и возвращает локальный fallback с понятной причиной.

AI Command Layer v1 добавляет сценарные endpoints для управленческого анализа:

- `POST /api/projects/:id/ai/summary`
- `POST /api/projects/:id/ai/budget-review`
- `POST /api/projects/:id/ai/schedule-review`
- `POST /api/projects/:id/ai/procurement-review`
- `POST /api/projects/:id/ai/finance-review`
- `POST /api/projects/:id/ai/risk-review`
- `POST /api/projects/:id/ai/document-review`
- `POST /api/projects/:id/ai/daily-report-summary`
- `POST /api/projects/:id/ai/executive-report`
- `POST /api/projects/:id/ai/draft-text`

Эти endpoints возвращают структурированный результат: статус, вывод, найденные проблемы, рекомендации, тему/draft text, рекомендуемые приложения и ограничения данных. Без `OPENAI_API_KEY` они работают в deterministic fallback-режиме и не требуют live provider call. При наличии ключа AI Command Layer запрашивает structured JSON, валидирует его на сервере и при provider failure/invalid JSON возвращает degraded deterministic result без утечки provider errors или секретов.

Подробности: `docs/ai_command_layer_v1.md`.

## Импорт Excel ВОР / сметы

Вкладка “Бюджет / ВОР” содержит блок импорта:

1. Выберите `.xlsx` или `.xls` файл до 15 MB.
2. Нажмите “Проверить файл”.
3. Проверьте preview: разделы, позиции ВОР, материалы, график, warnings/errors и unknown rows.
4. Отметьте “Я проверил импортируемые данные”.
5. Нажмите “Сохранить импорт”.

Preview не пишет данные в БД. Commit endpoint принимает только нормализованные preview-данные и пишет их транзакционно. Режимы commit:

- `append` - добавить к текущим данным;
- `replace_budget` - заменить бюджетные разделы и позиции;
- `replace_materials` - заменить материалы;
- `replace_schedule` - заменить график.

AI-классификация для unknown rows пока не вызывается автоматически: импорт работает deterministic-слоем и не зависит от `OPENAI_API_KEY`.

Для генерации безопасного synthetic Excel-файла:

```bash
pnpm import:fixture -- /tmp/pgs-budget-import-demo.xlsx
```

Этот файл не является пользовательским документом и не коммитится.

## Журнал изменений

Audit trail пишет последние изменения по проекту:

- Excel commit;
- создание/редактирование/удаление ВОР;
- создание/редактирование/удаление материалов;
- создание/редактирование/удаление графика;
- создание/редактирование/удаление рисков;
- создание/редактирование/удаление платежей.
- загрузка/удаление документов.

В карточке проекта есть вкладка “История”, которая читает `GET /api/projects/:id/audit` и показывает последние 50 событий. Endpoint поддерживает фильтры `entityType`, `action`, `limit`, `from`, `to`.

## Документы и файловое хранилище

Для dev-режима документы хранятся в `UPLOAD_DIR` (`./storage/uploads`), а в PostgreSQL остаются только метаданные: категория, название, путь, имя файла, mime type, размер, storage key, версия и автор.

Storage providers:

- `UPLOAD_STORAGE_PROVIDER=local` - полностью работает, требует persistent disk/volume;
- `UPLOAD_STORAGE_PROVIDER=s3` - S3-compatible adapter с AWS Signature v4 через server-side endpoints.

Для production/serverless нужен S3-compatible storage. Рекомендуемые категории:

- договоры;
- сметы;
- ВОР;
- исполнительная документация;
- КС-2/КС-3;
- чертежи;
- фотофиксация;
- счета и платежные документы.

Уже включены whitelist расширений, базовая проверка MIME/размера, backend-проверка прав, audit log, server-generated storage key, path traversal protection и `DocumentVersion` для первой версии файла. Для PDF/images выставляется preview-ready metadata, но встроенный preview viewer пока не реализован.

В UI можно загрузить новую версию документа и скачать конкретную версию из истории. Download идет только через protected backend endpoint; файлы не лежат в public.

S3 пример:

```bash
UPLOAD_STORAGE_PROVIDER=s3
S3_BUCKET=pgs-documents
S3_REGION=us-east-1
S3_ENDPOINT=https://s3.example.com
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

S3 credentials не логируются и не возвращаются API.

## JSON Export

Доступны:

- `GET /api/projects/:id/export/json` - проект, бюджет, график, материалы, снабжение, платежи, рапорты, риски и metadata документов без file bytes;
- `GET /api/projects/:id/audit/export/json` - журнал с фильтрами `entityType`, `action`, `from`, `to`, `limit` до 5000.

Кнопки экспорта находятся во вкладке “История”.

## GitHub и CI

Repo: `https://github.com/Grafnnn/PGS`.

Добавлены:

- `.github/workflows/ci.yml` - safe CI без реальных DB/S3 secrets: install, Prisma generate/validate, test, lint, build;
- `.github/workflows/staging-smoke.yml` - manual workflow_dispatch smoke по `app_url`, mutation выключен по умолчанию;
- issue templates для bug/feature/staging smoke;
- PR template с DB/env/security/smoke checklist.

Правило процесса: не push, не merge, не закрывать issues и не менять protected/main без явной команды владельца.

## Connector Readiness

PGS знает о будущих online integrations, но v0.8 не выполняет внешние мутации:

- GitHub: metadata repo `Grafnnn/PGS`, режим `read_only` по умолчанию;
- Google Drive/Docs/Sheets/Slides: readiness для будущего источника документов;
- Gmail: readiness для invite/reset delivery;
- Google Calendar: readiness для будущих контрольных дат;
- Render/Vercel: deployment profile placeholders;
- OpenAI: optional, AI calls opt-in.

Проверка:

```bash
GET /api/connectors/status
```

UI:

```text
/admin/integrations
```

Endpoint доступен `OWNER/ADMIN` и не возвращает OAuth tokens/API keys/secrets.

## Invite, Reset Password и Email Adapter

Routes:

- `POST /api/admin/invites`;
- `POST /api/invites/accept`;
- `POST /api/admin/users/:userId/reset-password-token`;
- `POST /api/auth/reset-password`;
- `/invite/accept?token=...`;
- `/reset-password?token=...`.

Токены:

- raw token генерируется один раз;
- в БД хранится только SHA-256 hash;
- invite token по умолчанию живет 48 часов;
- reset token по умолчанию живет 2 часа;
- reset token single-use и отзывает старые sessions.

Email:

- `EMAIL_PROVIDER=console` в dev/staging не отправляет письма, а возвращает delivery preview;
- Gmail/SMTP оставлены как provider boundary без внешних зависимостей;
- в production console provider не должен считаться рабочей доставкой.

## Smoke Project и Cleanup

Mutation smoke должен идти только в `project-smoke`.

Read-only smoke:

```bash
APP_URL=http://127.0.0.1:3000 pnpm smoke:staging
```

Authenticated smoke:

```bash
APP_URL=http://127.0.0.1:3000 \
SMOKE_EMAIL=admin@pgs.local \
SMOKE_PASSWORD=... \
pnpm smoke:staging
```

Mutation smoke:

```bash
APP_URL=http://127.0.0.1:3000 \
SMOKE_EMAIL=admin@pgs.local \
SMOKE_PASSWORD=... \
SMOKE_ALLOW_MUTATION=true \
pnpm smoke:staging
```

Cleanup:

```bash
SMOKE_CLEANUP_CONFIRM=project-smoke pnpm smoke:cleanup
```

Cleanup удаляет только smoke-marked данные (`SMOKE-...`, `smoke+...`) внутри `project-smoke` и не трогает `project-demo`.

## Operational Hardening

- Новые v0.8 endpoints используют `x-request-id` и JSON error envelope.
- Login/reset защищены MVP in-memory rate limit.
- `pnpm auth:cleanup-sessions` удаляет истекшие sessions и старые revoked sessions.
- `scripts/db-backup.sh` и `scripts/db-restore.sh` дают local/staging pg_dump/pg_restore flow.
- Подробный live playbook: `docs/staging_live_verification.md`.

## Production deployment notes

Проект не деплоится автоматически. Варианты:

- Render: web service + managed PostgreSQL. Env: `DATABASE_URL`, `AUTH_REQUIRED`, `SESSION_SECRET`, `OPENAI_API_KEY` при использовании AI, `UPLOAD_DIR` или S3 env. Команды: `pnpm install`, `pnpm prisma:generate`, `pnpm build`, start `pnpm start`. Миграции запускать отдельным one-off job.
- Vercel + managed PostgreSQL: подключить PostgreSQL provider, установить env, выполнить `pnpm prisma:migrate` из CI/локально перед production traffic. Документы хранить в S3-compatible storage, не на ephemeral FS.
- Docker VPS: `docker compose up --build`, production `DATABASE_URL` на managed или локальный PostgreSQL, HTTPS через reverse proxy, backups volume/database.

Production checklist:

- GitHub repo connected: `https://github.com/Grafnnn/PGS`;
- CI green;
- `DATABASE_URL` задан;
- `AUTH_REQUIRED=true`;
- `SESSION_SECRET` задан;
- `APP_URL` задан;
- `EMAIL_PROVIDER` production-ready или invite/reset delivery отключен;
- `FIRST_ADMIN_EMAIL` задан для bootstrap;
- `FIRST_ADMIN_PASSWORD` задан только на время bootstrap и затем ротирован/убран;
- `OPENAI_API_KEY` задан только если AI endpoints нужны;
- `NODE_ENV=production`;
- migrations применены;
- demo seed выключен или ограничен demo-only;
- storage strategy для документов определена, uploads не лежат в git;
- `UPLOAD_STORAGE_PROVIDER` выбран;
- local uploads имеют persistent disk; Vercel/serverless использует внешний S3-compatible storage;
- S3 env vars заданы, если используется S3 adapter;
- `MAX_UPLOAD_MB` задан;
- PostgreSQL backups включены;
- S3 verified или local persistent disk mounted;
- HTTPS включен;
- `/api/health` возвращает `200 ok`;
- read-only `pnpm smoke:staging` выполнен;
- mutation smoke выполнен только на staging и только на `project-smoke`;
- `SMOKE_CLEANUP_CONFIRM=project-smoke pnpm smoke:cleanup` выполнен после mutation smoke;
- роли проверены: `VIEWER` не может писать, `MANAGER` может вести проект, `OWNER/ADMIN` могут удалять.
- connector modes reviewed: Google Drive/Gmail/Calendar disabled until explicitly configured;
- no demo/local passwords active.

## Ограничения MVP

- Dashboard, Projects и Project detail читают PostgreSQL через Prisma, с fallback на demo state только когда локальная БД недоступна.
- Создание бюджетных позиций, работ, материалов, платежей, рапортов и рисков из UI идет через API и сохраняется в PostgreSQL при поднятой БД.
- Auth уже DB-backed, есть админка пользователей, invite/reset foundation и console email provider; real Gmail/SMTP delivery еще не подключен.
- Invite/reset foundation готов, но real Gmail/SMTP delivery еще не подключен.
- Файловое хранилище реализовано локально и через S3-compatible adapter; S3 live network flow требует реальный bucket/env.
- Connector readiness не выполняет реальные Google/Gmail/Calendar/Render/Vercel мутации.
- Rate limit in-memory, не распределенный; для production нужен Redis/WAF/platform limit.
- Excel импорт реализован для типовых ВОР/смет; сложные многострочные шапки, объединенные ячейки и нестандартные формы могут потребовать ручной подготовки файла или расширения маппинга.
- PDF импорт пока не реализован.
- КС-2/КС-3 заложены как документы/структура, официальные печатные формы не генерируются.

## Следующий этап

- Проверить live PostgreSQL migrate/seed/import/documents/audit на машине с Docker/PostgreSQL.
- Подключить real staging PostgreSQL/S3 и выполнить mutation smoke на `project-smoke`.
- Подключить production email provider для invite/reset password.
- Подготовить Render/Vercel deployment profile без ручных шагов.
- Добавить distributed rate limit и более полный request logging.
- Расширить ПТО/КС закрытие и approval workflow.
- Добавить Google Drive/Sheets import только после явного connector setup.
