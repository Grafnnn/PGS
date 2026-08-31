import { afterEach, describe, expect, it, vi } from "vitest";
import { getEnvStatus } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("env helpers", () => {
  it("reports optional AI as configured flag only", () => {
    const status = getEnvStatus();

    expect(typeof status.aiConfigured).toBe("boolean");
    expect(status.maxUploadMb).toBeGreaterThan(0);
  });

  it("flags insecure production auth configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_REQUIRED", "false");
    vi.stubEnv("SESSION_SECRET", "");

    const status = getEnvStatus();

    expect(status.authRequired).toBe(true);
    expect(status.authMode).toBe("db-session");
    expect(status.missing).toContain("AUTH_REQUIRED=true");
    expect(status.missing).toContain("SESSION_SECRET");
  });

  it("accepts database-backed document storage without S3 settings", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_REQUIRED", "true");
    vi.stubEnv("SESSION_SECRET", "session-secret");
    vi.stubEnv("DATABASE_URL", "postgresql://pgs:pgs@localhost:5432/pgs");
    vi.stubEnv("UPLOAD_STORAGE_PROVIDER", "database");

    const status = getEnvStatus();

    expect(status.uploadProvider).toBe("database");
    expect(status.missing).not.toContain("S3_BUCKET");
  });
});
