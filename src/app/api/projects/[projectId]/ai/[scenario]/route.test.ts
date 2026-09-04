import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    aiRun: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "ai-run-1",
        projectId: "project-demo",
        userId: null,
        scenario: "summary",
        promptVersion: data.promptVersion,
        inputJson: data.inputJson,
        outputJson: data.outputJson,
        status: data.status,
        provider: data.provider,
        durationMs: data.durationMs,
        sanitizedError: data.sanitizedError ?? null,
        feedback: null,
        feedbackComment: null,
        feedbackBy: null,
        feedbackAt: null,
        completedAt: new Date("2026-07-27T10:00:00.000Z"),
        createdAt: new Date("2026-07-27T10:00:00.000Z"),
        actionLinks: []
      }))
    },
    document: {
      findMany: vi.fn(async () => [])
    },
    supplierQuote: {
      findMany: vi.fn(async () => [])
    }
  }
}));

const originalDatabaseUrl = process.env.DATABASE_URL;

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
    delete process.env.DATABASE_URL;
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-demo", name: "Demo", email: "demo@pgs.local", role: "OWNER", authenticated: false });
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null);
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
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
    const data = (await response.json()) as { ok: boolean; journaled: boolean; run: { promptVersion: string }; insight: { scenario: string; provider: string; findings: unknown[] } };

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.insight.scenario).toBe("summary");
    expect(data.insight.provider).toBe("deterministic");
    expect(data.insight.findings.length).toBeGreaterThan(0);
    expect(data.journaled).toBe(true);
    expect(data.run.promptVersion).toBe("ai-lifecycle-copilot-v2");
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

  it.each([
    "budget-review",
    "schedule-review",
    "procurement-review",
    "finance-review",
    "contract-review",
    "risk-review",
    "executive-report",
    "onboarding-review",
    "workforce-review",
    "field-review",
    "quality-review",
    "rfi-review",
    "claims-review",
    "acceptance-review",
    "closeout-review"
  ] as const)("supports scenario route %s", async (scenario) => {
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

  it("redacts secret-like input before writing the AI journal", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      request({
        instructions: "DATABASE_URL=postgresql://admin:password@db.local/pgs token=abc123secret password=hunter2 sk-proj-abcdefghijklmnop"
      }),
      { params: { projectId: "project-demo", scenario: "summary" } }
    );

    expect(response.status).toBe(200);
    const createInput = vi.mocked(prisma.aiRun.create).mock.calls.at(-1)?.[0];
    const serialized = JSON.stringify(createInput);
    expect(serialized).not.toContain("admin:password");
    expect(serialized).not.toContain("abc123secret");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("sk-proj-abcdefghijklmnop");
    expect(serialized).toContain("[REDACTED");
  });

  it("keeps AI analysis available when journal persistence is unavailable", async () => {
    vi.mocked(prisma.aiRun.create).mockRejectedValueOnce(new Error("ai_runs table is unavailable"));
    const { POST } = await import("./route");

    const response = await POST(request(), { params: { projectId: "project-demo", scenario: "summary" } });
    const data = (await response.json()) as { ok: boolean; journaled: boolean; insight: { scenario: string } };

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      ok: true,
      journaled: false,
      insight: { scenario: "summary" }
    });
  });
});
