import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  receiptFind: vi.fn(),
  receiptCreate: vi.fn(),
  reportFind: vi.fn(),
  reportCreate: vi.fn(),
  actionFind: vi.fn(),
  actionCreate: vi.fn(),
  auditCreate: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    fieldSyncReceipt: { findUnique: mocks.receiptFind, create: mocks.receiptCreate },
    dailyReport: { findUnique: mocks.reportFind, create: mocks.reportCreate },
    projectActionItem: { findUnique: mocks.actionFind, create: mocks.actionCreate },
    auditLog: { create: mocks.auditCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      fieldSyncReceipt: { create: mocks.receiptCreate },
      dailyReport: { create: mocks.reportCreate },
      projectActionItem: { create: mocks.actionCreate },
      auditLog: { create: mocks.auditCreate }
    }))
  }
}));

const user = { id: "user-1", name: "Прораб", email: "field@example.test", role: "MANAGER", authenticated: true };
const report = {
  id: "report-1",
  organizationId: "org-1",
  projectId: "project-1",
  date: new Date("2026-07-15T00:00:00.000Z"),
  author: "Прораб",
  weather: "Ясно",
  workers: 12,
  engineers: 2,
  equipment: "Кран",
  completedWorks: "Армирование",
  materialsReceived: "",
  materialsConsumed: "",
  downtime: "",
  issues: "",
  status: "draft",
  createdBy: "user-1",
  createdAt: new Date("2026-07-15T10:00:00.000Z"),
  updatedAt: new Date("2026-07-15T10:00:00.000Z")
};

function reportRequest() {
  return new Request("https://pgs.local/api/projects/project-1/field-sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clientMutationId: "mutation_123456",
      kind: "daily_report",
      capturedAt: "2026-07-15T10:00:00.000Z",
      payload: {
        date: "2026-07-15",
        author: "Прораб",
        weather: "Ясно",
        workers: 12,
        engineers: 2,
        equipment: "Кран",
        completedWorks: "Армирование",
        materialsReceived: "",
        materialsConsumed: "",
        downtime: "",
        issues: ""
      }
    })
  }) as never;
}

describe("field sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.receiptFind.mockResolvedValue(null);
    mocks.reportFind.mockResolvedValue(report);
    mocks.reportCreate.mockResolvedValue(report);
    mocks.auditCreate.mockResolvedValue({});
    mocks.receiptCreate.mockResolvedValue({});
  });

  it("checks project access before parsing the request body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const request = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect((request as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.reportCreate).not.toHaveBeenCalled();
  });

  it("returns effective project capabilities without exposing role details", async () => {
    mocks.canProject.mockImplementation(async (_user: unknown, _projectId: string, action: string) => action !== "upload_document");
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local") as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ capabilities: { capture: true, upload: false } });
  });

  it("creates a draft, audit event and idempotency receipt in one transaction", async () => {
    const { POST } = await import("./route");
    const response = await POST(reportRequest(), { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.reportCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) }));
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entity: "daily_report", action: "create" }) }));
    expect(mocks.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clientMutationId: "mutation_123456", entityId: "report-1" }) }));
  });

  it("returns the existing entity for a repeated client mutation", async () => {
    mocks.receiptFind.mockResolvedValue({ kind: "daily_report", entityId: "report-1" });
    const { POST } = await import("./route");
    const response = await POST(reportRequest(), { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true, clientMutationId: "mutation_123456" });
    expect(mocks.reportCreate).not.toHaveBeenCalled();
  });

  it("rejects reuse of a mutation identifier for another operation kind", async () => {
    mocks.receiptFind.mockResolvedValue({ kind: "field_issue", entityId: "action-1" });
    const { POST } = await import("./route");
    const response = await POST(reportRequest(), { params: { projectId: "project-1" } });
    expect(response.status).toBe(409);
    expect(mocks.reportCreate).not.toHaveBeenCalled();
  });
});
