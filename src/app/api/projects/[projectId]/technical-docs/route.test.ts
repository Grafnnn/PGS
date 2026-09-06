import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  status: vi.fn(),
  upsert: vi.fn(),
  writeAudit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/technical-documentation/index", () => ({ getProjectKnowledgeStatus: mocks.status }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn(async () => ({ organizationId: "org-1" })) },
    projectKnowledgeConfig: { upsert: mocks.upsert }
  }
}));

describe("technical documentation settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", name: "User", email: "user@example.test", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.status.mockResolvedValue({ summary: {}, drive: {}, documents: [], aiConfigured: true });
    mocks.upsert.mockResolvedValue({ id: "config-1" });
  });

  it("checks view access before reading knowledge status", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local") as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("checks edit access before parsing the Drive folder body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const request = { json: vi.fn() } as never;
    const { PUT } = await import("./route");
    const response = await PUT(request, { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
    expect((request as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
