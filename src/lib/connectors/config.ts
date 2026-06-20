import { getEnv, type AppEnv } from "@/lib/env";
import type { ConnectorConfig, ConnectorId, ConnectorMode } from "./types";

function configuredFromMode(mode: ConnectorMode) {
  return mode !== "disabled";
}

export function getConnectorConfig(env: AppEnv = getEnv()): ConnectorConfig[] {
  const githubRepo = env.GITHUB_REPO || "Grafnnn/PGS";
  const openAiConfigured = Boolean(env.OPENAI_API_KEY);

  return [
    {
      id: "github",
      label: "GitHub",
      mode: env.GITHUB_CONNECTOR_MODE,
      configured: configuredFromMode(env.GITHUB_CONNECTOR_MODE) && Boolean(githubRepo),
      metadata: { repo: githubRepo },
      notes: ["Используется как официальный repo metadata. Push/merge только по явной команде."],
      warnings: env.GITHUB_CONNECTOR_MODE === "enabled" ? ["В v0.8 внешние мутации GitHub должны оставаться ручными."] : []
    },
    {
      id: "google_drive",
      label: "Google Drive / Docs / Sheets / Slides",
      mode: env.GOOGLE_DRIVE_CONNECTOR_MODE,
      configured: configuredFromMode(env.GOOGLE_DRIVE_CONNECTOR_MODE),
      notes: ["Готовность для будущего поиска и импорта проектных документов."],
      warnings: env.GOOGLE_DRIVE_CONNECTOR_MODE !== "disabled" ? ["Не импортировать и не изменять реальные файлы без подтверждения."] : []
    },
    {
      id: "gmail",
      label: "Gmail",
      mode: env.GMAIL_CONNECTOR_MODE,
      configured: configuredFromMode(env.GMAIL_CONNECTOR_MODE) && env.EMAIL_PROVIDER === "gmail",
      notes: ["Future provider для invite/reset delivery. Сейчас безопасный email adapter может работать в console mode."],
      warnings: env.EMAIL_PROVIDER === "console" ? ["EMAIL_PROVIDER=console не отправляет реальные письма."] : []
    },
    {
      id: "google_calendar",
      label: "Google Calendar",
      mode: env.GOOGLE_CALENDAR_CONNECTOR_MODE,
      configured: configuredFromMode(env.GOOGLE_CALENDAR_CONNECTOR_MODE),
      notes: ["Готовность для будущих контрольных дат и графиков работ."],
      warnings: env.GOOGLE_CALENDAR_CONNECTOR_MODE !== "disabled" ? ["Не создавать события без отдельной команды."] : []
    },
    {
      id: "render",
      label: "Render",
      mode: env.RENDER_CONNECTOR_MODE,
      configured: configuredFromMode(env.RENDER_CONNECTOR_MODE),
      notes: ["Deployment profile readiness; deploy/env mutations только вручную."],
      warnings: []
    },
    {
      id: "vercel",
      label: "Vercel",
      mode: env.VERCEL_CONNECTOR_MODE,
      configured: configuredFromMode(env.VERCEL_CONNECTOR_MODE),
      notes: ["Deployment profile readiness; deploy/env mutations только вручную."],
      warnings: []
    },
    {
      id: "openai",
      label: "OpenAI",
      mode: env.OPENAI_CONNECTOR_MODE,
      configured: openAiConfigured && configuredFromMode(env.OPENAI_CONNECTOR_MODE),
      notes: ["AI должен быть opt-in и получать только подготовленный контекст проекта."],
      warnings: openAiConfigured ? [] : ["OPENAI_API_KEY не задан; AI endpoints должны возвращать понятную ошибку."]
    }
  ];
}

export function getConnectorById(id: ConnectorId, env: AppEnv = getEnv()) {
  return getConnectorConfig(env).find((connector) => connector.id === id);
}
