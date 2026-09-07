import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  projectFind: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.projectFind } } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));

const context = { params: { projectId: "cmteg9g33000for4oc06rko5a" } };

describe("project 3D model viewer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ user: { id: "user-1" }, project: { id: context.params.projectId } });
    mocks.projectFind.mockResolvedValue({ id: context.params.projectId, name: "Троицк", code: "TR-24", object: "Здание 24", address: "Москва, Троицк" });
    mocks.readFile.mockResolvedValue("<html><head></head><body><canvas></canvas></body></html>");
  });

  it("checks project access before loading model metadata or files", async () => {
    mocks.access.mockResolvedValue({ response: new Response("Forbidden", { status: 403 }) });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), context);

    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("serves the self-contained viewer with private framing and responsive controls", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), context);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(html).toContain("pgs-model-embed-style");
    expect(html).toContain("pgsControlsToggle");
    expect(mocks.readFile).toHaveBeenCalledWith(expect.stringContaining("troitsk-b24-r04.html"), "utf8");
  });

  it("does not expose the Troitsk model for an unrelated project", async () => {
    mocks.projectFind.mockResolvedValue({ id: "project-2", name: "Другой объект", code: "OTHER", object: "Склад", address: "Москва" });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-2" } });

    expect(response.status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
