import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  ensureFresh: vi.fn(),
  search: vi.fn(),
  fingerprint: vi.fn(),
  answer: vi.fn(),
  aiRunFindMany: vi.fn(),
  aiRunCreate: vi.fn(),
  aiRunUpdate: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/technical-documentation/index", () => ({
  ensureGoogleDriveKnowledgeFresh: mocks.ensureFresh,
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
      findMany: mocks.aiRunFindMany,
      create: mocks.aiRunCreate,
      update: mocks.aiRunUpdate
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
    mocks.ensureFresh.mockResolvedValue({ configured: false, checked: false, refreshed: false, warning: null });
    mocks.search.mockResolvedValue([]);
    mocks.fingerprint.mockResolvedValue("fingerprint");
    mocks.aiRunFindMany.mockResolvedValue([]);
    mocks.aiRunCreate.mockResolvedValue({ id: "run-1" });
    mocks.aiRunUpdate.mockResolvedValue({ id: "run-1" });
  });

  it("checks access before reading the question body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const guardedRequest = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(guardedRequest, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect((guardedRequest as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.ensureFresh).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("refreshes a configured Google Drive knowledge base before searching", async () => {
    mocks.ensureFresh.mockResolvedValue({ configured: true, checked: true, refreshed: true, warning: null });
    const { POST } = await import("./route");
    const response = await POST(request({ question: "Какая марка утеплителя?" }), { params: { projectId: "project-1" } });

    expect(mocks.ensureFresh).toHaveBeenCalledWith("project-1");
    await expect(response.json()).resolves.toMatchObject({
      result: { knowledge: { configured: true, checked: true, refreshed: true, warning: null } }
    });
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

  it("rebuilds relevant citation excerpts for cached answers", async () => {
    const previousKey = process.env.OPENAI_API_KEY;
    const previousMode = process.env.OPENAI_CONNECTOR_MODE;
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    process.env.OPENAI_CONNECTOR_MODE = "read_only";
    const sourceText = `${"Начало таблицы без нужной строки. ".repeat(30)} Строка 121: НДС не облагается. Строка 122: ВСЕГО без НДС 15 274 035,05 ₽.`;
    mocks.search.mockResolvedValue([{
      id: "chunk-1",
      documentId: "knowledge-1",
      sourceKind: "pgs",
      title: "КП",
      locator: "Лист КП, строки 101–125",
      text: sourceText,
      sourceUrl: "/api/projects/project-1/documents/document-1/download",
      score: 8
    }]);
    mocks.answer.mockResolvedValue({
      answer: "НДС не облагается.",
      confidence: "high",
      notFound: false,
      citationIds: ["S1"],
      followUps: [],
      provider: "openai"
    });
    try {
      const { POST } = await import("./route");
      await POST(request({ question: "Какая ставка НДС?" }), { params: { projectId: "project-1" } });
      const cacheKey = mocks.aiRunCreate.mock.calls[0][0].data.inputJson.cacheKey;
      mocks.aiRunFindMany.mockResolvedValue([{
        inputJson: { cacheKey },
        outputJson: {
          answer: "НДС не облагается.", confidence: "high", notFound: false, followUps: [], provider: "openai",
          citations: [{ sourceId: "S1", title: "КП", locator: "Лист КП", excerpt: "Старое начало", sourceUrl: null, sourceKind: "pgs" }]
        }
      }]);

      const response = await POST(request({ question: "Какая ставка НДС?" }), { params: { projectId: "project-1" } });
      const payload = await response.json();
      expect(payload.result.cached).toBe(true);
      expect(payload.result.citations[0].excerpt).toContain("НДС не облагается");
      expect(payload.result.citations[0].excerpt).not.toContain("Старое начало");
      expect(mocks.answer).toHaveBeenCalledTimes(1);
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
      if (previousMode === undefined) delete process.env.OPENAI_CONNECTOR_MODE;
      else process.env.OPENAI_CONNECTOR_MODE = previousMode;
    }
  });
});
