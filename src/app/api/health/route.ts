import { NextResponse } from "next/server";
import { connectorSummary, getConnectorStatuses } from "@/lib/connectors/status";
import { getEnvStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs);
  });
  try {
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function GET() {
  const env = getEnvStatus();
  let database: "ok" | "unavailable" = "ok";
  let storageWritable = false;
  let migrations: { status: "ok"; count: number } | { status: "unavailable" } = { status: "unavailable" };

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3_000);
    const rows = await withTimeout(
      prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
      3_000
    );
    migrations = { status: "ok", count: Number(rows[0]?.count ?? 0) };
  } catch {
    database = "unavailable";
  }

  try {
    storageWritable = await withTimeout(getStorageProvider().checkWritable(), 5_000);
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
      connectors: connectorSummary(getConnectorStatuses()),
      migrations,
      version: { appVersion: env.appVersion, gitSha: env.gitSha ?? null },
      missing: env.missing,
      timestamp: new Date().toISOString()
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
