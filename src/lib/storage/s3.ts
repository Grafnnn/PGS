import type { StorageProvider } from "./types";

function s3NotImplemented(): never {
  throw new Error("S3 storage provider is not implemented in v0.6. Configure UPLOAD_STORAGE_PROVIDER=local or add an S3 adapter.");
}

export const s3StorageProvider: StorageProvider = {
  name: "s3",
  async write() {
    s3NotImplemented();
  },
  async read() {
    s3NotImplemented();
  },
  async delete() {
    s3NotImplemented();
  },
  async checkWritable() {
    return false;
  }
};
