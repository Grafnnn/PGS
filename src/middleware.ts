import { NextRequest, NextResponse } from "next/server";
import { legacyAtlasDestination, legacyAtlasWorker } from "@/lib/project-atlas-legacy";

export function middleware(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  const url = new URL(request.url);
  const target = legacyAtlasDestination(url);
  if (target) {
    const response = NextResponse.redirect(target, 307);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const worker = legacyAtlasWorker(url);
  if (worker) return new NextResponse(request.method === "HEAD" ? null : worker, { headers: {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  } });
  return NextResponse.next();
}

export const config = { matcher: ["/model-assets/:path*"] };
