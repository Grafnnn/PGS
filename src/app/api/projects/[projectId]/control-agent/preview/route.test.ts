import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { loadAiControlAgentPreview } from "@/lib/ai-control-agent-db";
import { runAiScenario } from "@/lib/ai-command";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/ai-control-agent-db", () => ({ loadAiControlAgentPreview: vi.fn() }));
vi.mock("@/lib/ai-command", () => ({ runAiScenario: vi.fn() }));

const preview = {
  previewId: "a".repeat(64),
  generatedAt: "2026-07-27T09:00:00.000Z",
  expiresAt: "2026-07-27T09:30:00.000Z",
  status: "attention",
  summary: "Есть действия",
  proposals: [],
  skippedExisting: 0,
  dataUsed: [],
  limitations: [],
  mutationPolicy: { previewWrites: false, confirmWrites: "project_actions_only", budgetScheduleProcurementDocumentWrites: false }
};

describe("AI Control Agent preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(loadAiControlAgentPreview).mockResolvedValue(preview as never);
  });

  it("checks access before parsing or loading project data", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(loadAiControlAgentPreview).not.toHaveBeenCalled();
  });

  it("does not call the provider unless explicitly requested", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ includeAi: false })
    }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    expect(runAiScenario).not.toHaveBeenCalled();
  });
});
