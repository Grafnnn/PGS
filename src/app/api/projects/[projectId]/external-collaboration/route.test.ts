import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  rfiFindMany: vi.fn(),
  rfiFindFirst: vi.fn(),
  submittalFindMany: vi.fn(),
  submittalFindFirst: vi.fn(),
  linkFindMany: vi.fn(),
  linkUpdateMany: vi.fn(),
  linkCreate: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/auth/tokens", () => ({
  generateOneTimeToken: () => "raw-response-token-for-one-time-link-123456",
  hashOneTimeToken: () => "h".repeat(64),
  tokenExpiresAt: () => new Date("2026-07-30T12:00:00.000Z")
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "https://pgs.example.test" }) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    projectRfi: { findMany: mocks.rfiFindMany, findFirst: mocks.rfiFindFirst },
    projectSubmittal: { findMany: mocks.submittalFindMany, findFirst: mocks.submittalFindFirst },
    externalCollaborationLink: { findMany: mocks.linkFindMany },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      externalCollaborationLink: {
        updateMany: mocks.linkUpdateMany,
        create: mocks.linkCreate
      }
    }))
  }
}));

describe("external collaboration project route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "owner-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    mocks.rfiFindMany.mockResolvedValue([]);
    mocks.rfiFindFirst.mockResolvedValue(null);
    mocks.submittalFindMany.mockResolvedValue([]);
    mocks.submittalFindFirst.mockResolvedValue(null);
    mocks.linkFindMany.mockResolvedValue([]);
    mocks.linkUpdateMany.mockResolvedValue({ count: 0 });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("checks owner/admin permission before reading project data", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("checks permission before parsing a create body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("stores and audits only the token hash while returning the raw URL once", async () => {
    const rawToken = "raw-response-token-for-one-time-link-123456";
    const now = new Date("2026-07-27T12:00:00.000Z");
    mocks.rfiFindFirst.mockResolvedValue({
      id: "rfi-1",
      sequence: 7,
      subject: "Узел фасада",
      status: "open"
    });
    mocks.linkCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "link-1",
      projectId: "project-1",
      entityType: "rfi",
      entityId: "rfi-1",
      recipientName: "Технадзор",
      recipientEmail: "reviewer@example.test",
      tokenHash: data.tokenHash,
      status: "active",
      expiresAt: new Date("2026-07-30T12:00:00.000Z"),
      responseLimit: 1,
      responseCount: 0,
      lastRespondedAt: null,
      revokedAt: null,
      createdAt: now,
      updatedAt: now
    }));

    const { POST } = await import("./route");
    const response = await POST(
      new Request("https://pgs.local", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entityType: "rfi",
          entityId: "rfi-1",
          recipientName: "Технадзор",
          recipientEmail: "reviewer@example.test",
          expiresInHours: 72,
          responseLimit: 1
        })
      }) as never,
      { params: { projectId: "project-1" } }
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.responseUrl).toBe(`https://pgs.example.test/external/respond/${rawToken}`);
    expect(mocks.linkCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tokenHash: "h".repeat(64) })
    }));
    expect(JSON.stringify(mocks.linkCreate.mock.calls)).not.toContain(rawToken);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain(rawToken);
  });
});
