import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";
import { GET as goluboeOld } from "@/app/model-assets/goluboe-vodovod-r1-18-4/[...asset]/route";
import { GET as goluboe } from "@/app/model-assets/goluboe-vodovod-r1-18-5/[...asset]/route";
import { GET as troitskOld } from "@/app/model-assets/troitsk-r25v12-22-4/[...asset]/route";
import { GET as troitsk } from "@/app/model-assets/troitsk-r25v12-22-5/[...asset]/route";

const origin = "https://pgs-frankfurt.onrender.com";
type Reply = { ok: boolean; cacheName?: string; ready?: boolean; message?: string };
type Event = {
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
  data?: { type: string };
  ports: { postMessage: (reply: Reply) => void }[];
  request?: Request;
};
type Handler = (event: Event) => void;

function runOfflineWorker(scope: string, worker: string, offline: string, globals: Record<string, unknown>) {
  const listeners = new Map<string, Handler>();
  const self = {
    registration: { scope },
    clients: { claim: async () => {} },
    addEventListener(name: string, handler: Handler) { listeners.set(name, handler); }
  };
  runInNewContext(worker, {
    self, URL, Response, AbortController, setTimeout, clearTimeout,
    importScripts(name: string) {
      expect(name).toBe("assets/offline-manifest.js");
      runInNewContext(offline, { self }, { timeout: 1000 });
    },
    ...globals
  }, { timeout: 1000 });

  function fire(name: string, event: Partial<Event> = {}) {
    let pending: Promise<unknown> | undefined, response: Promise<Response> | undefined;
    const handler = listeners.get(name);
    expect(handler, name).toBeTypeOf("function");
    handler!({
      waitUntil: promise => { pending = promise; },
      respondWith: promise => { response = promise; },
      ports: [],
      ...event
    });
    return { pending, response };
  }
  return { fire };
}

