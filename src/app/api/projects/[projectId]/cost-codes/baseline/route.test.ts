import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), canProject: vi.fn(), projectFind: vi.fn(), budgetFind: vi.fn(), codeFind: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.projectFind },
  budgetItem: { findMany: mocks.budgetFind },
  projectCostCode: { findMany: mocks.codeFind },
  $transaction: vi.fn()
} }));

describe("cost code baseline route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects before body parsing or database access when edit permission is missing", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", authenticated: true });
    mocks.canProject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("returns a deterministic preview without starting a transaction", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.budgetFind.mockResolvedValue([{ id: "b-1", section: "Фасад", subsection: "Монтаж", kind: "work", name: "Работы" }]);
    mocks.codeFind.mockResolvedValue([]);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "preview" }) }) as never, { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.preview.summary).toEqual({ budgetItems: 1, sections: 1, codes: 3, leafCodes: 1, assignments: 1 });
    expect(body.preview.conflicts).toEqual([]);
  });

  it("rejects commit without explicit confirmation", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "commit", confirm: false }) }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(400);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });
});
