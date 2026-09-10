import { beforeEach, describe, expect, it, vi } from "vitest";
import { gzipSync, gunzipSync } from "node:zlib";

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), access: vi.fn(), find: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.find } } }));
import { GET } from "./route";

const context = { params: { slug: "troitsk-building-24" } };
const html = "<html><title>R10 local</title><canvas></canvas></html>";

describe("public model publication", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.readFile.mockResolvedValue(gzipSync(html)); });

  it("opens only the published model without a session or project database lookup", async () => {
    const result = await GET(new Request("https://pgs.local/models/troitsk-building-24", { headers: { "accept-encoding": "gzip" } }), context);
    expect(result.status).toBe(200);
    expect(gunzipSync(Buffer.from(await result.arrayBuffer())).toString()).toBe(html);
    expect(result.headers.get("cache-control")).toContain("public");
    expect(result.headers.has("set-cookie")).toBe(false);
    const csp = result.headers.get("content-security-policy");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("sandbox allow-scripts allow-downloads");
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it.each(["other-project", "cmteg9g33000for4oc06rko5a", "..", "%2e%2e", "troitsk-building-24-r06", "troitsk-building-24/../../.env"])("does not publish arbitrary identifiers: %s", async (slug) => {
    const response = await GET(new Request("https://pgs.local/models/invalid"), { params: { slug } });
    expect(response.status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("invalidates old revision caches while allowing conditional requests for R10", async () => {
    const old = await GET(new Request("https://pgs.local", { headers: { "if-none-match": 'W/"troitsk-building-24-r06"' } }), context);
    expect(old.status).toBe(200);
    mocks.readFile.mockClear();
    const fresh = await GET(new Request("https://pgs.local", { headers: { "if-none-match": old.headers.get("etag")! } }), context);
    expect(fresh.status).toBe(304);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
