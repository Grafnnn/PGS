import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { projectAtlasR25Response } from "./project-atlas-r25-response";
import { getPublicProject3dModel, getProject3dModel } from "./project-3d-model";
import { legacyAtlasDestination, legacyAtlasWorker } from "./project-atlas-legacy";
import { GET, HEAD } from "@/app/model-assets/dou200-r1-27/[...asset]/route";

const base = "https://pgs.local/model-assets/dou200-r1-27/";
const get = (name: string, init?: RequestInit) => projectAtlasR25Response(new Request(base + name, init), name.split("/"), "dou200-r1-27");
function decode(text: string, key: string) {
  const window: Record<string, string> = {};
  runInNewContext(text, { window }, { timeout: 10000 });
  return JSON.parse(gunzipSync(Buffer.from(window[key], "base64")).toString());
}

describe("independent DOU200 public website", () => {
  it("keeps project aliases, roots and revisions separate", () => {
    expect(getPublicProject3dModel("dou200")).toMatchObject({ revision: "R1.27", assetBaseUrl: "/model-assets/dou200-r1-27/" });
    expect(getPublicProject3dModel("troitsk-building-24")).toMatchObject({ revision: "V12.15", assetBaseUrl: "/model-assets/troitsk-r25v12-15/" });
    expect(getProject3dModel({ id: "cmteg9g33000for4oc06rko5a" })?.revision).toBe("V12.15");
    expect(getProject3dModel({ name: "ДОУ 200" })).toBeNull(); // No inferred private project assignment.
    expect(legacyAtlasDestination(new URL(base + "index.html"))).toBeNull();
    expect(legacyAtlasWorker(new URL(base + "service-worker.js"))).toBeNull();
  });
  it("serves the independent route anonymously with its own CSP", async () => {
    expect(HEAD).toBe(GET);
    const response = await HEAD(new Request(base + "index.html", { method: "HEAD" }), { params: { asset: ["index.html"] } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain(base);
    expect(response.headers.get("content-security-policy")).not.toContain("troitsk");
    expect(response.headers.get("cache-control")).toBe("public, no-cache");
    expect(response.headers.has("set-cookie")).toBe(false);
  });
  it("retains the author website unchanged and records candidate limitations", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release).toMatchObject({ projectId: "dou-200", revision: "R1.27", suppliedFiles: 6301, geometryChangedFromSuppliedRelease: false, elementAssignmentsChanged: false, newEngineeringApproval: false, sourceCandidate: true, sourceAccepted: false });
    expect(release.sourceTreeSha256).toBe("4ef2e96586d806e0fec9a5536ec03186cadc52031c2204717c3679eb17347b6f");
    const index = JSON.parse(await readFile("src/assets/project-models/dou200-r1-27/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(6303);
    expect(index.archiveSha256).toBe("e4673730988aea3fdc6e69b3546c794ea78a2971ad3a4a83a94ee28ba3471e9a");
    const configWindow: Record<string, any> = {};
    runInNewContext(await (await get("project/config.js")).text(), { window: configWindow }, { timeout: 1000 });
    expect(configWindow.ATLAS_PROJECT.project_id).toBe("dou-200");
    expect(configWindow.ATLAS_PROJECT.title.object).toBe("ДОУ 200 мест");
    const metadata = decode(await (await get("data/metadata-light.js")).text(), "ATLAS_METADATA_GZIP");
    const library = decode(await (await get("data/library.js")).text(), "ATLAS_LIBRARY_GZIP");
    expect(metadata.objects).toHaveLength(16981);
    expect(library.records).toHaveLength(31777);
    expect(Object.keys(library.sources)).toHaveLength(758);
    for (const record of library.records) for (const source of record.sources || []) expect(library.sources[source.key], record.key).toBeDefined();
  });
  it("preserves PDF ranges and prevents assets crossing between projects", async () => {
    const pdf = await get("albums/2025N252-R-AR-1.13.pdf", { headers: { range: "bytes=0-7" } });
    expect(pdf.status).toBe(206);
    expect(await pdf.text()).toMatch(/^%PDF-/);
    const invalid = await get("albums/2025N252-R-AR-1.13.pdf", { headers: { range: "bytes=999999999999-" } });
    expect(invalid.status).toBe(416);
    for (const name of ["../troitsk-r25v12-15/index.html", "drawings/AS2_changes.pdf", ".env", "ids/index.json", "qa/index.html"]) expect((await get(name)).status, name).toBe(404);
    const troitskConfig = await projectAtlasR25Response(new Request("https://pgs.local/model-assets/troitsk-r25v12-15/project/config.js"), ["project", "config.js"], "v12-15");
    expect(troitskConfig.status).toBe(200);
    expect(await troitskConfig.text()).toContain("project_id: 'troitsk-b24'");
  });
  it("scopes the service worker and cache to DOU200", async () => {
    const worker = await get("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe("/model-assets/dou200-r1-27/");
    const text = await worker.text();
    expect(text).toContain("url.pathname.startsWith(ROOT.pathname)");
    expect(text).toContain("n.startsWith(PREFIX)");
    const self: Record<string, unknown> = {};
    runInNewContext(await (await get("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(String(self.ATLAS_OFFLINE_VERSION)).toMatch(/^site-/);
    const listeners: Record<string, (event: { waitUntil(p: Promise<unknown>): void }) => void> = {};
    const prefix = String(self.ATLAS_OFFLINE_PREFIX || "atlas-default-");
    const ownCache = prefix + encodeURIComponent(new URL(base).pathname) + "-old";
    const otherCache = "atlas-default-" + encodeURIComponent("/model-assets/troitsk-r25v12-15/") + "-old";
    const removeCache = vi.fn();
    runInNewContext(text, {
      URL, importScripts() {}, caches: { keys: async () => [ownCache, otherCache], delete: removeCache },
      self: { ...self, registration: { scope: base }, clients: { claim() {} }, addEventListener: (name: string, handler: typeof listeners[string]) => { listeners[name] = handler; } }
    }, { timeout: 1000 });
    let pending = Promise.resolve<unknown>(null);
    listeners.activate({ waitUntil(p) { pending = p; } });
    await pending;
    expect(removeCache).toHaveBeenCalledOnce();
    expect(removeCache).toHaveBeenCalledWith(ownCache);
    const etag = worker.headers.get("etag")!;
    expect((await get("service-worker.js", { headers: { "if-none-match": etag } })).status).toBe(304);
  });
  it("opens the correct split PDF pages and does not claim a DWG link is exact", async () => {
    const window: Record<string, any> = { addEventListener() {} };
    const document = {
      currentScript: { src: base + "assets/package-links.js" }, baseURI: base + "index.html",
      readyState: "loading", addEventListener() {}, getElementById: () => null, querySelector: () => null,
      createElement: () => ({}), head: { append() {} }
    };
    const context = { window, document, URL, location: { href: document.baseURI }, MutationObserver: class { observe() {} disconnect() {} } };
    for (const name of ["project/config.js", "assets/package-links.js", "assets/atlas-status.js"])
      runInNewContext(await (await get(name)).text(), context, { timeout: 1000 });
    const library = decode(await (await get("data/library.js")).text(), "ATLAS_LIBRARY_GZIP");
    for (const [section, page, filename, localPage] of [
      ["ГП", 19, "2025_N252-R-GP_chast2.pdf", 10],
      ["ЭМ", 73, "2025_N252-R-EM_chast2.pdf", 7],
      ["НК", 10, "2025-N252-R-NK_chast2.pdf", 1]
    ] as const) {
      const source = Object.values(library.sources).find((s: any) => s.section === section && s.pdf_page === page);
      expect(source, section).toBeDefined();
      expect(window.AtlasStatus.sourceDoc(source)).toMatchObject({ kind: "pdf", exact: true, href: base + "albums/" + filename + "#page=" + localPage });
    }
    expect(window.AtlasStatus.sourceDoc(library.sources["SRC:АР1.1|08.25|p8|s2#32ed9db25f"])).toMatchObject({ kind: "album", exact: false, page: null });
    const counts: Record<string, number> = {};
    for (const source of Object.values(library.sources)) {
      const result = window.AtlasStatus.resolveSource(source);
      counts[result.kind] = (counts[result.kind] || 0) + 1;
      if (result.href) expect(result.href).toContain(base);
      if (result.kind === "album") expect(result.exact).toBe(false);
    }
    expect(counts).toEqual({ pdf: 488, album: 65, none: 205 });
  });
});
