import { afterEach, describe, expect, it, vi } from "vitest";
import { getS3Config, s3StorageProvider, StorageConfigurationError } from "./s3";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function setS3Env() {
  process.env.UPLOAD_STORAGE_PROVIDER = "s3";
  process.env.S3_BUCKET = "pgs";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ENDPOINT = "https://s3.example.test";
  process.env.S3_ACCESS_KEY_ID = "access";
  process.env.S3_SECRET_ACCESS_KEY = "secret";
}

describe("s3 storage provider", () => {
  it("reports missing configuration without secrets", () => {
    process.env.UPLOAD_STORAGE_PROVIDER = "s3";
    delete process.env.S3_BUCKET;
    expect(() => getS3Config()).toThrow(StorageConfigurationError);
  });

  it("signs put/get/delete through fetch", async () => {
    setS3Env();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await s3StorageProvider.write("project/file.pdf", Buffer.from("pdf"));
    await expect(s3StorageProvider.read("project/file.pdf")).resolves.toEqual(Buffer.from("ok"));
    await s3StorageProvider.delete("project/file.pdf");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>).authorization).toContain("AWS4-HMAC-SHA256");
  });
});
