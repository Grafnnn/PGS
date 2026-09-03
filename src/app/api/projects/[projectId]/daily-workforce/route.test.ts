import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  assignmentFind: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    projectResourceAssignment: { findMany: mocks.assignmentFind }
  }
}));

describe("daily workforce route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ id: "project-1" });
    mocks.assignmentFind.mockResolvedValue([{
      resourceId: "resource-1",
      resource: { name: "Сотрудник 1", profession: "Кровельщик", kind: "worker", headcount: 1 }
    }]);
  });

  it("checks project access before reading the crew", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("returns only safe fields needed by the shift picker", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local?date=2026-09-03"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      items: [{ resourceId: "resource-1", name: "Сотрудник 1", profession: "Кровельщик", kind: "worker", headcount: 1 }]
    });
    expect(JSON.stringify(body)).not.toContain("salary");
    expect(mocks.assignmentFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        startsAt: { lte: new Date("2026-09-03T00:00:00.000Z") },
        endsAt: { gte: new Date("2026-09-03T00:00:00.000Z") }
      })
    }));
  });

  it("rejects an invalid shift date before reading project data", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local?date=03.09.2026"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(400);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });
});
