import { describe, expect, it } from "vitest";
import { getConnectorConfig } from "./config";
import { getConnectorStatuses } from "./status";
import type { AppEnv } from "@/lib/env";

function env(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    NODE_ENV: "development",
    APP_URL: "http://localhost:3000",
    AUTH_REQUIRED: "false",
    EMAIL_PROVIDER: "console",
    GITHUB_REPO: "Grafnnn/PGS",
    GITHUB_CONNECTOR_MODE: "read_only",
    GOOGLE_DRIVE_CONNECTOR_MODE: "disabled",
    GMAIL_CONNECTOR_MODE: "disabled",
    GOOGLE_CALENDAR_CONNECTOR_MODE: "disabled",
    RENDER_CONNECTOR_MODE: "disabled",
    VERCEL_CONNECTOR_MODE: "disabled",
    OPENAI_CONNECTOR_MODE: "disabled",
    LOGIN_RATE_LIMIT_WINDOW_MS: 60_000,
    LOGIN_RATE_LIMIT_MAX: 8,
    RESET_RATE_LIMIT_WINDOW_MS: 900_000,
    RESET_RATE_LIMIT_MAX: 5,
    DEMO_ADMIN_EMAIL: "demo@pgs.local",
    DEMO_ADMIN_PASSWORD: "demo-password-change-me",
    FIRST_ADMIN_NAME: "PGS Admin",
    MAX_UPLOAD_MB: 50,
    UPLOAD_DIR: "./storage/uploads",
    UPLOAD_STORAGE_PROVIDER: "local",
    S3_FORCE_PATH_STYLE: "true",
    ...overrides
  };
}

describe("connector readiness config", () => {
  it("defaults GitHub to official repo and disables external document/calendar providers", () => {
    const config = getConnectorConfig(env());
    expect(config.find((connector) => connector.id === "github")?.metadata?.repo).toBe("Grafnnn/PGS");
    expect(config.find((connector) => connector.id === "github")?.mode).toBe("read_only");
    expect(config.find((connector) => connector.id === "google_drive")?.configured).toBe(false);
    expect(config.find((connector) => connector.id === "google_calendar")?.configured).toBe(false);
  });

  it("does not expose secret-looking metadata keys in status", () => {
    const previousRepo = process.env.GITHUB_REPO;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    process.env.GITHUB_REPO = "Grafnnn/PGS";
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    const statuses = getConnectorStatuses(new Date("2026-06-19T00:00:00.000Z"));
    const serialized = JSON.stringify(statuses);
    process.env.GITHUB_REPO = previousRepo;
    process.env.OPENAI_API_KEY = previousOpenAi;
    expect(serialized).not.toContain("openai-token-redacted");
    expect(serialized).not.toContain("OPENAI_API_KEY");
  });
});
