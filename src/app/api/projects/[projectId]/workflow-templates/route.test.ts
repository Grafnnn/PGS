import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({ createTemplate: vi.fn(), createAudit: vi.fn(async () => ({})) }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true })) }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectWorkflowTemplate: { findMany: vi.fn(), create: mocks.createTemplate },
    auditLog: { create: mocks.createAudit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ projectWorkflowTemplate: { create: mocks.createTemplate }, auditLog: { create: mocks.createAudit } }))
  }
}));

const template = {
  id: "template-1", projectId: "project-1", name: "КС пакет", description: null, category: "billing", status: "active",
  createdAt: new Date("2026-07-15T10:00:00.000Z"), updatedAt: new Date("2026-07-15T10:00:00.000Z"),
  steps: [{ id: "step-1", sequence: 1, name: "Проверка", description: null, stepType: "review", assigneeRole: "MANAGER", dueDays: 2 }]
};

describe("workflow templates route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true });
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ organizationId: "org-1" } as never);
    vi.mocked(prisma.projectWorkflowTemplate.findMany).mockResolvedValue([template] as never);
    mocks.createTemplate.mockResolvedValue(template);
  });

  it("guards reads before querying", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.projectWorkflowTemplate.findMany).not.toHaveBeenCalled();
  });

  it("requires owner/admin permission before parsing a template", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("creates a serial snapshot template transactionally", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "КС пакет", category: "billing", steps: [{ name: "Проверка", assigneeRole: "MANAGER", dueDays: 2 }] }) }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(canProject).toHaveBeenCalledWith(expect.objectContaining({ id: "owner-1" }), "project-1", "manage_members");
    expect(mocks.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ steps: { create: [expect.objectContaining({ sequence: 1, assigneeRole: "MANAGER" })] } }) }));
    expect(mocks.createAudit).toHaveBeenCalled();
  });
});
