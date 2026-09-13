import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import manifest from "@/assets/project-models/troitsk-b24-atlas-3-2.manifest.json";
import drawings from "@/assets/project-models/troitsk-b24-atlas-3-2.drawings.json";
import { acceptsProjectModelGzip } from "@/lib/project-model-embed";
import { adaptProjectAtlasDrawings, atlasConfirmedDrawingLinks, atlasDrawingRenderer, atlasDrawingStyles } from "@/lib/project-atlas-drawing-adapter";
import { atlasDrawingPage } from "@/lib/project-atlas-drawing-viewer";

const unzip = promisify(gunzip);
const zip = promisify(gzip);
const root = "src/assets/project-models/troitsk-b24-atlas-3-2";
const prefix = "/model-assets/troitsk-b24-atlas-3-2/";
type Asset = (typeof manifest.files)[keyof typeof manifest.files];
const assets: Record<string, Asset> = { ...manifest.files, ...drawings.files };

// Adapter only: all stored source bytes, geometry and drawings stay unchanged.
const integration = `<style id="pgs-atlas-layout">
@media(min-width:801px){body.nav-collapsed #album{grid-template-columns:minmax(0,1fr)}}
${atlasDrawingStyles}
</style><script id="pgs-atlas-integration">
if(!location.hash||location.hash.startsWith('#module='))history.replaceState(null,'',location.pathname+location.search+'#node/building');
document.title='Троицк · 3D Атлас 3.2';
window.addEventListener('keydown',function(event){
  if(event.key==='Escape'&&!event.defaultPrevented&&parent!==window){
    const innerDialog=document.querySelector('dialog[open],#drawingPanel:not([hidden])');
    if(!innerDialog)parent.postMessage({type:'pgs:project-model-close'},'*');
  }
});
</script>`;
const adapterRevision = createHash("sha256").update(integration + atlasDrawingRenderer + atlasConfirmedDrawingLinks).digest("hex").slice(0, 16);

export function projectAtlasContentSecurityPolicy(origin: string) {
  const locations = [...new Set([origin, "https://pgs-frankfurt.onrender.com"])].map((host) => host + prefix).join(" ");
  return `default-src 'none'; script-src 'unsafe-inline' ${locations}; style-src 'unsafe-inline' ${locations}; img-src data: blob: ${locations}; worker-src blob:; frame-src ${locations}; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-downloads allow-modals allow-popups allow-popups-to-escape-sandbox`;
}

export async function projectAtlasAssetResponse(request: Request, segments: string[]) {
  const name = segments.join("/");
  if (segments.length === 1 && name === "drawing.html") {
    const url = new URL(request.url), page = atlasDrawingPage(url);
    if (!page) return new Response("Drawing not found", { status: 404 });
    const headers = new Headers({
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, no-cache", ETag: page.etag,
      "Content-Security-Policy": projectAtlasContentSecurityPolicy(url.origin), "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow"
    });
    return new Response(request.headers.get("if-none-match") === page.etag ? null : page.html, {
      status: request.headers.get("if-none-match") === page.etag ? 304 : 200, headers
    });
  }
  // User paths select a manifest entry, never a filesystem path or a project record.
  if (segments.some((segment) => !segment || /[\\/\x00-\x1f]/.test(segment) || segment === "." || segment === "..") || !Object.prototype.hasOwnProperty.call(assets, name)) {
    return new Response("Atlas asset not found", { status: 404 });
  }
  const asset = assets[name];
  const entry = name === "index.html";
  const drawingScript = name === "assets/album.js";
  const adapted = entry || drawingScript;
  const headers = new Headers({
    "Content-Type": asset.contentType,
    "Cache-Control": adapted ? "public, no-cache" : "public, max-age=31536000, immutable",
    ETag: `W/"${asset.sha256}${adapted ? "-pgs-" + adapterRevision : ""}"`,
    Vary: "Accept-Encoding",
    "Access-Control-Allow-Origin": "*",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow"
  });
  if (entry) {
    headers.set("Content-Security-Policy", projectAtlasContentSecurityPolicy(new URL(request.url).origin));
    headers.set("X-Frame-Options", "SAMEORIGIN");
  } else if (/\.(pdf|csv|json|xlsx)$/.test(name)) headers.set("Content-Disposition", "attachment");
  else if (name.endsWith(".svg")) headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox");
  if (request.headers.get("if-none-match") === headers.get("etag")) return new Response(null, { status: 304, headers });
  try {
    let bytes = await readFile(path.join(process.cwd(), root, asset.storage));
    const compressed = acceptsProjectModelGzip(request.headers.get("accept-encoding"));
    if (adapted) {
      const original = (await unzip(bytes)).toString("utf8");
      bytes = Buffer.from(entry
        ? original.replace("<script>", integration + "<script>").replace('src="assets/album.js"', `src="assets/album.js?pgs=${adapterRevision}"`)
        : adaptProjectAtlasDrawings(original));
      if (compressed) bytes = await zip(bytes);
    } else if (asset.compressed && !compressed) bytes = await unzip(bytes);
    if (asset.compressed && compressed) headers.set("Content-Encoding", "gzip");
    if (!asset.compressed) {
      headers.set("Accept-Ranges", "bytes");
      const range = request.headers.get("range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const size = bytes.length;
        const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
        const end = match?.[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
          headers.set("Content-Range", `bytes */${size}`);
          return new Response(null, { status: 416, headers });
        }
        headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
        headers.set("Content-Length", String(end - start + 1));
        return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers });
      }
    }
    headers.set("Content-Length", String(bytes.length));
    return new Response(new Uint8Array(bytes), { headers });
  } catch {
    console.error("Unable to load packaged atlas asset");
    return new Response("Atlas temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
