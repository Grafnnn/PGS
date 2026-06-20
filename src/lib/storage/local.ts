import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import type { StorageProvider } from "./types";

export function resolveLocalStoragePath(storageKey: string) {
  const env = getEnv();
  const root = path.resolve(env.UPLOAD_DIR);
  const target = path.resolve(root, storageKey);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid storage key");
  return target;
}

export const localStorageProvider: StorageProvider = {
  name: "local",
  async write(storageKey, bytes) {
    const target = resolveLocalStoragePath(storageKey);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    return { storageKey, path: target };
  },
  async read(storageKey) {
    return fs.readFile(resolveLocalStoragePath(storageKey));
  },
  async delete(storageKey) {
    await fs.unlink(resolveLocalStoragePath(storageKey)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  },
  async checkWritable() {
    const probeKey = `.health/${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
    try {
      await this.write(probeKey, Buffer.from("ok"));
      await this.delete(probeKey);
      return true;
    } catch {
      return false;
    }
  }
};
