import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip as gunzipCallback } from "node:zlib";
import type { Project3dModel } from "@/lib/project-3d-model";
import { acceptsProjectModelGzip, appendProjectModelEmbed, hasProjectModelEmbed, PROJECT_MODEL_EMBED_VERSION } from "@/lib/project-model-embed";

const gunzip = promisify(gunzipCallback);

// Callers must authorize either project membership or an explicit public-model allowlist.
export async function projectModelResponse(request: Request, model: Project3dModel, visibility: "private" | "public") {
  const embed = hasProjectModelEmbed(request.url);
  const headers = {
    "Cache-Control": `${visibility}, max-age=3600, must-revalidate`,
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts allow-downloads",
    "Content-Type": "text/html; charset=utf-8",
    ETag: `W/"${model.slug}${embed ? `-${PROJECT_MODEL_EMBED_VERSION}` : ""}"`,
    Vary: "Accept-Encoding",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-Robots-Tag": "noindex, nofollow"
  };
  if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });
  try {
    const compressed = await readFile(path.join(process.cwd(), model.assetPath));
    if (acceptsProjectModelGzip(request.headers.get("accept-encoding"))) {
      const body = embed ? await appendProjectModelEmbed(compressed, "gzip") : compressed;
      return new Response(new Uint8Array(body), { headers: { ...headers, "Content-Encoding": "gzip" } });
    }
    const source = await gunzip(compressed);
    const body = embed ? await appendProjectModelEmbed(source, "identity") : source;
    return new Response(new Uint8Array(body), { headers });
  } catch {
    console.error("Unable to load packaged project 3D model");
    return new Response("3D model is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
