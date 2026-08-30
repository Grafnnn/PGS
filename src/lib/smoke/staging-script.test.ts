import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("staging smoke acceptance", () => {
  const source = fs.readFileSync(new URL("../../../scripts/smoke-staging.ts", import.meta.url), "utf8");

  it("does not treat server failures as accepted responses", () => {
    expect(source).not.toMatch(/\[[^\]]*\b500\b[^\]]*\]/);
    expect(source).not.toMatch(/\[[^\]]*\b503\b[^\]]*\]/);
  });

  it("requires a healthy service and uses project-smoke as the default target", () => {
    expect(source).toContain('checkGet("health", "/api/health", [200])');
    expect(source).toContain("process.env.PROJECT_ID ?? SMOKE_PROJECT_ID");
  });
});
