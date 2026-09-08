import { beforeEach, describe, expect, it, vi } from "vitest";
import { gzipSync, gunzipSync, inflateRawSync } from "node:zlib";
import { runInNewContext } from "node:vm";

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

  it.each(["identity", "gzip"])("appends the opt-in integration after the unchanged model for %s", async (encoding) => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/?embed=monolith-v1", { headers: { "accept-encoding": encoding } }), context);
    const body = Buffer.from(await response.arrayBuffer());
    const html = encoding === "gzip" ? gunzipSync(body) : body;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe(encoding === "gzip" ? "gzip" : null);
    expect(response.headers.get("etag")).toBe('W/"troitsk-building-24-r06-monolith-v1"');
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(html.subarray(0, Buffer.byteLength(source))).toEqual(Buffer.from(source));
    expect(html.toString().slice(source.length)).toMatch(/^\s*<style id="pgs-model-embed-style">[\s\S]*<\/style>\s*<script id="pgs-model-embed-script">[\s\S]*<\/script>\s*$/);
    // Decode just the first gzip member to catch browsers dropping concatenated members.
    if (encoding === "gzip") expect(inflateRawSync(body.subarray(10))).toEqual(html);
  });

  it("keeps unsupported embed versions on the original byte-for-byte response", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/?embed=monolith-v2", { headers: { "accept-encoding": "gzip" } }), context);
    expect(response.headers.get("etag")).toBe('W/"troitsk-building-24-r06"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(gzipSync(source));
  });

  it("keeps raw and embedded model cache validators distinct", async () => {
    const { GET } = await import("./route");
    const rawTag = 'W/"troitsk-building-24-r06"';
    const embedTag = 'W/"troitsk-building-24-r06-monolith-v1"';
    const embedded = await GET(new Request("https://pgs.local/?embed=monolith-v1", { headers: { "if-none-match": rawTag } }), context);
    expect(embedded.status).toBe(200);
    expect(embedded.headers.get("etag")).toBe(embedTag);

    const raw = await GET(new Request("https://pgs.local/", { headers: { "if-none-match": embedTag } }), context);
    expect(raw.status).toBe(200);
    expect(raw.headers.get("etag")).toBe(rawTag);
    expect(await raw.text()).toBe(source);

    mocks.readFile.mockClear();
    const cached = await GET(new Request("https://pgs.local/?embed=monolith-v1", { headers: { "if-none-match": embedTag } }), context);
    expect(cached.status).toBe(304);
    expect(cached.headers.get("etag")).toBe(embedTag);
    expect(mocks.access).toHaveBeenCalledWith(context.params.projectId, "view");
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it.each([401, 403])("checks access before embedded metadata or cache responses (%s)", async (status) => {
    mocks.access.mockResolvedValue({ response: new Response("Denied", { status }) });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/?embed=monolith-v1", { headers: { "if-none-match": 'W/"troitsk-building-24-r06-monolith-v1"' } }), context);
    expect(response.status).toBe(status);
    expect(mocks.projectFind).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("only forwards unhandled Escape from the embedded document to its parent", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/?embed=monolith-v1"), context);
    const html = await response.text();
    const script = html.match(/<script id="pgs-model-embed-script">([\s\S]*?)<\/script>/)![1];
    const addEventListener = vi.fn();
    const postMessage = vi.fn();
    const frame = { addEventListener };
    runInNewContext(script, { window: frame, parent: { postMessage } });
    expect(addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    const handleKey = addEventListener.mock.calls[0][1];
    handleKey({ key: "Enter", defaultPrevented: false });
    handleKey({ key: "Escape", defaultPrevented: true });
    expect(postMessage).not.toHaveBeenCalled();
    handleKey({ key: "Escape", defaultPrevented: false });
    expect(postMessage).toHaveBeenCalledWith({ type: "pgs:project-model-close" }, "*");

    addEventListener.mockClear();
    postMessage.mockClear();
    const standalone = { addEventListener, postMessage };
    runInNewContext(script, { window: standalone, parent: standalone });
    addEventListener.mock.calls[0][1]({ key: "Escape", defaultPrevented: false });
    expect(postMessage).not.toHaveBeenCalled();
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

  it.each(["", "?embed=monolith-v1"])("does not expose the Troitsk model for an unrelated project (%s)", async (query) => {
    mocks.projectFind.mockResolvedValue({ id: "project-2", name: "Другой объект", code: "OTHER", object: "Склад", address: "Москва" });
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://pgs.local/${query}`), { params: { projectId: "project-2" } });

    expect(response.status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
