import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadGoogleDriveFile, listGoogleDriveFolder, parseGoogleDriveFolderId } from "./google-drive";

const previousConnectorMode = process.env.GOOGLE_DRIVE_CONNECTOR_MODE;
const previousApiKey = process.env.GOOGLE_DRIVE_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousConnectorMode === undefined) delete process.env.GOOGLE_DRIVE_CONNECTOR_MODE;
  else process.env.GOOGLE_DRIVE_CONNECTOR_MODE = previousConnectorMode;
  if (previousApiKey === undefined) delete process.env.GOOGLE_DRIVE_API_KEY;
  else process.env.GOOGLE_DRIVE_API_KEY = previousApiKey;
});

describe("Google Drive technical documentation source", () => {
  it("accepts a shared folder URL or a raw folder id", () => {
    expect(parseGoogleDriveFolderId("https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUv?usp=sharing")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
    expect(parseGoogleDriveFolderId("1AbCdEfGhIjKlMnOpQrStUv")).toBe("1AbCdEfGhIjKlMnOpQrStUv");
  });

  it("rejects arbitrary URLs", () => {
    expect(parseGoogleDriveFolderId("https://example.com/project-docs")).toBeNull();
  });

  it("resolves shortcut target metadata so target edits invalidate the index", async () => {
    process.env.GOOGLE_DRIVE_CONNECTOR_MODE = "read_only";
    process.env.GOOGLE_DRIVE_API_KEY = "test-key";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/files/target-file-1")) {
        return new Response(JSON.stringify({
          id: "target-file-1",
          name: "Рабочая документация.pdf",
          mimeType: "application/pdf",
          modifiedTime: "2026-09-07T10:00:00.000Z",
          size: "1024",
          webViewLink: "https://drive.google.com/file/d/target-file-1/view"
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        files: [{
          id: "shortcut-1",
          name: "Ярлык на рабочую документацию",
          mimeType: "application/vnd.google-apps.shortcut",
          modifiedTime: "2026-09-01T10:00:00.000Z",
          shortcutDetails: { targetId: "target-file-1", targetMimeType: "application/pdf" }
        }]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const listing = await listGoogleDriveFolder("root-folder-id");

    expect(listing.files).toEqual([expect.objectContaining({
      id: "target-file-1",
      name: "Рабочая документация.pdf",
      modifiedTime: "2026-09-07T10:00:00.000Z"
    })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("accepts a 55 MiB project PDF and keeps a bounded 64 MiB limit", async () => {
    process.env.GOOGLE_DRIVE_CONNECTOR_MODE = "read_only";
    process.env.GOOGLE_DRIVE_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadGoogleDriveFile({
      id: "large-project-pdf",
      name: "project.pdf",
      mimeType: "application/pdf",
      size: String(55 * 1024 * 1024)
    })).resolves.toMatchObject({ fileName: "project.pdf", mimeType: "application/pdf" });
    await expect(downloadGoogleDriveFile({
      id: "too-large-project-pdf",
      name: "too-large.pdf",
      mimeType: "application/pdf",
      size: String(65 * 1024 * 1024)
    })).rejects.toThrow("64 МБ");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
