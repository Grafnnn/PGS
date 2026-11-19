import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { projectAtlasR25Response } from "./project-atlas-r25-response";
import { getPublicProject3dModel, getProject3dModel } from "./project-3d-model";
import { GET, HEAD } from "@/app/model-assets/goluboe-vodovod-r1-1/[...asset]/route";

const base = "https://pgs.local/model-assets/goluboe-vodovod-r1-1/";
const get = (name: string, init?: RequestInit) => projectAtlasR25Response(new Request(base + name, init), name.split("/"), "goluboe-vodovod-r1-1");
function decode(text: string, key: string) {
  const window: Record<string, string> = {};
  runInNewContext(text, { window }, { timeout: 10000 });
  return JSON.parse(gunzipSync(Buffer.from(window[key], "base64")).toString());
}

describe("independent Goluboe R1.1 publication", () => {
  it("adds a public allowlist entry without changing private assignments or neighbors", () => {
    expect(getPublicProject3dModel("goluboe-vodovod")).toMatchObject({ revision: "R1.1", assetBaseUrl: "/model-assets/goluboe-vodovod-r1-1/" });
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
    expect((await get("service-worker.js", { method: "HEAD" })).headers.get("service-worker-allowed")).toBe("/model-assets/goluboe-vodovod-r1-1/");
  });
  it("retains every supplied byte and all six PDFs", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release).toMatchObject({ release: "GOLUBOE_VODOVOD_R1_1", projectId: "goluboe-vodovod", revision: "R1.1", suppliedFiles: 204,
      sourceArchiveSha256: "58e99ffadbe1efd010880ceba9fb014f6bd712a7a3dc5cc98317516bf4c6748a",
      sourceTreeSha256: "bcd036d171df88c277956ba2deba09c559c48540cdbb2dd15d69989e1c236812",
      suppliedManifestSha256: "67e15cd76438aa7b90a7b87d81e462ee563fd0c2de6fee7b69e44417d177fa73",
      geometryChangedFromSuppliedRelease: false, newEngineeringApproval: false, znpOriginalIncluded: false });
    const index = JSON.parse(await readFile("src/assets/project-models/goluboe-vodovod-r1-1/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(206);
    expect(index.archiveSha256).toBe("630660210574dfbc2a1fa144d7bb7aa8bac0e935ff90a9f146baa346c9874303");
    const manifest = await (await get("MANIFEST.json")).json();
    expect(manifest.files).toHaveLength(205);
    for (const file of manifest.files) {
      const bytes = Buffer.from(await (await get(file.path)).arrayBuffer());
      expect(bytes.length, file.path).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(file.sha256);
    }
    expect(manifest.files.filter((f: { path: string }) => f.path.endsWith(".pdf"))).toHaveLength(6);
    expect(index.files["data/metadata-light.js"].sha256).toBe("f805c03c10daed837feecabb0a712bc65eaf1a4fab21ca7f8d1db203aca23689");
  });
  it("preserves the scene, local geometry, issues and excavation menu", async () => {
    const window: Record<string, any> = {};
    for (const file of ["project/config.js", "project/texts.js", "data/release-info.js", "data/rd_remarks_final.js"])
      runInNewContext(await (await get(file)).text(), { window }, { timeout: 1000 });
    expect(window.ATLAS_PROJECT.storage.prefix).toBe("atlas:goluboe-vodovod:");
    expect(window.ATLAS_RELEASE).toMatchObject({ release: "ATLAS_goluboe-vodovod_R1_1", registry_records: 144,
      elements: 37, local_bodies: 37, bodies_total: 74, library_records: 158, remarks: 19, source_candidate: true, source_accepted: null });
    expect(window.ATLAS_PROJECT.documents).toHaveLength(6);
    expect(window.ATLAS_REMARKS.items).toHaveLength(19);
    expect(window.ATLAS_REMARKS.items.find((r: { id: string }) => r.id === "Г-01").status).toBe("Открыто");
    expect(window.ATLAS_TEXTS.pages.menu[0].href).toBe("catalogue-model.html#id/NET-GOL-PD-POS-SHORING-ASSEMBLY");
    const metadata = decode(await (await get("data/metadata-light.js")).text(), "ATLAS_METADATA_GZIP");
    expect(metadata.objects).toHaveLength(74);
    expect(metadata.objects.filter((o: { worldAllowed: boolean }) => o.worldAllowed)).toHaveLength(37);
    const library = decode(await (await get("data/library.js")).text(), "ATLAS_LIBRARY_GZIP");
    expect(library.records).toHaveLength(158);
    expect(Object.keys(library.sources)).toHaveLength(61);
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
});
