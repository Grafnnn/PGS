import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), canProject: vi.fn(), projectFind: vi.fn(), documentFind: vi.fn(),
  rfiFindMany: vi.fn(), rfiFindFirst: vi.fn(), rfiFindUnique: vi.fn(), rfiCreate: vi.fn(), rfiUpdate: vi.fn(), rfiDelete: vi.fn(), responseCreate: vi.fn(),
  submittalFindMany: vi.fn(), submittalFindFirst: vi.fn(), submittalFindUnique: vi.fn(), submittalCreate: vi.fn(), submittalUpdate: vi.fn(), submittalDelete: vi.fn(), reviewCreate: vi.fn(),
  auditCreate: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    projectRfi: { findFirst: mocks.rfiFindFirst, create: mocks.rfiCreate, update: mocks.rfiUpdate, delete: mocks.rfiDelete },
    rfiResponse: { create: mocks.responseCreate },
    projectSubmittal: { findFirst: mocks.submittalFindFirst, create: mocks.submittalCreate, update: mocks.submittalUpdate, delete: mocks.submittalDelete },
    submittalReview: { create: mocks.reviewCreate }, auditLog: { create: mocks.auditCreate }
  };
  return { prisma: {
    project: { findUnique: mocks.projectFind }, document: { findFirst: mocks.documentFind },
    projectRfi: { findMany: mocks.rfiFindMany, findUnique: mocks.rfiFindUnique },
    projectSubmittal: { findMany: mocks.submittalFindMany, findUnique: mocks.submittalFindUnique },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  } };
});

const user = { id: "manager-1", name: "РП", email: "manager@example.test", role: "MANAGER", authenticated: true };
const now = new Date("2026-07-14T12:00:00Z");
const baseRfi = { id: "rfi-1", organizationId: "org-1", projectId: "project-1", sequence: 1, subject: "Узел фасада", question: "Как выполнить примыкание?", discipline: "АР", location: "Ось 4", priority: "high", status: "draft", assignee: "Проектировщик", dueAt: now, sentAt: null, answeredAt: null, closedAt: null, linkedDocumentId: "doc-1", linkedDocumentVersion: null, linkedDocumentVersionId: null, createdBy: user.id, createdAt: now, updatedAt: now, responses: [] };
const baseSubmittal = { id: "sub-1", organizationId: "org-1", projectId: "project-1", sequence: 1, title: "Паспорт фасада", category: "Материалы", specSection: "АР", revision: 0, status: "draft", reviewer: "Технадзор", dueAt: now, submittedAt: null, reviewedAt: null, closedAt: null, linkedDocumentId: "doc-1", linkedDocumentVersion: null, linkedDocumentVersionId: null, createdBy: user.id, createdAt: now, updatedAt: now, reviews: [] };

