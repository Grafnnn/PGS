import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { GET as alias } from "@/app/models/[slug]/route";
import { GET, HEAD } from "@/app/model-assets/goluboe-vodovod-r1-2-field-pilot-01/[...asset]/route";
import { GET as currentGET } from "@/app/model-assets/goluboe-vodovod-r1-2-field-pilot-02/[...asset]/route";
import { GET as uxGET } from "@/app/model-assets/goluboe-vodovod-r1-2-field-pilot-02-ux-01/[...asset]/route";
import { legacyAtlasDestination, legacyAtlasWorker } from "./project-atlas-legacy";

const origin = "https://pgs.local";
const prefix = "/model-assets/goluboe-vodovod-r1-2-field-pilot-01/";
const current = "/model-assets/goluboe-vodovod-r1-2-field-pilot-02/";
const ux = "/model-assets/goluboe-vodovod-r1-2-field-pilot-02-ux-01/";
const primary = "/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/";
const slug = "goluboe-vodovod-field-pilot";
const pathUrl = (name: string) => origin + prefix + name.split("/").map(encodeURIComponent).join("/");
const get = (name: string, init?: RequestInit) => GET(new Request(pathUrl(name), init), { params: { asset: name.split("/") } });
const digest = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("Goluboe field pilot publication", () => {
  it.each([
    ["", ""],
    ["field=1&pk=21%2C5", "?field=1&pk=21.5"],
    ["field=1&xing=xing-v-st-200&pk=21.5", "?field=1&xing=xing-v-st-200"],
    ["pdFieldPk=21.5&pdFieldMeasure=invert&pdFieldEdition=R1.2-field-1&next=https://example.test", "?pdFieldPk=21.5&pdFieldMeasure=invert&pdFieldEdition=R1.2-field-1"],
    ["pdFieldPk=21.5&pdFieldMeasure=invert&pdFieldEdition=unknown", "?pdFieldPk=21.5"],
    ["field=1&pk=46&xing=unknown&pdFieldPk=-1&pdFieldMeasure=invert", "?field=1"],
    ["pk=21.5&xing=xing-v-st-200", ""]
  ])("passes only pilot query parameters: %s", async (query, target) => {
    const r = await alias(new Request(origin + "/models/" + slug + "?" + query), { params: { slug } });
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-6/index.html" + target);
    expect(r.headers.has("set-cookie")).toBe(false);
  });

  it("leaves the primary release and legacy route isolation unchanged", async () => {
    const r = await alias(new Request(origin + "/models/goluboe-vodovod?field=1&pk=21.5&pdFieldPk=21.5"), { params: { slug: "goluboe-vodovod" } });
    expect(r.headers.get("location")).toBe(primary + "index.html");
    expect(legacyAtlasDestination(new URL(origin + prefix + "index.html"))).toBeNull();
    expect(legacyAtlasWorker(new URL(origin + prefix + "service-worker.js"))).toBeNull();
    expect(legacyAtlasDestination(new URL(origin + current + "index.html"))).toBeNull();
  });

  it("publishes the exact Field 02 payload while retaining a distinct Field 01 worker scope", async () => {
    const served = (name: string) => currentGET(new Request(origin + current + name.split("/").map(encodeURIComponent).join("/")), {
      params: { asset: name.split("/") }
    });
    const manifestText = await (await served("MANIFEST.json")).text();
    expect(digest(manifestText)).toBe("1c7ef217bae4f1d5183e4b0f446493dabdf92ef01d15cd9e940585d0f230d301");
    const manifest = JSON.parse(manifestText);
    expect(manifest.files).toHaveLength(335);
    expect(manifest.sourceTreeSha256).toBe("331a5359b68260f997903828d04525c0c29374fe630a66caea92b42517d6331c");
    for (const {path, bytes, sha256} of manifest.files) {
      const response = await served(path);
      expect(response.status, path).toBe(200);
      const data = new Uint8Array(await response.arrayBuffer());
      expect(data.byteLength, path).toBe(bytes);
      expect(digest(data), path).toBe(sha256);
    }
    const worker = await served("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe(current);
    expect(worker.headers.get("content-security-policy")).not.toContain(prefix);
    expect(digest(await worker.text())).toBe(digest(await (await get("service-worker.js")).text()));
    const self: Record<string, any> = {};
    runInNewContext(await (await served("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_VERSION).toBe("field-ff8a08a4414d");
    const overlay = "project/field-pilot-overlay.js";
    expect(self.ATLAS_OFFLINE_FILES).toContain(overlay);
    expect(await (await served("project/config.js")).text()).toContain(overlay);
    expect((await get(overlay)).status).toBe(404);
    for (const name of ["SHA256SUMS", "qa/report.json", "ПАСПОРТ_ПОСТАВКИ.json"]) expect((await served(name)).status).toBe(404);
  });

  it("serves the independently sealed UX release and isolates its cache", async () => {
    const served = (name: string) => uxGET(new Request(origin + ux + name.split("/").map(encodeURIComponent).join("/")), {
      params: { asset: name.split("/") }
    });
    const metadata = await served("MANIFEST.json");
    expect(metadata.status).toBe(200);
    const manifestText = await metadata.text();
    expect(digest(manifestText)).toBe("64862d0b28d32c43469f3b1ef3a7c77590c41d6d976ec59bd1a74c486e2f67b5");
    const manifest = JSON.parse(manifestText);
    expect(manifest.files).toHaveLength(335);
    for (const {path, bytes, sha256} of manifest.files) {
      const response = await served(path);
      expect(response.status, path).toBe(200);
      const data = new Uint8Array(await response.arrayBuffer());
      expect(data.byteLength, path).toBe(bytes);
      expect(digest(data), path).toBe(sha256);
    }
    const worker = await served("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe(ux);
    expect(worker.headers.get("content-security-policy")).not.toContain(current);
    expect(digest(await worker.text())).toBe("9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259");
    const self: Record<string, any> = {};
    runInNewContext(await (await served("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_VERSION).toBe("field-e58fc482c96a");
    for (const name of ["SHA256SUMS", "ИТОГ_ПРОВЕРКИ.md", "qa/report.json"]) expect((await served(name)).status).toBe(404);
    expect(legacyAtlasDestination(new URL(origin + ux + "index.html"))).toBeNull();
  });

  it("serves the sealed pilot, only its manifest files, and a scoped worker", async () => {
    expect(HEAD).toBe(GET);
    const manifestText = await (await get("MANIFEST.json")).text();
    expect(digest(manifestText)).toBe("0fd2700bcab9c57b90b9af96cf55413f24a5f70bf2c70649e6429a9210155768");
    const manifest = JSON.parse(manifestText);
    expect(manifest.files).toHaveLength(334);
    for (const file of manifest.files) {
      const response = await get(file.path);
      expect(response.status, file.path).toBe(200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(digest(bytes), file.path).toBe(file.sha256);
    }
    for (const name of ["SHA256SUMS", "ПРОЧИТАЙТЕ.md", "ПРОТОКОЛ_SHA256.json", "qa/report.json"]) {
      expect((await get(name)).status).toBe(404);
    }
    const worker = await get("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe(prefix);
    expect(worker.headers.get("content-security-policy")).toContain(origin + prefix);
    expect(worker.headers.get("content-security-policy")).not.toContain(primary);
    const workerBytes = new Uint8Array(await worker.arrayBuffer());
    expect(digest(workerBytes)).toBe("9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259");
    const self: Record<string, any> = {};
    runInNewContext(await (await get("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_VERSION).toBe("field-6294cf6471b1");
    expect(self.ATLAS_OFFLINE_SIZES["service-worker.js"]).toBe(workerBytes.byteLength);
  });

  it("serves offline TKR under literal and escaped parentheses, with full and range responses", async () => {
    const pdf = "albums/Раздел ПД№3 - том 3 (5).pdf";
    const actual = new Uint8Array(await (await get(pdf)).arrayBuffer());
    const stored = pathUrl(pdf);
    let cacheKey = stored;
    const network = vi.fn(async () => { throw new TypeError("network offline"); });
    const listeners: Record<string, (event: { request: Request; respondWith(p: Promise<Response>): void }) => void> = {};
    const self = { registration: { scope: origin + prefix }, addEventListener: (name: string, fn: typeof listeners[string]) => { listeners[name] = fn; } };
    const cache = { match: vi.fn(async (value: string, options?: { ignoreSearch?: boolean }) =>
      (options?.ignoreSearch ? value.split("?")[0] : value) === cacheKey
        ? new Response(actual, { headers: { "content-type": "application/pdf" } }) : undefined) };
    const open = vi.fn(async (_cacheName: string) => cache);
    const manifest = await (await get("assets/offline-manifest.js")).text();
    const worker = await (await get("service-worker.js")).text();
    runInNewContext(manifest + "\n" + worker, { self, URL, Response, importScripts() {}, caches: { open }, fetch: network }, { timeout: 1000 });
    function dispatch(url: string, range?: string) {
      let pending: Promise<Response> | undefined;
      const request = new Request(url, range ? { headers: { range } } : undefined);
      listeners.fetch({ request, respondWith(p) { pending = p; } });
      return pending;
    }
    const escaped = stored.replace("(", "%28").replace(")", "%29");
    expect(escaped).not.toBe(stored);
    for (const key of [stored, escaped]) {
      cacheKey = key;
      for (const url of [stored, escaped, escaped + "?source=field"]) {
        const complete = await dispatch(url);
        expect(complete?.status).toBe(200);
        expect(digest(new Uint8Array(await complete!.arrayBuffer()))).toBe(digest(actual));
        const partial = await dispatch(url, "bytes=0-7");
        expect(partial?.status).toBe(206);
        expect(partial?.headers.get("content-range")).toBe("bytes 0-7/" + actual.byteLength);
        expect(await partial?.text()).toMatch(/^%PDF-/);
        expect((await dispatch(url, "bytes=999999999-"))?.status).toBe(416);
      }
    }
    expect(dispatch(origin + primary + "index.html")).toBeUndefined();
    expect(dispatch(origin + "/dashboard")).toBeUndefined();
    expect(open.mock.calls.every(([key]) => String(key).includes(encodeURIComponent(prefix)))).toBe(true);
  });
});
