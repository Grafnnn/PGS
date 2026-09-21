import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { projectAtlasR25Response } from "./project-atlas-r25-response";

const base = "https://pgs.local/model-assets/troitsk-r25v8/";
const get = (name: string, headers?: HeadersInit, method = "GET") => projectAtlasR25Response(new Request(base + name, { headers, method }), name.split("/"), "v8");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("immutable R25v8 publication", () => {
  it("serves original bytes with independent caching and no authentication", async () => {
    const index = JSON.parse(await readFile("src/assets/project-models/troitsk-r25v8/index.json", "utf8"));
    expect(Object.keys(index.files)).toHaveLength(30646);
    expect(index.archiveSha256).toBe("b4522e8690c9e9dce03b1109ada99fee293dd3d5bd55bfb1b74a7459de6c7b5e");
    for (const encoding of ["identity", "gzip"]) {
      const response = await get("index.html", { "Accept-Encoding": encoding });
      expect(response.status).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(hash(encoding === "gzip" ? gunzipSync(bytes) : bytes)).toBe(index.files["index.html"].sha256);
      expect(response.headers.get("content-security-policy")).toContain(`connect-src ${base}`);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
  });
  it("preserves source limitations and isolates service worker scope from v5", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release.release).toBe("R25_FINAL_V8");
    expect(release.catalogue_packages).toBe(2760);
    expect(release.active_world_bodies).toBe(10412);
    expect(release.new_world_placements).toBe(0);
    expect(release.remaining_queue_count).toBe(47);
    expect(release.limitations.join(" ")).toContain("2566");
    const sw = await get("service-worker.js", undefined, "HEAD");
    expect(sw.headers.get("service-worker-allowed")).toBe("/model-assets/troitsk-r25v8/");
    const old = await projectAtlasR25Response(new Request("https://pgs.local/model-assets/troitsk-r25v5/CURRENT_RELEASE.json"), ["CURRENT_RELEASE.json"]);
    expect((await old.json()).release).toBe("R25_FINAL_V5");
  });
  it("supports drawings, history, PDF ranges, and conditional requests", async () => {
    expect((await get("HISTORY_MATERIALS.html")).status).toBe(200);
    expect((await get("UNPLACED.html")).status).toBe(200);
    expect((await (await get("qa/final_v8/VERIFICATION.json")).json()).release).toBe("R25_FINAL_V8");
    const name = "source_album/documents/AS2_last_full.pdf";
    const response = await get(name, { range: "bytes=0-15" });
    expect(response.status).toBe(206);
    expect((await response.arrayBuffer()).byteLength).toBe(16);
    expect((await get(name, { range: "bytes=999999999-" })).status).toBe(416);
    const head = await get(name, undefined, "HEAD");
    expect((await get(name, { "If-None-Match": head.headers.get("etag")! })).status).toBe(304);
  });
  it.each(["../.env", "__proto__", "index.json", "no-such-file", "assets//file"])("rejects unlisted paths: %s", async name => {
    expect((await get(name)).status).toBe(404);
  });
});
