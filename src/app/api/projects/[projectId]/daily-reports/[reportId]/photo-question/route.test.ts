import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  reportFind: vi.fn(),
  documentsFind: vi.fn(),
  read: vi.fn(),
  ask: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/storage/documents", () => ({ readDocumentFile: mocks.read }));
vi.mock("@/lib/photo-question", async (original) => {
  const actual = await original<typeof import("@/lib/photo-question")>();
  return { ...actual, askPhotoQuestion: mocks.ask };
});
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    dailyReport: { findFirst: mocks.reportFind },
    document: { findMany: mocks.documentsFind }
  }
}));

const context = { params: { projectId: "project-1", reportId: "report-1" } };
const request = () => new Request("https://pgs.local", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ question: "Есть ли видимый дефект покрытия?", documentIds: ["document-1"] })
}) as never;

describe("daily report photo question route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", name: "Прораб", email: "foreman@example.test", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.reportFind.mockResolvedValue({ id: "report-1", projectId: "project-1", organizationId: "org-1" });
    mocks.documentsFind.mockResolvedValue([{ id: "document-1", mimeType: "image/jpeg", sizeBytes: 4, storageKey: "safe-key" }]);
    mocks.read.mockResolvedValue(Buffer.from("image"));
    mocks.ask.mockResolvedValue({ answer: "Виден участок покрытия.", observations: [], risks: [], recommendedActions: [], confidence: "low", limitations: ["Нет масштаба."] });
    mocks.audit.mockResolvedValue({});
  });

  it("checks access and report scope before parsing the body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const guardedRequest = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(guardedRequest, context);
    expect(response.status).toBe(403);
    expect((guardedRequest as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.reportFind).not.toHaveBeenCalled();
  });

  it("rejects documents not linked to this report", async () => {
    mocks.documentsFind.mockResolvedValue([]);
    const { POST } = await import("./route");
    const response = await POST(request(), context);
    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.ask).not.toHaveBeenCalled();
  });

  it("analyzes linked photos without returning provider inputs", async () => {
    const { POST } = await import("./route");
    const response = await POST(request(), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({ result: expect.objectContaining({ answer: "Виден участок покрытия.", confidence: "low" }) });
    expect(JSON.stringify(body)).not.toContain("safe-key");
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entity: "daily_report_photo_question" }));
  });
});
