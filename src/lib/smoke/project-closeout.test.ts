import { describe, expect, it } from "vitest";
import { projectCloseoutSmokePassed, type ProjectCloseoutSmokeEvidence } from "./project-closeout";

const passingEvidence: ProjectCloseoutSmokeEvidence = {
  projectCreated: true,
  projectOpened: true,
  documentUploaded: true,
  blockerEnforced: true,
  blockerCleared: true,
  transmittalCreated: true,
  transmittalIssued: true,
  transmittalLinked: true,
  warrantyEvidenceLinked: true,
  checklistCompleted: 8,
  requiredChecklistItems: 8,
  packageSubmitted: true,
  inboxVisible: true,
  packageAccepted: true,
  packageClosed: true,
  warrantyClosed: true,
  projectCompleted: true,
  finalReadPassed: true,
  projectDeleted: true,
  projectDeletionVerified: true,
  storageCleaned: true,
  permissionRestored: true
};

describe("project closeout staging smoke evidence", () => {
  it("passes only for the complete disposable lifecycle", () => {
    expect(projectCloseoutSmokePassed(passingEvidence)).toBe(true);
  });

  it.each([
    ["quality blocker", { blockerEnforced: false }],
    ["Approval Inbox", { inboxVisible: false }],
    ["warranty close", { warrantyClosed: false }],
    ["project deletion", { projectDeletionVerified: false }],
    ["role restoration", { permissionRestored: false }]
  ])("fails when %s evidence is missing", (_label, patch) => {
    expect(projectCloseoutSmokePassed({ ...passingEvidence, ...patch })).toBe(false);
  });

  it("fails when not every required checklist item is completed", () => {
    expect(projectCloseoutSmokePassed({ ...passingEvidence, checklistCompleted: 7 })).toBe(false);
  });
});
