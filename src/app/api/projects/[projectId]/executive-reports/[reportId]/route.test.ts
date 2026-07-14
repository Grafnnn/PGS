import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject, getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn(), audit: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(), getEffectiveProjectRole: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    executiveReport: { findUnique: vi.fn(), update: mocks.update, delete: mocks.remove },
    auditLog: { create: mocks.audit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ executiveReport: { update: mocks.update, delete: mocks.remove }, auditLog: { create: mocks.audit } }))
  }
}));

const content = { status: "red", statusReason: "blocked", reportReadiness: "blocked", topRisks: [], topActions: [], decisionsRequiredCount: 1, missingData: ["Documents"], sections: [], copyText: "Blocked" };
const report = {
  id: "report-1", organizationId: "org-1", projectId: "project-1", version: 1, title: "Report", reportDate: new Date("2026-07-14T12:00:00Z"),
  status: "draft", content, sourceSnapshot: {}, createdBy: "user-1", publishedAt: null, publishedBy: null,
  createdAt: new Date("2026-07-14T12:00:00Z"), updatedAt: new Date("2026-07-14T12:00:00Z")
};

function request(body: unknown) {
  return new Request("https://pgs.local", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

describe("executive report item", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1", name: "Владелец", email: "owner@example.test", role: "OWNER", authenticated: true });
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("OWNER");
    vi.mocked(prisma.executiveReport.findUnique).mockResolvedValue(report as never);
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...report, ...data, updatedAt: new Date("2026-07-14T13:00:00Z") }));
  });

  it("requires explicit confirmation for a blocked report", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "published" }) as never, { params: { projectId: "project-1", reportId: "report-1" } });
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("keeps publication restricted to owners and administrators", async () => {
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("MANAGER");
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "published", publishConfirmed: true }) as never, { params: { projectId: "project-1", reportId: "report-1" } });
    expect(response.status).toBe(403);
  });

  it("publishes a confirmed blocked report atomically and audits approval", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "published", publishConfirmed: true }) as never, { params: { projectId: "project-1", reportId: "report-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.item.status).toBe("published");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "accept" }) }));
  });

  it("does not delete a published report", async () => {
    vi.mocked(prisma.executiveReport.findUnique).mockResolvedValue({ ...report, status: "published" } as never);
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("https://pgs.local"), { params: { projectId: "project-1", reportId: "report-1" } });
    expect(response.status).toBe(409);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("does not republish an archived report", async () => {
    vi.mocked(prisma.executiveReport.findUnique).mockResolvedValue({ ...report, status: "archived" } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ status: "published", publishConfirmed: true }) as never, { params: { projectId: "project-1", reportId: "report-1" } });
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