it.each([
  { current: goluboe, prior: goluboeOld, prefix: "/model-assets/goluboe-vodovod-r1-18-5/",
    old: "/model-assets/goluboe-vodovod-r1-18-4/", count: 413 },
  { current: troitsk, prior: troitskOld, prefix: "/model-assets/troitsk-r25v12-22-5/",
    old: "/model-assets/troitsk-r25v12-22-4/", count: 175 }
])("saves the full offline set explicitly under $prefix", async ({ current, prior, prefix, old, count }) => {
  const get = (serve: typeof goluboe, folder: string, name: string) =>
    serve(new Request(origin + folder + name), { params: { asset: name.split("/") } });
  const [worker, offline, oldWorker, oldOffline] = await Promise.all([
    get(current, prefix, "service-worker.js"), get(current, prefix, "assets/offline-manifest.js"),
    get(prior, old, "service-worker.js"), get(prior, old, "assets/offline-manifest.js")
  ]);
  for (const response of [worker, offline, oldWorker, oldOffline]) expect(response.status).toBe(200);
  const header = "service-worker-allowed";
  expect(worker.headers.get(header)).toBe(prefix);
  expect(oldWorker.headers.get(header)).toBe(old);
  const workerText = await worker.text();
  expect(createHash("sha256").update(workerText).digest("hex"))
    .toBe("f7c0b8e9863692d279ac9d85904b1de59e3182254079fe4533c669dbfa0a6b4f");
  const metadata = await (await get(current, prefix, "CURRENT_RELEASE.json")).json();
  expect(metadata).toMatchObject({
    coreVersion: "1.4.4",
    coreManifestSha256: "57ff9dfe83f48143bc9c28a8444fd416ceb49b5abc97211e5fbd74eba1f86cc4"
  });

  const oldScope = origin + old;
  const scope = origin + prefix;
  const expected = new Set<string>();
  const oldRuntime = runOfflineWorker(oldScope, await oldWorker.text(), await oldOffline.text(), {
    caches: { open: async () => ({ addAll: async (urls: URL[]) => {
      for (const url of urls) {
        expect(url.href.startsWith(oldScope)).toBe(true);
        expected.add(scope + url.href.slice(oldScope.length));
      }
    } }) }
  });
  await oldRuntime.fire("install").pending;
  expect(expected.size).toBe(count);

  // Simulate an unavailable file once, then save again with the partial cache intact.
  const saved = new Map<string, Response>(), network: string[] = [];
  const unrelated = "pgs-other-scope", cacheNames = new Set([unrelated]);
  const deleted: string[] = [];
  let failOnce = true, online = true, maxInFlight = 0, inFlight = 0;
  const demoPdf = "%PDF-1.7\nfixture";
  const { fire } = runOfflineWorker(scope, workerText, await offline.text(), {
    caches: {
      has: async (name: string) => cacheNames.has(name),
      keys: async () => [...cacheNames],
      delete: async (name: string) => { deleted.push(name); return cacheNames.delete(name); },
      open: async (name: string) => {
        cacheNames.add(name);
        return {
          match: async (url: string) => saved.get(url)?.clone(),
          keys: async () => [...saved.keys()].map(url => new Request(url)),
          put: async (url: string, reply: Response) => { saved.set(url, reply.clone()); }
        };
      }
    },
    fetch: async (request: string | Request) => {
      if (!online) throw new Error("offline");
      const url = typeof request === "string" ? request : request.url;
      expect(expected.has(url)).toBe(true);
      network.push(url);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise<void>(resolve => setImmediate(resolve));
      inFlight--;
      if (failOnce) { failOnce = false; return new Response(null, { status: 503 }); }
      return url.endsWith(".pdf")
        ? new Response(demoPdf, { headers: { "Content-Type": "application/pdf" } })
        : new Response("offline fixture");
    }
  });
  const message = (type: string) => {
    const replies: Reply[] = [];
    const { pending } = fire("message", { data: { type }, ports: [{ postMessage: reply => replies.push(reply) }] });
    return { replies, pending };
  };
  await fire("install").pending;
  await fire("activate").pending;
  expect(network).toEqual([]);
  expect(saved.size).toBe(0);
  expect(cacheNames.has(unrelated)).toBe(true);
  expect(deleted).toEqual([]);
  const status = message("atlas-offline-status");
  await status.pending;
  expect(status.replies).toMatchObject([{ ok: true, ready: false }]);
  expect(message("unhandled").pending).toBeUndefined();
  expect(fire("message", { data: { type: "atlas-offline-precache" } }).pending).toBeUndefined();
  expect(network).toEqual([]);

  const failed = message("atlas-offline-precache");
  await failed.pending;
  expect(failed.replies).toMatchObject([{ ok: false, message: expect.stringContaining("503") }]);
  const incomplete = message("atlas-offline-status");
  await incomplete.pending;
  expect(incomplete.replies).toMatchObject([{ ok: true, ready: false }]);
  const remaining = [...expected].filter(url => !saved.has(url)).sort();
  network.length = 0;
  const first = message("atlas-offline-precache"), concurrent = message("atlas-offline-precache");
  expect(first.replies).toEqual([]);
  expect(concurrent.replies).toEqual([]);
  await Promise.all([first.pending, concurrent.pending]);
  expect(first.replies).toMatchObject([{ ok: true, cacheName: expect.any(String) }]);
  expect(concurrent.replies).toEqual(first.replies);
  expect([...network].sort()).toEqual(remaining);
  expect([...saved.keys()].sort()).toEqual([...expected].sort());
  expect(maxInFlight).toBe(4);
  const complete = message("atlas-offline-status");
  await complete.pending;
  expect(complete.replies).toMatchObject([{ ok: true, ready: true }]);

  online = false;
  const pdf = [...expected].find(url => url.endsWith(".pdf"))!;
  const range = async (header: string) => (await fire("fetch", {
    request: new Request(pdf, { headers: { range: header } })
  }).response)!;
  const partial = await range("bytes=0-7");
  expect(partial.status).toBe(206);
  expect(partial.headers.get("content-range")).toBe("bytes 0-7/" + demoPdf.length);
  expect(await partial.text()).toBe(demoPdf.slice(0, 8));
  expect((await range("bytes=" + demoPdf.length + "-")).status).toBe(416);
  expect(fire("fetch", { request: new Request(origin + "/api/health") }).response).toBeUndefined();
});
