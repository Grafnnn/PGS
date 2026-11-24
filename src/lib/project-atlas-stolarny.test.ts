import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { GET as publicModel } from "@/app/models/[slug]/route";
import { GET as previousAsset } from "@/app/model-assets/stolarny-r0-3/[...asset]/route";
import { GET as intermediateAsset } from "@/app/model-assets/stolarny-r0-4/[...asset]/route";
import { GET as currentAsset } from "@/app/model-assets/stolarny-r0-4-1/[...asset]/route";

const origin = "https://pgs-frankfurt.onrender.com";
const previousPrefix = "/model-assets/stolarny-r0-3/";
const intermediatePrefix = "/model-assets/stolarny-r0-4/";
const currentPrefix = "/model-assets/stolarny-r0-4-1/";
const routes = {
  [previousPrefix]: previousAsset,
  [intermediatePrefix]: intermediateAsset,
  [currentPrefix]: currentAsset
};
type Prefix = keyof typeof routes;
function get(prefix: Prefix, file: string, init?: RequestInit) {
  return routes[prefix](new Request(origin + prefix + file, init), { params: { asset: file.split("/") } });
}

it("switches only the explicit Stolarny alias to R0.4.1", async () => {
  const go = (slug: string) => publicModel(new Request(origin + "/models/" + slug), { params: { slug } });
  const alias = await go("stolarny");
  expect(alias.status).toBe(307);
  expect(alias.headers.get("location")).toBe(currentPrefix + "index.html");
  expect((await go("stolarny-r0-3")).status).toBe(404);
  expect((await go("stolarny-r0-4")).status).toBe(404);
  expect((await go("stolarny-r0-4-1")).status).toBe(404);
});

it.each([previousPrefix, intermediatePrefix, currentPrefix] as const)("serves assets and scopes the worker and fonts to %s", async (prefix) => {
  for (const page of ["index.html", "project/stolarny-plan.html", "project/stolarny-roof.html", "catalogue.html"]) {
    const response = await get(prefix, page, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(response.headers.get("content-security-policy")).toContain("font-src " + origin + prefix);
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  }
  const worker = await get(prefix, "service-worker.js", { method: "HEAD" });
  expect(worker.status).toBe(200);
  expect(worker.headers.get("service-worker-allowed")).toBe(prefix);
  expect((await get(prefix, "assets/fonts/GolosText-Regular.woff2", { method: "HEAD" })).headers.get("content-type")).toBe("font/woff2");
  expect((await get(prefix, "STOLARNY_3D_ATLAS_SOURCE/index.html")).status).toBe(404);
});

async function manifestFor(prefix: Prefix, pin: string) {
  const manifestResponse = await get(prefix, "MANIFEST.json");
  expect(manifestResponse.status).toBe(200);
  const json = await manifestResponse.text();
  expect(createHash("sha256").update(json).digest("hex")).toBe(pin);
  return JSON.parse(json) as { release: string; files: { path: string; bytes: number; sha256: string }[] };
}

it("keeps the sealed inventories and serves the same 21 PDF albums with byte ranges", async () => {
  const previous = await manifestFor(previousPrefix, "69dcce8f3079a6d165ccf2171fb5b6c0b561b393f73f2d8faf52b5b23fc62ad0");
  const intermediate = await manifestFor(intermediatePrefix, "b4b7c9a6fa5bd51aec49ee7260faba28c74d902f144d6c31e99aff926129bc8c");
  const current = await manifestFor(currentPrefix, "1fa55d0063f92f9c5ff86bdb7bffa1703388887cf0f3b28c98d1c23502b5b63f");
  expect(previous.release).toBe("STOLARNY_R0_3");
  expect(previous.files).toHaveLength(1886);
  expect(intermediate.release).toBe("STOLARNY_R0_4");
  expect(intermediate.files).toHaveLength(2963);
  expect(current.release).toBe("STOLARNY_R0_4_1");
  expect(current.files).toHaveLength(3059);
  const authorReport = await get(currentPrefix, "\u041f\u0440\u043e\u0432\u0435\u0440\u043a\u0430_SHA256.json");
  expect(authorReport.status).toBe(200);
  expect(createHash("sha256").update(Buffer.from(await authorReport.arrayBuffer())).digest("hex")).toBe("51eb92949fbfce917f3284083a3651c0202bde3f6b5449e4fd799a0cfdd98de8");
  const albums = current.files.filter(file => file.path.endsWith(".pdf"));
  expect(albums).toEqual(previous.files.filter(file => file.path.endsWith(".pdf")));
  expect(albums).toEqual(intermediate.files.filter(file => file.path.endsWith(".pdf")));
  expect(albums).toHaveLength(21);
  for (const file of albums) {
    const range = await get(currentPrefix, file.path, { headers: { Range: "bytes=0-7" } });
    expect(range.status, file.path).toBe(206);
    expect(range.headers.get("etag")).toBe('"' + file.sha256 + '"');
    expect(range.headers.get("content-type")).toBe("application/pdf");
    expect(range.headers.get("content-range")).toBe(`bytes 0-7/${file.bytes}`);
    expect(await range.text()).toMatch(/^%PDF-/);
  }
  const invalid = await get(currentPrefix, "albums/vpt-01.pdf", { headers: { Range: "bytes=999999999-" } });
  expect(invalid.status).toBe(416);
});
