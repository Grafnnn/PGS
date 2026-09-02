import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  role: vi.fn(),
  projectFind: vi.fn(),
  projectUpdate: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: mocks.role }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...args: unknown[]) => mocks.audit(...args) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    $transaction: mocks.transaction
  }
}));

const project = {
  id: "project-1",
  organizationId: "org-1",
  startsAt: new Date("2026-08-25T00:00:00.000Z"),
  endsAt: new Date("2026-11-30T00:00:00.000Z"),
  scheduleItems: [{ startsAt: new Date("2026-09-07T00:00:00.000Z"), endsAt: new Date("2026-11-13T00:00:00.000Z") }],
  materials: [{ orderByAt: new Date("2026-09-04T00:00:00.000Z"), neededAt: new Date("2026-09-07T00:00:00.000Z") }],
  materialNeeds: [{ requiredAt: new Date("2026-09-07T00:00:00.000Z") }],
  procurementRequests: []
};

function post(body: unknown) {
  return new Request("https://pgs.local/api/projects/project-1/calendar/shift", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const context = { params: { projectId: "project-1" } };

describe("project calendar shift route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ authenticated: true, id: "user-1", name: "Owner", email: "owner@example.test" });
    mocks.role.mockResolvedValue("OWNER");
    mocks.projectFind.mockResolvedValue(project);
    mocks.projectUpdate.mockResolvedValue({});
    mocks.executeRaw.mockResolvedValue(1);
    mocks.audit.mockResolvedValue({});
    const tx = { project: { update: mocks.projectUpdate }, $executeRaw: mocks.executeRaw };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("checks owner/admin permission before parsing or reading project data", async () => {
    mocks.role.mockResolvedValue("MANAGER");
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }), context);

    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("returns a read-only preview", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ targetStart: "2026-09-02", mode: "preview" }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.preview).toMatchObject({
      deltaDays: -5,
      schedule: { first: { after: "2026-09-02" } },
      materials: { firstOrder: { after: "2026-08-30" } }
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before the transaction", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ targetStart: "2026-09-02", mode: "commit", confirmed: false }), context);

    expect(response.status).toBe(409);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("shifts the project and dependent plan dates in one transaction", async () => {
    const { POST } = await import("./route");
    const response = await POST(post({ targetStart: "2026-09-02", mode: "commit", confirmed: true }), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.shifted).toBe(true);
    expect(mocks.projectUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        startsAt: new Date("2026-09-02T00:00:00.000Z"),
        endsAt: new Date("2026-11-25T00:00:00.000Z")
      }
    }));
    expect(mocks.executeRaw).toHaveBeenCalledTimes(4);
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "project_calendar",
      after: expect.objectContaining({ deltaDays: -5, scheduleItems: 1, materials: 1 })
    }));
  });
});
