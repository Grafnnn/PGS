import { readFile, readdir } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { LEGACY_ATLAS_RELEASES, LEGACY_DOU_ATLAS_RELEASES, legacyAtlasDestination, legacyAtlasWorker } from "./project-atlas-legacy";

const current = "/model-assets/troitsk-r25v12-18/";
const old = "/model-assets/troitsk-r25v8-ui8/";
const currentDou = "/model-assets/dou200-r1-27/";
const url = (path: string) => new URL(path, "https://pgs.local");

describe("legacy atlas links", () => {
  it.each(LEGACY_ATLAS_RELEASES)("redirects %s entry links without losing query or element hash", (release) => {
    for (const suffix of ["", "/", "/index.html"]) {
      const source = url(`/model-assets/${release}${suffix}?embed=monolith-v1#scope=BUILDING&id=ALBUM2%3A%3AVS01_BR`);
      const target = legacyAtlasDestination(source)!;
      expect(target.pathname).toBe(current + "index.html");
      expect(target.search).toBe(source.search);
      expect(target.hash).toBe(source.hash);
    }
  });
  it.each(["library.html", "catalogue.html", "drawing.html?sheet=98", "documents/REV07_L1_MU2_PASSPORT.html",
    "START_HERE.html", "albums/AS2_last_full.pdf", "assets/prototype.js", "CURRENT_RELEASE.json", "images/drawing.png"])("replaces every retired resource with the current entry: %s", (name) => {
    expect(legacyAtlasDestination(url(old + name))!.pathname).toBe(current + "index.html");
  });
  it.each(LEGACY_DOU_ATLAS_RELEASES)("redirects retired %s only to DOU200, keeping query and hash", (release) => {
    for (const suffix of ["", "/", "/index.html", "/library.html", "/catalogue.html", "/albums/2025_N252-R-GP_chast2.pdf", "/assets/atlas-status.js"]) {
      const source = url(`/model-assets/${release}${suffix}?q=roof#source`);
      const target = legacyAtlasDestination(source)!;
      expect(target.pathname).toBe(currentDou + "index.html");
      expect(target.search).toBe(source.search);
      expect(target.hash).toBe(source.hash);
    }
  });
  it("packages both current projects, without old public assets or routes", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    expect(pkg.scripts.build).toBe("node scripts/prepare-public-atlases.mjs && next build");
    expect(pkg.scripts.test).toBe("node scripts/prepare-public-atlases.mjs && vitest run");
    expect((await readdir("src/app/model-assets")).sort()).toEqual(["dou200-r1-27", "troitsk-r25v12-18"]);
    expect((await readdir("public")).includes("model-assets")).toBe(false);
  });
  it.each([
    current + "index.html", currentDou + "index.html", "/model-assets/other-project/index.html", "/api/projects/1/model-viewer",
    "/projects", old + "service-worker.js", old + "%00.html",
    old + "a%5Cindex.html", old + "%zz.html", "/model-assets/dou200-r1-21/%00.html",
    "/model-assets/dou200-r1-21/a%5Cindex.html", "/model-assets/dou200-r1-21/%zz.html"
  ])("does not redirect the current release, private routes or unsafe paths: %s", (path) => {
    expect(legacyAtlasDestination(url(path))).toBeNull();
  });
  it("returns uncached GET/HEAD redirects, without sessions or open redirects", () => {
    for (const prefix of [old, ...LEGACY_DOU_ATLAS_RELEASES.map(release => `/model-assets/${release}/`)]) for (const method of ["GET", "HEAD"]) {
      const response = middleware(new NextRequest(url(prefix + "index.html?next=https://elsewhere.test"), { method }));
      expect(response.status).toBe(307);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(new URL(response.headers.get("location")!).origin).toBe("https://pgs.local");
      expect(response.headers.has("set-cookie")).toBe(false);
    }
    for (const prefix of [old, ...LEGACY_DOU_ATLAS_RELEASES.map(release => `/model-assets/${release}/`)]) {
      const response = middleware(new NextRequest(url(prefix + "index.html"), { method: "POST" }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  });
  it("retires only the requested legacy worker and migrates its pages, not other clients", async () => {
    const listeners: Record<string, (event: { waitUntil: (p: Promise<unknown>) => void }) => void> = {};
    const own = { url: url(old + "catalogue.html?q=roof#item").href, navigate: vi.fn() };
    const other = { url: url("/projects").href, navigate: vi.fn() };
    const active = { url: url(current + "index.html").href, navigate: vi.fn() };
    const unregister = vi.fn();
    const claim = vi.fn();
    const skipWaiting = vi.fn();
    runInNewContext(legacyAtlasWorker(url(old + "service-worker.js"))!, {
      URL, Response, self: { location: url(old), skipWaiting, registration: { unregister },
        clients: { claim, matchAll: async () => [own, other, active] },
        addEventListener: (name: string, fn: typeof listeners[string]) => { listeners[name] = fn; } }
    });
    let pending: Promise<unknown> = Promise.resolve();
    const event = { waitUntil: (p: Promise<unknown>) => { pending = p; } };
    listeners.install(event); await pending;
    listeners.activate(event); await pending;
    expect(skipWaiting).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledOnce();
    expect(own.navigate).toHaveBeenCalledWith(url(current + "index.html?q=roof#item").href);
    expect(other.navigate).not.toHaveBeenCalled();
    expect(active.navigate).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalledOnce();
    expect(legacyAtlasWorker(url(current + "service-worker.js"))).toBeNull();
    const response = middleware(new NextRequest(url(old + "service-worker.js")));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("javascript");
  });
  it.each(LEGACY_DOU_ATLAS_RELEASES)("retires %s worker without moving Troitsk or other DOU clients", async (release) => {
    const retired = `/model-assets/${release}/`;
    const listeners: Record<string, (event: { waitUntil(p: Promise<unknown>): void }) => void> = {};
    const own = { url: url(retired + "library.html?q=roof#source").href, navigate: vi.fn() };
    const others = [current, currentDou, "/projects/", ...LEGACY_DOU_ATLAS_RELEASES.filter(name => name !== release).map(name => `/model-assets/${name}/`)].map((prefix) => ({ url: url(prefix + "index.html").href, navigate: vi.fn() }));
    const unregister = vi.fn();
    runInNewContext(legacyAtlasWorker(url(retired + "service-worker.js"))!, {
      URL, Response, self: { location: url(retired), skipWaiting() {}, registration: { unregister },
        clients: { claim() {}, matchAll: async () => [own, ...others] },
        addEventListener: (name: string, fn: typeof listeners[string]) => { listeners[name] = fn; } }
    });
    let pending: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil(p) { pending = p; } }); await pending;
    expect(own.navigate).toHaveBeenCalledWith(url(currentDou + "index.html?q=roof#source").href);
    for (const other of others) expect(other.navigate).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalledOnce();
    const response = middleware(new NextRequest(url(retired + "service-worker.js")));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
