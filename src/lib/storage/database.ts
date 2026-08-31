import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { StorageProvider } from "./types";

export const databaseStorageProvider: StorageProvider = {
  name: "database",
  async write(storageKey, bytes) {
    await prisma.storedFile.upsert({
      where: { storageKey },
      create: { storageKey, bytes, sizeBytes: bytes.byteLength },
      update: { bytes, sizeBytes: bytes.byteLength }
    });
    return { storageKey };
  },
  async read(storageKey) {
    const storedFile = await prisma.storedFile.findUnique({
      where: { storageKey },
      select: { bytes: true }
    });
    if (!storedFile) throw new Error("Stored file not found");
    return Buffer.from(storedFile.bytes);
  },
  async delete(storageKey) {
    await prisma.storedFile.deleteMany({ where: { storageKey } });
  },
  async checkWritable() {
    const probeKey = `.health/${crypto.randomUUID()}.tmp`;
    try {
      await this.write(probeKey, Buffer.from("ok"));
      const probe = await this.read(probeKey);
      return probe.equals(Buffer.from("ok"));
    } catch {
      return false;
    } finally {
      await this.delete(probeKey).catch(() => undefined);
    }
  }
};
