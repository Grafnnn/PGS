import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { GET, HEAD } from "@/app/model-assets/goluboe-vodovod-r1-3/[...asset]/route";
import { GET as r14GET, HEAD as r14HEAD } from "@/app/model-assets/goluboe-vodovod-r1-4/[...asset]/route";
import { GET as r15GET, HEAD as r15HEAD } from "@/app/model-assets/goluboe-vodovod-r1-5/[...asset]/route";
import { GET as r16GET, HEAD as r16HEAD } from "@/app/model-assets/goluboe-vodovod-r1-6/[...asset]/route";
import { GET as r17GET, HEAD as r17HEAD } from "@/app/model-assets/goluboe-vodovod-r1-7/[...asset]/route";
import { GET as r18GET, HEAD as r18HEAD } from "@/app/model-assets/goluboe-vodovod-r1-8/[...asset]/route";
import { GET as r19GET, HEAD as r19HEAD } from "@/app/model-assets/goluboe-vodovod-r1-9/[...asset]/route";
import { GET as r110GET, HEAD as r110HEAD } from "@/app/model-assets/goluboe-vodovod-r1-10/[...asset]/route";
import { GET as r111GET, HEAD as r111HEAD } from "@/app/model-assets/goluboe-vodovod-r1-11/[...asset]/route";
import { GET as r112GET, HEAD as r112HEAD } from "@/app/model-assets/goluboe-vodovod-r1-12/[...asset]/route";
import { GET as r113GET, HEAD as r113HEAD } from "@/app/model-assets/goluboe-vodovod-r1-13/[...asset]/route";
import { GET as r1131GET, HEAD as r1131HEAD } from "@/app/model-assets/goluboe-vodovod-r1-13-1/[...asset]/route";
import { GET as r1132GET, HEAD as r1132HEAD } from "@/app/model-assets/goluboe-vodovod-r1-13-2/[...asset]/route";
import { GET as r115GET, HEAD as r115HEAD } from "@/app/model-assets/goluboe-vodovod-r1-15/[...asset]/route";
import { GET as r116GET, HEAD as r116HEAD } from "@/app/model-assets/goluboe-vodovod-r1-16/[...asset]/route";
import { GET as r1161GET, HEAD as r1161HEAD } from "@/app/model-assets/goluboe-vodovod-r1-16-1/[...asset]/route";
import { GET as alias } from "@/app/models/[slug]/route";
import { legacyAtlasDestination, legacyAtlasWorker } from "./project-atlas-legacy";

