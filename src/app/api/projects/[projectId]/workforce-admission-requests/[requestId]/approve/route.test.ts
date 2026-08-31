import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  writeAudit: vi.fn(async () => ({})),
  resourceCreate: vi.fn(),
  resourceUpdate: vi.fn(),
  assignmentUpsert: vi.fn(),
  memberUpdate: vi.fn(),
  requestUpdateMany: vi.fn(),
  requestUpdate: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectPayrollPolicy: { findUnique: vi.fn() },
    organizationResource: { findMany: vi.fn() },
    workforceAdmissionRequest: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      organizationResource: { create: mocks.resourceCreate, update: mocks.resourceUpdate },
      projectResourceAssignment: { upsert: mocks.assignmentUpsert },
      workforceAdmissionMember: { update: mocks.memberUpdate },
      workforceAdmissionRequest: { updateMany: mocks.requestUpdateMany, update: mocks.requestUpdate }
    }))
  }
}));

const member = {
  id: "member-1",
  resourceId: null,
  fullName: "Сотрудник Тестовый",
  profession: "Кровельщик",
  kind: "worker",
  birthDate: null,
  citizenship: null,
  documentType: null,
  documentLast4: null,
  status: "pending"
};
const request = {
  id: "request-1",
  projectId: "project-1",
  requestNumber: "24-08/1",
  title: "Заявка",
  contractor: "Подрядчик",
  objectName: "Объект",
  validFrom: new Date("2026-08-31T00:00:00.000Z"),
  validUntil: new Date("2026-09-30T00:00:00.000Z"),
  workScope: "Устройство кровли",
  employmentType: "subcontract",
  status: "draft",
  sourceFileName: null,
  notes: null,
  approvedAt: null,
  createdAt: new Date("2026-08-31T00:00:00.000Z"),
  members: [member]
};

describe("workforce admission approval route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "project-1",
      organizationId: "org-1",
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-31T00:00:00.000Z")
    } as never);
    vi.mocked(prisma.projectPayrollPolicy.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.organizationResource.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.workforceAdmissionRequest.findFirst).mockResolvedValue(request as never);
    mocks.resourceCreate.mockResolvedValue({ id: "resource-1" });
    mocks.assignmentUpsert.mockResolvedValue({ id: "assignment-1" });
    mocks.memberUpdate.mockResolvedValue({ ...member, resourceId: "resource-1", status: "approved" });
    mocks.requestUpdateMany.mockResolvedValue({ count: 1 });
    mocks.requestUpdate.mockResolvedValue({
      ...request,
      status: "approved",
      approvedAt: new Date("2026-08-31T12:00:00.000Z"),
      members: [{ ...member, resourceId: "resource-1", status: "approved" }]
    });
  });

  it("guards approval before querying the project", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST" }) as never, { params: { projectId: "project-1", requestId: "request-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("creates and assigns the employee transactionally, then approves the request", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST" }) as never, { params: { projectId: "project-1", requestId: "request-1" } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toEqual({ created: 1, assigned: 1, reused: 0 });
    expect(mocks.resourceCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Сотрудник Тестовый", employmentType: "subcontract" }) }));
    expect(mocks.assignmentUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId_resourceId: { projectId: "project-1", resourceId: "resource-1" } },
      create: expect.objectContaining({ status: "active" })
    }));
    expect(mocks.memberUpdate).toHaveBeenCalledWith({ where: { id: "member-1" }, data: { resourceId: "resource-1", status: "approved" } });
    expect(mocks.requestUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "request-1", status: "draft" }, data: expect.objectContaining({ status: "approved" }) }));
    expect(mocks.requestUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ approvedBy: "user-1" }) }));
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ after: expect.objectContaining({ memberCount: 1, status: "approved" }) }));
  });

  it("returns a conflict when another approval already claimed the draft", async () => {
    mocks.requestUpdateMany.mockResolvedValue({ count: 0 });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST" }) as never, { params: { projectId: "project-1", requestId: "request-1" } });
    expect(response.status).toBe(409);
    expect(mocks.resourceCreate).not.toHaveBeenCalled();
    expect(mocks.assignmentUpsert).not.toHaveBeenCalled();
  });
});
