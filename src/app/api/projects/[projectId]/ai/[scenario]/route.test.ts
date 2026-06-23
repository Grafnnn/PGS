import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
