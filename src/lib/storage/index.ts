import { getEnv } from "@/lib/env";
import { databaseStorageProvider } from "./database";
import { localStorageProvider } from "./local";
import { s3StorageProvider } from "./s3";
import type { StorageProvider } from "./types";

export function getStorageProvider(): StorageProvider {
  const env = getEnv();
  if (env.UPLOAD_STORAGE_PROVIDER === "database") return databaseStorageProvider;
  if (env.UPLOAD_STORAGE_PROVIDER === "s3") return s3StorageProvider;
  return localStorageProvider;
}
