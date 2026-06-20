import { describe, expect, it } from "vitest";
import { generateOneTimeToken, hashOneTimeToken, tokenExpiresAt, tokenHashMatches, tokenIsUsable } from "./tokens";

describe("one-time auth tokens", () => {
  it("stores and validates only hashes", () => {
    const token = generateOneTimeToken();
    const hash = hashOneTimeToken(token);
    expect(hash).not.toContain(token);
    expect(tokenHashMatches(token, hash)).toBe(true);
    expect(tokenHashMatches(`${token}x`, hash)).toBe(false);
  });

  it("rejects expired or already used tokens", () => {
    const now = new Date("2026-06-19T12:00:00.000Z");
    expect(tokenIsUsable({ expiresAt: tokenExpiresAt(1, now), now })).toBe(true);
    expect(tokenIsUsable({ expiresAt: now, now })).toBe(false);
    expect(tokenIsUsable({ expiresAt: tokenExpiresAt(1, now), usedAt: now, now })).toBe(false);
  });
});
