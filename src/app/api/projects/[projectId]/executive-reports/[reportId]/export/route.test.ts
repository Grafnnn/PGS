import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "user-1", role: "VIEWER", authenticated: true })) }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/prisma", () => ({ prisma: { executiveReport: { findUnique: vi.fn() } } }));

describe("executive report export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.executiveReport.findUnique).mockResolvedValue({
      id: "report-1", projectId: "project-1", version: 3, reportDate: new Date("2026-07-14T12:00:00Z"), content: { copyText: "Safe report text" }
    } as never);
  });

  it("exports a private plain-text report for project viewers", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1", reportId: "report-1" } });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Safe report text");
    expect(response.headers.get("content-disposition")).toContain("executive-report-v3-2026-07-14.txt");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("guards export before reading the report", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1", reportId: "report-1" } });
    expect(response.status).toBe(403);
    expect(prisma.executiveReport.findUnique).not.toHaveBeenCalled();
  });

  it("returns a controlled error for an invalid stored report payload", async () => {
    vi.mocked(prisma.executiveReport.findUnique).mockResolvedValue({
      id: "report-1", projectId: "project-1", version: 3, reportDate: new Date("2026-07-14T12:00:00Z"), content: {}
    } as never);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1", reportId: "report-1" } });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Executive report content is unavailable" });
  });
});
