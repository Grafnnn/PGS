import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { projectAtlasR25Response } from "./project-atlas-r25-response";
import { getPublicProject3dModel, getProject3dModel } from "./project-3d-model";
import { GET, HEAD } from "@/app/model-assets/goluboe-vodovod-r1-2/[...asset]/route";

const base = "https://pgs.local/model-assets/goluboe-vodovod-r1-2/";
const get = (name: string, init?: RequestInit) => projectAtlasR25Response(new Request(base + name, init), name.split("/"), "goluboe-vodovod-r1-2");
function decode(text: string, key: string) {
  const window: Record<string, string> = {};
  runInNewContext(text, { window }, { timeout: 10000 });
  return JSON.parse(gunzipSync(Buffer.from(window[key], "base64")).toString());
}

describe("independent Goluboe R1.2 publication", () => {
  it("adds a public allowlist entry without changing private assignments or neighbors", () => {
    expect(getPublicProject3dModel("goluboe-vodovod")).toMatchObject({ revision: "R1.2", assetBaseUrl: "/model-assets/goluboe-vodovod-r1-2/" });
    expect(getPublicProject3dModel("dou200")?.revision).toBe("R1.27");
    expect(getPublicProject3dModel("troitsk-building-24")?.revision).toBe("V12.18");
    expect(getPublicProject3dModel("zagoryanka-1500")?.revision).toBe("R1.0");
    expect(getProject3dModel({ id: "goluboe-vodovod" })).toBeNull();
    expect(getPublicProject3dModel("goluboe")).toBeNull();
  });
  it("scopes anonymous HTML, CSP, caching and the worker to this release", async () => {
    expect(HEAD).toBe(GET);
    const response = await HEAD(new Request(base + "index.html", { method: "HEAD" }), { params: { asset: ["index.html"] } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, no-cache");
    expect(response.headers.get("content-security-policy")).toContain(base);
    expect(response.headers.get("content-security-policy")).not.toMatch(/troitsk|dou200|zagoryanka/);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect((await get("service-worker.js", { method: "HEAD" })).headers.get("service-worker-allowed")).toBe("/model-assets/goluboe-vodovod-r1-2/");
  });
  it("retains every supplied byte and all six PDFs", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release).toMatchObject({ release: "GOLUBOE_VODOVOD_R1_2", projectId: "goluboe-vodovod", revision: "R1.2", suppliedFiles: 320,
      sourceArchiveSha256: "f1e8faf270f2f7905a3187dc36b2792df16e1401f731e349b5a25be96f0ee669",
      sourceTreeSha256: "d5d03875c06fa561fb8fa5d374d9040d687f20b2d2a4f52f1a29c01e4bae6da6",
      suppliedManifestSha256: "b5eee4ba87cf8023a04bda16851594932c67876d550001d3d7331568e27316d7",
      geometryChangedFromSuppliedRelease: false, newEngineeringApproval: false, znpOriginalIncluded: false });
    const index = JSON.parse(await readFile("src/assets/project-models/goluboe-vodovod-r1-2/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(322);
    expect(index.archiveSha256).toBe("36c740734c9c00e25d5443ca56335b0fa5cda50ab5d112cb5f59eac56d506388");
    const manifest = await (await get("MANIFEST.json")).json();
    expect(manifest.files).toHaveLength(321);
    for (const file of manifest.files) {
      const bytes = Buffer.from(await (await get(file.path)).arrayBuffer());
      expect(bytes.length, file.path).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(file.sha256);
    }
    expect(manifest.files.filter((f: { path: string }) => f.path.endsWith(".pdf"))).toHaveLength(6);
    expect(index.files["data/metadata-light.js"].sha256).toBe("ab20cc63d75fa1c523e9130353112e9410259065c107f60b110dd281f8102424");
  });
  it("preserves the scene, local geometry, issues and excavation menu", async () => {
    const window: Record<string, any> = {};
    for (const file of ["project/config.js", "project/texts.js", "data/release-info.js", "data/rd_remarks_final.js"])
      runInNewContext(await (await get(file)).text(), { window }, { timeout: 1000 });
    expect(window.ATLAS_PROJECT.storage.prefix).toBe("atlas:goluboe-vodovod:");
    expect(window.ATLAS_RELEASE).toMatchObject({ release: "ATLAS_goluboe-vodovod_R1_2", registry_records: 263,
      elements: 153, local_bodies: 40, bodies_total: 193, library_records: 277, remarks: 23, source_candidate: true, source_accepted: null });
    expect(window.ATLAS_PROJECT.documents).toHaveLength(6);
    expect(window.ATLAS_REMARKS.items).toHaveLength(23);
    expect(window.ATLAS_REMARKS.items.find((r: { id: string }) => r.id === "Г-01").status).toBe("Открыто");
    expect(window.ATLAS_TEXTS.pages.menu.map((entry: { href: string }) => entry.href)).toContain("catalogue-model.html#id/NET-GOL-PD-POS-SHORING-ASSEMBLY");
    const metadata = decode(await (await get("data/metadata-light.js")).text(), "ATLAS_METADATA_GZIP");
    expect(metadata.objects).toHaveLength(193);
    expect(metadata.objects.filter((o: { worldAllowed: boolean }) => o.worldAllowed)).toHaveLength(153);
    const library = decode(await (await get("data/library.js")).text(), "ATLAS_LIBRARY_GZIP");
    expect(library.records).toHaveLength(277);
    expect(Object.keys(library.sources)).toHaveLength(66);
  });
  it("resolves PD sources to project-local PDF pages without inventing a ZnP file", async () => {
    const window: Record<string, any> = { addEventListener() {} };
    const document = { currentScript: { src: base + "assets/package-links.js" }, baseURI: base + "index.html", readyState: "loading",
      addEventListener() {}, getElementById: () => null, querySelector: () => null, createElement: () => ({}), head: { append() {} } };
    const context = { window, document, URL, addEventListener() {}, location: { href: document.baseURI }, MutationObserver: class { observe() {} disconnect() {} } };
    for (const file of ["project/config.js", "assets/package-links.js", "assets/atlas-status.js"])
      runInNewContext(await (await get(file)).text(), context, { timeout: 1000 });
    const library = decode(await (await get("data/library.js")).text(), "ATLAS_LIBRARY_GZIP");
    const pdfs = new Set<string>();
    for (const source of Object.values(library.sources)) {
      const result = window.AtlasStatus.resolveSource(source);
      if (result.kind !== "pdf") continue;
      const url = new URL(result.href);
      expect(url.href.startsWith(base)).toBe(true);
      expect(url.hash).toMatch(/^#page=\d+$/);
      const name = decodeURIComponent(url.pathname.slice(new URL(base).pathname.length));
      pdfs.add(name);
      expect((await get(name, { method: "HEAD" })).status).toBe(200);
    }
    expect(pdfs.size).toBe(5);
    for (const doc of window.ATLAS_PROJECT.documents) {
      const bytes = Buffer.from(await (await get(doc.file)).arrayBuffer());
      expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(doc.sha256);
    }
  });
  it("retains ranges and conditional requests, rejecting unpublished paths", async () => {
    const name = "albums/Заключение_ПД_и_ЗнП_Голубое.pdf";
    expect((await get(name, { headers: { range: "bytes=0-7" } })).status).toBe(206);
    expect((await get(name, { headers: { range: "bytes=999999999999-" } })).status).toBe(416);
    for (const name of ["../zagoryanka-1500-r1-0/index.html", "../dou200-r1-27/index.html", ".env", "qa/index.html", "comm/private.json"])
      expect((await get(name)).status, name).toBe(404);
    const head = await get("CURRENT_RELEASE.json", { method: "HEAD" });
    expect((await get("CURRENT_RELEASE.json", { headers: { "if-none-match": head.headers.get("etag")! } })).status).toBe(304);
  });
  it("exposes three isolated excavation views with source and adopted alternatives", async () => {
    const window: Record<string, any> = { ATLAS_PROJECT: { reference_bodies: [] } };
    runInNewContext(await (await get("project/plan-controls.js")).text(), {
      window, URLSearchParams, location: { search: "" }, document: { addEventListener() {} }
    }, { timeout: 1000 });
    const views = window.ATLAS_PD_VIEWS.excavations;
    expect(Object.keys(views).sort()).toEqual(["kv1", "up1", "vzu"]);
    for (const [key, view] of Object.entries(views) as [string, any][]) {
      expect(view.supports.length, key).toBeGreaterThan(0);
      for (const id of [...view.supports, ...view.backfill, ...Object.keys(view.alternate), ...Object.values(view.alternate)])
        expect(view.ids, key).toContain(id);
    }
    for (const key of ["kv1", "vzu"]) {
      expect(views[key].pipe).toBe(true);
      expect(Object.keys(views[key].alternate)).toHaveLength(4);
      expect(views[key].backfill).toHaveLength(1);
    }
    expect(views.up1.pipe).toBe(false);
    expect(views.up1.backfill).toHaveLength(0);
  });
});
