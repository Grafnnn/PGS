import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  writeAudit: vi.fn(async () => ({})),
  requestCreate: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    workforceAdmissionRequest: { findMany: vi.fn(), create: mocks.requestCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      workforceAdmissionRequest: { create: mocks.requestCreate }
    }))
  }
}));

const member = {
  id: "member-1",
  resourceId: null,
  fullName: "Сотрудник Тестовый",
  profession: "Кровельщик",
  kind: "worker",
  birthDate: new Date("1990-01-01T00:00:00.000Z"),
  citizenship: "Российская Федерация",
  documentType: "Паспорт",
  documentLast4: "1234",
  status: "pending"
};

const item = {
  id: "request-1",
  projectId: "project-1",
  requestNumber: "24-08/1",
  title: "Заявка на допуск работников",
  contractor: "Подрядчик",
  objectName: "Объект",
  validFrom: new Date("2026-08-31T00:00:00.000Z"),
  validUntil: new Date("2026-09-30T00:00:00.000Z"),
  workScope: "Устройство кровли",
  employmentType: "subcontract",
  status: "draft",
  sourceFileName: "source.docx",
  notes: null,
  approvedAt: null,
  createdAt: new Date("2026-08-31T00:00:00.000Z"),
  members: [member]
};

describe("workforce admission request route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "project-1", organizationId: "org-1" } as never);
    vi.mocked(prisma.workforceAdmissionRequest.findMany).mockResolvedValue([item] as never);
    mocks.requestCreate.mockResolvedValue(item);
  });

  it("checks import permission before reading project data", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local") as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("creates a draft request without logging member personal data", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requestNumber: item.requestNumber,
        title: item.title,
        contractor: item.contractor,
        objectName: item.objectName,
        validFrom: "2026-08-31",
        validUntil: "2026-09-30",
        workScope: item.workScope,
        employmentType: item.employmentType,
        sourceFileName: item.sourceFileName,
        members: [{ ...member, id: undefined, resourceId: undefined, status: undefined, birthDate: "1990-01-01" }]
      })
    }) as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(201);
    expect(mocks.requestCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requestNumber: "24-08/1",
        members: { create: [expect.objectContaining({ fullName: "Сотрудник Тестовый", documentLast4: "1234" })] }
      })
    }));
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      after: { requestNumber: "24-08/1", memberCount: 1, status: "draft" }
    }));
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("Сотрудник Тестовый");
    expect(JSON.stringify(mocks.writeAudit.mock.calls)).not.toContain("1234");
  });
});
