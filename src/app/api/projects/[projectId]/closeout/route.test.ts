import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject, getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { loadProjectCloseout } from "@/lib/project-closeout-db";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  packageCreate: vi.fn(),
  warrantyCreate: vi.fn(),
  auditCreate: vi.fn(async () => ({})),
  projectUpdate: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "manager-1", name: "РП", email: "manager@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: vi.fn(async () => true),
  getEffectiveProjectRole: vi.fn(async () => "MANAGER")
}));
vi.mock("@/lib/project-closeout-db", () => ({
  loadProjectCloseout: vi.fn()
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn(), update: mocks.projectUpdate },
    projectCloseoutPackage: { count: vi.fn(), findFirst: vi.fn() },
    projectWarrantyObligation: { findFirst: vi.fn(), findMany: vi.fn() },
    projectDocumentTransmittal: { findFirst: vi.fn() },
    projectCloseoutChecklistItem: { findFirst: vi.fn() },
    document: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectCloseoutPackage: { create: mocks.packageCreate, findFirst: vi.fn() },
      projectWarrantyObligation: { create: mocks.warrantyCreate, findFirst: vi.fn() },
      project: { update: mocks.projectUpdate },
      auditLog: { create: mocks.auditCreate }
    }))
  }
}));

const project = {
  id: "project-1",
  organizationId: "org-1",
  status: "active",
  endsAt: new Date("2026-12-31T12:00:00.000Z"),
  documents: [{ id: "doc-1", title: "Договор", category: "договор", fileName: "contract.pdf" }],
  qualityIssues: [{ id: "issue-1" }]
};

const payload = {
  project: { id: "project-1", name: "Проект", status: "active", endsAt: "2026-12-31T12:00:00.000Z" },
  packages: [],
  warranties: [],
  documents: [],
  transmittals: [],
  openAcceptanceIssues: [],
  summary: { canCompleteProject: false }
};

function request(body: unknown) {
  return new Request("https://pgs.local/api/projects/project-1/closeout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

describe("project closeout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("MANAGER");
    vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    vi.mocked(prisma.projectCloseoutPackage.count).mockResolvedValue(0);
    mocks.packageCreate.mockResolvedValue({ id: "package-1", number: "CLS-001", title: "Итоговая сдача" });
    mocks.warrantyCreate.mockResolvedValue({ id: "warranty-1", number: "WAR-001", title: "Гарантия" });
    vi.mocked(loadProjectCloseout).mockResolvedValue(payload as never);
  });

  it("checks project access before parsing a request body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("bootstraps a package with guarded checklist and a warranty placeholder", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ action: "bootstrap" }), { params: { projectId: "project-1" } });

    expect(response.status).toBe(200);
    expect(mocks.packageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        number: "CLS-001",
        status: "in_progress",
        checklistItems: {
          create: expect.arrayContaining([
            expect.objectContaining({ sourceType: "quality_gate", status: "blocked" }),
            expect.objectContaining({ sourceType: "document_requirement", status: "in_progress" })
          ])
        }
      })
    }));
    expect(mocks.warrantyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "draft",
        title: "Гарантийные обязательства по договору",
        notes: expect.stringContaining("автоматические значения не подставлены")
      })
    }));
    expect(mocks.auditCreate).toHaveBeenCalled();
  });

  it("does not let a manager complete the project", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ action: "complete_project" }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
  });

  it("does not complete a transmittal gate without issued handover evidence", async () => {
    vi.mocked(prisma.projectCloseoutChecklistItem.findFirst).mockResolvedValue({
      id: "check-1",
      packageId: "package-1",
      title: "Итоговая передача",
      status: "in_progress",
      sourceType: "transmittal_gate",
      documentId: null,
      notes: null,
      package: {
        id: "package-1",
        number: "CLS-001",
        transmittalId: null,
        handoverAt: null,
        transmittal: null
      }
    } as never);

    const { POST } = await import("./route");
    const response = await POST(request({
      action: "update_checklist_item",
      id: "check-1",
      status: "completed"
    }), { params: { projectId: "project-1" } });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("transmittal") });
  });

  it("does not let a manager close a warranty obligation", async () => {
    vi.mocked(prisma.projectWarrantyObligation.findFirst).mockResolvedValue({
      id: "warranty-1",
      projectId: "project-1",
      status: "active"
    } as never);

    const { POST } = await import("./route");
    const response = await POST(request({
      action: "update_warranty",
      id: "warranty-1",
      status: "closed"
    }), { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
  });
});
