import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import vm from "node:vm";
import { projectAtlasR25Response } from "./project-atlas-r25-response";

const root = "src/assets/atlas-ui/20260922-sources";
const registry = JSON.parse(await readFile(`${root}/assets/source-recovery/registry.json`, "utf8"));
const prefix = "https://pgs.local/model-assets/troitsk-r25v8-ui2/";
const get = (name: string, version: "v8-ui1" | "v8-ui2" = "v8-ui2") => projectAtlasR25Response(new Request(prefix + name), name.split("/"), version);
const text = await (await get("data/metadata-light.js")).text();
const metadata = JSON.parse(gunzipSync(Buffer.from(JSON.parse(text.slice(text.indexOf("=") + 1).trim().replace(/;$/, "")), "base64")).toString());
const context = vm.createContext({});
vm.runInContext(await readFile(`${root}/assets/source-recovery/runtime.js`, "utf8"), context);
const recovery = context.AtlasSourceRecovery.create(registry, metadata.albumSources);

describe("verified Atlas source recovery", () => {
  it("preserves all 8557 assigned active links and adds 1840 missing links without changing records", () => {
    const before = JSON.stringify(metadata);
    let preserved = 0, restored = 0, missing = 0;
    for (const r of metadata.albumIndex) {
      const o = { albumRecord: r, sourceKeys: r.sources };
      const links = recovery.links(o);
      if (r.sources?.length) expect(links).toBe(r.sources);
      if (r.bucket !== "active" || r.ns !== "world" || !r.physical) continue;
      if (r.sources?.length) preserved++;
      else if (links.length) restored++;
      else missing++;
    }
    expect({ preserved, restored, missing }).toEqual({ preserved: 8557, restored: 1840, missing: 15 });
    expect(JSON.stringify(metadata)).toBe(before);
  });
  it("keeps every original source unchanged", () => {
    for (const [key, source] of Object.entries(metadata.albumSources)) expect(recovery.sources[key]).toBe(source);
  });
  it("opens MB2 on printed sheet 57, not the incorrect inherited navigation label", () => {
    const r = metadata.albumIndex.find((r: { key: string }) => r.key === "L1_МБ2_F3_03");
    const [link] = recovery.links({ albumRecord: r, sourceKeys: [] });
    expect(recovery.sources[link.key]).toMatchObject({ printed_sheet: "57", pdf_page: 67,
      pdf_url: "source_album/documents/AS2_last_full.pdf#page=67" });
  });
  it("distinguishes AR excerpt pages from full-album pages and AS2 editions", () => {
    expect(registry.sources.RECOVERY_AR_FACADE_4).toMatchObject({ printed_sheet: "11", pdf_page: 4, original_pdf_page: 16 });
    expect(registry.sources.RECOVERY_AR_FACADE_5).toMatchObject({ printed_sheet: "12", pdf_page: 5, original_pdf_page: 17 });
    expect(registry.sources.RECOVERY_AS2_CHANGES_25.pdf_url).toBe("engineering/sources/AS2_changes.pdf#page=25");
    expect(registry.sources.RECOVERY_AS2_JULY_108.pdf_url).toBe("engineering/sources/AS2_03_07_2026.pdf#page=108");
  });
  it("reports missing and partial sources honestly", () => {
    for (const key of ["GAL_C_0_18", "DR1_L"]) {
      const object = { albumRecord: { key }, sourceKeys: [] };
      expect(recovery.links(object)).toHaveLength(0);
      expect(recovery.note(object)).toContain("подтверждённый файл отсутствует");
    }
    expect(recovery.note({ albumRecord: { key: "CAP_MAIN" }, sourceKeys: [] })).toContain("лист 29");
    expect(recovery.links({ albumRecord: { key: "CAP_MAIN" }, sourceKeys: [] })).toHaveLength(1);
  });
  it("verifies every recovered path, PDF page, document hash and JPEG content type", async () => {
    const index = JSON.parse(await readFile("src/assets/project-models/troitsk-r25v8-ui2/index.json", "utf8")).files;
    for (const source of Object.values(registry.sources) as Array<{ image: string; pdf_url: string; pdf_page: number; pdf_pages: number; document_sha256: string }>) {
      expect(index[source.image]).toBeDefined();
      const [pdf, page] = source.pdf_url.split("#");
      expect(index[pdf].sha256).toBe(source.document_sha256);
      expect(page).toBe(`page=${source.pdf_page}`);
      expect(source.pdf_page).toBeGreaterThan(0);
      expect(source.pdf_page).toBeLessThanOrEqual(source.pdf_pages);
    }
    const response = await get("assets/source-recovery/as2_july-118.jpg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  });
  it("keeps previous immutable UI unchanged, with independently scoped new assets", async () => {
    expect((await (await get("CURRENT_RELEASE.json", "v8-ui1")).json()).ui_revision).toBe("20260922-3");
    expect((await (await get("CURRENT_RELEASE.json")).json()).source_recovery.active.remaining).toBe(15);
    expect((await get("index.html")).headers.get("content-security-policy")).toContain(prefix);
    expect((await get("service-worker.js")).headers.get("service-worker-allowed")).toBe("/model-assets/troitsk-r25v8-ui2/");
    expect(await (await get("assets/prototype.css")).text()).toBe(await (await get("assets/prototype.css", "v8-ui1")).text());
  });
  it("precaches the UI and recovery resolver within the new release scope", async () => {
    const manifest = vm.createContext({ self: {} });
    vm.runInContext(await (await get("assets/offline-manifest.js")).text(), manifest);
    expect(manifest.self.ATLAS_OFFLINE_VERSION).toBe("20260922-3-sources-1");
    const worker = await (await get("service-worker.js")).text();
    const core = JSON.parse(worker.match(/const CORE=(\[[^;]+\]);/)![1]);
    for (const name of ["assets/source-recovery/registry.js", "assets/source-recovery/runtime.js", "assets/prototype.css", "assets/atlas-engine.js"]) {
      expect(core).toContain(name);
      expect(manifest.self.ATLAS_OFFLINE_FILES).toContain(name);
      expect(manifest.self.ATLAS_OFFLINE_SIZES[name]).toBeGreaterThan(0);
    }
    expect(worker).toContain("encodeURIComponent(ROOT.pathname)");
  });
});
