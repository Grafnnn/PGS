import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashOneTimeToken } from "@/lib/auth/tokens";

const mocks = vi.hoisted(() => ({
  resetFind: vi.fn(),
  resetUpdate: vi.fn(),
  userUpdate: vi.fn(async () => ({})),
  queryRaw: vi.fn(async () => []),
  auditCreate: vi.fn(async () => ({}))
}));

vi.mock("@/lib/env", () => ({ getEnv: () => ({ RESET_RATE_LIMIT_MAX: 5, RESET_RATE_LIMIT_WINDOW_MS: 60_000 }) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 4, retryAfterSeconds: 0 })
}));
vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn(async () => "new-password-hash") }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.queryRaw,
      passwordResetToken: { findUnique: mocks.resetFind, update: mocks.resetUpdate },
      user: { update: mocks.userUpdate },
      auditLog: { create: mocks.auditCreate }
    }))
  }
}));

const reset = {
  id: "reset-1",
  userId: "user-1",
  tokenHash: hashOneTimeToken("raw-reset-token"),
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  usedAt: null as Date | null,
  user: {
    id: "user-1",
    name: "User",
    email: "user@example.test",
    memberships: [{ organizationId: "org-1" }]
  }
};

function request() {
  return new Request("https://pgs.test/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "raw-reset-token", password: "Strong!Pass-2026" })
  });
}

describe("password reset token consumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reset.usedAt = null;
    mocks.resetFind.mockImplementation(async () => reset);
    mocks.resetUpdate.mockImplementation(async ({ data }: { data: { usedAt: Date } }) => {
      reset.usedAt = data.usedAt;
      return reset;
    });
  });

  it("uses an exact token-hash lookup and consumes the token once", async () => {
    const { POST } = await import("./route");
    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    expect(mocks.resetFind).toHaveBeenCalledWith(expect.objectContaining({
      where: { tokenHash: hashOneTimeToken("raw-reset-token") }
    }));
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.resetUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalled();
  });
});
