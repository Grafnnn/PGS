import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProject3dModel } from "@/lib/project-3d-model";
import { decorateProject3dModelHtml } from "@/lib/project-3d-model-html";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/project-route-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function responseHeaders(modelSlug: string) {
  return {
    "Cache-Control": "private, max-age=3600, must-revalidate",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
    "Content-Type": "text/html; charset=utf-8",
    ETag: `"${modelSlug}"`,
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
    const source = await readFile(path.join(process.cwd(), model.assetPath), "utf8");
    const html = decorateProject3dModelHtml(source);
    return new Response(html, { status: 200, headers });
  } catch (error) {
    console.error("Unable to load project 3D model", error);
    return new Response("3D model is temporarily unavailable", { status: 503 });
  }
}