function request(body: unknown, method = "POST") {
  return new Request("https://pgs.local", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
}

describe("RFI & Submittals API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.getCurrentUser.mockResolvedValue(user); mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" }); mocks.documentFind.mockResolvedValue({ id: "doc-1", version: 3, versions: [{ id: "version-3", versionNumber: 3 }] });
    mocks.rfiFindMany.mockResolvedValue([]); mocks.submittalFindMany.mockResolvedValue([]); mocks.rfiFindFirst.mockResolvedValue({ sequence: 1 }); mocks.submittalFindFirst.mockResolvedValue(null);
    mocks.rfiFindUnique.mockResolvedValue(baseRfi); mocks.submittalFindUnique.mockResolvedValue(baseSubmittal);
    mocks.rfiCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseRfi, ...data }));
    mocks.submittalCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseSubmittal, ...data }));
    mocks.rfiUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseRfi, ...data, responses: data.status === "answered" ? [{ id: "response-1", body: "По узлу А-12", createdByName: user.name, createdAt: now }] : [] }));
    mocks.submittalUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseSubmittal, ...data, reviews: data.status === "revise_required" ? [{ id: "review-1", revision: 0, decision: "revise_required", comment: "Уточнить крепеж", createdByName: user.name, createdAt: now }] : [] }));
  });

  it("checks authorization before parsing collection requests", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { POST: createRfi } = await import("./rfis/route");
    const { POST: createSubmittal } = await import("./submittals/route");
    expect((await createRfi(request("not-an-object"), { params: { projectId: "project-1" } })).status).toBe(403);
    expect((await createSubmittal(request("not-an-object"), { params: { projectId: "project-1" } })).status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("creates sequential RFI drafts and writes audit", async () => {
    const { POST } = await import("./rfis/route");
    const response = await POST(request({ subject: baseRfi.subject, question: baseRfi.question, priority: "high", linkedDocumentId: "doc-1" }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.rfiCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 2 }) }));
    expect((await response.json()).item.status).toBe("draft");
    expect(mocks.auditCreate).toHaveBeenCalled();
  });

  it("records an RFI answer as history and audited transition", async () => {
    mocks.rfiFindUnique.mockResolvedValue({ ...baseRfi, status: "open" });
    const { PATCH } = await import("./rfis/[rfiId]/route");
    const response = await PATCH(request({ action: "answer", response: "По узлу А-12" }, "PATCH"), { params: { projectId: "project-1", rfiId: "rfi-1" } });
    expect(response.status).toBe(200);
    expect(mocks.responseCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: "По узлу А-12" }) }));
    expect(mocks.rfiUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "answered" }) }));
    expect(mocks.auditCreate).toHaveBeenCalled();
  });

  it("snapshots the exact document version when an RFI is sent", async () => {
    const { PATCH } = await import("./rfis/[rfiId]/route");
    const response = await PATCH(request({ action: "send" }, "PATCH"), { params: { projectId: "project-1", rfiId: "rfi-1" } });
    expect(response.status).toBe(200);
    expect(mocks.rfiUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ linkedDocumentVersion: 3, linkedDocumentVersionId: "version-3", status: "open" }) }));
  });

  it("does not allow workflow actions to rewrite RFI fields", async () => {
    mocks.rfiFindUnique.mockResolvedValue({ ...baseRfi, status: "open" });
    const { PATCH } = await import("./rfis/[rfiId]/route");
    const response = await PATCH(request({ action: "answer", response: "Ответ", subject: "Подмененная тема" }, "PATCH"), { params: { projectId: "project-1", rfiId: "rfi-1" } });
    expect(response.status).toBe(409);
    expect(mocks.rfiUpdate).not.toHaveBeenCalled();
  });

  it("requires document, reviewer and due date before submittal submission", async () => {
    mocks.submittalFindUnique.mockResolvedValue({ ...baseSubmittal, reviewer: null, dueAt: null, linkedDocumentId: null });
    const { PATCH } = await import("./submittals/[submittalId]/route");
    const response = await PATCH(request({ action: "submit" }, "PATCH"), { params: { projectId: "project-1", submittalId: "sub-1" } });
    expect(response.status).toBe(409);
    expect(mocks.submittalUpdate).not.toHaveBeenCalled();
  });

  it("snapshots the exact document version when a submittal is submitted", async () => {
    const { PATCH } = await import("./submittals/[submittalId]/route");
    const response = await PATCH(request({ action: "submit" }, "PATCH"), { params: { projectId: "project-1", submittalId: "sub-1" } });
    expect(response.status).toBe(200);
    expect(mocks.submittalUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ linkedDocumentVersion: 3, linkedDocumentVersionId: "version-3", status: "submitted" }) }));
  });

  it("persists review history and a revise-required decision", async () => {
    mocks.submittalFindUnique.mockResolvedValue({ ...baseSubmittal, status: "submitted" });
    const { PATCH } = await import("./submittals/[submittalId]/route");
    const response = await PATCH(request({ action: "review", decision: "revise_required", comment: "Уточнить крепеж" }, "PATCH"), { params: { projectId: "project-1", submittalId: "sub-1" } });
    expect(response.status).toBe(200);
    expect(mocks.reviewCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ decision: "revise_required", revision: 0 }) }));
    expect(mocks.submittalUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "revise_required" }) }));
  });

  it("does not allow a review action to rewrite submittal fields", async () => {
    mocks.submittalFindUnique.mockResolvedValue({ ...baseSubmittal, status: "submitted" });
    const { PATCH } = await import("./submittals/[submittalId]/route");
    const response = await PATCH(request({ action: "review", decision: "approved", title: "Подмененное название" }, "PATCH"), { params: { projectId: "project-1", submittalId: "sub-1" } });
    expect(response.status).toBe(409);
    expect(mocks.submittalUpdate).not.toHaveBeenCalled();
  });
});
