import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  reportFind: vi.fn(),
  documentsFind: vi.fn(),
  scheduleFind: vi.fn(),
  budgetFind: vi.fn(),
  read: vi.fn(),
  estimate: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/storage/documents", () => ({ readDocumentFile: mocks.read }));
vi.mock("@/lib/photo-volume-estimation", async (original) => {
  const actual = await original<typeof import("@/lib/photo-volume-estimation")>();
  return { ...actual, estimatePhotoVolumes: mocks.estimate };
});
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: { findFirst: mocks.reportFind },
    document: { findMany: mocks.documentsFind },
    scheduleItem: { findMany: mocks.scheduleFind },
    budgetItem: { findMany: mocks.budgetFind }
  }
}));

const context = { params: { projectId: "project-1", reportId: "report-1" } };
const request = (body: unknown = { documentIds: ["document-1"], scheduleItemIds: ["schedule-1"] }) => new Request("https://pgs.local", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
}) as never;

describe("daily report photo volume route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", name: "Прораб", email: "foreman@example.test", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.reportFind.mockResolvedValue({
      id: "report-1",
      projectId: "project-1",
      organizationId: "org-1",
      status: "draft",
      workScopes: [{ scheduleItemId: "schedule-1", workName: "Монтаж кровли", source: "schedule" }],
      workOutputs: []
    });
    mocks.documentsFind.mockResolvedValue([{ id: "document-1", mimeType: "image/jpeg", sizeBytes: 4, storageKey: "safe-key" }]);
    mocks.scheduleFind.mockResolvedValue([{
      id: "schedule-1",
      budgetItemId: "budget-1",
      name: "Монтаж кровли",
      unit: null,
      plannedQty: 100,
      actualQty: 20,
      progressMode: "quantity"
    }]);
    mocks.budgetFind.mockResolvedValue([{ id: "budget-1", unit: "м2" }]);
    mocks.read.mockResolvedValue(Buffer.from("image"));
    mocks.estimate.mockResolvedValue({
      summary: "На фото есть масштаб.",
      suggestions: [{
        scheduleItemId: "schedule-1",
        workName: "Монтаж кровли",
        suggestedQuantity: 12,
        unit: "м²",
        confidence: "medium",
        basis: "Видна разметка.",
        needsManualMeasurement: false
      }],
      limitations: []
    });
    mocks.audit.mockResolvedValue({});
  });

  it("checks access before parsing the request body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const guardedRequest = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(guardedRequest, context);

    expect(response.status).toBe(403);
    expect((guardedRequest as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.reportFind).not.toHaveBeenCalled();
  });

  it("analyzes only linked evidence and trusted current schedule works", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.suggestions[0]).toEqual(expect.objectContaining({ suggestedQuantity: 12, unit: "м²" }));
    expect(mocks.estimate).toHaveBeenCalledWith(expect.objectContaining({
      works: [expect.objectContaining({ scheduleItemId: "schedule-1", remainingQuantity: 80, unit: "м²" })]
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entity: "daily_report_photo_volume" }));
    expect(JSON.stringify(body)).not.toContain("safe-key");
  });

  it("rejects a work that is not saved in the report scope", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ documentIds: ["document-1"], scheduleItemIds: ["schedule-other"] }), context);

    expect(response.status).toBe(409);
    expect(mocks.documentsFind).not.toHaveBeenCalled();
    expect(mocks.estimate).not.toHaveBeenCalled();
  });

  it("does not analyze documents that are not attached to the report", async () => {
    mocks.documentsFind.mockResolvedValue([]);
    const { POST } = await import("./route");
    const response = await POST(request(), context);

    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.estimate).not.toHaveBeenCalled();
  });
});
