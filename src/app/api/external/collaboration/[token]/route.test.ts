import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linkFind: vi.fn(),
  rfiFind: vi.fn(),
  submittalFind: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalCollaborationLink: { findUnique: mocks.linkFind },
    projectRfi: { findFirst: mocks.rfiFind },
    projectSubmittal: { findFirst: mocks.submittalFind }
  }
}));

const token = "a".repeat(43);
const now = new Date();

describe("public external collaboration route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.linkFind.mockResolvedValue({
      id: "link-1",
      organizationId: "org-1",
      projectId: "project-1",
      entityType: "rfi",
      entityId: "rfi-1",
      recipientName: "Технадзор",
      recipientEmail: "private@example.test",
      tokenHash: "hash",
      status: "active",
      expiresAt: new Date(now.getTime() + 86_400_000),
      responseLimit: 1,
      responseCount: 0,
      lastRespondedAt: null,
      revokedAt: null,
      metadata: null,
      createdBy: "owner-1",
      createdAt: now,
      updatedAt: now,
      project: { name: "Проект", customer: "Заказчик", object: "Объект" }
    });
    mocks.rfiFind.mockResolvedValue({
      id: "rfi-1",
      sequence: 7,
      subject: "Узел фасада",
      question: "Подтвердить решение",
      discipline: "АР",
      location: "Ось 1",
      priority: "high",
      status: "open",
      dueAt: null
    });
  });

  it("returns 404 for malformed tokens without querying the database", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { token: "short" } });
    expect(response.status).toBe(404);
    expect(mocks.linkFind).not.toHaveBeenCalled();
  });

  it("returns only the scoped project label and one shared entity", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { token } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.project).toEqual({ name: "Проект", customer: "Заказчик", object: "Объект" });
    expect(body.entity).toMatchObject({ id: "rfi-1", number: "RFI-007", subject: "Узел фасада" });
    expect(body).not.toHaveProperty("recipientEmail");
    expect(body).not.toHaveProperty("organizationId");
    expect(JSON.stringify(body)).not.toContain("private@example.test");
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });
});
