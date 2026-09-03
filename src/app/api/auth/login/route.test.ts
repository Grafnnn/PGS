import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  verifyPassword: vi.fn(async () => true),
  createUserSession: vi.fn(async () => ({ token: "session-token", expiresAt: new Date("2026-10-01T00:00:00.000Z") })),
  userFind: vi.fn(),
  userUpdate: vi.fn(async () => ({}))
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ NODE_ENV: "test", LOGIN_RATE_LIMIT_MAX: 8, LOGIN_RATE_LIMIT_WINDOW_MS: 60_000 })
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/auth/session", () => ({
  createUserSession: mocks.createUserSession,
  SESSION_COOKIE: "pgs_session",
  SESSION_TTL_DAYS: 30
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.userFind, update: mocks.userUpdate } }
}));

const allowed = { allowed: true, remaining: 7, retryAfterSeconds: 0 };

function request(email = "user@example.test", ip = "203.0.113.10") {
  return new Request("https://pgs.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ email, password: "Strong!Pass-2026" })
  });
}

describe("login rate limiting and organization role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkRateLimit).mockReturnValue(allowed);
    mocks.userFind.mockResolvedValue({
      id: "user-1",
      email: "user@example.test",
      name: "User",
      appRole: "OWNER",
      isActive: true,
      passwordHash: "hash",
      memberships: [{ role: "subcontractor" }]
    });
  });

  it("applies per-IP, per-account, and pair buckets", async () => {
    const { POST } = await import("./route");
    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(checkRateLimit).toHaveBeenCalledTimes(3);
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "login:ip:203.0.113.10" }));
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "login:account:user@example.test" }));
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "login:pair:203.0.113.10:user@example.test" }));
    expect((await response.json()).user.role).toBe("VIEWER");
  });

  it("blocks email enumeration when the IP bucket is exhausted", async () => {
    vi.mocked(checkRateLimit).mockImplementation(({ key }) => key.startsWith("login:ip:")
      ? { allowed: false, remaining: 0, retryAfterSeconds: 31 }
      : allowed);
    const { POST } = await import("./route");
    const response = await POST(request("another@example.test") as never);

    expect(response.status).toBe(429);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("blocks distributed attempts against one account", async () => {
    vi.mocked(checkRateLimit).mockImplementation(({ key }) => key.startsWith("login:account:")
      ? { allowed: false, remaining: 0, retryAfterSeconds: 22 }
      : allowed);
    const { POST } = await import("./route");
    const response = await POST(request("user@example.test", "198.51.100.20") as never);

    expect(response.status).toBe(429);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
