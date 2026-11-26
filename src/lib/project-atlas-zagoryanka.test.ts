import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { projectAtlasR25Response } from "./project-atlas-r25-response";
import { getPublicProject3dModel, getProject3dModel, getProjectAtlasUrl } from "./project-3d-model";
import { GET, HEAD } from "@/app/model-assets/zagoryanka-1500-r1-0/[...asset]/route";

const base = "https://pgs.local/model-assets/zagoryanka-1500-r1-0/";
const get = (name: string, init?: RequestInit) => projectAtlasR25Response(new Request(base + name, init), name.split("/"), "zagoryanka-1500-r1-0");
function decode(text: string, key: string) {
  const window: Record<string, string> = {};
  runInNewContext(text, { window }, { timeout: 10000 });
  return JSON.parse(gunzipSync(Buffer.from(window[key], "base64")).toString());
}

describe("independent Zagoryanka R1.0 publication", () => {
  it("adds only the explicit public alias and preserves existing project assignments", () => {
    expect(getPublicProject3dModel("zagoryanka-1500")).toMatchObject({ revision: "R1.0", assetBaseUrl: "/model-assets/zagoryanka-1500-r1-0/" });
    expect(getPublicProject3dModel("dou200")?.revision).toBe("R1.27");
    expect(getPublicProject3dModel("troitsk-building-24")?.revision).toBe("V12.22");
    expect(getProject3dModel({ id: "zagoryanka-1500" })).toBeNull();
    expect(getPublicProject3dModel("goluboe")).toBeNull();
  });
  it("links the Zagoryanka project card directly to its published atlas", () => {
    expect(getProjectAtlasUrl("cmwpge82t0002nqot69h6io2y")).toBe("/models/zagoryanka-1500#node/building");
    expect(getProjectAtlasUrl("zagoryanka-1500")).toBeNull();
    expect(getProjectAtlasUrl("cmteg9g33000for4oc06rko5a")).toBeNull();
  });
  it("serves the anonymous entry with a project-scoped CSP and worker", async () => {
    expect(HEAD).toBe(GET);
    const response = await HEAD(new Request(base + "index.html", { method: "HEAD" }), { params: { asset: ["index.html"] } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, no-cache");
    expect(response.headers.get("content-security-policy")).toContain(base);
    expect(response.headers.get("content-security-policy")).not.toMatch(/troitsk|dou200/);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect((await get("service-worker.js", { method: "HEAD" })).headers.get("service-worker-allowed")).toBe("/model-assets/zagoryanka-1500-r1-0/");
  });
  it("retains all 165 supplied files and their hashes, with two publication metadata files", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release).toMatchObject({ release: "ZAGORYANKA_1500_R1_0", projectId: "zagoryanka-1500", revision: "R1.0", suppliedFiles: 165,
      sourceArchiveSha256: "408cfc2cece28aebb5cd14a6a5be29edd164f42d2b9e00751f8fc7f8ee5ea022", sourceTreeSha256: "ff277ef1c667bd8d9ac6f4558c880530b5cc291642fcafc271176cceefc4e8da",
      geometryChangedFromSuppliedRelease: false, elementAssignmentsChanged: false, newEngineeringApproval: false });
    const index = JSON.parse(await readFile("src/assets/project-models/zagoryanka-1500-r1-0/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(167);
    expect(index.archiveSha256).toBe("abdfb943d354372a21897f767489411fa43b16b0fdd97df0c69074cf5db4b5e6");
    const manifest = await (await get("MANIFEST.json")).json();
    expect(manifest.files).toHaveLength(166);
    for (const file of manifest.files) {
      const bytes = Buffer.from(await (await get(file.path)).arrayBuffer());
      expect(bytes.length, file.path).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(file.sha256);
    }
    expect(release.limitations.join(" ")).toContain("unfolded longitudinal profile");
  });
  it("preserves the supplied body, registry, plan and limitation counts", async () => {
    const window: Record<string, any> = {};
    for (const file of ["project/config.js", "data/release-info.js", "data/progress_plan.js"])
      runInNewContext(await (await get(file)).text(), { window }, { timeout: 1000 });
    expect(window.ATLAS_PROJECT.project_id).toBe("zagoryanka-1500");
    expect(window.ATLAS_PROJECT.storage.prefix).toBe("atlas:zagoryanka-1500:");
    expect(window.ATLAS_RELEASE).toMatchObject({ release: "ATLAS_zagoryanka-1500_R1_0", registry_records: 99, bodies_total: 34,
      elements: 11, local_bodies: 23, remarks: 11, library_records: 111, source_candidate: true });
    expect(window.ATLAS_PROGRESS_PLAN.stages).toHaveLength(45);
    const metadata = decode(await (await get("data/metadata-light.js")).text(), "ATLAS_METADATA_GZIP");
    const library = decode(await (await get("data/library.js")).text(), "ATLAS_LIBRARY_GZIP");
    expect(metadata.objects).toHaveLength(34);
    expect(metadata.objects.filter((o: { worldAllowed: boolean }) => o.worldAllowed)).toHaveLength(11);
    expect(library.records).toHaveLength(111);
    expect(Object.keys(library.sources)).toHaveLength(49);
    for (const record of library.records) for (const source of record.sources || []) expect(library.sources[source.key], record.key).toBeDefined();
  });
  it("resolves available PDF sources only into this release, retaining exact page fragments", async () => {
    const window: Record<string, any> = { addEventListener() {} };
    const document = { currentScript: { src: base + "assets/package-links.js" }, baseURI: base + "index.html",
      readyState: "loading", addEventListener() {}, getElementById: () => null, querySelector: () => null,
      createElement: () => ({}), head: { append() {} } };
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
    expect(pdfs.size).toBe(4);
  });
  it("keeps PDF range/conditional delivery and refuses other projects and private files", async () => {
    const pdf = await get("albums/ZAG_WELL_SOURCE_REGISTER_R1.pdf", { headers: { range: "bytes=0-7" } });
    expect(pdf.status).toBe(206);
    expect(await pdf.text()).toMatch(/^%PDF-/);
    const invalid = await get("albums/ZAG_WELL_SOURCE_REGISTER_R1.pdf", { headers: { range: "bytes=999999999999-" } });
    expect(invalid.status).toBe(416);
    for (const file of ["../dou200-r1-27/index.html", "../troitsk-r25v12-18/index.html", ".env", "qa/index.html", "comm/private.json"])
      expect((await get(file)).status, file).toBe(404);
    const head = await get("CURRENT_RELEASE.json", { method: "HEAD" });
    expect(head.headers.get("cache-control")).toContain("immutable");
    expect((await get("CURRENT_RELEASE.json", { headers: { "if-none-match": head.headers.get("etag")! } })).status).toBe(304);
  });
});
