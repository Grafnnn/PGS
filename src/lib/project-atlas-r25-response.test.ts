import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { projectAtlasR25Response, ATLAS_R25_PREFIX } from "./project-atlas-r25-response";

const base = "https://pgs.local" + ATLAS_R25_PREFIX;
const get = (name: string, headers?: HeadersInit, method = "GET") => projectAtlasR25Response(new Request(base + name, { headers, method }), name.split("/"));
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("immutable R25v5 publication", () => {
  it("serves the sealed entrypoint byte-for-byte, with and without gzip", async () => {
    const index = JSON.parse(await readFile("src/assets/project-models/troitsk-r25v5/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(30614);
    for (const encoding of ["identity", "gzip"]) {
      const response = await get("index.html", { "Accept-Encoding": encoding });
      expect(response.status).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(hash(encoding === "gzip" ? gunzipSync(bytes) : bytes)).toBe(index.files["index.html"].sha256);
      expect(response.headers.get("content-security-policy")).toContain(`connect-src ${base}`);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });
  it("preserves release limitations, catalogue totals and service worker scope", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release.release).toBe("R25_FINAL_V5");
    expect(release.catalogue_packages).toBe(2760);
    expect(release.new_world_placements).toBe(0);
    expect(release.limitations.join(" ")).toContain("1395");
    const sw = await get("service-worker.js", undefined, "HEAD");
    expect(sw.headers.get("service-worker-allowed")).toBe(ATLAS_R25_PREFIX);
    expect(await sw.text()).toBe("");
  });
  it("supports PDF byte ranges and rejects impossible ranges", async () => {
    const name = "source_album/documents/AS2_last_full.pdf";
    const response = await get(name, { range: "bytes=0-15" });
    expect(response.status).toBe(206);
    expect((await response.arrayBuffer()).byteLength).toBe(16);
    expect((await get(name, { range: "bytes=999999999-" })).status).toBe(416);
    expect((await get(name, { range: "bytes=-0" })).status).toBe(416);
    const head = await get(name, undefined, "HEAD");
    expect((await get(name, { "If-None-Match": head.headers.get("etag")! })).status).toBe(304);
  });
  it.each(["../.env", "assets/../../.env", "__proto__", "index.json", "no-such-file", "assets\\secret", "assets//file"])("denies paths outside the manifest: %s", async (name) => {
    expect((await get(name)).status).toBe(404);
  });
});
