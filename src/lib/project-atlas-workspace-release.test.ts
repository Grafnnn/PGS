import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { GET as goluboe } from "@/app/model-assets/goluboe-vodovod-r1-18/[...asset]/route";
import { GET as priorGoluboe } from "@/app/model-assets/goluboe-vodovod-r1-17-2/[...asset]/route";
import { GET as troitsk } from "@/app/model-assets/troitsk-r25v12-22/[...asset]/route";
import { GET as priorTroitsk } from "@/app/model-assets/troitsk-r25v12-21/[...asset]/route";

const origin = "https://pgs-frankfurt.onrender.com";
type Serve = typeof goluboe;
type Manifest = { files: { path: string; bytes: number; sha256: string }[] };
const request = (serve: Serve, prefix: string, file: string, init?: RequestInit) =>
  serve(new Request(origin + prefix + file, init), { params: { asset: file.split("/") } });
const albums = (manifest: Manifest) => manifest.files.filter(file => file.path.endsWith(".pdf"))
  .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

it.each([
  { serve: goluboe, prior: priorGoluboe, prefix: "/model-assets/goluboe-vodovod-r1-18/",
    old: "/model-assets/goluboe-vodovod-r1-17-2/", files: 412, pdfs: 6,
    pin: "b1e66bb0903337e5b4b23deca50a21b3ba7e36060d8e1b51085df1f89c686d61", cache: "field-899738c6272e" },
  { serve: troitsk, prior: priorTroitsk, prefix: "/model-assets/troitsk-r25v12-22/",
    old: "/model-assets/troitsk-r25v12-21/", files: 4688, pdfs: 26,
    pin: "51cb479ffb336db54cd151ef30c9f547fdda6bd8e8b547998c78fb697fdb4022", cache: "site-76cc6616f064" }
])("serves the exact independent workspace release under $prefix", async ({ serve, prior, prefix, old, files, pdfs, pin, cache }) => {
  const reply = await request(serve, prefix, "MANIFEST.json");
  expect(reply.status).toBe(200);
  const bytes = new Uint8Array(await reply.arrayBuffer());
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(pin);
  const manifest = JSON.parse(new TextDecoder().decode(bytes)) as Manifest;
  expect(manifest.files).toHaveLength(files);
  const previous = await request(prior, old, "MANIFEST.json");
  expect(previous.status).toBe(200);
  expect(albums(manifest)).toHaveLength(pdfs);
  expect(albums(manifest)).toEqual(albums(await previous.json() as Manifest));

  const index = await request(serve, prefix, "index.html", { method: "HEAD" });
  expect(index.status).toBe(200);
  expect(index.headers.get("content-security-policy")).toContain("font-src " + origin + prefix);
  expect(index.headers.get("content-security-policy")).not.toContain(origin + old);
  expect(index.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  const worker = await request(serve, prefix, "service-worker.js", { method: "HEAD" });
  expect(worker.status).toBe(200);
  expect(worker.headers.get("service-worker-allowed")).toBe(prefix);
  expect((await request(prior, old, "service-worker.js", { method: "HEAD" })).headers.get("service-worker-allowed")).toBe(old);
  const offline = await request(serve, prefix, "assets/offline-manifest.js");
  expect(offline.status).toBe(200);
  expect(await offline.text()).toContain(cache);

  const sample = albums(manifest)[0]!;
  const pdf = await request(serve, prefix, sample.path, { headers: { range: "bytes=0-7" } });
  expect(pdf.status).toBe(206);
  expect(pdf.headers.get("content-type")).toBe("application/pdf");
  expect(pdf.headers.get("content-range")).toBe(`bytes 0-7/${sample.bytes}`);
  expect(await pdf.text()).toMatch(/^%PDF-/);
  expect((await request(serve, prefix, sample.path, { headers: { range: `bytes=${sample.bytes}-` } })).status).toBe(416);
});
