# PGS Construction Platform

Локальный MVP онлайн-системы управления строительным проектом по концепции EfA: проект → бюджет / ВОР → график → факт → материалы → снабжение → финансы → рапорты → риски → AI-помощник.

## Что реализовано

- Next.js / React / TypeScript приложение.
- DB-backed auth: bcrypt password hashes, opaque session cookie, server-side sessions.
- First-admin bootstrap через `FIRST_ADMIN_EMAIL`, `FIRST_ADMIN_PASSWORD`, `FIRST_ADMIN_NAME`.
- Дашборд компании и список проектов.
- Health endpoint `/api/health` для проверки env, PostgreSQL, AI и storage-настроек.
- Роли `OWNER`, `ADMIN`, `MANAGER`, `VIEWER` с централизованной проверкой permissions.
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
- `src/app/api/projects/[projectId]/documents` - upload/download/delete документов.
- `src/lib/auth/permissions.ts` - базовая модель ролей и прав.
- `src/lib/auth/session.ts` - opaque session tokens и DB session lookup.
- `src/lib/auth/password.ts` - bcrypt hash/verify.
- `src/lib/env.ts` - централизованная валидация env.
- `src/lib/storage` - local/S3-ready storage adapter.
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
```

`.env.local` не коммитится.

Для production/staging:

- `NODE_ENV=production`;
- `AUTH_REQUIRED=true`;
- `SESSION_SECRET` задан длинным случайным значением;
- `FIRST_ADMIN_EMAIL` и `FIRST_ADMIN_PASSWORD` заданы для первого bootstrap, затем пароль нужно сменить/убрать из env;
- `DATABASE_URL` указывает на live PostgreSQL;
- `UPLOAD_STORAGE_PROVIDER=local` допустим только для VPS/volume, для serverless нужен S3-compatible storage;
- `OPENAI_API_KEY` задается только если нужны AI endpoints.

## Auth, Sessions и First Admin

v0.6 использует DB-backed auth:

- пароль хранится только как bcrypt hash в `users.password_hash`;
- cookie `pgs_session` содержит только случайный opaque token;
- в таблице `sessions` хранится SHA-256 hash token, `expires_at`, `revoked_at`, user agent и IP;
- logout отзывает session и очищает cookie;
- `/api/auth/me` читает session и возвращает текущего пользователя без `passwordHash`.

Seed создает первого OWNER:

- если заданы `FIRST_ADMIN_EMAIL` и `FIRST_ADMIN_PASSWORD`, используется эта пара;
- в dev, если они не заданы, создается local-only `admin@pgs.local` / `pgs-admin-local`;
- в production небезопасный пароль автоматически не создается.

Также seed обновляет demo-пользователя `demo@pgs.local` с паролем из `DEMO_ADMIN_PASSWORD`, чтобы локальный сценарий оставался удобным.

## Roles и Permissions

Роли приложения хранятся в `users.app_role`:

- `OWNER` - все действия;
- `ADMIN` - все операции по проектам, без будущих owner-only системных действий;
- `MANAGER` - редактирование данных проекта, Excel import, upload документов, просмотр audit;
- `VIEWER` - read-only, скачивание документов и просмотр audit;
- anonymous - нет доступа при `AUTH_REQUIRED=true`; local fallback только при `AUTH_REQUIRED=false`.

Все write/import/upload/delete endpoints проходят через `src/lib/auth/permissions.ts`.

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
```

## API endpoints

Next.js routes имеют префикс `/api`.

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
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
- `version.appVersion` и `version.gitSha`, если `GIT_SHA` задан;
- `missing` для обязательных production/staging env.

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
SMOKE_PASSWORD=pgs-admin-local \
pnpm smoke:staging
```

По умолчанию smoke не мутирует production/staging данные. Для локальной проверки upload можно явно включить:

```bash
SMOKE_ALLOW_MUTATION=true SMOKE_EMAIL=admin@pgs.local SMOKE_PASSWORD=pgs-admin-local pnpm smoke:staging
```

Вывод имеет статусы `PASS`, `FAIL`, `SKIP`; любой `FAIL` завершает процесс с non-zero exit code.

## AI-помощник

AI endpoint собирает контекст проекта:

- summary проекта;
- бюджетные итоги;
- график и просрочки;
- материалы с дефицитом;
- финансы и кассовый разрыв;
- риски.

Если `OPENAI_API_KEY` есть, `/api/projects/project-demo/ai/chat` отправляет контекст в OpenAI. Если ключ отсутствует, endpoint не падает и возвращает локальный fallback с понятной причиной.

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
- `UPLOAD_STORAGE_PROVIDER=s3` - интерфейс подготовлен, в v0.6 возвращает clear not implemented/configured error без внешних вызовов.

Для production/serverless нужен S3-compatible storage adapter. Рекомендуемые категории:

- договоры;
- сметы;
- ВОР;
- исполнительная документация;
- КС-2/КС-3;
- чертежи;
- фотофиксация;
- счета и платежные документы.

Уже включены whitelist расширений, базовая проверка MIME/размера, backend-проверка прав, audit log, server-generated storage key, path traversal protection и `DocumentVersion` для первой версии файла. Для PDF/images выставляется preview-ready metadata, но встроенный preview viewer пока не реализован.

## Production deployment notes

Проект не деплоится автоматически. Варианты:

- Render: web service + managed PostgreSQL. Env: `DATABASE_URL`, `AUTH_REQUIRED`, `SESSION_SECRET`, `OPENAI_API_KEY` при использовании AI, `UPLOAD_DIR` или S3 env. Команды: `pnpm install`, `pnpm prisma:generate`, `pnpm build`, start `pnpm start`. Миграции запускать отдельным one-off job.
- Vercel + managed PostgreSQL: подключить PostgreSQL provider, установить env, выполнить `pnpm prisma:migrate` из CI/локально перед production traffic. Документы хранить в S3-compatible storage, не на ephemeral FS.
- Docker VPS: `docker compose up --build`, production `DATABASE_URL` на managed или локальный PostgreSQL, HTTPS через reverse proxy, backups volume/database.

Production checklist:

- `DATABASE_URL` задан;
- `AUTH_REQUIRED=true`;
- `SESSION_SECRET` задан;
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
- HTTPS включен;
- `/api/health` возвращает `200 ok`;
- `pnpm smoke:staging` выполнен;
- роли проверены: `VIEWER` не может писать, `MANAGER` может вести проект, `OWNER/ADMIN` могут удалять.

## Ограничения MVP

- Dashboard, Projects и Project detail читают PostgreSQL через Prisma, с fallback на demo state только когда локальная БД недоступна.
- Создание бюджетных позиций, работ, материалов, платежей, рапортов и рисков из UI идет через API и сохраняется в PostgreSQL при поднятой БД.
- Auth уже DB-backed, но без UI управления пользователями, reset password и invite flow.
- Файловое хранилище реализовано локально через adapter; production S3 adapter пока placeholder без внешних вызовов.
- Excel импорт реализован для типовых ВОР/смет; сложные многострочные шапки, объединенные ячейки и нестандартные формы могут потребовать ручной подготовки файла или расширения маппинга.
- PDF импорт пока не реализован.
- КС-2/КС-3 заложены как документы/структура, официальные печатные формы не генерируются.

## Следующий этап

- Добавить UI управления пользователями, invite/reset password и project-level permissions.
- Реализовать полноценный S3-compatible storage adapter.
- Проверить live Excel import на реальной локальной PostgreSQL.
- Расширить ПТО/КС закрытие и approval workflow.
- Добавить миграции CI/CD и production deploy profile.
