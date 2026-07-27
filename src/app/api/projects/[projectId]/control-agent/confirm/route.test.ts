import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { commitAiControlAgentActions } from "@/lib/ai-control-agent-db";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/ai-control-agent-db", () => ({
  AiControlAgentError: class AiControlAgentError extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
  commitAiControlAgentActions: vi.fn()
}));

describe("AI Control Agent confirmation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(commitAiControlAgentActions).mockResolvedValue({ ok: true, created: [], skippedProposalIds: [] } as never);
  });

  it("checks edit access before parsing confirmation", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(commitAiControlAgentActions).not.toHaveBeenCalled();
  });

  it("requires an explicit confirmation flag", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        previewId: "a".repeat(64),
        generatedAt: "2026-07-27T09:00:00.000Z",
        selectedProposalIds: ["proposal-1"],
        confirmed: false
      })
    }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(400);
    expect(commitAiControlAgentActions).not.toHaveBeenCalled();
  });
});
