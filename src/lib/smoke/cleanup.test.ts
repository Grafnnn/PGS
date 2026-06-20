import { describe, expect, it } from "vitest";
import { assertSmokeCleanupConfirm, assertSmokeMutationTarget, isSmokeEmail, isSmokeMarkedText, SMOKE_PROJECT_ID } from "./cleanup";

describe("smoke cleanup safety", () => {
  it("requires explicit cleanup confirmation", () => {
    expect(() => assertSmokeCleanupConfirm(undefined)).toThrow(SMOKE_PROJECT_ID);
    expect(() => assertSmokeCleanupConfirm(SMOKE_PROJECT_ID)).not.toThrow();
  });

  it("only recognizes smoke markers", () => {
    expect(isSmokeMarkedText("SMOKE-2026-budget")).toBe(true);
    expect(isSmokeMarkedText("project-demo-budget")).toBe(false);
    expect(isSmokeEmail("smoke+run@pgs.local")).toBe(true);
    expect(isSmokeEmail("demo@pgs.local")).toBe(false);
  });

  it("blocks mutation smoke in production and non-smoke projects", () => {
    expect(() => assertSmokeMutationTarget("project-demo", "staging")).toThrow("project-smoke");
    expect(() => assertSmokeMutationTarget(SMOKE_PROJECT_ID, "production")).toThrow("production");
    expect(() => assertSmokeMutationTarget(SMOKE_PROJECT_ID, "staging")).not.toThrow();
  });
});
