import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken, sessionExpiresAt, toAppRole } from "./session";

describe("session helpers", () => {
  it("hashes opaque session tokens deterministically", () => {
    const token = generateSessionToken();
    expect(token.length).toBeGreaterThan(32);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
  });

  it("normalizes app roles and expiry", () => {
    expect(toAppRole("manager")).toBe("MANAGER");
    expect(toAppRole("unknown")).toBe("VIEWER");
    expect(sessionExpiresAt(new Date("2026-06-19T00:00:00Z")).getTime()).toBeGreaterThan(new Date("2026-06-19T00:00:00Z").getTime());
  });
});
