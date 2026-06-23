import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();
const checkWritableMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRawMock
  }
}));

vi.mock("@/lib/storage", () => ({
  getStorageProvider: () => ({
    name: "s3",
    checkWritable: checkWritableMock
  })
}));

vi.mock("@/lib/connectors/status", () => ({
  connectorSummary: () => ({ configured: 0, enabled: 0, readOnly: 0, disabled: 0 }),
  getConnectorStatuses: () => []
}));

describe("health route", () => {
  beforeEach(() => {
    vi.resetModules();
    queryRawMock.mockReset();
    checkWritableMock.mockReset();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://pgs:pgs@localhost:5432/pgs");
    vi.stubEnv("AUTH_REQUIRED", "true");
    vi.stubEnv("SESSION_SECRET", "session-secret");
    vi.stubEnv("UPLOAD_STORAGE_PROVIDER", "s3");
    vi.stubEnv("S3_BUCKET", "pgs");
    vi.stubEnv("S3_REGION", "us-east-1");
    vi.stubEnv("S3_ACCESS_KEY_ID", "access");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("returns degraded instead of hanging when storage health check times out", async () => {
    vi.useFakeTimers();
    queryRawMock.mockResolvedValueOnce([{ ok: 1 }]).mockResolvedValueOnce([{ count: BigInt(6) }]);
    checkWritableMock.mockReturnValue(new Promise(() => undefined));
    const { GET } = await import("./route");

    const responsePromise = GET();
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await responsePromise;
    const body = (await response.json()) as {
      status: string;
      database: string;
      storage: { writable: boolean };
      migrations: { status: string; count?: number };
    };

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("ok");
    expect(body.storage.writable).toBe(false);
    expect(body.migrations).toEqual({ status: "ok", count: 6 });
  });
});
