import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aiRun: { findFirst: mocks.findFirst },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({ aiRun: { update: mocks.update }, auditLog: { create: mocks.audit } })
    )
  }
}));

const user = { id: "user-1", name: "User", email: "user@pgs.local", role: "MANAGER" as const, authenticated: true };
const baseRun = {
  id: "run-1",
  organizationId: "org-1",
  projectId: "project-1",
  userId: "user-1",
  scenario: "summary",
  promptVersion: "ai-command-v1",
  inputJson: {},
  outputJson: {},
  status: "succeeded",
  provider: "deterministic",
  durationMs: 25,
  sanitizedError: null,
  feedback: null,
  feedbackComment: null,
  feedbackBy: null,
  feedbackAt: null,
  completedAt: new Date("2026-07-27T10:00:00.000Z"),
  createdAt: new Date("2026-07-27T10:00:00.000Z"),
  actionLinks: []
};

function request(body: unknown) {
  return new NextRequest("https://pgs.local/api/projects/project-1/ai-runs/run-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("AI run feedback endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(canProject).mockResolvedValue(true);
    mocks.findFirst.mockResolvedValue(baseRun);
    mocks.update.mockResolvedValue({
      ...baseRun,
      feedback: "needs_review",
      feedbackComment: "Перепроверить срок",
      feedbackBy: "user-1",
      feedbackAt: new Date("2026-07-27T10:01:00.000Z")
    });
    mocks.audit.mockResolvedValue({});
  });

  it("rejects unauthenticated users before parsing or database access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ feedback: "helpful" }), { params: { projectId: "project-1", runId: "run-1" } });

    expect(response.status).toBe(403);
    expect(canProject).not.toHaveBeenCalled();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("records sanitized review feedback and an audit event", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      request({ feedback: "needs_review", comment: "Перепроверить token=super-secret-value срок" }),
      { params: { projectId: "project-1", runId: "run-1" } }
    );

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        feedback: "needs_review",
        feedbackComment: "Перепроверить token=[REDACTED] срок"
      })
    }));
    expect(mocks.audit).toHaveBeenCalled();
    expect(JSON.stringify(mocks.update.mock.calls)).not.toContain("super-secret-value");
  });

  it("rejects invalid feedback values", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(request({ feedback: "approved" }), { params: { projectId: "project-1", runId: "run-1" } });

    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
