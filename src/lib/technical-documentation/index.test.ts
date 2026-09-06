import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ knowledgeChunkFindMany: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { projectKnowledgeChunk: { findMany: mocks.knowledgeChunkFindMany } }
}));

import { GOOGLE_DRIVE_AUTO_REFRESH_MS, googleDriveNeedsRefresh, searchProjectKnowledge } from "./index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Google Drive knowledge freshness", () => {
  const now = Date.parse("2026-09-07T08:00:00.000Z");

  it("does not schedule Drive work when a project folder is absent", () => {
    expect(googleDriveNeedsRefresh({ driveFolderId: null }, now)).toBe(false);
  });

  it("refreshes a new, failed or expired Drive index", () => {
    expect(googleDriveNeedsRefresh({ driveFolderId: "folder-1", driveSyncStatus: "pending", lastDriveSyncedAt: null }, now)).toBe(true);
    expect(googleDriveNeedsRefresh({
      driveFolderId: "folder-1",
      driveSyncStatus: "ready",
      lastDriveSyncedAt: new Date(now - GOOGLE_DRIVE_AUTO_REFRESH_MS)
    }, now)).toBe(true);
  });

  it("reuses a fresh Drive index to keep questions fast and inexpensive", () => {
    expect(googleDriveNeedsRefresh({
      driveFolderId: "folder-1",
      driveSyncStatus: "ready",
      lastDriveSyncedAt: new Date(now - GOOGLE_DRIVE_AUTO_REFRESH_MS + 1)
    }, now)).toBe(false);
  });
});

describe("project knowledge source priority", () => {
  const chunk = (sourceKind: "google_drive" | "pgs", id: string) => ({
    id: `chunk-${id}`,
    locator: "Страница 1",
    text: "Адрес объекта: город Москва, Троицк",
    terms: ["адрес", "объекта", "троицк"],
    knowledgeDocument: {
      id: `document-${id}`,
      sourceKind,
      title: sourceKind === "google_drive" ? "Проектная документация.pdf" : "Проектная книга.xlsx",
      sourceUrl: sourceKind === "google_drive" ? "https://drive.google.com/file/d/example/view" : "/api/projects/project-1/documents/example/download"
    }
  });

  it("uses Google Drive as the authoritative source when it has a relevant match", async () => {
    mocks.knowledgeChunkFindMany.mockResolvedValueOnce([chunk("google_drive", "drive")]);

    const result = await searchProjectKnowledge("project-1", "Какой адрес объекта?");

    expect(result).toHaveLength(1);
    expect(result[0].sourceKind).toBe("google_drive");
    expect(mocks.knowledgeChunkFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.knowledgeChunkFindMany.mock.calls[0][0].where.knowledgeDocument.sourceKind).toBe("google_drive");
  });

  it("falls back to PGS documents only when Google Drive has no relevant match", async () => {
    mocks.knowledgeChunkFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([chunk("pgs", "pgs")]);

    const result = await searchProjectKnowledge("project-1", "Какой адрес объекта?");

    expect(result).toHaveLength(1);
    expect(result[0].sourceKind).toBe("pgs");
    expect(mocks.knowledgeChunkFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.knowledgeChunkFindMany.mock.calls.map(([call]) => call.where.knowledgeDocument.sourceKind)).toEqual(["google_drive", "pgs"]);
  });
});
