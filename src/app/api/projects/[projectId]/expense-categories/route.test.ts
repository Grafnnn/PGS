import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  categoryFindMany: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.projectFind },
  projectExpenseCategory: { findMany: mocks.categoryFindMany },
  $transaction: mocks.transaction
} }));

const context = { params: { projectId: "project-1" } };

describe("project expense categories route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", name: "Admin", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    mocks.categoryFindMany.mockResolvedValue([]);
    mocks.audit.mockResolvedValue({});
  });

  it("checks edit permission before parsing a category", async () => {
    mocks.canProject.mockResolvedValue(false);
    const guarded = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(guarded, context);
    expect(response.status).toBe(403);
    expect((guarded as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
  });

  it("lists project categories as selectable values", async () => {
    mocks.categoryFindMany.mockResolvedValue([{ id: "category-1", name: "Аренда бытовки" }]);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ value: "custom:category-1", label: "Аренда бытовки", custom: true }] });
  });

  it("creates and audits a project category", async () => {
    const tx = {
      projectExpenseCategory: { create: vi.fn().mockResolvedValue({ id: "category-1", name: "Аренда бытовки" }) },
      auditLog: { create: vi.fn() }
    };
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "  Аренда бытовки  " }) }), context);
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(tx.projectExpenseCategory.create).toHaveBeenCalledWith({ data: expect.objectContaining({ projectId: "project-1", name: "Аренда бытовки", normalizedName: "аренда бытовки" }) });
    expect(mocks.audit).toHaveBeenCalled();
    expect(body.item).toEqual({ value: "custom:category-1", label: "Аренда бытовки", custom: true });
  });

  it("does not duplicate a built-in category label", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Материалы" }) }), context);
    expect(response.status).toBe(409);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });
});
