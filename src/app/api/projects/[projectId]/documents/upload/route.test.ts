import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  receiptFind: vi.fn(),
  receiptCreate: vi.fn(),
  documentFind: vi.fn(),
  documentCreate: vi.fn(),
  versionCreate: vi.fn(),
  audit: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  demoContext: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/project-data", () => ({ getDemoContext: mocks.demoContext }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/storage/documents", () => ({
  sanitizeFileName: (value: string) => value,
  makeStorageKey: () => "project-1/storage-key.jpg",
  saveDocumentFile: mocks.save,
  deleteDocumentFile: mocks.remove,
  validateDocumentUpload: () => null,
  hasPreviewMetadata: () => true
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    fieldSyncReceipt: { findUnique: mocks.receiptFind, create: mocks.receiptCreate },
    document: { findUnique: mocks.documentFind, create: mocks.documentCreate },
    documentVersion: { create: mocks.versionCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      fieldSyncReceipt: { create: mocks.receiptCreate },
      document: { create: mocks.documentCreate },
      documentVersion: { create: mocks.versionCreate }
    }))
  }
}));

const user = { id: "user-1", name: "Прораб", email: "field@example.test", role: "MANAGER", authenticated: true };
const documentItem = {
  id: "document-1",
  organizationId: "org-1",
  projectId: "project-1",
  category: "фотофиксация",
  title: "evidence.jpg",
  filePath: "project-1/storage-key.jpg",
  fileName: "evidence.jpg",
  mimeType: "image/jpeg",
  sizeBytes: 4,
  storageKey: "project-1/storage-key.jpg",
  uploadedAt: new Date("2026-07-15T10:00:00.000Z"),
  version: 1,
  author: "Прораб",
  comment: null,
  createdBy: "user-1",
  createdAt: new Date("2026-07-15T10:00:00.000Z"),
  updatedAt: new Date("2026-07-15T10:00:00.000Z")
};

function uploadRequest() {
  const form = new FormData();
  form.set("file", new File(["test"], "evidence.jpg", { type: "image/jpeg" }));
  form.set("category", "фотофиксация");
  form.set("clientMutationId", "mutation_photo_1");
  return new Request("https://pgs.local/api/projects/project-1/documents/upload", { method: "POST", body: form }) as never;
}

describe("document upload field idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.receiptFind.mockResolvedValue(null);
    mocks.documentFind.mockResolvedValue(documentItem);
    mocks.documentCreate.mockResolvedValue(documentItem);
    mocks.versionCreate.mockResolvedValue({});
    mocks.receiptCreate.mockResolvedValue({});
    mocks.audit.mockResolvedValue({});
    mocks.demoContext.mockResolvedValue({ userId: "demo-user" });
    mocks.save.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
  });

  it("checks upload permission before reading multipart data", async () => {
    mocks.canProject.mockResolvedValue(false);
    const request = { formData: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect((request as { formData: ReturnType<typeof vi.fn> }).formData).not.toHaveBeenCalled();
  });

  it("stores the document, audit and receipt for a new offline upload", async () => {
    const { POST } = await import("./route");
    const response = await POST(uploadRequest(), { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.documentCreate).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entity: "document", action: "create" }));
    expect(mocks.receiptCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ clientMutationId: "mutation_photo_1", kind: "photo_evidence" }) }));
  });

  it("returns an existing document without writing storage again", async () => {
    mocks.receiptFind.mockResolvedValue({ kind: "photo_evidence", entityId: "document-1" });
    const { POST } = await import("./route");
    const response = await POST(uploadRequest(), { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ duplicate: true, clientMutationId: "mutation_photo_1" });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.documentCreate).not.toHaveBeenCalled();
  });
});
