import { afterEach, describe, expect, it } from "vitest";
import { getEnvStatus } from "./env";

const originalNodeEnv = process.env.NODE_ENV;
const originalAuthRequired = process.env.AUTH_REQUIRED;
const originalSessionSecret = process.env.SESSION_SECRET;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.AUTH_REQUIRED = originalAuthRequired;
  process.env.SESSION_SECRET = originalSessionSecret;
});

describe("env helpers", () => {
  it("reports optional AI as configured flag only", () => {
    const status = getEnvStatus();

    expect(typeof status.aiConfigured).toBe("boolean");
    expect(status.maxUploadMb).toBeGreaterThan(0);
  });

  it("flags insecure production auth configuration", () => {
    process.env.NODE_ENV = "production";
    process.env.AUTH_REQUIRED = "false";
    delete process.env.SESSION_SECRET;

    const status = getEnvStatus();

    expect(status.authRequired).toBe(true);
    expect(status.authMode).toBe("db-session");
    expect(status.missing).toContain("AUTH_REQUIRED=true");
    expect(status.missing).toContain("SESSION_SECRET");
  });
});
