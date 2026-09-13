import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/assets/project-models/troitsk-b24-atlas-3-2.manifest.json";
import { projectAtlasAssetResponse } from "@/lib/project-atlas-response";

const base = "https://pgs.local/model-assets/troitsk-b24-atlas-3-2/";
const get = (name: string, headers?: Record<string, string>) => projectAtlasAssetResponse(new Request(base + name, { headers }), name.split("/"));

describe("Atlas runtime delivery", () => {
  it("preserves every packaged source byte, all geometry blocks and required scripts", async () => {
    expect(manifest.sourceFilesVerified).toBe(1617);
    expect(manifest.sourceArchiveSha256).toBeNull();
    expect(manifest.geometryChanges).toBe(0);
    expect(manifest.activePhysicalObjects).toBe(10412);
    expect(Object.keys(manifest.files).filter((name) => name.startsWith("blocks/")).length).toBe(562);
    for (const asset of Object.values(manifest.files)) {
      const stored = await readFile(`src/assets/project-models/troitsk-b24-atlas-3-2/${asset.storage}`);
      const bytes = asset.compressed ? gunzipSync(stored) : stored;
      expect(stored.length).toBe(asset.storedBytes);
      expect(bytes.length).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    }
    const response = await get("index.html");
    const html = await response.text();
    for (const [, name] of html.matchAll(/(?:src|href)="([^"]+)"/g)) expect(manifest.files).toHaveProperty(name);
  }, 30_000);

  it.each(["gzip", "br, gzip", "GZIP;q=0.5", "*"])("compresses the entry as one gzip member: %s", async (encoding) => {
    const response = await get("index.html", { "accept-encoding": encoding });
    const html = gunzipSync(Buffer.from(await response.arrayBuffer())).toString();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(html).toContain('id="pgs-atlas-integration"');
    expect(html).toContain('id="canvas"');
    expect(html).toContain('src="assets/album.js"');
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each(["identity", "br", "gzip;q=0", "gzip;q=0, *;q=1"])("honors identity encoding: %s", async (encoding) => {
    const response = await get("assets/album.js", { "accept-encoding": encoding });
    expect(response.headers.has("content-encoding")).toBe(false);
    expect(createHash("sha256").update(await response.text()).digest("hex")).toBe(manifest.files["assets/album.js"].sha256);
  });
  it("permits only atlas resources and a local worker, never app API requests or parent access", async () => {
    const response = await get("index.html");
    const csp = response.headers.get("content-security-policy")!;
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("worker-src blob:");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain(base);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).not.toContain("unsafe-eval");
    const script = (await response.text()).match(/<script id="pgs-atlas-integration">([\s\S]*?)<\/script>/)![1];
    const addEventListener = vi.fn(), replaceState = vi.fn(), postMessage = vi.fn(), querySelector = vi.fn();
    const document = { title: "", querySelector, getElementById: () => null };
    runInNewContext(script, { location: { hash: "#module=master", pathname: "/index.html", search: "" }, history: { replaceState }, document, window: { addEventListener }, parent: { postMessage } });
    expect(replaceState).toHaveBeenCalledWith(null, "", "/index.html#node/building");
    expect(document.title).toContain("3.2");
    const onKey = addEventListener.mock.calls[0][1];
    querySelector.mockReturnValue({ open: true });
    onKey({ key: "Escape" });
    expect(postMessage).not.toHaveBeenCalled();
    querySelector.mockReturnValue(null);
    onKey({ key: "Escape" });
    expect(postMessage).toHaveBeenCalledWith({ type: "pgs:project-model-close" }, "*");
  });
  it.each(["../.env", "data/../../.env", "%2e%2e/.env", "documents/no-such.pdf", "constructor", "__proto__", "qa/demo_a/FINAL_QA.json", "release.json"])("rejects non-published paths: %s", async (name) => {
    expect((await get(name)).status).toBe(404);
  });
  it("revalidates unchanged assets and does not reuse the old model tag", async () => {
    const first = await get("assets/core.js");
    expect((await get("assets/core.js", { "if-none-match": first.headers.get("etag")! })).status).toBe(304);
    expect((await get("index.html", { "if-none-match": 'W/"troitsk-building-24-r10"' })).status).toBe(200);
  });
  it("supports PDF byte ranges and rejects unsatisfiable ranges", async () => {
    const name = Object.keys(manifest.files).find((name) => name.endsWith(".pdf"))!;
    const response = await get(name, { range: "bytes=0-99" });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(response.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
    expect((await response.arrayBuffer()).byteLength).toBe(100);
    expect((await get(name, { range: "bytes=999999999-" })).status).toBe(416);
    expect((await get(name, { range: "bytes=-0" })).status).toBe(416);
    expect((await get(name, { range: "bytes=-100" })).status).toBe(206);
  });
  it("replaces unsupported sandbox PDF previews with an explicit download", async () => {
    const html = await (await get("index.html")).text();
    expect(html).toContain("body.nav-collapsed #album{grid-template-columns:minmax(0,1fr)}");
    const script = html.match(/<script id="pgs-atlas-integration">([\s\S]*?)<\/script>/)![1];
    const link = { hasAttribute: () => false, setAttribute: vi.fn(), removeAttribute: vi.fn(), textContent: "" };
    const iframe = { remove: vi.fn() };
    const resource = { querySelector: (selector: string) => selector === "iframe" ? iframe : link };
    let onMutation = () => {};
    class Observer { constructor(callback: () => void) { onMutation = callback; } observe() {} }
    runInNewContext(script, { location: { hash: "#node/building" }, document: { title: "", getElementById: () => resource }, window: { addEventListener: vi.fn() }, MutationObserver: Observer });
    onMutation();
    expect(link.setAttribute).toHaveBeenCalledWith("download", "");
    expect(link.textContent).toBe("Скачать полный PDF");
    expect(iframe.remove).toHaveBeenCalled();
  });
});
