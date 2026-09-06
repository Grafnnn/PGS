import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  indexPgs: vi.fn(),
  indexDrive: vi.fn(),
  status: vi.fn(),
  writeAudit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/technical-documentation/index", () => ({
  indexPgsProjectDocuments: mocks.indexPgs,
  indexGoogleDriveDocuments: mocks.indexDrive,
  getProjectKnowledgeStatus: mocks.status
}));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: { project: { findUnique: vi.fn(async () => ({ organizationId: "org-1" })) } }
}));

describe("technical documentation index route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", name: "User", email: "user@example.test", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.indexPgs.mockResolvedValue({ discovered: 1, indexed: 1, unchanged: 0, unsupported: 0, failed: 0, chunks: 2, warnings: [] });
    mocks.status.mockResolvedValue({ summary: {}, drive: {}, documents: [], aiConfigured: true });
  });

  it("checks edit access before parsing the index request", async () => {
    mocks.canProject.mockResolvedValue(false);
    const request = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
    expect((request as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.indexPgs).not.toHaveBeenCalled();
    expect(mocks.indexDrive).not.toHaveBeenCalled();
  });
});
