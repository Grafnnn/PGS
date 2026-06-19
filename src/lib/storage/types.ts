export type StorageProviderName = "local" | "s3";

export interface StorageWriteResult {
  storageKey: string;
  path?: string;
}

export interface StorageProvider {
  name: StorageProviderName;
  write(storageKey: string, bytes: Buffer): Promise<StorageWriteResult>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  checkWritable(): Promise<boolean>;
}
