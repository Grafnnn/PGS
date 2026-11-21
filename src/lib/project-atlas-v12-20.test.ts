import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { GET, HEAD } from "@/app/model-assets/troitsk-r25v12-20/[...asset]/route";

const prefix = "/model-assets/troitsk-r25v12-20/";
const origin = "https://pgs.local";
const get = (file: string, init?: RequestInit) => GET(
  new Request(origin + prefix + file.split("/").map(encodeURIComponent).join("/"), init),
  { params: { asset: file.split("/") } }
);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type FileEntry = { path: string; bytes: number; sha256: string };
type Manifest = { release: string; sourceTreeSha256: string; files: FileEntry[] };

describe("Troitsk V12.20 public delivery", () => {
  it("matches the sealed manifest and preserves model data and all 26 PDFs", async () => {
    const response = await get("MANIFEST.json");
    expect(response.status).toBe(200);
    const raw = new Uint8Array(await response.arrayBuffer());
    expect(sha(raw)).toBe("2408e490965596df4a76827fa75f03e17f27eec32d14f85db37d1fc2c652f284");
    const manifest: Manifest = JSON.parse(Buffer.from(raw).toString());
    expect(manifest).toMatchObject({ release: "V12_20", sourceTreeSha256: "e25beceabb6fca766e4ce30456974ad0eda402d6b8156e8e3d1ec5dc59cf9293" });
    expect(manifest.files).toHaveLength(4671);
    const prior: { files: Record<string, FileEntry> } = JSON.parse(await readFile("src/assets/project-models/troitsk-r25v12-18/index.json", "utf8"));
    const next: { files: Record<string, FileEntry> } = JSON.parse(await readFile("src/assets/project-models/troitsk-r25v12-20/index.json", "utf8"));
    expect(Object.keys(next.files)).toHaveLength(4672);
    for (const { path, ...meta } of manifest.files) {
      expect(next.files[path], path).toMatchObject(meta);
      if (/^(data|drawings|albums|source_album|engineering)\//.test(path) && path !== "data/release-info.js") {
        expect(prior.files[path], path).toMatchObject(meta);
      }
    }
    const pdfs = manifest.files.filter(f => f.path.endsWith(".pdf"));
    expect(pdfs).toHaveLength(26);
    for (const pdf of pdfs) {
      const part = await get(pdf.path, { headers: { range: "bytes=0-7" } });
      expect(part.status, pdf.path).toBe(206);
      expect(part.headers.get("content-range")).toBe(`bytes 0-7/${pdf.bytes}`);
      expect(await part.text()).toMatch(/^%PDF-/);
    }
    const release = new Uint8Array(await (await get("CURRENT_RELEASE.json")).arrayBuffer());
    expect(sha(release)).toBe("04ae5372de495b525cb7b2998b36e67b6cea3b18f85e3dffd2b54adcc1ba8d7d");
    expect(JSON.parse(Buffer.from(release).toString())).toMatchObject({
      coreVersion: "1.1.0", sources: 396, nodes: 559, elements: 10795, newEngineeringApproval: false
    });
  });

  it("serves the exact engine, library recovery and local fonts within the new scope", async () => {
    expect(HEAD).toBe(GET);
    const html = await get("index.html", { method: "HEAD" });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-security-policy")).toContain("font-src " + origin + prefix);
    expect(html.headers.get("content-security-policy")).not.toContain("/model-assets/troitsk-r25v12-18/");
    expect(html.headers.get("cache-control")).toBe("public, no-cache");
    const font = await get("assets/fonts/GolosText-Regular.woff2");
    expect(font.headers.get("content-type")).toBe("font/woff2");
    expect(Buffer.from(await font.arrayBuffer()).subarray(0, 4).toString()).toBe("wOF2");
    const worker = await get("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe(prefix);
    expect(sha(new Uint8Array(await worker.arrayBuffer()))).toBe("9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259");
    const self: Record<string, unknown> = {};
    runInNewContext(await (await get("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_VERSION).toBe("site-86658188a416");
    const engine = await (await get("assets/atlas-engine.js")).text();
    expect(sha(Buffer.from(engine))).toBe("b0ba83c888a429c342f1baf60eab32d1be2bd65c2936d2552c3875922b50f32a");
    expect(engine).toContain("sourceLinks:o=>albumLinks(o)");
    expect(await (await get("library.html")).text()).toContain("assets/source-recovery/runtime.js");
    const window: Record<string, string> = {};
    runInNewContext(await (await get("data/nodes.js")).text(), { window }, { timeout: 1000 });
    expect(JSON.parse(gunzipSync(Buffer.from(window.ATLAS_NODES_GZIP, "base64")).toString()).nodes).toHaveLength(559);
    expect((await get("engineering/private.pdf")).status).toBe(404);
    expect((await get("qa/index.json")).status).toBe(404);
  });
});
