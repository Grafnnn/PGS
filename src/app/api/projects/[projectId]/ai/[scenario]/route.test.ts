import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-demo", name: "Demo", email: "demo@pgs.local", role: "OWNER", authenticated: false }))
}));

vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: vi.fn(async () => true)
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: vi.fn()
    },
    document: {
      findMany: vi.fn(async () => [])
    }
  }
}));

function request(body: unknown = {}) {
  return new NextRequest("https://pgs.local/api/projects/project-demo/ai/summary", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

describe("AI scenario endpoint", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-demo", name: "Demo", email: "demo@pgs.local", role: "OWNER", authenticated: false });
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
    vi.unstubAllGlobals();
  });

  it("rejects unknown scenarios", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-demo", scenario: "unknown" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown AI scenario" });
  });

  it("returns structured insight for an authorized scenario", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-demo", scenario: "summary" } });
    const data = (await response.json()) as { ok: boolean; insight: { scenario: string; provider: string; findings: unknown[] } };

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.insight.scenario).toBe("summary");
    expect(data.insight.provider).toBe("deterministic");
    expect(data.insight.findings.length).toBeGreaterThan(0);
  });

  it("rejects unauthenticated users before project access checks", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-demo", scenario: "summary" } });

    expect(response.status).toBe(403);
    expect(canProject).not.toHaveBeenCalled();
  });

  it("returns 404 for missing projects before AI execution", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-missing", scenario: "summary" } });

    expect(response.status).toBe(404);
    expect(canProject).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: "Project not found" });
  });

  it("rejects users without project access", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-demo", scenario: "summary" } });

    expect(response.status).toBe(403);
    expect(canProject).toHaveBeenCalledWith(expect.objectContaining({ id: "user-demo" }), "project-demo", "view");
  });

  it.each(["budget-review", "schedule-review", "procurement-review", "finance-review", "risk-review", "executive-report"] as const)("supports scenario route %s", async (scenario) => {
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-demo", scenario } });
    const data = (await response.json()) as { ok: boolean; insight: { scenario: string; provider: string } };

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.insight.scenario).toBe(scenario);
    expect(data.insight.provider).toBe("deterministic");
  });

  it("returns degraded structured response for invalid live provider JSON", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "not-json" } }] })
      }))
    );
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-demo", scenario: "summary" } });
    const data = (await response.json()) as { ok: boolean; insight: { provider: string; dataLimitations: string[] } };

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.insight.provider).toBe("degraded");
    expect(JSON.stringify(data)).not.toContain("openai-token-redacted");
  });
});
