import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { GET, HEAD } from "@/app/model-assets/goluboe-vodovod-r1-3/[...asset]/route";
import { GET as alias } from "@/app/models/[slug]/route";
import { legacyAtlasDestination, legacyAtlasWorker } from "./project-atlas-legacy";

const origin = "https://pgs.local";
const release = "/model-assets/goluboe-vodovod-r1-3/";
const snapshot = "/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/";
const priorPilot = "/model-assets/goluboe-vodovod-r1-2-field-pilot-02-ux-01/";
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const get = (name: string, init?: RequestInit) =>
  GET(new Request(origin + release + name.split("/").map(encodeURIComponent).join("/"), init), { params: { asset: name.split("/") } });

describe("Goluboe R1.3 publication", () => {
  it("switches only the pilot alias while preserving immutable assets", async () => {
    for (const prefix of [release, snapshot, priorPilot]) {
      expect(legacyAtlasDestination(new URL(origin + prefix + "index.html"))).toBeNull();
      expect(legacyAtlasWorker(new URL(origin + prefix + "service-worker.js"))).toBeNull();
    }
    const slug = "goluboe-vodovod-field-pilot";
    const response = await alias(new Request(origin + "/models/" + slug + "?field=1&pk=21.5"), { params: { slug } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(release + "index.html?field=1&pk=21.5");
    const main = "goluboe-vodovod";
    const primary = await alias(new Request(origin + "/models/" + main), { params: { slug: main } });
    expect(primary.status).toBe(307);
    expect(primary.headers.get("location")).toBe(snapshot + "index.html");
  });

  it("serves all 338 hashed items and scopes its separate offline release", async () => {
    expect(HEAD).toBe(GET);
    const manifestResponse = await get("MANIFEST.json");
    expect(manifestResponse.status).toBe(200);
    const serialized = await manifestResponse.text();
    expect(hash(serialized)).toBe("c967ddb475389106463e5bea52511f1fbf92cfef971aa4ac23c5c74de70f0442");
    const manifest = JSON.parse(serialized);
    expect(manifest.files).toHaveLength(338);
    expect(manifest.sourceTreeSha256).toBe("4820d30afa9aad4a4b7d465a465c9ccd60b82c73078730787d77c7352d0367c5");
    for (const file of manifest.files) {
      const r = await get(file.path);
      expect(r.status, file.path).toBe(200);
      expect(r.headers.has("set-cookie"), file.path).toBe(false);
      const bytes = new Uint8Array(await r.arrayBuffer());
      expect(bytes.byteLength, file.path).toBe(file.bytes);
      expect(hash(bytes), file.path).toBe(file.sha256);
    }
    const worker = await get("service-worker.js");
    expect(worker.headers.get("service-worker-allowed")).toBe(release);
    expect(worker.headers.get("content-security-policy")).not.toContain(snapshot);
    expect(hash(await worker.text())).toBe("9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259");
    const self: Record<string, any> = {};
    runInNewContext(await (await get("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_VERSION).toBe("field-01319f828fba");
    expect(self.ATLAS_OFFLINE_FILES).toEqual(expect.arrayContaining([
      "project/underground-geometry-data.js", "project/underground-mesh.js", "project/underground-view.js"
    ]));
    expect((await get("MANIFEST_SHA256_пакета.txt")).status).toBe(404);
    expect((await get("qa/report.json")).status).toBe(404);
  });
});
