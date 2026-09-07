import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { gunzip as gunzipCallback } from "node:zlib";
import path from "node:path";
import { getProject3dModel } from "@/lib/project-3d-model";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/project-route-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const gunzip = promisify(gunzipCallback);

function acceptsGzip(header: string | null) {
  const encodings = (header ?? "").split(",").map((part) => {
    const [name, ...parameters] = part.trim().toLowerCase().split(";");
    const quality = parameters.map((value) => value.trim()).find((value) => value.startsWith("q="));
    return { name, quality: quality ? Number(quality.slice(2)) : 1 };
  });
  const gzip = encodings.find((encoding) => encoding.name === "gzip") ?? encodings.find((encoding) => encoding.name === "*");
  return Boolean(gzip && gzip.quality > 0 && gzip.quality <= 1);
}

function responseHeaders(modelSlug: string) {
  return {
    "Cache-Control": "private, max-age=3600, must-revalidate",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    "Content-Type": "text/html; charset=utf-8",
    ETag: `W/"${modelSlug}"`,
    Vary: "Accept-Encoding",
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN"
  };
}

export async function GET(request: Request, { params }: { params: { projectId: string } }): Promise<Response> {
  const access = await requireProjectAccess(params.projectId, "view");
  if ("response" in access && access.response) return access.response;

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, name: true, code: true, object: true, address: true }
  });
  const model = project ? getProject3dModel(project) : null;
  if (!model) return new Response("3D model not found", { status: 404 });

  const headers = responseHeaders(model.slug);
  if (request.headers.get("if-none-match") === headers.ETag) return new Response(null, { status: 304, headers });

  try {
    // Ship the portable model byte-for-byte, precompressed once rather than on every request.
    const compressed = await readFile(path.join(process.cwd(), model.assetPath));
    if (acceptsGzip(request.headers.get("accept-encoding"))) {
      return new Response(new Uint8Array(compressed), { status: 200, headers: { ...headers, "Content-Encoding": "gzip" } });
    }
    return new Response(new Uint8Array(await gunzip(compressed)), { status: 200, headers });
  } catch (error) {
    console.error("Unable to load project 3D model", error);
    return new Response("3D model is temporarily unavailable", { status: 503 });
  }
}
