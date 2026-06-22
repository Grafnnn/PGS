import { describe, expect, it } from "vitest";
import {
  buildSafeStagingSmokeUserReport,
  CREATE_STAGING_SMOKE_USER_CONFIRM,
  DEMO_PROJECT_ID,
  validateStagingSmokeUserConfig
} from "./user";
import { SMOKE_PROJECT_ID } from "./cleanup";

const validEnv = {
  APP_ENV: "staging",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://example.invalid/pgs",
  CREATE_STAGING_SMOKE_USER_CONFIRM,
  SMOKE_EMAIL: "smoke+pgs-staging@pgs.local",
  SMOKE_PASSWORD: "StrongSmokePass%789"
};

describe("staging smoke user safety", () => {
  it("requires explicit staging and confirmation guards", () => {
    expect(() => validateStagingSmokeUserConfig({ ...validEnv, CREATE_STAGING_SMOKE_USER_CONFIRM: undefined })).toThrow(SMOKE_PROJECT_ID);
    expect(() => validateStagingSmokeUserConfig({ ...validEnv, APP_ENV: "production" })).toThrow("APP_ENV=staging");
    expect(() => validateStagingSmokeUserConfig({ ...validEnv, NODE_ENV: "development" })).toThrow("NODE_ENV=production");
    expect(() => validateStagingSmokeUserConfig({ ...validEnv, DATABASE_URL: undefined })).toThrow("DATABASE_URL");
  });

  it("accepts only synthetic smoke emails and strong passwords", () => {
    expect(() => validateStagingSmokeUserConfig({ ...validEnv, SMOKE_EMAIL: "admin@pgs.local" })).toThrow("smoke+");
    expect(() => validateStagingSmokeUserConfig({ ...validEnv, SMOKE_EMAIL: "smoke+real@example.com" })).toThrow("@pgs.local");
    expect(() => validateStagingSmokeUserConfig({ ...validEnv, SMOKE_PASSWORD: "password-admin" })).toThrow("obvious");
  });

  it("targets only smoke and demo projects for read-only AI smoke", () => {
    expect(validateStagingSmokeUserConfig(validEnv).projectIds).toEqual([SMOKE_PROJECT_ID, DEMO_PROJECT_ID]);
    expect(validateStagingSmokeUserConfig({ ...validEnv, SMOKE_INCLUDE_PROJECT_DEMO: "false" }).projectIds).toEqual([SMOKE_PROJECT_ID]);
  });

  it("builds a non-secret report", () => {
    const report = buildSafeStagingSmokeUserReport({
      userAction: "updated",
      projectMemberships: [{ projectId: SMOKE_PROJECT_ID, action: "kept", role: "VIEWER" }],
      revokedSessions: 1
    });
    const serialized = JSON.stringify(report);

    expect(report.secretsPrinted).toBe(false);
    expect(serialized).not.toContain(validEnv.SMOKE_PASSWORD);
    expect(serialized).not.toContain(validEnv.SMOKE_EMAIL);
  });
});
