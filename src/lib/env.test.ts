import { describe, expect, it } from "vitest";
import { getEnvStatus } from "./env";

describe("env helpers", () => {
  it("reports optional AI as configured flag only", () => {
    const status = getEnvStatus();

    expect(typeof status.aiConfigured).toBe("boolean");
    expect(status.maxUploadMb).toBeGreaterThan(0);
  });
});
