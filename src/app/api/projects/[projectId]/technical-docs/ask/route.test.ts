import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  search: vi.fn(),
  fingerprint: vi.fn(),
  answer: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/technical-documentation/index", () => ({
  searchProjectKnowledge: mocks.search,
  projectKnowledgeFingerprint: mocks.fingerprint
}));
vi.mock("@/lib/technical-documentation/qa", async (original) => {
  const actual = await original<typeof import("@/lib/technical-documentation/qa")>();
  return { ...actual, answerTechnicalQuestion: mocks.answer };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn(async () => ({ name: "Проект", organizationId: "org-1" })) },
    aiRun: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: "run-1" })),
      update: vi.fn(async () => ({ id: "run-1" }))
    }
  }
}));

function request(body: unknown) {
  return new NextRequest("https://pgs.local/api/projects/project-1/technical-docs/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("technical documentation question route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", name: "User", email: "user@example.test", role: "MANAGER", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.search.mockResolvedValue([]);
    mocks.fingerprint.mockResolvedValue("fingerprint");
  });

  it("checks access before reading the question body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const guardedRequest = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(guardedRequest, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect((guardedRequest as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("returns an honest no-evidence result without calling AI", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ question: "Какая марка утеплителя?" }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ result: { notFound: true, provider: "deterministic", citations: [] } });
    expect(mocks.answer).not.toHaveBeenCalled();
  });

  it("returns local source matches without calling AI when the connector is disabled", async () => {
    const previousMode = process.env.OPENAI_CONNECTOR_MODE;
    process.env.OPENAI_CONNECTOR_MODE = "disabled";
    mocks.search.mockResolvedValue([{
      id: "chunk-1",
      documentId: "knowledge-1",
      sourceKind: "pgs",
      title: "Рабочая документация",
      locator: "Страница 12",
      text: "Толщина минераловатного утеплителя 150 мм.",
      sourceUrl: "/api/projects/project-1/documents/document-1/download",
      score: 8
    }]);
    try {
      const { POST } = await import("./route");
      const response = await POST(request({ question: "Какая толщина утеплителя?" }), { params: { projectId: "project-1" } });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        result: {
          provider: "deterministic",
          notFound: false,
          citations: [{ title: "Рабочая документация", locator: "Страница 12" }]
        }
      });
      expect(mocks.answer).not.toHaveBeenCalled();
    } finally {
      if (previousMode === undefined) delete process.env.OPENAI_CONNECTOR_MODE;
      else process.env.OPENAI_CONNECTOR_MODE = previousMode;
    }
  });
});
