import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { projectAtlasR25Response } from "./project-atlas-r25-response";
import { getPublicProject3dModel, getProject3dModel } from "./project-3d-model";
import { GET, HEAD } from "@/app/model-assets/goluboe-vodovod-r1-2-profile-3d/[...asset]/route";

const base = "https://pgs.local/model-assets/goluboe-vodovod-r1-2-profile-3d/";
const get = (name: string, init?: RequestInit) => projectAtlasR25Response(new Request(base + name, init), name.split("/"), "goluboe-vodovod-r1-2-profile-3d");
function decode(text: string, key: string) {
  const window: Record<string, string> = {};
  runInNewContext(text, { window }, { timeout: 10000 });
  return JSON.parse(gunzipSync(Buffer.from(window[key], "base64")).toString());
}

describe("independent Goluboe R1.2 publication", () => {
  it("adds a public allowlist entry without changing private assignments or neighbors", () => {
    expect(getPublicProject3dModel("goluboe-vodovod")).toMatchObject({ revision: "R1.2", assetBaseUrl: "/model-assets/goluboe-vodovod-r1-2-profile-3d/" });
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
    expect((await get("service-worker.js", { method: "HEAD" })).headers.get("service-worker-allowed")).toBe("/model-assets/goluboe-vodovod-r1-2-profile-3d/");
  });
  it("retains every supplied byte and all six PDFs", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release).toMatchObject({ release: "GOLUBOE_VODOVOD_R1_2_PROFILE_3D", projectId: "goluboe-vodovod", revision: "R1.2", suppliedFiles: 326,
      sourceArchiveSha256: "21ecc601029163bdf02e06406b65790387a37e6056e29bccbc093c84e1d13f2f",
      sourceTreeSha256: "1e5c15d19407c3f9ab644e504d07c37dc800fa1c13a331b61d4c51d6136b1431",
      suppliedManifestSha256: "36b6a9b0980e780045bbc6f6a620a6c538feb7e3b38eb19c8f46cb5146a6ff15",
      geometryChangedFromSuppliedRelease: false, newEngineeringApproval: false, znpOriginalIncluded: false });
    const index = JSON.parse(await readFile("src/assets/project-models/goluboe-vodovod-r1-2-profile-3d/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(328);
    expect(index.archiveSha256).toBe("71db660cfb08d32ebacf82dc31a3ab309e18dcdf1e3fab4a7772e7ac67541e6a");
    const manifest = await (await get("MANIFEST.json")).json();
    expect(manifest.files).toHaveLength(327);
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
    expect(createHash("sha256").update(await response.text()).digest("hex")).toBe("6298a3d675940bfb86c57a28faa398ad103fe48b7a1c71137134099d684c110b");
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
    ["profile-waterline.html", "f102607075e1011141acb7da2bde56110e5598d6cf2d4893a8699bb9ce7b19da", ["Продольный разрез водовода В1", "Начало, м", "Конец, м", "Конец интервала должен быть больше начала.", "Горизонтальный и вертикальный масштабы различаются", "линейной интерполяцией", "Знак ≈", "99,1 мм"]],
    ["section-kv1.html", "c552cb4766108eb1d1c7de94004241e5feccf7d7be4c631dc399447150931977", ["Разрез колодца КВ‑1", "+200,599", "+200,500", "+200,000", "+199,860", "+199,760", "640 мм требует сверки с проектировщиком", "Толщина плиты 140 мм принята в модели", "Абсолютные отметки установки колодца в ТКР отсутствуют"]]
  ])("serves the exact supplied %s with its qualifications and local links", async (name, digest, markers) => {
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
  it("permits only project-local Goluboe fonts and serves valid WOFF2 without changing neighboring CSP", async () => {
    const html = await get("index.html", { method: "HEAD" });
    const policy = html.headers.get("content-security-policy")!;
    expect(policy).toContain(`font-src ${base}`);
    expect(policy.match(/font-src ([^;]+)/)?.[1]).not.toMatch(/\*|'self'|data:|blob:/);
    const index = JSON.parse(await readFile("src/assets/project-models/goluboe-vodovod-r1-2-profile-3d/index.json", "utf8"));
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
      "project/config.js": "de4a12461d58a90aa8e1c41dc99a092ec8f8cf9224c0b7fe43de069b167d03cd",
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
      .toEqual(["project/profile-world-data.js", "project/profile-world-overlay.js", "project/plan-controls.js"]);
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
});
