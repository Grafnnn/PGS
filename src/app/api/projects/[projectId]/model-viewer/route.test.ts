import { beforeEach, describe, expect, it, vi } from "vitest";
import { gzipSync, gunzipSync } from "node:zlib";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  projectFind: vi.fn(),
  readFile: vi.fn()
}));

vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.projectFind } } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));

const context = { params: { projectId: "cmteg9g33000for4oc06rko5a" } };
const source = '<html><head><title>R06</title></head><body><script>window.R06_PORTABLE=true;</script><canvas></canvas></body></html>';

describe("project 3D model viewer route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ user: { id: "user-1" }, project: { id: context.params.projectId } });
    mocks.projectFind.mockResolvedValue({ id: context.params.projectId, name: "Троицк", code: "TR-24", object: "Здание 24", address: "Москва, Троицк" });
    mocks.readFile.mockResolvedValue(gzipSync(source));
  });

  it("checks project access before loading model metadata or files", async () => {
    mocks.access.mockResolvedValue({ response: new Response("Forbidden", { status: 403 }) });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), context);

    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("serves the original self-contained R06 viewer without legacy R04 overrides", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), context);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(response.headers.get("vary")).toBe("Accept-Encoding");
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(html).toBe(source);
    expect(html).not.toContain("pgs-model-embed-style");
    expect(mocks.readFile).toHaveBeenCalledWith(expect.stringContaining("troitsk-b24-r06.html.gz"));
  });

  it.each(["gzip", "br, gzip, deflate", "GZIP; q=0.5", "*"])("serves precompressed bytes for %s", async (encoding) => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local", { headers: { "accept-encoding": encoding } }), context);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync(Buffer.from(await response.arrayBuffer())).toString()).toBe(source);
  });

  it.each(["identity", "br", "gzip;q=0", "gzip;q=0, *;q=1", "gzip;q=invalid"])("respects lack of gzip support for %s", async (encoding) => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local", { headers: { "accept-encoding": encoding } }), context);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(await response.text()).toBe(source);
  });

  it("revalidates the R06 cache only after checking project access", async () => {
    const { GET } = await import("./route");
    const request = new Request("https://pgs.local", { headers: { "if-none-match": 'W/"troitsk-building-24-r06"' } });
    const response = await GET(request, context);
    expect(response.status).toBe(304);
    expect(mocks.access).toHaveBeenCalledWith(context.params.projectId, "view");
    expect(mocks.readFile).not.toHaveBeenCalled();

    mocks.access.mockResolvedValue({ response: new Response("Forbidden", { status: 403 }) });
    expect((await GET(request, context)).status).toBe(403);
  });

  it("does not return not-modified for a cached R04 model", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local", { headers: { "if-none-match": '"troitsk-building-24-r04"' } }), context);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(source);
  });

  it("returns a safe unavailable response if the packaged model is missing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.readFile.mockRejectedValue(new Error("missing asset"));
      const { GET } = await import("./route");
      const response = await GET(new Request("https://pgs.local"), context);
      expect(response.status).toBe(503);
      expect(await response.text()).toBe("3D model is temporarily unavailable");
    } finally {
      log.mockRestore();
    }
  });

  it("does not expose the Troitsk model for an unrelated project", async () => {
    mocks.projectFind.mockResolvedValue({ id: "project-2", name: "Другой объект", code: "OTHER", object: "Склад", address: "Москва" });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-2" } });

    expect(response.status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
