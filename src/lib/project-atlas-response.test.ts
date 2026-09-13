import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/assets/project-models/troitsk-b24-atlas-3-2.manifest.json";
import drawings from "@/assets/project-models/troitsk-b24-atlas-3-2.drawings.json";
import { projectAtlasAssetResponse } from "@/lib/project-atlas-response";
import { adaptProjectAtlasDrawings } from "@/lib/project-atlas-drawing-adapter";
import { adaptProjectAtlasPerformance } from "@/lib/project-atlas-performance-adapter";
import { adaptProjectAtlasNavigation } from "@/lib/project-atlas-navigation-adapter";

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
    for (const [, name] of html.matchAll(/(?:src|href)="([^"]+)"/g)) expect(manifest.files).toHaveProperty(name.split("?")[0]);
  }, 30_000);

  it.each(["gzip", "br, gzip", "GZIP;q=0.5", "*"])("compresses the entry as one gzip member: %s", async (encoding) => {
    const response = await get("index.html", { "accept-encoding": encoding });
    const html = gunzipSync(Buffer.from(await response.arrayBuffer())).toString();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(html).toContain('id="pgs-atlas-integration"');
    expect(html).toContain('id="canvas"');
    expect(html).toMatch(/src="assets\/album\.js\?pgs=[a-f0-9]+"/);
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it.each(["identity", "br", "gzip;q=0", "gzip;q=0, *;q=1"])("honors identity encoding: %s", async (encoding) => {
    const response = await get("assets/album.js", { "accept-encoding": encoding });
    expect(response.headers.has("content-encoding")).toBe(false);
    const stored = await readFile(`src/assets/project-models/troitsk-b24-atlas-3-2/${manifest.files["assets/album.js"].storage}`);
    expect(await response.text()).toBe(adaptProjectAtlasNavigation(adaptProjectAtlasPerformance(adaptProjectAtlasDrawings(gunzipSync(stored).toString()))));
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
    expect((await get("index.html", { "if-none-match": `W/"${manifest.files["index.html"].sha256}-pgs-v1"` })).status).toBe(200);
    const entry = await get("index.html");
    expect((await get("index.html", { "if-none-match": entry.headers.get("etag")! })).status).toBe(304);
    const script = await get("assets/album.js");
    expect(script.headers.get("cache-control")).toBe("public, no-cache");
    expect(script.headers.get("etag")).not.toBe(`W/"${manifest.files["assets/album.js"].sha256}"`);
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
  it("serves the exact PDF page in a sandboxed image viewer without a native PDF plugin", async () => {
    const url = base + "drawing.html?source=R05S_N_024&view=page";
    const response = await projectAtlasAssetResponse(new Request(url), ["drawing.html"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("connect-src 'none'");
    expect(response.headers.get("content-security-policy")).not.toContain("allow-same-origin");
    const html = await response.text();
    expect(html).toContain("PDF, страница 24");
    expect(html).toContain("Лист 23");
    expect(html).toContain(drawings.sources.R05S_N_024.pageFile);
    expect(html).not.toContain("<iframe");
    expect(html).toContain('href="documents/AS2_last_full.pdf" download');
    expect((await projectAtlasAssetResponse(new Request(url, { headers: { "if-none-match": response.headers.get("etag")! } }), ["drawing.html"])).status).toBe(304);
    for (const query of ["", "?source=__proto__", "?source=../../.env", "?source=R04_node_OP&view=page"]) {
      expect((await projectAtlasAssetResponse(new Request(base + "drawing.html" + query), ["drawing.html"])).status).toBe(404);
    }
    const imageOnly = await projectAtlasAssetResponse(new Request(base + "drawing.html?source=R04_node_OP"), ["drawing.html"]);
    expect(imageOnly.status).toBe(200);
    expect(await imageOnly.text()).toContain('src="sources/R04_node_OP.jpg"');
  });
  it("keeps derived pages traceable to each exact registered PDF and validates their bytes", async () => {
    expect(Object.keys(drawings.sources)).toHaveLength(237);
    expect(Object.values(drawings.sources).filter(s => s.pageFile)).toHaveLength(149);
    expect(Object.keys(drawings.files)).toHaveLength(116);
    for (const [name, file] of Object.entries(drawings.files)) {
      expect(file.pdfSha256).toBe(manifest.files[file.pdf as keyof typeof manifest.files].sha256);
      const response = await get(name);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
      expect(bytes.length).toBe(file.bytes);
      expect(file.pdfPage).toBeGreaterThan(0);
      expect(Math.max(file.width, file.height)).toBeGreaterThanOrEqual(3200);
    }
    const files: Record<string, { pdf: string; pdfPage: number }> = drawings.files;
    for (const source of Object.values(drawings.sources)) if (source.pageFile) {
      expect(files[source.pageFile].pdf).toBe(source.pdf);
      expect(files[source.pageFile].pdfPage).toBe(source.pdfPage);
    }
  });
});
