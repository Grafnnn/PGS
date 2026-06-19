# PGS Construction Platform

Локальный MVP онлайн-системы управления строительным проектом по концепции EfA: проект → бюджет / ВОР → график → факт → материалы → снабжение → финансы → рапорты → риски → AI-помощник.

## Что реализовано

- Next.js / React / TypeScript приложение.
- Демо-вход: `demo@pgs.local` / `demo-password-change-me`.
- Дашборд компании и список проектов.
- Health endpoint `/api/health` для проверки env, PostgreSQL, AI и storage-настроек.
- Демо-auth с cookie-сессией и ролями `OWNER`, `ADMIN`, `MANAGER`, `VIEWER`.
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
- Local document upload/download/delete с метаданными в PostgreSQL и файлами в `UPLOAD_DIR`.
- Demo seed для организации “Демо Строй”.
- SQL migration в `prisma/migrations/20260619183000_v0_2_baseline`.
- Docker Compose для PostgreSQL + web.
- OpenAI API key сохранен локально в `.env.local` как `OPENAI_API_KEY`.

## Архитектура

Выбран единый Next.js MVP, потому что он быстрее дает проверяемую онлайн-систему с UI и API в одном приложении. Prisma/PostgreSQL уже заложены отдельно, поэтому следующий этап может безболезненно перенести demo state на реальные таблицы и расширить backend.

Основные файлы:

- `src/app/dashboard/page.tsx` - дашборд компании.
- `src/app/projects/page.tsx` - список проектов.
- `src/app/projects/[id]/page.tsx` - карточка проекта.
- `src/components/project-workspace.tsx` - основной рабочий интерфейс объекта.
- `src/app/api/[...path]/route.ts` - API endpoints с Prisma CRUD и Zod-валидацией.
- `src/app/api/health/route.ts` - staging health check.
- `src/app/api/auth/login/route.ts` - демо-login с cookie-сессией.
- `src/app/api/projects/[projectId]/documents` - upload/download/delete документов.
- `src/lib/auth/permissions.ts` - базовая модель ролей и прав.
- `src/lib/env.ts` - централизованная валидация env.
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
UPLOAD_DIR="./uploads"
MAX_UPLOAD_MB="50"
UPLOAD_STORAGE_PROVIDER="local"
```

`.env.local` не коммитится.

Для production/staging:

- `NODE_ENV=production`;
- `AUTH_REQUIRED=true`;
- `SESSION_SECRET` задан длинным случайным значением;
- `DATABASE_URL` указывает на live PostgreSQL;
- `UPLOAD_STORAGE_PROVIDER=local` допустим только для VPS/volume, для serverless нужен S3-compatible storage;
- `OPENAI_API_KEY` задается только если нужны AI endpoints.

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
```

Health check:

```bash
curl -i http://localhost:3000/api/health
```

При недоступной БД endpoint возвращает `503` и JSON со статусом `degraded`, не ломая приложение.

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

Для dev-режима документы хранятся в `UPLOAD_DIR` (`./uploads`), а в PostgreSQL остаются только метаданные: категория, название, путь, имя файла, mime type, размер, storage key, версия и автор.

Для production нужен S3-compatible storage. Рекомендуемые категории:

- договоры;
- сметы;
- ВОР;
- исполнительная документация;
- КС-2/КС-3;
- чертежи;
- фотофиксация;
- счета и платежные документы.

Уже включены whitelist расширений, базовая проверка MIME/размера, backend-проверка прав и audit log. Ограничения для следующего этапа: S3 adapter, антивирусная проверка или asynchronous scan pipeline, версии документов и preview.

## Production deployment notes

Проект не деплоится автоматически. Варианты:

- Render: web service + managed PostgreSQL. Env: `DATABASE_URL`, `AUTH_REQUIRED`, `SESSION_SECRET`, `OPENAI_API_KEY` при использовании AI, `UPLOAD_DIR` или S3 env. Команды: `pnpm install`, `pnpm prisma:generate`, `pnpm build`, start `pnpm start`. Миграции запускать отдельным one-off job.
- Vercel + managed PostgreSQL: подключить PostgreSQL provider, установить env, выполнить `pnpm prisma:migrate` из CI/локально перед production traffic. Документы хранить в S3-compatible storage, не на ephemeral FS.
- Docker VPS: `docker compose up --build`, production `DATABASE_URL` на managed или локальный PostgreSQL, HTTPS через reverse proxy, backups volume/database.

Production checklist:

- `DATABASE_URL` задан;
- `AUTH_REQUIRED=true`;
- `SESSION_SECRET` задан;
- `OPENAI_API_KEY` задан только если AI endpoints нужны;
- `NODE_ENV=production`;
- migrations применены;
- demo seed выключен или ограничен demo-only;
- storage strategy для документов определена, uploads не лежат в git;
- PostgreSQL backups включены;
- HTTPS включен;
- `/api/health` возвращает `200 ok`;
- роли проверены: `VIEWER` не может писать, `MANAGER` может вести проект, `OWNER/ADMIN` могут удалять.

## Ограничения MVP

- Dashboard, Projects и Project detail читают PostgreSQL через Prisma, с fallback на demo state только когда локальная БД недоступна.
- Создание бюджетных позиций, работ, материалов, платежей, рапортов и рисков из UI идет через API и сохраняется в PostgreSQL при поднятой БД.
- Auth пока демонстрационный: cookie-сессия с ролью, без полноценной таблицы sessions/JWT/password hash flow.
- Файловое хранилище реализовано локально, production S3 adapter пока описан архитектурно.
- Excel импорт реализован для типовых ВОР/смет; сложные многострочные шапки, объединенные ячейки и нестандартные формы могут потребовать ручной подготовки файла или расширения маппинга.
- PDF импорт пока не реализован.
- КС-2/КС-3 заложены как документы/структура, официальные печатные формы не генерируются.

## Следующий этап

- Добавить реальные sessions/JWT, reset password и управление пользователями.
- Реализовать S3-compatible storage adapter.
- Проверить live Excel import на реальной локальной PostgreSQL.
- Расширить ПТО/КС закрытие и approval workflow.
- Добавить миграции CI/CD и production deploy profile.
