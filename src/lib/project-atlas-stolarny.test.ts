import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { GET as publicModel } from "@/app/models/[slug]/route";
import { GET as asset } from "@/app/model-assets/stolarny-r0-3/[...asset]/route";

const origin = "https://pgs-frankfurt.onrender.com";
const prefix = "/model-assets/stolarny-r0-3/";
const get = (file: string, init?: RequestInit) => asset(new Request(origin + prefix + file, init), {
  params: { asset: file.split("/") }
});

it("opens only the explicit Stolarny alias and scopes its assets to this release", async () => {
  const go = (slug: string) => publicModel(new Request(origin + "/models/" + slug), { params: { slug } });
  const alias = await go("stolarny");
  expect(alias.status).toBe(307);
  expect(alias.headers.get("location")).toBe(prefix + "index.html");
  expect((await go("stolarny-r0-3")).status).toBe(404);

  for (const page of ["index.html", "project/stolarny-plan.html", "project/stolarny-roof.html", "catalogue.html"]) {
    const response = await get(page, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(response.headers.get("content-security-policy")).toContain("font-src " + origin + prefix);
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  }
  const worker = await get("service-worker.js", { method: "HEAD" });
  expect(worker.status).toBe(200);
  expect(worker.headers.get("service-worker-allowed")).toBe(prefix);
  expect((await get("assets/fonts/GolosText-Regular.woff2", { method: "HEAD" })).headers.get("content-type")).toBe("font/woff2");
  expect((await get("STOLARNY_3D_ATLAS_SOURCE/index.html")).status).toBe(404);
});

it("keeps the pinned source inventory and serves all 21 sealed drawing PDFs with byte ranges", async () => {
  const manifestResponse = await get("MANIFEST.json");
  expect(manifestResponse.status).toBe(200);
  const json = await manifestResponse.text();
  expect(createHash("sha256").update(json).digest("hex")).toBe("69dcce8f3079a6d165ccf2171fb5b6c0b561b393f73f2d8faf52b5b23fc62ad0");
  const manifest = JSON.parse(json) as { release: string; files: { path: string; bytes: number; sha256: string }[] };
  expect(manifest.release).toBe("STOLARNY_R0_3");
  expect(manifest.files).toHaveLength(1886);
  const albums = manifest.files.filter(file => file.path.endsWith(".pdf"));
  expect(albums).toHaveLength(21);
  for (const file of albums) {
    const range = await get(file.path, { headers: { Range: "bytes=0-7" } });
    expect(range.status, file.path).toBe(206);
    expect(range.headers.get("etag")).toBe('"' + file.sha256 + '"');
    expect(range.headers.get("content-type")).toBe("application/pdf");
    expect(range.headers.get("content-range")).toBe(`bytes 0-7/${file.bytes}`);
    expect(await range.text()).toMatch(/^%PDF-/);
  }
  const invalid = await get("albums/vpt-01.pdf", { headers: { Range: "bytes=999999999-" } });
  expect(invalid.status).toBe(416);
});
