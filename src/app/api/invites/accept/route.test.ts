import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashOneTimeToken } from "@/lib/auth/tokens";

const mocks = vi.hoisted(() => ({
  inviteFind: vi.fn(),
  inviteUpdate: vi.fn(),
  userFind: vi.fn(),
  userCreate: vi.fn(),
  membershipUpsert: vi.fn(async () => ({})),
  projectMemberUpsert: vi.fn(async () => ({})),
  projectFind: vi.fn(),
  queryRaw: vi.fn(async () => []),
  auditCreate: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/password", () => ({ hashPassword: vi.fn(async () => "new-password-hash") }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.queryRaw,
      userInvite: { findUnique: mocks.inviteFind, update: mocks.inviteUpdate },
      user: { findUnique: mocks.userFind, create: mocks.userCreate },
      membership: { upsert: mocks.membershipUpsert },
      projectMember: { upsert: mocks.projectMemberUpsert },
      project: { findFirst: mocks.projectFind },
      auditLog: { create: mocks.auditCreate }
    }))
  }
}));

const existingUser = {
  id: "user-1",
  email: "user@example.test",
  name: "Existing Name",
  appRole: "VIEWER",
  isActive: true,
  passwordHash: "existing-password-hash"
};
const invite = {
  id: "invite-1",
  organizationId: "org-1",
  email: existingUser.email,
  role: "MANAGER",
  projectId: null,
  projectRole: null,
  tokenHash: hashOneTimeToken("raw-invite-token"),
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  acceptedAt: null as Date | null
};

function request() {
  return new Request("https://pgs.test/api/invites/accept", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "raw-invite-token", name: "Replacement Name", password: "Replacement!Pass-2026" })
  });
}

describe("invite token consumption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invite.acceptedAt = null;
    mocks.inviteFind.mockImplementation(async () => invite);
    mocks.userFind.mockResolvedValue(existingUser);
    mocks.inviteUpdate.mockImplementation(async ({ data }: { data: { acceptedAt: Date } }) => {
      invite.acceptedAt = data.acceptedAt;
      return invite;
    });
  });

  it("uses exact lookup, preserves an existing global account, and consumes once", async () => {
    const { POST } = await import("./route");
    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect((await first.json()).existingAccount).toBe(true);
    expect(second.status).toBe(400);
    expect(mocks.inviteFind).toHaveBeenCalledWith({ where: { tokenHash: hashOneTimeToken("raw-invite-token") } });
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(existingUser).toMatchObject({ name: "Existing Name", passwordHash: "existing-password-hash", isActive: true });
    expect(mocks.membershipUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.inviteUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalled();
  });
});
