import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  documentFindMany: vi.fn(),
  transmittalFindMany: vi.fn(),
  transmittalFindFirst: vi.fn(),
  transmittalFindUnique: vi.fn(),
  transmittalCreate: vi.fn(),
  transmittalUpdate: vi.fn(),
  transmittalDelete: vi.fn(),
  itemDeleteMany: vi.fn(),
  itemCreateMany: vi.fn(),
  itemUpdate: vi.fn(),
  eventCreate: vi.fn(),
  auditCreate: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    projectDocumentTransmittal: { findFirst: mocks.transmittalFindFirst, create: mocks.transmittalCreate, update: mocks.transmittalUpdate, delete: mocks.transmittalDelete },
    documentTransmittalItem: { deleteMany: mocks.itemDeleteMany, createMany: mocks.itemCreateMany, update: mocks.itemUpdate },
    documentTransmittalEvent: { create: mocks.eventCreate },
    auditLog: { create: mocks.auditCreate }
  };
  return { prisma: {
    project: { findUnique: mocks.projectFind },
    document: { findMany: mocks.documentFindMany },
    projectDocumentTransmittal: { findMany: mocks.transmittalFindMany, findUnique: mocks.transmittalFindUnique },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  } };
});

const user = { id: "manager-1", name: "РП", email: "manager@example.test", role: "MANAGER", authenticated: true };
const now = new Date("2026-07-15T12:00:00Z");
const document = { id: "doc-1", title: "Акт скрытых работ", category: "исполнительная", fileName: "act-v3.pdf", version: 3, versions: [{ id: "version-3", versionNumber: 3, fileName: "act-v3.pdf" }] };
const base = {
  id: "tr-1", organizationId: "org-1", projectId: "project-1", sequence: 1, subject: "Исполнительная документация", purpose: "На согласование",
  recipient: "Заказчик", ccRecipients: "ПТО", reviewer: "Технадзор", dueAt: now, status: "draft", revision: 0,
  issuedAt: null, acknowledgedAt: null, reviewedAt: null, closedAt: null, createdBy: user.id, createdAt: now, updatedAt: now,
  items: [{ id: "item-1", documentId: "doc-1", documentVersionId: null, documentVersion: 2, titleSnapshot: document.title, fileNameSnapshot: "act-v2.pdf", categorySnapshot: document.category }],
  events: []
};

function request(body: unknown, method = "POST") {
  return new Request("https://pgs.local", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
}

describe("Document Transmittals API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.documentFindMany.mockResolvedValue([document]);
    mocks.transmittalFindMany.mockResolvedValue([]);
    mocks.transmittalFindFirst.mockResolvedValue(null);
    mocks.transmittalFindUnique.mockResolvedValue(base);
    mocks.transmittalCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...base, ...data, items: base.items, events: [] }));
    mocks.transmittalUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...base, ...data, items: base.items, events: [] }));
  });

  it("checks authorization before parsing collection requests", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(request("not-an-object"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("creates a sequential draft with selected project documents and audit", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ subject: base.subject, recipient: base.recipient, reviewer: base.reviewer, dueAt: now.toISOString(), documentIds: ["doc-1"] }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.transmittalCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 1, items: expect.any(Object) }) }));
    expect(mocks.auditCreate).toHaveBeenCalled();
  });

  it("requires a complete package before issue", async () => {
    mocks.transmittalFindUnique.mockResolvedValue({ ...base, recipient: null, dueAt: null, items: [] });
    mocks.documentFindMany.mockResolvedValue([]);
    const { PATCH } = await import("./[transmittalId]/route");
    const response = await PATCH(request({ action: "issue" }, "PATCH"), { params: { projectId: "project-1", transmittalId: "tr-1" } });
    expect(response.status).toBe(409);
    expect(mocks.transmittalUpdate).not.toHaveBeenCalled();
  });

  it("snapshots the exact latest document version when issued", async () => {
    const { PATCH } = await import("./[transmittalId]/route");
    const response = await PATCH(request({ action: "issue" }, "PATCH"), { params: { projectId: "project-1", transmittalId: "tr-1" } });
    expect(response.status).toBe(200);
    expect(mocks.itemUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ documentVersion: 3, documentVersionId: "version-3" }) }));
    expect(mocks.eventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "issue", revision: 0 }) }));
    expect(mocks.transmittalUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "issued" }) }));
  });

  it("records a formal review decision without allowing field rewrites", async () => {
    mocks.transmittalFindUnique.mockResolvedValue({ ...base, status: "acknowledged" });
    const { PATCH } = await import("./[transmittalId]/route");
    const rejected = await PATCH(request({ action: "review", decision: "approved", subject: "Подмена" }, "PATCH"), { params: { projectId: "project-1", transmittalId: "tr-1" } });
    expect(rejected.status).toBe(409);
    const accepted = await PATCH(request({ action: "review", decision: "approved", comment: "Согласовано" }, "PATCH"), { params: { projectId: "project-1", transmittalId: "tr-1" } });
    expect(accepted.status).toBe(200);
    expect(mocks.eventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "reviewed", decision: "approved" }) }));
  });

  it("deletes only drafts and writes audit", async () => {
    const { DELETE } = await import("./[transmittalId]/route");
    expect((await DELETE(new Request("https://pgs.local"), { params: { projectId: "project-1", transmittalId: "tr-1" } })).status).toBe(200);
    expect(mocks.transmittalDelete).toHaveBeenCalled();
    expect(mocks.auditCreate).toHaveBeenCalled();
    mocks.transmittalFindUnique.mockResolvedValue({ ...base, status: "issued" });
    expect((await DELETE(new Request("https://pgs.local"), { params: { projectId: "project-1", transmittalId: "tr-1" } })).status).toBe(409);
  });
});
