import { NextResponse } from "next/server";
import { getEnvStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const env = getEnvStatus();
  let database: "ok" | "unavailable" = "ok";

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }

  const status = database === "ok" && env.missing.length === 0 ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      database,
      ai: { configured: env.aiConfigured },
      auth: { required: env.authRequired },
      upload: { provider: env.uploadProvider, maxUploadMb: env.maxUploadMb },
      missing: env.missing,
      timestamp: new Date().toISOString()
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
