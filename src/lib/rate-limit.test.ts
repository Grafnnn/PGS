import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitBuckets } from "./rate-limit";

describe("in-memory rate limiter", () => {
  beforeEach(() => resetRateLimitBuckets());

  it("blocks after configured attempts until window resets", () => {
    expect(checkRateLimit({ key: "login:a", limit: 2, windowMs: 1000, now: 0 }).allowed).toBe(true);
    expect(checkRateLimit({ key: "login:a", limit: 2, windowMs: 1000, now: 10 }).allowed).toBe(true);
    expect(checkRateLimit({ key: "login:a", limit: 2, windowMs: 1000, now: 20 }).allowed).toBe(false);
    expect(checkRateLimit({ key: "login:a", limit: 2, windowMs: 1000, now: 1001 }).allowed).toBe(true);
  });
});
