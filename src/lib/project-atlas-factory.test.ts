import { describe, expect, it } from "vitest";
import { GET as getAsset } from "@/app/model-assets/proizvodstvenny-korpus-r1-0/[...asset]/route";
import { GET as getAlias } from "@/app/models/[slug]/route";
import { getProject3dModel } from "./project-3d-model";

const slug = "proizvodstvenny-korpus";
const origin = "https://pgs.local";
const prefix = "/model-assets/proizvodstvenny-korpus-r1-0/";
const asset = (file: string, headers?: HeadersInit) =>
  getAsset(new Request(origin + prefix + file, { headers }), { params: { asset: file.split("/") } });

describe("Factory atlas R1.0", () => {
  it("publishes only the named atlas alias and preserves private project lookup", async () => {
    const response = await getAlias(new Request(origin + "/models/" + slug + "?next=https://offsite.test"), { params: { slug } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(prefix + "index.html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const unknown = await getAlias(new Request(origin + "/models/" + slug + "-r0-3"), { params: { slug: slug + "-r0-3" } });
    expect(unknown.status).toBe(404);
    expect(getProject3dModel({ id: slug, name: "Factory atlas" })).toBeNull();
  });

  it("serves the sealed manifest and scopes the worker and local fonts", async () => {
    const manifest = await asset("MANIFEST.json");
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("etag")).toBe('"28a54194b8e2f7f4ebc40b6648422602b116a7177e633f036cefe385d01595a9"');
    expect((await manifest.json()).files).toHaveLength(35229);
    const html = await asset("index.html");
    expect(html.headers.get("content-security-policy")).toContain("font-src " + origin + prefix);
    await html.body?.cancel();
    const worker = await asset("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe(prefix);
    expect(worker.headers.get("cache-control")).toBe("public, no-cache");
    await worker.body?.cancel();
    const font = await asset("assets/fonts/GolosText-Regular.woff2");
    expect(font.headers.get("content-type")).toBe("font/woff2");
    await font.body?.cancel();
  });

  it("returns byte ranges from drawings, not files from other projects", async () => {
    const pdf = await asset("albums/pdf-04.pdf", { range: "bytes=0-4" });
    expect(pdf.status).toBe(206);
    expect(pdf.headers.get("content-range")).toMatch(/^bytes 0-4\/\d+$/);
    expect(await pdf.text()).toBe("%PDF-");
    expect((await asset("albums/pdf-04.pdf", { range: "bytes=999999999-" })).status).toBe(416);
    expect((await asset("albums/absent.pdf")).status).toBe(404);
    expect((await asset("albums/../secret")).status).toBe(404);
  });

  it("serves the corrected drawing links in the remarks data", async () => {
    const response = await asset("data/rd_remarks_final.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("etag")).toBe('"47d6ddea3f3502fd5530a34f94d7721f4ee2eb2023215de627c6c6fac5abb63b"');
    const text = await response.text();
    const data = JSON.parse(text.match(/^window\.ATLAS_REMARKS\s*=\s*(\{.*\});$/m)![1]);
    const remarks: { id: string; sheet_links: { href: string }[] }[] = data.items;
    expect(remarks).toHaveLength(1034);
    expect(remarks.every(item => item.sheet_links.length > 0)).toBe(true);
    expect(remarks.reduce((count, item) => count + item.sheet_links.length, 0)).toBe(1930);
    expect(remarks.find(item => item.id === "\u041a\u041e\u041b-655")?.sheet_links.map(link => link.href))
      .toEqual(["albums/pdf-07.pdf#page=26", "albums/pdf-04.pdf#page=37"]);
  });
});
