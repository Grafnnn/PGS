import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { GET, HEAD } from "@/app/model-assets/troitsk-r25v12-21/[...asset]/route";

const prefix = "/model-assets/troitsk-r25v12-21/";
const origin = "https://pgs.local";
const get = (file: string, init?: RequestInit) => GET(
  new Request(origin + prefix + file.split("/").map(encodeURIComponent).join("/"), init),
  { params: { asset: file.split("/") } }
);
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
type FileMeta = { bytes: number; sha256: string };
const index = async (version: string): Promise<Record<string, FileMeta>> =>
  JSON.parse(await readFile(`src/assets/project-models/troitsk-r25${version}/index.json`, "utf8")).files;

describe("Troitsk V12.21 public delivery", () => {
  it("delivers the sealed manifest without changing drawings or project data", async () => {
    const response = await get("MANIFEST.json");
    expect(response.status).toBe(200);
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(digest(bytes)).toBe("55150f73ed68d268578572e382c13ed28f6b41d52a52722ce14d29c78226ecb8");
    const manifest: { release: string; files: (FileMeta & { path: string })[] } = JSON.parse(Buffer.from(bytes).toString());
    expect(manifest.release).toBe("V12_21");
    expect(manifest.files).toHaveLength(4672);
    const [previous, current] = await Promise.all([index("v12-20"), index("v12-21")]);
    expect(Object.keys(current)).toHaveLength(4673);
    const newPreview = "source_album/previews/AR_full_page_016-w864.jpg";
    expect(Object.keys(current).filter(path => !previous[path])).toEqual([newPreview]);
    expect(Object.keys(previous).filter(path => !current[path])).toEqual([]);
    for (const { path, ...meta } of manifest.files) {
      expect(current[path], path).toMatchObject(meta);
      if (/^(data|drawings|albums|source_album)\//.test(path) && path !== "data/release-info.js" && path !== newPreview) {
        expect(previous[path], path).toMatchObject(meta);
      }
    }
    const preview = await get(newPreview);
    expect(preview.headers.get("content-type")).toBe("image/jpeg");
    expect(digest(new Uint8Array(await preview.arrayBuffer()))).toBe("1a16a295933beec4887697313906fd13508e0c7edcf9d538afe089f37425df02");
    const pdfs = manifest.files.filter(f => f.path.endsWith(".pdf"));
    expect(pdfs).toHaveLength(26);
    for (const pdf of pdfs) {
      const partial = await get(pdf.path, { headers: { range: "bytes=0-7" } });
      expect(partial.status, pdf.path).toBe(206);
      expect(partial.headers.get("content-range")).toBe(`bytes 0-7/${pdf.bytes}`);
      expect(await partial.text()).toMatch(/^%PDF-/);
    }
  });

  it("isolates offline and font scope and reports Core 1.1.3 consistently", async () => {
    expect(HEAD).toBe(GET);
    const html = await get("index.html", { method: "HEAD" });
    expect(html.status).toBe(200);
    expect(html.headers.get("content-security-policy")).toContain("font-src " + origin + prefix);
    expect(html.headers.get("content-security-policy")).not.toContain("/model-assets/troitsk-r25v12-20/");
    expect(html.headers.get("cache-control")).toBe("public, no-cache");
    const font = await get("assets/fonts/GolosText-Regular.woff2");
    expect(font.headers.get("content-type")).toBe("font/woff2");
    expect(Buffer.from(await font.arrayBuffer()).subarray(0, 4).toString()).toBe("wOF2");
    const worker = await get("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe(prefix);
    expect(digest(new Uint8Array(await worker.arrayBuffer()))).toBe("9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259");
    const self: { ATLAS_OFFLINE_VERSION?: string; ATLAS_OFFLINE_FILES?: string[] } = {};
    runInNewContext(await (await get("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_VERSION).toBe("site-94b2aa1c019c");
    expect(self.ATLAS_OFFLINE_FILES).toHaveLength(4639);
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release).toMatchObject({ coreVersion: "1.1.3", sources: 396, nodes: 559, newEngineeringApproval: false });
    const shell = await (await get("assets/atlas-shell.js")).text();
    expect([...shell.matchAll(/^\s*window\.ATLAS_CORE_VERSION\s*=\s*["']([^"']+)["'];/gm)].map(match => match[1])).toEqual([release.coreVersion]);
    const window: { ATLAS_PROJECT?: { core_version?: string } } = {};
    runInNewContext(await (await get("project/config.js")).text(), { window }, { timeout: 1000 });
    expect(window.ATLAS_PROJECT?.core_version).toBe(release.coreVersion);
    expect((await get("engineering/private.pdf")).status).toBe(404);
    expect((await get("qa/index.json")).status).toBe(404);
  });
});
