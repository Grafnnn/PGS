import { afterEach, describe, expect, it, vi } from "vitest";
import { getStorageProvider } from "./index";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("storage provider selection", () => {
  it.each([
    ["local", "local"],
    ["database", "database"],
    ["s3", "s3"]
  ] as const)("selects %s storage", (configured, expected) => {
    vi.stubEnv("UPLOAD_STORAGE_PROVIDER", configured);
    expect(getStorageProvider().name).toBe(expected);
  });
});
