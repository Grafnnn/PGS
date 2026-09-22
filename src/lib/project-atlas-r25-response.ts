import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { acceptsProjectModelGzip } from "@/lib/project-model-embed";

export const ATLAS_R25_PREFIX = "/model-assets/troitsk-r25v5/";
type AtlasVersion = "v5" | "v8" | "v8-ui1" | "v8-ui2" | "v8-ui3" | "v8-ui4" | "v8-ui5" | "v8-ui6";
type Asset = { source?: "v8" | "v8-ui1" | "v8-ui2" | "v8-ui3" | "v8-ui4" | "v8-ui5"; pack: string; offset: number; storedBytes: number; bytes: number; compressed: boolean; sha256: string; contentType: string };
const indexes = new Map<AtlasVersion, Promise<{ files: Record<string, Asset> }>>();
function loadIndex(version: AtlasVersion, root: string) {
  // Load the index only, not the 600MB release, and keep it out of the JS build bundle.
  if (!indexes.has(version)) indexes.set(version, readFile(path.join(root, "index.json"), "utf8").then(JSON.parse).catch((error) => {
    indexes.delete(version);
    throw error;
  }));
  return indexes.get(version)!;
}

export async function projectAtlasR25Response(request: Request, segments: string[], version: AtlasVersion = "v5") {
  const prefix = `/model-assets/troitsk-r25${version}/`;
  const root = path.join(process.cwd(), `src/assets/project-models/troitsk-r25${version}`);
  if (segments.some(s => !s || s === "." || s === ".." || /[\\/\x00-\x1f]/.test(s))) return new Response("Not found", { status: 404 });
  const name = segments.join("/");
  try {
    const { files } = await loadIndex(version, root);
    if (!Object.hasOwn(files, name)) return new Response("Not found", { status: 404 });
    const asset = files[name];
    const headers = new Headers({
      "Content-Type": asset.contentType,
      "Cache-Control": name === "service-worker.js" ? "public, no-cache" : "public, max-age=31536000, immutable",
      "ETag": `"${asset.sha256}"`, "Vary": "Accept-Encoding",
      "Access-Control-Allow-Origin": "*", "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow"
    });
    const locations = [...new Set([new URL(request.url).origin, "https://pgs-frankfurt.onrender.com"])].map(host => host + prefix).join(" ");
    if (name.endsWith(".html") || name === "service-worker.js") {
      headers.set("Content-Security-Policy", `default-src 'none'; script-src 'unsafe-inline' ${locations}; style-src 'unsafe-inline' ${locations}; img-src data: blob: ${locations}; worker-src blob: ${locations}; connect-src ${locations}; frame-src blob: ${locations}; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
      headers.set("X-Frame-Options", "SAMEORIGIN");
    }
    if (name === "service-worker.js") headers.set("Service-Worker-Allowed", prefix);
    if (name.endsWith(".svg")) headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    if (request.headers.get("if-none-match") === headers.get("etag")) return new Response(null, { status: 304, headers });
    let start = 0, end = asset.storedBytes - 1, status = 200;
    const range = request.headers.get("range");
    if (!asset.compressed) {
      headers.set("Accept-Ranges", "bytes");
      if (range && (!request.headers.has("if-range") || request.headers.get("if-range") === headers.get("etag"))) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        start = match?.[1] ? Number(match[1]) : Math.max(0, asset.bytes - Number(match?.[2]));
        end = match?.[1] && match[2] ? Math.min(Number(match[2]), asset.bytes - 1) : asset.bytes - 1;
        if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= asset.bytes) {
          headers.set("Content-Range", `bytes */${asset.bytes}`);
          return new Response(null, { status: 416, headers });
        }
        status = 206;
        headers.set("Content-Range", `bytes ${start}-${end}/${asset.bytes}`);
      }
    }
    const encoded = asset.compressed && acceptsProjectModelGzip(request.headers.get("accept-encoding"));
    if (encoded) headers.set("Content-Encoding", "gzip");
    headers.set("Content-Length", String(asset.compressed && !encoded ? asset.bytes : Math.max(0, end - start + 1)));
    if (request.method === "HEAD" || !asset.storedBytes) return new Response(null, { status, headers });
    // The UI release reuses sealed V8 packs without copying engineering payloads.
    const ancestors: Partial<Record<AtlasVersion, string[]>> = {
      "v8-ui1": ["v8"], "v8-ui2": ["v8", "v8-ui1"],
      "v8-ui3": ["v8", "v8-ui1", "v8-ui2"], "v8-ui4": ["v8", "v8-ui1", "v8-ui2", "v8-ui3"],
      "v8-ui5": ["v8", "v8-ui1", "v8-ui2", "v8-ui3", "v8-ui4"],
      "v8-ui6": ["v8", "v8-ui1", "v8-ui2", "v8-ui3", "v8-ui4", "v8-ui5"]
    };
    const inherited = asset.source && ancestors[version]?.includes(asset.source);
    const packRoot = inherited
      ? path.join(process.cwd(), `src/assets/project-models/troitsk-r25${asset.source}`) : root;
    const file = await open(path.join(packRoot, asset.pack), "r");
    const input = file.createReadStream({ start: asset.offset + start, end: asset.offset + end, autoClose: true });
    let body: Readable = input;
    if (asset.compressed && !encoded) {
      const unzip = createGunzip();
      input.on("error", error => unzip.destroy(error));
      unzip.on("close", () => input.destroy());
      body = input.pipe(unzip);
    }
    return new Response(Readable.toWeb(body) as ReadableStream<Uint8Array>, { status, headers });
  } catch {
    return new Response("Atlas temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
