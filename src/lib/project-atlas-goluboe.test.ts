import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { projectAtlasR25Response } from "./project-atlas-r25-response";
import { getPublicProject3dModel, getProject3dModel } from "./project-3d-model";
import { GET, HEAD } from "@/app/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/[...asset]/route";

const base = "https://pgs.local/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/";
const get = (name: string, init?: RequestInit) => projectAtlasR25Response(new Request(base + name, init), name.split("/"), "goluboe-vodovod-r1-2-terrain-snapshot");
function decode(text: string, key: string) {
  const window: Record<string, string> = {};
  runInNewContext(text, { window }, { timeout: 10000 });
  return JSON.parse(gunzipSync(Buffer.from(window[key], "base64")).toString());
}

describe("Goluboe public atlas and sealed R1.2 Terrain Snapshot", () => {
  it("adds a public allowlist entry without changing private assignments or neighbors", () => {
    expect(getPublicProject3dModel("goluboe-vodovod")).toMatchObject({
      revision: "R1.13.2", assetBaseUrl: "/model-assets/goluboe-vodovod-r1-13-2/", publicUrl: "/models/goluboe-vodovod#node/building"
    });
    expect(getPublicProject3dModel("dou200")?.revision).toBe("R1.27");
    expect(getPublicProject3dModel("troitsk-building-24")?.revision).toBe("V12.21");
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
    expect((await get("service-worker.js", { method: "HEAD" })).headers.get("service-worker-allowed")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/");
  });
  it("records the sealed terrain snapshot delivery and retains all six PDFs", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release).toMatchObject({ release: "GOLUBOE_VODOVOD_R1_2_TERRAIN_SNAPSHOT", projectId: "goluboe-vodovod", revision: "R1.2", suppliedFiles: 329,
      sourceArchiveSha256: "a11cb956b7b39a610344b53fb1fbd7b30eebda5f0d550e1af77c8829c0d32c88",
      upstreamSourceTreeSha256: "1d66423a502f738dec2b708ae2560332e052a49bb84e905e51df9b10d7a87332",
      upstreamManifestSha256: "85c6ad9e9f23cad53a4673f6bdbc10f669340826bad9e8ecfce85710dbc81de5",
      sourceTreeSha256: "91b2a7505249fef3ba57ba8ef6b84c034e5998109aab33ee27369da77246f0f8", publicationModifiedFiles: [],
      changedFromUpstream: ["assets/atlas-engine.js", "assets/offline-manifest.js", "project/terrain-overlay.js"],
      unchangedFromUpstream: 326, offlineVersion: "pkg-f49a2b22919b",
      suppliedManifestSha256: "accfaf7bcc72f0f75faa068ad63c382d502188554f6970a32e8446bc037649c2",
      geometryChangedFromSuppliedRelease: false, newEngineeringApproval: false, znpOriginalIncluded: false });
    const index = JSON.parse(await readFile("src/assets/project-models/goluboe-vodovod-r1-2-terrain-snapshot/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(331);
    expect(index.archiveSha256).toBe("c3c7b600be8dfc1460ed71c0a9387844b0bf114e18472e6979cc9e9d12721f4d");
    const manifestText = await (await get("MANIFEST.json")).text();
    expect(createHash("sha256").update(manifestText).digest("hex")).toBe("364918ef8b0a2bc112a58db48fb775720784f19c153216d73b6321a9cbc6b5eb");
    const manifest = JSON.parse(manifestText);
    expect(manifest.files).toHaveLength(330);
    for (const file of manifest.files) {
      const bytes = Buffer.from(await (await get(file.path)).arrayBuffer());
      expect(bytes.length, file.path).toBe(file.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), file.path).toBe(file.sha256);
    }
    expect(manifest.files.filter((f: { path: string }) => f.path.endsWith(".pdf"))).toHaveLength(6);
    expect(index.files["data/metadata-light.js"].sha256).toBe("8d4b8ae4af19f2802d6d6b68f0fbc45294cd6a3a791061fdd2cb4eae072ac07a");
  });
  it("preserves the scene, local geometry, issues and excavation menu", async () => {
    const window: Record<string, any> = {};
    for (const file of ["project/config.js", "project/texts.js", "data/release-info.js", "data/rd_remarks_final.js"])
      runInNewContext(await (await get(file)).text(), { window }, { timeout: 1000 });
    expect(window.ATLAS_PROJECT.storage.prefix).toBe("atlas:goluboe-vodovod:");
    expect(window.ATLAS_RELEASE).toMatchObject({ release: "ATLAS_goluboe-vodovod_R1_2", registry_records: 264,
      elements: 154, local_bodies: 40, bodies_total: 194, library_records: 278, remarks: 23, source_candidate: true, source_accepted: null });
    expect(window.ATLAS_PROJECT.documents).toHaveLength(6);
    expect(window.ATLAS_REMARKS.items).toHaveLength(23);
    expect(window.ATLAS_REMARKS.items.find((r: { id: string }) => r.id === "Г-01").status).toBe("Открыто");
    expect(window.ATLAS_TEXTS.pages.menu.map((entry: { href: string }) => entry.href)).toContain("catalogue-model.html#id/NET-GOL-PD-POS-SHORING-ASSEMBLY");
    const metadata = decode(await (await get("data/metadata-light.js")).text(), "ATLAS_METADATA_GZIP");
    expect(metadata.objects).toHaveLength(194);
    expect(metadata.objects.some((o: { renderId: string }) => o.renderId === "NET-V-SUPPORT-UP-2")).toBe(true);
    expect(metadata.objects.filter((o: { worldAllowed: boolean }) => o.worldAllowed)).toHaveLength(154);
    const library = decode(await (await get("data/library.js")).text(), "ATLAS_LIBRARY_GZIP");
    expect(library.records).toHaveLength(278);
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
  it.each(["", "?pdLocate=up1"])("shows all five excavations in the general scene %s without changing geometry", async (search) => {
    const window: Record<string, any> = {};
    const context = { window, URLSearchParams, location: { search }, document: { addEventListener() {} } };
    for (const file of ["project/config.js", "project/plan-controls.js"])
      runInNewContext(await (await get(file)).text(), context, { timeout: 1000 });
    const views = Object.values(window.ATLAS_PD_VIEWS.excavations) as any[];
    const rims = views.flatMap(view => view.details).filter(id => id.includes("-R12-VIEW-RIM-"));
    expect(new Set(rims).size).toBe(5);
    for (const view of views) {
      const compareOnly = new Set([...Object.keys(view.alternate), ...view.backfill]);
      for (const id of view.details.filter((id: string) => !compareOnly.has(id)))
        expect(window.ATLAS_PROJECT.reference_bodies).not.toContain(id);
    }
    for (const id of rims) expect(window.ATLAS_PROJECT.reference_bodies).toContain(id.replace("-R12-VIEW-RIM-", "-"));
    const response = await get("project/plan-controls.js");
    expect(createHash("sha256").update(await response.text()).digest("hex")).toBe("f2035e45e1191e876e51f9d5fcd7203f41810b133a24e84f99280a325c3dcd6e");
  });
  it("serves the supplied UP-1 profile and its contextual return/PDF links without changing source figures", async () => {
    const response = await get("project/profile-up1.html");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain(`font-src ${base}`);
    const text = await response.text();
    expect(createHash("sha256").update(text).digest("hex")).toBe("760f9f49b6e6f642f91c281165a7305725ea9644b4ffb859ef79754142178da5");
    for (const value of ["34,2 м³", "27,8 м³", "6,4 м³", "+203,800 м", "+200,000 м", "3,00 × 3,00 м", "+200,420 м", "+200,519 м"])
      expect(text).toContain(value);
    const links = [...text.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1], base + "project/profile-up1.html"));
    expect(links.some(url => url.pathname.endsWith("/index.html") && url.search === "?pdLocate=up1")).toBe(true);
    expect(links.filter(url => url.hash.startsWith("#page=")).map(url => url.hash).sort()).toEqual(["#page=18", "#page=22", "#page=46", "#page=55"]);
    for (const url of links) {
      expect(url.href.startsWith(base)).toBe(true);
      expect((await get(decodeURIComponent(url.pathname.slice(new URL(base).pathname.length)), { method: "HEAD" })).status).toBe(200);
    }
    const controls = await (await get("project/plan-controls.js")).text();
    for (const value of ["pdSoilVolume", "pdToggleSoil", "pdOpenSoilProfile", "project/profile-up1.html", "project/profile-waterline.html", "project/section-kv1.html", "pdSoil"])
      expect(controls).toContain(value);
  });
  it.each([
    ["profile-waterline.html", "6c811a21e69e9a52be2a3c468e3c418387cc525be9e0fde82ae040cffb4cfa44", ["Продольный разрез водовода В1", "Начало, м", "Конец, м", "Конец интервала должен быть больше начала.", "Горизонтальный и вертикальный масштабы различаются", "линейной интерполяцией", "Знак ≈", "99,1 мм"]],
    ["section-kv1.html", "c552cb4766108eb1d1c7de94004241e5feccf7d7be4c631dc399447150931977", ["Разрез колодца КВ‑1", "+200,599", "+200,500", "+200,000", "+199,860", "+199,760", "640 мм требует сверки с проектировщиком", "Толщина плиты 140 мм принята в модели", "Абсолютные отметки установки колодца в ТКР отсутствуют"]]
  ])("serves the sealed %s with its qualifications and local links", async (name, digest, markers) => {
    const response = await get(`project/${name}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain(`font-src ${base}`);
    const text = await response.text();
    expect(createHash("sha256").update(text).digest("hex")).toBe(digest);
    for (const marker of markers) expect(text).toContain(marker);
    for (const match of text.matchAll(/href="([^"]+)"/g)) {
      const url = new URL(match[1], base + `project/${name}`);
      expect(url.href.startsWith(base)).toBe(true);
      expect((await get(decodeURIComponent(url.pathname.slice(new URL(base).pathname.length)), { method: "HEAD" })).status).toBe(200);
    }
  });
  it("keeps search tools at intrinsic width and wraps narrow profile labels with a fresh offline cache", async () => {
    const css = await (await get("assets/atlas-shell.css")).text();
    expect(createHash("sha256").update(css).digest("hex")).toBe("a989b4895d393a6235aef66aed455dc58de176bb140fde5ebe7dc2f1e4960d7a");
    expect(css).toContain(".atlas-shell .as-tools { margin-left: 0; flex: 0 0 auto; }");
    expect(await (await get("project/profile-waterline.html")).text()).toContain(".methods li{white-space:normal}");
    const self: Record<string, any> = {};
    const offline = await (await get("assets/offline-manifest.js")).text();
    expect(createHash("sha256").update(offline).digest("hex")).toBe("c86e012957060295eab0fde6d11f14a6701893431f5e99e790b995baa23e4819");
    runInNewContext(offline, { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_VERSION).toBe("pkg-f49a2b22919b");
    for (const name of ["assets/atlas-shell.css", "assets/atlas-engine.js", "project/profile-waterline.html", "project/terrain-analysis.js", "project/terrain-overlay.js", "project/terrain-tools.js"])
      expect(self.ATLAS_OFFLINE_SIZES[name]).toBe(Buffer.byteLength(await (await get(name)).text()));
  });
  it("permits only project-local Goluboe fonts and serves valid WOFF2 without changing neighboring CSP", async () => {
    const html = await get("index.html", { method: "HEAD" });
    const policy = html.headers.get("content-security-policy")!;
    expect(policy).toContain(`font-src ${base}`);
    expect(policy.match(/font-src ([^;]+)/)?.[1]).not.toMatch(/\*|'self'|data:|blob:/);
    const index = JSON.parse(await readFile("src/assets/project-models/goluboe-vodovod-r1-2-terrain-snapshot/index.json", "utf8"));
    const fonts = Object.keys(index.files).filter(name => name.endsWith(".woff2"));
    expect(fonts).toHaveLength(5);
    for (const name of fonts) {
      const response = await get(name);
      expect(response.headers.get("content-type")).toBe("font/woff2");
      expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("wOF2");
    }
    const other = await projectAtlasR25Response(new Request("https://pgs.local/model-assets/zagoryanka-1500-r1-0/index.html", { method: "HEAD" }), ["index.html"], "zagoryanka-1500-r1-0");
    expect(other.status).toBe(200);
    expect(other.headers.get("content-security-policy")).not.toContain("font-src");
  });
  it("loads the exact 3D profile plugins in order while preserving the source elevations", async () => {
    const window: Record<string, any> = {};
    const pins = {
      "project/config.js": "b5d73d886b15439282a0e82a9c7e52802bf9d3dbcf29e3298c00991bcf408080",
      "project/profile-world-data.js": "b2bc0d1c06d5ed0aa45e2f0db7e29aa5f0678354881cb1418a0e9f183bbee219",
      "project/profile-world-overlay.js": "76dd9158739c87c1ebc606a9ea810454a4b4f1c8aee697554f9dce4963f40c7a"
    };
    for (const [file, digest] of Object.entries(pins)) {
      const response = await get(file);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(createHash("sha256").update(text).digest("hex")).toBe(digest);
      runInNewContext(text, { window }, { timeout: 1000 });
    }
    expect(window.ATLAS_PROJECT.plugins.find((p: { name: string }) => p.name === "pd_plan_controls").data.map((p: { src: string }) => p.src))
      .toEqual(["project/profile-world-data.js", "project/profile-world-overlay.js",
        "project/terrain-analysis.js", "project/terrain-overlay.js", "project/terrain-tools.js", "project/plan-controls.js"]);
    const data = window.ATLAS_PROFILE_WORLD;
    expect(data.insideRadius).toBe(0.0991);
    expect(data.route).toHaveLength(18);
    expect(data.marks.map((p: { station: number }) => p.station)).toEqual([0, 21.5, 31, 60.5, 142.4, 292.1, 390, 400]);
    expect(data.marks.map((p: { invert: number }) => p.invert)).toEqual([200.5, 200.39, 200.42, 200.5, 202.5, 206.5, 207.23, 207.3]);
    expect(data.marks.filter((p: { ground?: number }) => Number.isFinite(p.ground)).map((p: { ground: number }) => p.ground)).toEqual([204.3, 203.8, 211.05]);
    for (const mark of data.marks) expect(data.route.find((p: { station: number }) => p.station === mark.station)?.invert).toBe(mark.invert);
    expect(data.well).toEqual({ station: 0, slabTop: 200, slabBottom: 199.86, beddingBottom: 199.76 });
    expect(typeof window.ATLAS_PROFILE_OVERLAY.mount).toBe("function");
    const controls = await (await get("project/plan-controls.js")).text();
    for (const marker of ["Профиль в 3D", "Интервал профиля в 3D", "pdProfile", "pdFrom", "pdTo", "Конец должен быть больше начала.", "Переключитесь в 3D, чтобы видеть профиль."])
      expect(controls).toContain(marker);
    const section = await (await get("project/profile-waterline.html")).text();
    expect(section).toContain("Показать профиль в 3D");
    expect(section).toContain("pdFrom: first, pdTo: last");
  });
  it("derives half-meter contours and vertical heights only inside the terrain triangles", async () => {
    const window: Record<string, any> = {
      __FULL_ATLAS: {
        geometry: (id: string) => id === "NET-GOL-PD-TERRAIN-1" ? {
          v: [[0, 0, 200], [2, 0, 202], [0, 2, 200], [3, 0, 200], [5, 0, 202], [5, 2, 200]],
          f: [[0, 1, 2], [3, 4, 5]]
        } : null
      }
    };
    const analysis = await (await get("project/terrain-analysis.js")).text();
    runInNewContext(analysis, { window }, { timeout: 1000 });
    const surface = window.GOL_TERRAIN.create({});
    expect(surface.step).toBe(0.5);
    expect(surface.heightAt(0.75, 0.25)).toBe(200.75);
    expect(surface.heightAt(2.5, 0.1)).toBeNull();
    expect(surface.heightAt(6, 0)).toBeNull();
    expect(surface.contours.map((entry: { level: number }) => entry.level)).toEqual([200, 200.5, 201, 201.5]);
    const middle = surface.contours.find((entry: { level: number }) => entry.level === 201);
    expect(middle.segments).toHaveLength(2);
    for (const segment of middle.segments) {
      expect(segment.every(([x]: number[]) => x <= 2) || segment.every(([x]: number[]) => x >= 3)).toBe(true);
    }
    expect(await (await get("project/terrain-tools.js")).text()).toContain("line-height:1.3;white-space:normal");
  });
  it("publishes the project-local terrain layers before the ordinary and HQ PNG encoding", async () => {
    const engine = await (await get("assets/atlas-engine.js")).text();
    expect(createHash("sha256").update(engine).digest("hex")).toBe("a1a203de679f104cedef317e4b8e52dd7d41915ffa787403fd6de54692a74ab7");
    const save = engine.slice(engine.indexOf("function r23SaveImage("));
    expect(save).toMatch(/if\(hires\).*AtlasGraphics24\.exportSize/);
    expect(save).toMatch(/paintSnapshotLayers\(ctx,cr\);[\s\S]*?c\.toBlob\(/);
    const overlay = await (await get("project/terrain-overlay.js")).text();
    expect(createHash("sha256").update(overlay).digest("hex")).toBe("34c67b78cf1efcfb83023f20b5b0ba21357123dfe5f2c33fc4d3935048928217");
    expect(engine).toContain("new CustomEvent('atlas:snapshotpaint'");
    expect(overlay).toContain("add(ink => paint(ink, viewport, drawGround, section, true));");
  });
});
