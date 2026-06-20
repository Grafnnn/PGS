# PGS staging live verification

Этот playbook нужен для проверки PGS на реальной PostgreSQL/S3/staging-инфраструктуре без подмены результата локальными mock-success.

## Prerequisites

- GitHub repo: `https://github.com/Grafnnn/PGS`.
- Node.js 20+ и pnpm.
- Доступный PostgreSQL или Docker.
- Для S3 проверки: отдельный synthetic bucket/prefix, не production-документы.
- Staging URL с `AUTH_REQUIRED=true`.
- Owner/admin smoke-пользователь.

## GitHub repo setup

```bash
git remote -v
gh repo view Grafnnn/PGS
gh pr list --repo Grafnnn/PGS --limit 10
gh issue list --repo Grafnnn/PGS --limit 10
```

Если `gh` не авторизован, это не блокер кода. Настройте GitHub CLI отдельно и не пушьте/merge без явной команды владельца.

## Env vars

Минимум для staging:

```bash
DATABASE_URL=postgresql://...
AUTH_REQUIRED=true
SESSION_SECRET=...
APP_URL=https://staging.example.com
EMAIL_PROVIDER=console
UPLOAD_STORAGE_PROVIDER=local
GITHUB_REPO=Grafnnn/PGS
GITHUB_CONNECTOR_MODE=read_only
GOOGLE_DRIVE_CONNECTOR_MODE=disabled
GMAIL_CONNECTOR_MODE=disabled
GOOGLE_CALENDAR_CONNECTOR_MODE=disabled
RENDER_CONNECTOR_MODE=disabled
VERCEL_CONNECTOR_MODE=disabled
OPENAI_CONNECTOR_MODE=disabled
```

Для S3:

```bash
UPLOAD_STORAGE_PROVIDER=s3
S3_BUCKET=...
S3_REGION=...
S3_ENDPOINT=...
S3_FORCE_PATH_STYLE=true
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
```

Не печатайте секреты в logs и не коммитьте `.env`.

## Local PostgreSQL verification

```bash
pnpm install
pnpm prisma validate
pnpm prisma generate
docker compose config
docker compose up -d db
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

Ожидается:

- `/api/health` возвращает `200 ok`;
- миграции применены;
- seed создал `project-demo` и `project-smoke`;
- login работает через DB-backed session.

## Staging PostgreSQL verification

```bash
pnpm prisma validate
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma db seed
```

Проверить:

```bash
curl -i "$APP_URL/api/health"
```

Ожидается `200 ok`. `503 degraded` допустим только как blocker, не как успешная проверка.

## Auth verification

```bash
APP_URL=https://staging.example.com \
SMOKE_EMAIL=admin@pgs.local \
SMOKE_PASSWORD=... \
pnpm smoke:staging
```

Проверить вручную:

- `/login`;
- `/api/auth/login`;
- `/api/auth/me`;
- `/admin/users`;
- `/admin/integrations`.

## Excel import verification

```bash
pnpm import:fixture
```

Загрузить synthetic Excel через вкладку `Бюджет / ВОР`, выполнить preview, затем commit в `project-smoke`. Проверить audit и cleanup.

## Document versions verification

На `project-smoke`:

- загрузить маленький synthetic `.pdf`;
- скачать документ;
- загрузить v2;
- скачать предыдущую/новую версию;
- удалить документ;
- убедиться, что audit содержит upload/version/delete.

## Local storage verification

При `UPLOAD_STORAGE_PROVIDER=local`:

- `UPLOAD_DIR` должен быть persistent volume на staging;
- `/api/health` должен показывать `storage.writable=true`.

## S3 storage verification

При `UPLOAD_STORAGE_PROVIDER=s3`:

- использовать synthetic file с именем `SMOKE-...`;
- проверить upload/download/version/delete;
- не использовать реальные документы;
- не создавать bucket из приложения;
- не считать S3 успешным, если env/bucket не задан.

## Connector status verification

```bash
curl -i "$APP_URL/api/connectors/status"
```

С owner/admin session endpoint должен вернуть статусы:

- GitHub repo `Grafnnn/PGS`;
- Google Drive/Gmail/Calendar disabled by default;
- Render/Vercel disabled by default;
- OpenAI disabled/configured в зависимости от env;
- без OAuth tokens, API keys и секретов.

## Smoke mutation safety

Mutation smoke разрешен только на `project-smoke`:

```bash
APP_URL=https://staging.example.com \
SMOKE_EMAIL=admin@pgs.local \
SMOKE_PASSWORD=... \
SMOKE_ALLOW_MUTATION=true \
pnpm smoke:staging
```

Запрещено:

- mutation smoke на `project-demo`;
- mutation smoke при `APP_ENV=production`;
- реальные customer documents;
- реальные email delivery без явной настройки provider.

Cleanup:

```bash
SMOKE_CLEANUP_CONFIRM=project-smoke pnpm smoke:cleanup
```

## Backup and restore

Для local/staging:

```bash
DATABASE_URL=postgresql://... scripts/db-backup.sh
RESTORE_CONFIRM=pgs-restore DATABASE_URL=postgresql://... scripts/db-restore.sh ./backups/pgs-YYYYMMDD-HHMMSS.dump
```

Для managed PostgreSQL production предпочтительны provider-native backups/snapshots. Dump-файлы не коммитить.

## Rollback

- Остановить deployment.
- Проверить миграции.
- Восстановить backup/snapshot при необходимости.
- Отключить mutation smoke.
- Вернуть connector modes в `disabled/read_only`.

## Troubleshooting

- `503 degraded`: проверить `DATABASE_URL`, миграции, storage writable, missing env в `/api/health`.
- `403`: проверить роль пользователя и project membership.
- `429`: сработал in-memory rate limit login/reset.
- `S3 SignatureDoesNotMatch`: проверить region/endpoint/path-style и ключи.
- `project-smoke 404`: выполнить `pnpm prisma:seed`.

## Production запреты

- Не запускать mutation smoke без отдельного staging-контекста.
- Не отправлять реальные документы в OpenAI автоматически.
- Не включать Gmail/Drive/Calendar mutations без отдельного подтверждения.
- Не использовать `EMAIL_PROVIDER=console` как рабочую доставку invite/reset.
- Не хранить OAuth/API tokens в коде или GitHub issues.
