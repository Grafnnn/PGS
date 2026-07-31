import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import {
  applyDailyProgressImpact,
  findDailyProgressProjectId,
  loadDailyProgressImpact
} from "@/lib/daily-progress-impact-db";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "manager-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/daily-progress-impact-db", () => ({
  DailyProgressImpactError: class DailyProgressImpactError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  findDailyProgressProjectId: vi.fn(async () => "project-1"),
  loadDailyProgressImpact: vi.fn(),
  applyDailyProgressImpact: vi.fn()
}));

const preview = {
  projectId: "project-1",
  report: { id: "report-1", impactStatus: "pending" },
  preview: { reportId: "report-1", status: "ready", blockers: [], warnings: [] }
};

describe("daily progress impact route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findDailyProgressProjectId).mockResolvedValue("project-1");
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(loadDailyProgressImpact).mockResolvedValue(preview as never);
    vi.mocked(applyDailyProgressImpact).mockResolvedValue({ ...preview, alreadyApplied: false } as never);
  });

  it("loads a read-only preview for an authorized project user", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local") as never, { params: { reportId: "report-1" } });
    expect(response.status).toBe(200);
    expect(loadDailyProgressImpact).toHaveBeenCalledWith("report-1");
  });

  it("checks edit access before parsing a mutation body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { reportId: "report-1" } });
    expect(response.status).toBe(403);
    expect(applyDailyProgressImpact).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: false })
    }) as never, { params: { reportId: "report-1" } });
    expect(response.status).toBe(400);
    expect(applyDailyProgressImpact).not.toHaveBeenCalled();
  });

  it("applies once and returns created", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true })
    }) as never, { params: { reportId: "report-1" } });
    expect(response.status).toBe(201);
    expect(applyDailyProgressImpact).toHaveBeenCalledWith("report-1", expect.objectContaining({ id: "manager-1" }));
  });
});
