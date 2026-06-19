# PGS Construction Platform

Локальный MVP онлайн-системы управления строительным проектом по концепции EfA: проект → бюджет / ВОР → график → факт → материалы → снабжение → финансы → рапорты → риски → AI-помощник.

## Что реализовано

- Next.js / React / TypeScript приложение.
- Демо-вход: `demo@pgs.local` / `demo-password`.
- Дашборд компании и список проектов.
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
- Demo seed для организации “Демо Строй”.
- Docker Compose для PostgreSQL + web.
- OpenAI API key сохранен локально в `.env.local` как `OPENAI_API_KEY`.

## Архитектура

Выбран единый Next.js MVP, потому что он быстрее дает проверяемую онлайн-систему с UI и API в одном приложении. Prisma/PostgreSQL уже заложены отдельно, поэтому следующий этап может безболезненно перенести demo state на реальные таблицы и расширить backend.

Основные файлы:

- `src/app/dashboard/page.tsx` - дашборд компании.
- `src/app/projects/page.tsx` - список проектов.
- `src/app/projects/[id]/page.tsx` - карточка проекта.
- `src/components/project-workspace.tsx` - основной рабочий интерфейс объекта.
- `src/app/api/[...path]/route.ts` - MVP API endpoints.
- `src/lib/calculations.ts` - расчетный слой.
- `src/lib/ai.ts` - AI context builder и OpenAI вызов.
- `src/lib/demo-data.ts` - demo seed для UI/API.
- `prisma/schema.prisma` - PostgreSQL модель данных.
- `prisma/seed.ts` - загрузка demo данных в БД.

## Локальный запуск

В этой desktop-сессии Node.js доступен через bundled runtime. Если в обычном терминале установлен Node.js 20+, можно использовать стандартные команды:

```bash
npm install
npm run dev
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
OPENAI_API_KEY="..."
DATABASE_URL="postgresql://pgs:pgs@localhost:5432/pgs?schema=public"
NEXTAUTH_SECRET="change-me-in-local-dev"
```

`.env.local` не коммитится.

## PostgreSQL, миграции и seed

Запуск БД:

```bash
docker compose up db
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

## API endpoints

Next.js routes имеют префикс `/api`.

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
- `POST /api/projects/:id/budget/import`
- `GET /api/projects/:id/schedule`
- `POST /api/projects/:id/schedule`
- `GET /api/projects/:id/materials`
- `POST /api/projects/:id/materials`
- `GET /api/projects/:id/procurement`
- `POST /api/projects/:id/procurement`
- `GET /api/projects/:id/finance`
- `POST /api/projects/:id/payments`
- `GET /api/projects/:id/daily-reports`
- `POST /api/projects/:id/daily-reports`
- `GET /api/projects/:id/risks`
- `POST /api/projects/:id/risks`
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
pnpm test
pnpm lint
pnpm build
```

## AI-помощник

AI endpoint собирает контекст проекта:

- summary проекта;
- бюджетные итоги;
- график и просрочки;
- материалы с дефицитом;
- финансы и кассовый разрыв;
- риски.

Если `OPENAI_API_KEY` есть, `/api/projects/project-demo/ai/chat` отправляет контекст в OpenAI. Если ключ отсутствует, endpoint не падает и возвращает локальный fallback с понятной причиной.

## Ограничения MVP

- UI использует demo state и local client-side добавления; запись в PostgreSQL подготовлена схемой и seed, но не подключена к каждому экрану.
- Auth пока демонстрационный, без полноценной session/JWT проверки.
- Файловое хранилище и документы подготовлены структурно, но upload pipeline не реализован.
- Импорт Excel/PDF реализован как API-заготовка с рекомендациями, без полноценного парсинга.
- КС-2/КС-3 заложены как документы/структура, официальные печатные формы не генерируются.

## Следующий этап

- Подключить Prisma queries вместо demo state.
- Добавить реальные sessions/JWT и backend authorization checks.
- Реализовать upload файлов в `uploads` и S3-compatible storage.
- Добавить CSV/XLSX import pipeline.
- Расширить ПТО/КС закрытие и approval workflow.
- Добавить миграции CI/CD и production deploy profile.
