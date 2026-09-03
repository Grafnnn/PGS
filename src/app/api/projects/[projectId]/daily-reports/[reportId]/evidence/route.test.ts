import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  reportFind: vi.fn(),
  documentFind: vi.fn(),
  documentUpdateMany: vi.fn(),
  projectLock: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: { findFirst: mocks.reportFind },
    document: { findMany: mocks.documentFind },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: mocks.projectLock,
      dailyReport: { findFirst: mocks.reportFind },
      document: { findMany: mocks.documentFind, updateMany: mocks.documentUpdateMany },
      auditLog: { create: mocks.audit }
    }))
  }
}));

const user = { id: "user-1", name: "Owner", email: "owner@pgs.local", role: "OWNER", authenticated: true };
const report = { id: "report-1", projectId: "project-1", organizationId: "org-1", status: "draft" };
const photo = {
  id: "photo-1",
  projectId: "project-1",
  dailyReportId: null,
  category: "фотофиксация",
  title: "photo.jpg",
  filePath: "project-1/photo.jpg",
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 120,
  storageKey: "project-1/photo.jpg",
  uploadedAt: new Date(),
  version: 1,
  author: "Owner",
  comment: null,
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date()
};

function request(documentIds = ["photo-1"]) {
  return new Request("https://pgs.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ documentIds })
  }) as never;
}

describe("daily report existing evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentFind.mockReset();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.projectLock.mockResolvedValue([{ id: "project-1" }]);
    mocks.reportFind.mockResolvedValue(report);
    mocks.documentFind
      .mockResolvedValueOnce([photo])
      .mockResolvedValueOnce([{ ...photo, dailyReportId: "report-1" }]);
    mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue({});
  });

  it("links an unassigned project photo to a draft report and audits it", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(), { params: { projectId: "project-1", reportId: "report-1" } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.linked).toBe(1);
    expect(body.items[0]).toEqual(expect.objectContaining({ id: "photo-1", dailyReportId: "report-1" }));
    expect(mocks.documentUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["photo-1"] }, projectId: "project-1", dailyReportId: null },
      data: { dailyReportId: "report-1" }
    });
    expect(mocks.audit).toHaveBeenCalled();
    expect(mocks.projectLock).toHaveBeenCalledOnce();
    expect(mocks.projectLock.mock.invocationCallOrder[0]).toBeLessThan(mocks.reportFind.mock.invocationCallOrder[0]);
  });

  it("does not change evidence on an approved report", async () => {
    mocks.reportFind.mockResolvedValue({ ...report, status: "approved" });
    const { POST } = await import("./route");
    const response = await POST(request(), { params: { projectId: "project-1", reportId: "report-1" } });

    expect(response.status).toBe(409);
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a photo linked to another report", async () => {
    mocks.documentFind.mockReset();
    mocks.documentFind.mockResolvedValue([{ ...photo, dailyReportId: "report-2" }]);
    const { POST } = await import("./route");
    const response = await POST(request(), { params: { projectId: "project-1", reportId: "report-1" } });

    expect(response.status).toBe(409);
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });
});
