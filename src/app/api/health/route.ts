import { NextResponse } from "next/server";
import { getEnvStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";

export async function GET() {
  const env = getEnvStatus();
  let database: "ok" | "unavailable" = "ok";
  let storageWritable = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = "unavailable";
  }

  try {
    storageWritable = await getStorageProvider().checkWritable();
  } catch {
    storageWritable = false;
  }

  const status = database === "ok" && storageWritable && env.missing.length === 0 ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      database,
      ai: { configured: env.aiConfigured },
      auth: { required: env.authRequired, mode: env.authMode },
      storage: { provider: env.uploadProvider, writable: storageWritable, maxUploadMb: env.maxUploadMb },
      version: { appVersion: env.appVersion, gitSha: env.gitSha ?? null },
      missing: env.missing,
      timestamp: new Date().toISOString()
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
