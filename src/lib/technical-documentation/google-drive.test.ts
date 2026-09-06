import { describe, expect, it } from "vitest";
import { parseGoogleDriveFolderId } from "./google-drive";

describe("Google Drive technical documentation source", () => {
  it("accepts a shared folder URL or a raw folder id", () => {
    expect(parseGoogleDriveFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv?usp=sharing")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(parseGoogleDriveFolderId("1AbCdEfGhIjKlMnOpQrStUv")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
  });

  it("rejects arbitrary URLs", () => {
    expect(parseGoogleDriveFolderId("https://example.com/project-docs")).toBeNull();
  });
});
