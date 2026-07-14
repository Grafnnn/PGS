import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getProjectBundleFromDb } from "@/lib/project-data";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn() }));
vi.mock("@/lib/project-data", () => ({ getProjectBundleFromDb: vi.fn() }));
vi.mock("@/lib/project-pipeline", () => ({ buildPipelineSnapshot: vi.fn(async () => null) }));
vi.mock("@/lib/risk-executive-intelligence", () => ({
  buildRiskExecutiveIntelligence: vi.fn(() => ({
    executiveReport: {
      status: "amber",
      statusReason: "partial",
      reportReadiness: "partial",
      topRisks: [],
      topActions: [],
      decisionsRequiredCount: 0,
      missingData: ["Documents"],
      sections: [{ title: "Статус проекта", text: "Требует внимания" }],
      copyText: "Статус проекта\nТребует внимания"
    }
  }))
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    executiveReport: { findMany: vi.fn(), aggregate: mocks.aggregate, create: mocks.create },
    document: { findMany: vi.fn(async () => []) },
    auditLog: { create: mocks.audit },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      executiveReport: { aggregate: mocks.aggregate, create: mocks.create },
      auditLog: { create: mocks.audit }
    }))
  }
}));

const content = {
  status: "amber",
  statusReason: "partial",
  reportReadiness: "partial",
  topRisks: [],
  topActions: [],
  decisionsRequiredCount: 0,
  missingData: ["Documents"],
  sections: [{ title: "Статус проекта", text: "Требует внимания" }],
  copyText: "Статус проекта\nТребует внимания"
};
const report = {
  id: "report-1",
  organizationId: "org-1",
  projectId: "project-1",
  version: 2,
  title: "Еженедельный отчет",
  reportDate: new Date("2026-07-14T12:00:00.000Z"),
  status: "draft",
  content,
  sourceSnapshot: { budgetItems: 1 },
  createdBy: "user-1",
  publishedAt: null,
  publishedBy: null,
  createdAt: new Date("2026-07-14T12:00:00.000Z"),
  updatedAt: new Date("2026-07-14T12:00:00.000Z")
};
const bundle = {
  project: { id: "project-1", organizationId: "org-1", name: "Объект", contractAmount: 1000 },
  budgetItems: [{}], scheduleItems: [], materials: [], procurementRequests: [], payments: [], dailyReports: [], risks: [], aiMessages: []
};

describe("executive reports collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true });
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(getProjectBundleFromDb).mockResolvedValue(bundle as never);
    vi.mocked(prisma.executiveReport.findMany).mockResolvedValue([report] as never);
    mocks.aggregate.mockResolvedValue({ _max: { version: 1 } });
    mocks.create.mockResolvedValue(report);
  });

  it("guards generation before parsing the request body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(getProjectBundleFromDb).not.toHaveBeenCalled();
  });

  it("lists versioned reports for project viewers", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items[0]).toMatchObject({ id: "report-1", version: 2, status: "draft" });
    expect(canProject).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }), "project-1", "view");
  });

  it("creates the next deterministic report version with an audit entry", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportDate: "2026-07-14" })
    }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ entity: "executive_report", action: "create" }) }));
  });
});
