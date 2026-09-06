import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { GOOGLE_DRIVE_AUTO_REFRESH_MS, googleDriveNeedsRefresh } from "./index";

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
