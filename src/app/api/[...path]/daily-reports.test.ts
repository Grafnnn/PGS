import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  effectiveRole: vi.fn(),
  projectFind: vi.fn(),
  reportFind: vi.fn(),
  reportCreate: vi.fn(),
  reportUpdate: vi.fn(),
  reportDelete: vi.fn(),
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
    dailyReport: { findUnique: mocks.reportFind, findUniqueOrThrow: mocks.reportFind, create: mocks.reportCreate, update: mocks.reportUpdate, delete: mocks.reportDelete },
    auditLog: { create: mocks.audit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      dailyReport: { create: mocks.reportCreate, update: mocks.reportUpdate, delete: mocks.reportDelete },
      auditLog: { create: mocks.audit }
    }))
  }
}));
vi.mock("@/lib/ai", () => ({ askProjectAssistant: vi.fn(), buildProjectContext: vi.fn(), localAiFallback: vi.fn() }));
vi.mock("@/lib/project-delete", () => ({ deleteProjectWithConfirmation: vi.fn(), ProjectDeleteError: class extends Error {} }));

const user = { id: "manager-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true };
const before = {
  id: "daily-1", organizationId: "org-1", projectId: "project-1", date: new Date("2026-07-14T12:00:00Z"), author: "Прораб",
  weather: "Ясно", workers: 5, engineers: 1, equipment: "Кран", completedWorks: "Монтаж", materialsReceived: "",
  materialsConsumed: "", downtime: "", issues: "", status: "draft", createdBy: "manager-1", createdAt: new Date(), updatedAt: new Date()
};

function request(body: unknown) {
  return new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
}

describe("daily reports catch-all workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.effectiveRole.mockResolvedValue("MANAGER");
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.demoContext.mockResolvedValue({ organizationId: "org-1", userId: "demo-user" });
    mocks.reportFind.mockResolvedValue(before);
    mocks.reportCreate.mockResolvedValue(before);
    mocks.reportUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...before, ...data }));
    mocks.reportDelete.mockResolvedValue(before);
  });

  it("creates only a draft and writes audit atomically", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ ...before, status: "approved" }), { params: { path: ["projects", "project-1", "daily-reports"] } });
    expect(response.status).toBe(201);
    expect(mocks.reportCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "draft" }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entity: "daily_report", action: "create" }) }));
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

  it("deletes only draft reports and writes audit", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("https://pgs.local", { method: "DELETE" }) as never, { params: { path: ["daily-reports", "daily-1"] } });
    expect(response.status).toBe(200);
    expect(mocks.reportDelete).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "delete" }) }));
  });
});
