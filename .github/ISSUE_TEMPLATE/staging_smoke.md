---
name: Staging smoke checklist
about: Зафиксировать результат staging smoke
title: "[Smoke]: "
labels: staging, smoke
assignees: ""
---

## Контекст
- App URL:
- Branch/commit:
- Smoke run id:
- Read-only или mutation:

## Результат
- [ ] `/api/health`
- [ ] Login/auth me
- [ ] `/dashboard`
- [ ] `/projects/project-demo`
- [ ] `/projects/project-smoke`
- [ ] Project members API
- [ ] Documents list/version flow
- [ ] Project/audit exports
- [ ] `/api/connectors/status`
- [ ] Mutation smoke только на `project-smoke`
- [ ] Cleanup выполнен или запланирован

## Команды

```bash
APP_URL=... SMOKE_EMAIL=... SMOKE_PASSWORD=... pnpm smoke:staging
SMOKE_CLEANUP_CONFIRM=project-smoke pnpm smoke:cleanup
```

## Логи / requestId

## Блокеры
