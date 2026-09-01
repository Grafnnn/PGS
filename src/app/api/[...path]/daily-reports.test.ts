import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  effectiveRole: vi.fn(),
  projectFind: vi.fn(),
  reportFind: vi.fn(),
  reportFindMany: vi.fn(),
  reportCreate: vi.fn(),
  reportUpdate: vi.fn(),
  reportDelete: vi.fn(),
  scheduleFindMany: vi.fn(),
  scheduleUpdate: vi.fn(),
  progressFindMany: vi.fn(),
  progressCreate: vi.fn(),
  progressDeleteMany: vi.fn(),
  assignmentFindMany: vi.fn(),
  audit: vi.fn(async () => ({})),
  demoContext: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject, getEffectiveProjectRole: mocks.effectiveRole }));
vi.mock("@/lib/project-data", () => ({
  getDemoContext: mocks.demoContext,
  listProjectsFromDb: vi.fn(),
  getProjectBundleFromDb: vi.fn()
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    dailyReport: { findMany: mocks.reportFindMany, findUnique: mocks.reportFind, findUniqueOrThrow: mocks.reportFind, create: mocks.reportCreate, update: mocks.reportUpdate, delete: mocks.reportDelete },
    scheduleItem: { findMany: mocks.scheduleFindMany, update: mocks.scheduleUpdate },
    workProgressEntry: { findMany: mocks.progressFindMany, create: mocks.progressCreate, deleteMany: mocks.progressDeleteMany },
    projectResourceAssignment: { findMany: mocks.assignmentFindMany },
    auditLog: { create: mocks.audit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      dailyReport: { create: mocks.reportCreate, update: mocks.reportUpdate, delete: mocks.reportDelete },
      scheduleItem: { findMany: mocks.scheduleFindMany, update: mocks.scheduleUpdate },
      workProgressEntry: { findMany: mocks.progressFindMany, create: mocks.progressCreate, deleteMany: mocks.progressDeleteMany },
      auditLog: { create: mocks.audit }
    }))
  }
}));
vi.mock("@/lib/ai", () => ({ askProjectAssistant: vi.fn(), buildProjectContext: vi.fn(), localAiFallback: vi.fn() }));
vi.mock("@/lib/project-delete", () => ({ deleteProjectWithConfirmation: vi.fn(), ProjectDeleteError: class extends Error {} }));

