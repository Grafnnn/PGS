import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { projectAtlasR25Response } from "./project-atlas-r25-response";

const prefix = "https://pgs.local/model-assets/troitsk-r25v8-ui1/";
const get = (name: string, headers?: HeadersInit, method = "GET") => projectAtlasR25Response(new Request(prefix + name, { headers, method }), name.split("/"), "v8-ui1");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("Atlas UI release on the sealed V8 base", () => {
  it("preserves every engineering asset and old V8 route", async () => {
    const base = JSON.parse(await readFile("src/assets/project-models/troitsk-r25v8/index.json", "utf8"));
    const ui = JSON.parse(await readFile("src/assets/project-models/troitsk-r25v8-ui1/index.json", "utf8"));
    for (const [name, asset] of Object.entries(base.files)) {
      expect(ui.files[name], name).toBeDefined();
      if (/^(data|source_album|engineering|provenance|history_recovered|packages)\//.test(name)) {
        expect(ui.files[name], name).toEqual({ ...(asset as object), source: "v8" });
      }
    }
    const old = await projectAtlasR25Response(new Request("https://pgs.local/model-assets/troitsk-r25v8/CURRENT_RELEASE.json"), ["CURRENT_RELEASE.json"], "v8");
    expect((await old.json()).release).toBe("R25_FINAL_V8");
  });
  it("serves the exact UI bytes in identity and gzip without a session", async () => {
    const expected = await readFile("src/assets/atlas-ui/20260922/index.html");
    for (const encoding of ["identity", "gzip"]) {
      const response = await get("index.html", { "Accept-Encoding": encoding });
      expect(response.status).toBe(200);
      const bytes = Buffer.from(await response.arrayBuffer());
      expect(hash(encoding === "gzip" ? gunzipSync(bytes) : bytes)).toBe(hash(expected));
      expect(response.headers.get("content-security-policy")).toContain(`connect-src ${prefix}`);
      expect(response.headers.has("set-cookie")).toBe(false);
    }
    expect((await get("assets/atlas-mark-v3.png")).headers.get("content-type")).toBe("image/png");
    expect((await (await get("assets/prototype.js")).text())).toContain("Данные V8 · интерфейс 22.09.2026");
  });
  it("reports UI provenance without claiming new engineering acceptance", async () => {
    const release = await (await get("CURRENT_RELEASE.json")).json();
    expect(release.release).toBe("R25_V8_UI_20260922");
    expect(release.active_world_bodies).toBe(10412);
    expect(release.new_world_placements).toBe(0);
    expect(release.remaining_queue_count).toBe(47);
    expect(release.limitations.join(" ")).toContain("2566");
    const ui = await (await get("UI_RELEASE.json")).json();
    expect(ui.new_engineering_approval).toBe(false);
    expect(ui.engineering_data_changed).toBe(false);
  });
  it("streams inherited PDFs with ranges and independent service worker scope", async () => {
    const response = await get("source_album/documents/AS2_last_full.pdf", { range: "bytes=0-15" });
    expect(response.status).toBe(206);
    expect((await response.text()).startsWith("%PDF-")).toBe(true);
    const sw = await get("service-worker.js", undefined, "HEAD");
    expect(sw.headers.get("service-worker-allowed")).toBe("/model-assets/troitsk-r25v8-ui1/");
    const head = await get("index.html", undefined, "HEAD");
    expect((await get("index.html", { "If-None-Match": head.headers.get("etag")! })).status).toBe(304);
  });
  it.each(["../.env", "__proto__", "index.json", "ui.bin", "assets//file", "integrity.json"])("rejects unlisted paths: %s", async name => {
    expect((await get(name)).status).toBe(404);
  });
});