const origin = "https://pgs.local";
const r13 = "/model-assets/goluboe-vodovod-r1-3/";
const r14 = "/model-assets/goluboe-vodovod-r1-4/";
const r15 = "/model-assets/goluboe-vodovod-r1-5/";
const r16 = "/model-assets/goluboe-vodovod-r1-6/";
const r17 = "/model-assets/goluboe-vodovod-r1-7/";
const r18 = "/model-assets/goluboe-vodovod-r1-8/";
const r19 = "/model-assets/goluboe-vodovod-r1-9/";
const r110 = "/model-assets/goluboe-vodovod-r1-10/";
const r111 = "/model-assets/goluboe-vodovod-r1-11/";
const r112 = "/model-assets/goluboe-vodovod-r1-12/";
const r113 = "/model-assets/goluboe-vodovod-r1-13/";
const r1131 = "/model-assets/goluboe-vodovod-r1-13-1/";
const r1132 = "/model-assets/goluboe-vodovod-r1-13-2/";
const r115 = "/model-assets/goluboe-vodovod-r1-15/";
const r116 = "/model-assets/goluboe-vodovod-r1-16/";
const r1161 = "/model-assets/goluboe-vodovod-r1-16-1/";
const snapshot = "/model-assets/goluboe-vodovod-r1-2-terrain-snapshot/";
const priorPilot = "/model-assets/goluboe-vodovod-r1-2-field-pilot-02-ux-01/";
const hash = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("Goluboe immutable publication through R1.16.1", () => {
  it("serves R1.16.1 from both aliases without changing prior releases", async () => {
    for (const prefix of [r13, r14, r15, r16, r17, r18, r19, r110, r111, r112, r113, r1131, r1132, r115, r116, r1161, snapshot, priorPilot]) {
      expect(legacyAtlasDestination(new URL(origin + prefix + "index.html"))).toBeNull();
      expect(legacyAtlasWorker(new URL(origin + prefix + "service-worker.js"))).toBeNull();
    }
    const slug = "goluboe-vodovod-field-pilot";
    const response = await alias(new Request(origin + "/models/" + slug + "?field=1&pk=21.5"), { params: { slug } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(r1161 + "index.html?field=1&pk=21.5");
    const main = "goluboe-vodovod";
    const primary = await alias(new Request(origin + "/models/" + main), { params: { slug: main } });
    expect(primary.status).toBe(307);
    expect(primary.headers.get("location")).toBe(r1161 + "index.html");
  });

  it.each([
    { release: r13, serve: GET, head: HEAD, manifestSha: "c967ddb475389106463e5bea52511f1fbf92cfef971aa4ac23c5c74de70f0442",
      treeSha: "4820d30afa9aad4a4b7d465a465c9ccd60b82c73078730787d77c7352d0367c5", cache: "field-01319f828fba" },
    { release: r14, serve: r14GET, head: r14HEAD, manifestSha: "f6df69c6463f2decb7e3ebd50f5300ba506e2ff8aab966493f51781761459927",
      treeSha: "5cf9166e9885b238668400298cb45c91ce806d1829431161e644fca884eccac5", cache: "field-e0fc8c9ac634" },
    { release: r15, serve: r15GET, head: r15HEAD, manifestSha: "b3e7edd1eeeed6a9955b8222a7fce192781e0dd9f40e9718ebbe9ed3f86b1388",
      treeSha: "5413263cc8583341e43a846dfb0e6e80d8e9a0f1fefd7b4f9a1ae202fafe6a4a", cache: "field-0ed55a424c70" },
    { release: r16, serve: r16GET, head: r16HEAD, manifestSha: "5b1a5b31141fae560f5cf09a2b764b498501572cef188167c57cc0b54273b133",
      treeSha: "a48eff118e55ccb85cab6f24825c5246532ad1609c1f50a190a1fd4325ec683b", cache: "field-9aa2252b0a1e" },
    { release: r17, serve: r17GET, head: r17HEAD, manifestSha: "e5bc82605efbdc09ad25381948bed26b241c3820a09f1943fcb99a6847a7a438",
      treeSha: "8f44c74a22cbf0ee433f98f21abb890e2ab54fd945ae6c510b4e2ba4251929a6", cache: "field-922182d99d5f" },
    { release: r18, serve: r18GET, head: r18HEAD, manifestSha: "f6650086a23eb7e9229e332e8c6f289df94d69ccc1ae7281c560cc84a2303486",
      treeSha: "34df261306412871c2d2d9cbff763c95c0350155c77f5c1979b5589abf468418", cache: "field-6804df33c9bc" },
    { release: r19, serve: r19GET, head: r19HEAD, manifestSha: "42b28ffa312074b7b61ef37b26a46f025d0fd04f67a4948a23c9704ae3dbe18e",
      treeSha: "d0a3fb232dcefe5841460386ee7cd8efc8a517378a794847f8ddbbfca45d6b2e", cache: "field-91e81891091d" },
    { release: r110, serve: r110GET, head: r110HEAD, manifestSha: "47c15c45919f21d3ce2c04ccb081408a94f52da5aae47f0c1167ea7904feacd2",
      treeSha: "a8012a721a9a9cf40936ba95a78439b3c9bf0dbf4c961b0ccab0c955218dcf8e", cache: "field-bf0d5282df7a" },
    { release: r111, serve: r111GET, head: r111HEAD, manifestSha: "f12c262bc8a50849b9bc1fb019bff547b52cdc9ef21211fd1cd626d2f013aa28",
      treeSha: "c3d604e38a6397326c882dd62dff5336f0382929cbcf7702b34074d06636a211", cache: "field-d857ffef1232", files: 345 },
    { release: r112, serve: r112GET, head: r112HEAD, manifestSha: "6d7d1045e3c87b0000167311bf7ba10817b7c41bf14ecd3d07b3c8def6419f10",
      treeSha: "c590cf0ce23aab3c03b2a7d0076d92035aaf003b6149b5aa9ce8bd31151e33a8", cache: "field-9188a938881d", files: 345 },
    { release: r113, serve: r113GET, head: r113HEAD, manifestSha: "ad9cfdffc20d7506495ff2d348b18b278562af946642f05eca0ca5396c653667",
      treeSha: "870d73c42a5198c3aa8ced8dfdeb668160821b1b8d9ebdf1d995bf8205edbb50", cache: "field-f0f3994dd89c", files: 353 },
    { release: r1131, serve: r1131GET, head: r1131HEAD, manifestSha: "4dded89e44206070e91afec43d1f42ec5b61271f3ee02a13dbd57c60b7ae4e71",
      treeSha: "7d87e9a45924549da3b47b08ab20189ec1b0ef1d9e885094df51c23989dc955b", cache: "field-c83501683889", files: 353 },
    { release: r1132, serve: r1132GET, head: r1132HEAD, manifestSha: "404b758f6b8bc7b74e40d843dd35be0b3f27a77dee1d4ebaa11d2b18703f3548",
      treeSha: "cd2e83897a45e145ef08addad9e9d4489a6d239dd808028fbec2d23df2dc54d5", cache: "field-1a847e80b9a8", files: 353 },
    { release: r115, serve: r115GET, head: r115HEAD, manifestSha: "120d9b6af55c22de0359503ccbbde0d38d983cc053efc0d92e66bdce7de626c9",
      treeSha: "f8465f596b22125e527d78ebcecdd11392ea5b7ebd954e96a5e9cb9273e0c016", cache: "field-6418d94f9ea7", files: 372 },
    { release: r116, serve: r116GET, head: r116HEAD, manifestSha: "914fb424973f0ecbd1e7e6e46d58444e76ba39408e6cf22da88a9ac7dc9d4a3e",
      treeSha: "e4a5a792b214c437639f7685d4c7185ae84217f8452c655833b00bf1a78bc1ae", cache: "field-232e1bc27f13", files: 374 },
    { release: r1161, serve: r1161GET, head: r1161HEAD, manifestSha: "b8d30463bb9f2a7bc80e1709e658b51eabbebabf5c8c25f1f6492e4cff508c81",
      treeSha: "e696c6d99c9197cdba0d143e18a2d0fcf71f2f4e91ac13cdd67d92568216c4cf", cache: "field-59ebc954774b", files: 374 },
  ])("serves all hashed items and isolates the worker for $release", async ({ release, serve, head, manifestSha, treeSha, cache, files = 338 }) => {
    const get = (name: string) => serve(
      new Request(origin + release + name.split("/").map(encodeURIComponent).join("/")), { params: { asset: name.split("/") } }
    );
    expect(head).toBe(serve);
    const manifestResponse = await get("MANIFEST.json");
    expect(manifestResponse.status).toBe(200);
    const serialized = await manifestResponse.text();
    expect(hash(serialized)).toBe(manifestSha);
    const manifest = JSON.parse(serialized);
    expect(manifest.files).toHaveLength(files);
    expect(manifest.sourceTreeSha256).toBe(treeSha);
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
    expect(self.ATLAS_OFFLINE_VERSION).toBe(cache);
    if (release === r111 || release === r112) {
      expect(self.ATLAS_OFFLINE_FILES).toHaveLength(339);
      expect(self.ATLAS_OFFLINE_PRECACHE).toHaveLength(65);
      expect((await get("data/layers.js")).status).toBe(200);
    }
    expect(self.ATLAS_OFFLINE_FILES).toEqual(expect.arrayContaining([
      "project/underground-geometry-data.js", "project/underground-mesh.js", "project/underground-view.js"
    ]));
    if (release === r112 || release === r113 || release === r1131 || release === r1132 || release === r115 || release === r116 || release === r1161) {
      expect(hash(new Uint8Array(await (await get("assets/atlas-field-offline.js")).arrayBuffer())))
        .toBe("62083de270fa86d6fd828d40c91ecaa31598f3b280f9eef56da21bc981101e68");
      const metadata = await (await get("CURRENT_RELEASE.json")).json();
      expect(metadata).toMatchObject({ coreVersion: release === r115 || release === r116 || release === r1161 ? "1.2.7" : "1.1.3" });
      const shell = await (await get("assets/atlas-shell.js")).text();
      const stamps = [...shell.matchAll(/^\s*window\.ATLAS_CORE_VERSION\s*=\s*["']([^"']+)["'];/gm)].map(match => match[1]);
      expect(stamps).toEqual([metadata.coreVersion]);
      const config: Record<string, any> = {};
      runInNewContext(await (await get("project/config.js")).text(), { window: config }, { timeout: 1000 });
      expect(config.ATLAS_PROJECT.core_version).toBe(metadata.coreVersion);
    }
    expect((await get("MANIFEST_SHA256_пакета.txt")).status).toBe(404);
    expect((await get("qa/report.json")).status).toBe(404);
  });

  it.each([[r113, r113GET], [r1131, r1131GET], [r1132, r1132GET]] as const)("keeps the progress demo and embedded model inside the release policy at %s", async (prefix, serve) => {
    const get = (name: string) => serve(
      new Request(origin + prefix + name), { params: { asset: name.split("/") } }
    );
    const demo = await get("project/work-progress-demo.html");
    const index = await serve(new Request(origin + prefix + "index.html?pdDemo=1"), { params: { asset: ["index.html"] } });
    for (const response of [demo, index]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      const directives = response.headers.get("content-security-policy")!.split(";").map(value => value.trim());
      expect(directives).toContain("frame-src blob: " + origin + prefix + " https://pgs-frankfurt.onrender.com" + prefix);
      expect(directives).toContain("frame-ancestors 'self'");
    }
    expect(await demo.text()).toContain('id="wd-model"');
    expect(await (await get("project/work-progress-demo.js")).text()).toContain("../index.html?pdDemo=1");
    const self: Record<string, string[]> = {};
    runInNewContext(await (await get("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_FILES).toHaveLength(347);
    expect(self.ATLAS_OFFLINE_PRECACHE).toHaveLength(85);
    expect(self.ATLAS_OFFLINE_FILES).toEqual(expect.arrayContaining([
      "PROGRESS.html", "project/work-progress-demo.html", "data/geometry_06.js", "data/progress_items.js"
    ]));
  });

  it.each([[r115, r115GET, 366, 104], [r116, r116GET, 368, 106], [r1161, r1161GET, 368, 106]] as const)("ships the demo and fragments only within the versioned scope at %s", async (prefix, serve, files, precache) => {
    const get = (name: string) => serve(
      new Request(origin + prefix + name), { params: { asset: name.split("/") } }
    );
    const demo = await get("DEMO.html");
    expect(demo.status).toBe(200);
    expect(demo.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(demo.headers.get("content-security-policy")).toContain("frame-src blob: " + origin + prefix + " https://pgs-frankfurt.onrender.com" + prefix);
    expect(await demo.text()).toContain('id="demoModelBox"');
    const self: Record<string, string[]> = {};
    runInNewContext(await (await get("assets/offline-manifest.js")).text(), { self }, { timeout: 1000 });
    expect(self.ATLAS_OFFLINE_FILES).toHaveLength(files);
    expect(self.ATLAS_OFFLINE_PRECACHE).toHaveLength(precache);
    for (const fragment of ["project/fragments/pk021p5-pos-58.png", "project/fragments/pk021p5-ppo-18.png"]) {
      const response = await get(fragment);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(self.ATLAS_OFFLINE_FILES).toContain(fragment);
    }
  });
});