const user = { id: "manager-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true };
const before = {
  id: "daily-1", organizationId: "org-1", projectId: "project-1", date: new Date("2026-07-14T12:00:00Z"), author: "Прораб",
  weather: "Ясно", workers: 7, engineers: 1, equipment: "Кран", completedWorks: "Монтаж", materialsReceived: "",
  materialsConsumed: "", downtime: "", issues: "",
  workOutputs: [{ profession: "Монтажник", workName: "Монтаж конструкций", quantity: 12, unit: "т", laborHours: 160 }],
  status: "draft", createdBy: "manager-1", createdAt: new Date(), updatedAt: new Date()
};

const schedule = {
  id: "schedule-1",
  organizationId: "org-1",
  projectId: "project-1",
  costCodeId: null,
  budgetItemId: null,
  name: "Монтаж конструкций",
  owner: "Прораб",
  startsAt: new Date("2026-07-01T00:00:00Z"),
  endsAt: new Date("2026-07-31T00:00:00Z"),
  plannedQty: new Prisma.Decimal(100),
  actualQty: new Prisma.Decimal(40),
  status: "in_progress",
  dependency: null,
  createdBy: "manager-1",
  createdAt: new Date(),
  updatedAt: new Date()
};

function request(body: unknown) {
  return new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
}

describe("daily reports catch-all workflow", () => {
  let scheduleActual = 40;
  let scheduleStatus = "in_progress";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.effectiveRole.mockResolvedValue("MANAGER");
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.demoContext.mockResolvedValue({ organizationId: "org-1", userId: "demo-user" });
    mocks.reportFind.mockResolvedValue(before);
    mocks.reportFindMany.mockResolvedValue([before]);
    mocks.reportCreate.mockResolvedValue(before);
    mocks.reportUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...before, ...data }));
    mocks.reportDelete.mockResolvedValue(before);
    mocks.assignmentFindMany.mockResolvedValue([]);
    mocks.progressFindMany.mockResolvedValue([]);
    mocks.progressCreate.mockResolvedValue({ id: "progress-1" });
    mocks.progressDeleteMany.mockResolvedValue({ count: 0 });
    scheduleActual = 40;
    scheduleStatus = "in_progress";
    mocks.scheduleFindMany.mockImplementation(async () => [{ ...schedule, actualQty: new Prisma.Decimal(scheduleActual), status: scheduleStatus }]);
    mocks.scheduleUpdate.mockImplementation(async ({ data }: { data: { actualQty?: Prisma.Decimal | { increment?: Prisma.Decimal; decrement?: Prisma.Decimal }; status?: string } }) => {
      if (data.actualQty instanceof Prisma.Decimal) scheduleActual = data.actualQty.toNumber();
      else if (data.actualQty?.increment) scheduleActual += data.actualQty.increment.toNumber();
      else if (data.actualQty?.decrement) scheduleActual -= data.actualQty.decrement.toNumber();
      if (data.status) scheduleStatus = data.status;
      return { ...schedule, actualQty: new Prisma.Decimal(scheduleActual), status: scheduleStatus };
    });
  });

  it("loads project reports independently from the page bundle", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local") as never, { params: { path: ["projects", "project-1", "daily-reports"] } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.reportFindMany).toHaveBeenCalledWith({
      where: { projectId: "project-1" },
      include: {
        evidenceDocuments: { orderBy: { uploadedAt: "asc" } },
        progressEntries: { orderBy: { createdAt: "asc" } }
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    });
    expect(body.items).toEqual([expect.objectContaining({ id: "daily-1", projectId: "project-1", completedWorks: "Монтаж" })]);
  });

  it("protects the report register from users without project access", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local") as never, { params: { path: ["projects", "project-1", "daily-reports"] } });
    expect(response.status).toBe(403);
    expect(mocks.reportFindMany).not.toHaveBeenCalled();
  });

  it("creates only a draft and writes audit atomically", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ ...before, status: "approved" }), { params: { path: ["projects", "project-1", "daily-reports"] } });
    expect(response.status).toBe(201);
    expect(mocks.reportCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "draft",
        workOutputs: [expect.objectContaining({ profession: "Монтажник", laborHours: 160 })]
      })
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entity: "daily_report", action: "create" }) }));
  });

  it("rejects an empty daily fact before creating a draft", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ ...before, completedWorks: "  " }), { params: { path: ["projects", "project-1", "daily-reports"] } });
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("выполненные работы");
    expect(mocks.reportCreate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("normalizes report text and measurable units before persistence", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      ...before,
      author: "  Прораб   Иванов ",
      workOutputs: [{ ...before.workOutputs[0], profession: " Монтажник  ", unit: "м2" }]
    }), { params: { path: ["projects", "project-1", "daily-reports"] } });
    expect(response.status).toBe(201);
    expect(mocks.reportCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        author: "Прораб Иванов",
        workOutputs: [expect.objectContaining({ profession: "Монтажник", unit: "м²" })]
      })
    }));
  });

  it("opens a planned shift with server-resolved project crew", async () => {
    mocks.assignmentFindMany.mockResolvedValue([{
      resourceId: "resource-1",
      resource: { name: "Сотрудник 1", profession: "Кровельщик", kind: "worker", headcount: 1 }
    }]);
    const { POST } = await import("./route");
    const response = await POST(request({
      ...before,
      phase: "open",
      workCategory: "Кровельные работы",
      plannedWorks: "Монтаж мембраны",
      completedWorks: "",
      workOutputs: [],
      workers: 0,
      engineers: 0,
      crewResourceIds: ["resource-1"]
    }), { params: { path: ["projects", "project-1", "daily-reports"] } });
    expect(response.status).toBe(201);
    expect(mocks.reportCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        phase: "open",
        workers: 1,
        engineers: 0,
        crewMembers: [expect.objectContaining({ resourceId: "resource-1", name: "Сотрудник 1" })]
      })
    }));
  });

  it("stores multiple work scopes and keeps a compact legacy summary", async () => {
    mocks.assignmentFindMany.mockResolvedValue([{
      resourceId: "resource-1",
      resource: { name: "Сотрудник 1", profession: "Кровельщик", kind: "worker", headcount: 1 }
    }]);
    const { POST } = await import("./route");
    const response = await POST(request({
      ...before,
      phase: "open",
      workCategory: "",
      workScopes: [
        { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" },
        { scheduleItemId: "schedule-2", workName: "Устройство примыканий", source: "schedule" }
      ],
      plannedWorks: "Выполнить работы на захватке 2",
      completedWorks: "",
      workOutputs: [],
      workers: 0,
      engineers: 0,
      crewResourceIds: ["resource-1"]
    }), { params: { path: ["projects", "project-1", "daily-reports"] } });

    expect(response.status).toBe(201);
    expect(mocks.reportCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workCategory: "Монтаж мембраны · Устройство примыканий",
        workScopes: [
          expect.objectContaining({ scheduleItemId: "schedule-1", workName: "Монтаж мембраны" }),
          expect.objectContaining({ scheduleItemId: "schedule-2", workName: "Устройство примыканий" })
        ]
      })
    }));
  });

  it("rejects duplicate work scopes before writing the report", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      ...before,
      workScopes: [
        { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" },
        { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" }
      ]
    }), { params: { path: ["projects", "project-1", "daily-reports"] } });

    expect(response.status).toBe(400);
    expect(mocks.reportCreate).not.toHaveBeenCalled();
  });

  it("keeps legacy work-category patches synchronized with structured scopes", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ workCategory: "Устройство гидроизоляции" }), {
      params: { path: ["daily-reports", "daily-1"] }
    });

    expect(response.status).toBe(200);
    expect(mocks.reportUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workCategory: "Устройство гидроизоляции",
        workScopes: [{ workName: "Устройство гидроизоляции", source: "manual" }]
      })
    }));
  });

  it("does not allow an open shift to be submitted as a completed report", async () => {
    mocks.reportFind.mockResolvedValue({
      ...before,
      phase: "open",
      workCategory: "Кровельные работы",
      plannedWorks: "Монтаж мембраны",
      completedWorks: "",
      workOutputs: [],
      crewMembers: [{ resourceId: "resource-1", name: "Сотрудник 1", profession: "Кровельщик", kind: "worker", headcount: 1 }]
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "submitted" }), { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(409);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
  });

  it("rejects skipped workflow transitions", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "approved" }), { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(409);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
  });

  it("audits the valid draft to submitted transition", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "submitted" }), { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(200);
    expect(mocks.reportUpdate).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entity: "daily_report", action: "update" }) }));
  });

  it("blocks submission when recorded labor exceeds the shift capacity", async () => {
    mocks.reportFind.mockResolvedValue({
      ...before,
      workers: 1,
      engineers: 0,
      workOutputs: [{ ...before.workOutputs[0], laborHours: 25 }]
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "submitted" }), { params: { path: ["daily-reports", "daily-1"] } });
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error).toContain("Трудозатраты");
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
  });

  it("allows a no-work report when the downtime is explicitly documented", async () => {
    mocks.reportFind.mockResolvedValue({
      ...before,
      workers: 0,
      engineers: 0,
      completedWorks: "Работы не выполнялись",
      downtime: "Остановка по штормовому предупреждению",
      workOutputs: []
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "submitted" }), { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(200);
    expect(mocks.reportUpdate).toHaveBeenCalled();
  });

  it("rejects empty or repeated-status updates without writing audit", async () => {
    const { PATCH } = await import("./route");
    const emptyResponse = await PATCH(request({}), { params: { path: ["daily-reports", "daily-1"] } });
    const repeatedStatusResponse = await PATCH(request({ status: "draft" }), { params: { path: ["daily-reports", "daily-1"] } });
    expect(emptyResponse.status).toBe(409);
    expect(repeatedStatusResponse.status).toBe(409);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("keeps non-draft reports immutable", async () => {
    mocks.reportFind.mockResolvedValue({ ...before, status: "submitted" });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ completedWorks: "Переписано" }), { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(409);
  });

  it("applies approved measurable output to the linked schedule item atomically", async () => {
    mocks.effectiveRole.mockResolvedValue("OWNER");
    scheduleActual = 90;
    mocks.reportFind.mockResolvedValue({
      ...before,
      status: "checked",
      workOutputs: [{ ...before.workOutputs[0], scheduleItemId: "schedule-1", quantity: 10 }]
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "approved" }), { params: { path: ["daily-reports", "daily-1"] } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.progressCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ dailyReportId: "daily-1", scheduleItemId: "schedule-1", status: "approved" })
    }));
    expect(scheduleActual).toBe(100);
    expect(scheduleStatus).toBe("done");
    expect(body.progress).toEqual(expect.objectContaining({ mode: "applied", entries: 1 }));
  });

  it("returns an approved report to draft and rolls back only its linked progress", async () => {
    mocks.effectiveRole.mockResolvedValue("OWNER");
    scheduleActual = 50;
    mocks.reportFind.mockResolvedValue({ ...before, status: "approved" });
    mocks.progressFindMany.mockResolvedValue([{ id: "progress-1", dailyReportId: "daily-1", scheduleItemId: "schedule-1", qty: new Prisma.Decimal(10) }]);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "draft", correctionReason: "Уточнить фактический объём" }), { params: { path: ["daily-reports", "daily-1"] } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(scheduleActual).toBe(40);
    expect(mocks.progressDeleteMany).toHaveBeenCalledWith({ where: { dailyReportId: "daily-1" } });
    expect(mocks.reportUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) }));
    expect(body.progress).toEqual(expect.objectContaining({ mode: "rolled_back", entries: 1 }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ summary: expect.stringContaining("Уточнить фактический объём") }) }));
  });

  it("requires an owner or administrator and a reason to reopen an approved report", async () => {
    mocks.reportFind.mockResolvedValue({ ...before, status: "approved" });
    const { PATCH } = await import("./route");
    const managerResponse = await PATCH(request({ status: "draft", correctionReason: "Исправить объём" }), { params: { path: ["daily-reports", "daily-1"] } });
    mocks.effectiveRole.mockResolvedValue("OWNER");
    const noReasonResponse = await PATCH(request({ status: "draft" }), { params: { path: ["daily-reports", "daily-1"] } });

    expect(managerResponse.status).toBe(409);
    expect(noReasonResponse.status).toBe(400);
    expect(mocks.progressDeleteMany).not.toHaveBeenCalled();
  });

  it("synchronizes a legacy approved report once and remains idempotent", async () => {
    mocks.effectiveRole.mockResolvedValue("OWNER");
    mocks.reportFind.mockResolvedValue({
      ...before,
      status: "approved",
      workOutputs: [{ ...before.workOutputs[0], scheduleItemId: "schedule-1", quantity: 5 }]
    });
    const { PATCH } = await import("./route");
    const firstResponse = await PATCH(request({ applyProgress: true }), { params: { path: ["daily-reports", "daily-1"] } });
    mocks.progressFindMany.mockResolvedValue([{ id: "progress-1", dailyReportId: "daily-1", scheduleItemId: "schedule-1", qty: new Prisma.Decimal(5) }]);
    const secondResponse = await PATCH(request({ applyProgress: true }), { params: { path: ["daily-reports", "daily-1"] } });
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(scheduleActual).toBe(45);
    expect(mocks.progressCreate).toHaveBeenCalledTimes(1);
    expect(secondBody.progress.mode).toBe("already_applied");
  });

  it("deletes only draft reports and writes audit", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("https://pgs.local", { method: "DELETE" }) as never, { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(200);
    expect(mocks.reportDelete).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "delete" }) }));
  });

  it("keeps submitted and approved reports immutable during cleanup", async () => {
    mocks.reportFind.mockResolvedValue({ ...before, status: "submitted" });
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("https://pgs.local", { method: "DELETE" }) as never, { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(409);
    expect(mocks.reportDelete).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not update or delete a report through another project's nested URL", async () => {
    const { DELETE, PATCH } = await import("./route");
    const updateResponse = await PATCH(request({ completedWorks: "Подмена" }), {
      params: { path: ["projects", "project-other", "daily-reports", "daily-1"] }
    });
    const deleteResponse = await DELETE(new Request("https://pgs.local", { method: "DELETE" }) as never, {
      params: { path: ["projects", "project-other", "daily-reports", "daily-1"] }
    });
    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
    expect(mocks.reportDelete).not.toHaveBeenCalled();
  });

  it("keeps direct report mutations protected by project access", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ completedWorks: "Нет доступа" }), { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(403);
    expect(mocks.reportUpdate).not.toHaveBeenCalled();
  });
});
