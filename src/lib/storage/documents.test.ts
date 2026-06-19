import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeStorageKey, readDocumentFile, resolveStoragePath, sanitizeFileName, saveDocumentFile, validateDocumentUpload } from "./documents";
import { s3StorageProvider } from "./s3";

const originalUploadDir = process.env.UPLOAD_DIR;

afterEach(() => {
  process.env.UPLOAD_DIR = originalUploadDir;
  process.env.UPLOAD_STORAGE_PROVIDER = "local";
});

describe("document storage helpers", () => {
  it("sanitizes file names and creates scoped storage keys", () => {
    expect(sanitizeFileName("../contract?.pdf")).toBe("contract_.pdf");
    expect(makeStorageKey("project-demo", "contract.pdf")).toMatch(/^project-demo\/[0-9a-f-]+\.pdf$/);
  });

  it("validates allowed metadata", () => {
    expect(validateDocumentUpload("contract.pdf", "application/pdf", 1000)).toBeNull();
    expect(validateDocumentUpload("script.sh", "text/x-shellscript", 1000)).toContain("Unsupported");
  });

  it("rejects path traversal and writes through the local provider", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pgs-storage-"));
    process.env.UPLOAD_DIR = tempDir;
    await saveDocumentFile("project-demo/file.pdf", Buffer.from("pdf"));

    await expect(readDocumentFile("project-demo/file.pdf")).resolves.toEqual(Buffer.from("pdf"));
    expect(() => resolveStoragePath("../escape.pdf")).toThrow("Invalid storage key");
  });

  it("keeps S3 failures clear when configuration is missing", async () => {
    await expect(s3StorageProvider.write("key", Buffer.from("x"))).rejects.toThrow("Missing S3 configuration");
    await expect(s3StorageProvider.checkWritable()).resolves.toBe(false);
  });
});
