import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    storedFile: mocks
  }
}));

import { databaseStorageProvider } from "./database";

describe("database storage provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({});
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("writes, reads and deletes file bytes by storage key", async () => {
    const bytes = Buffer.from("photo");
    mocks.findUnique.mockResolvedValue({ bytes: new Uint8Array(bytes) });

    await expect(databaseStorageProvider.write("project/photo.png", bytes)).resolves.toEqual({ storageKey: "project/photo.png" });
    await expect(databaseStorageProvider.read("project/photo.png")).resolves.toEqual(bytes);
    await expect(databaseStorageProvider.delete("project/photo.png")).resolves.toBeUndefined();

    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { storageKey: "project/photo.png" },
      create: { storageKey: "project/photo.png", bytes, sizeBytes: bytes.byteLength },
      update: { bytes, sizeBytes: bytes.byteLength }
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { storageKey: "project/photo.png" } });
  });

  it("fails clearly when a storage key is missing", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(databaseStorageProvider.read("missing")).rejects.toThrow("Stored file not found");
  });

  it("checks write/read/delete and always removes the probe", async () => {
    mocks.findUnique.mockResolvedValue({ bytes: new Uint8Array(Buffer.from("ok")) });

    await expect(databaseStorageProvider.checkWritable()).resolves.toBe(true);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.findUnique).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).toHaveBeenCalledOnce();
  });

  it("reports an unavailable database as not writable", async () => {
    mocks.upsert.mockRejectedValue(new Error("database unavailable"));

    await expect(databaseStorageProvider.checkWritable()).resolves.toBe(false);
    expect(mocks.deleteMany).toHaveBeenCalledOnce();
  });
});
