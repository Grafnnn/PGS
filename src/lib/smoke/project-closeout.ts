export type ProjectCloseoutSmokeEvidence = {
  projectCreated: boolean;
  projectOpened: boolean;
  documentUploaded: boolean;
  blockerEnforced: boolean;
  blockerCleared: boolean;
  transmittalCreated: boolean;
  transmittalIssued: boolean;
  transmittalLinked: boolean;
  warrantyEvidenceLinked: boolean;
  checklistCompleted: number;
  requiredChecklistItems: number;
  packageSubmitted: boolean;
  inboxVisible: boolean;
  packageAccepted: boolean;
  packageClosed: boolean;
  warrantyClosed: boolean;
  projectCompleted: boolean;
  finalReadPassed: boolean;
  projectDeleted: boolean;
  projectDeletionVerified: boolean;
  storageCleaned: boolean;
  permissionRestored: boolean;
};

export function projectCloseoutSmokePassed(evidence: ProjectCloseoutSmokeEvidence) {
  return evidence.projectCreated
    && evidence.projectOpened
    && evidence.documentUploaded
    && evidence.blockerEnforced
    && evidence.blockerCleared
    && evidence.transmittalCreated
    && evidence.transmittalIssued
    && evidence.transmittalLinked
    && evidence.warrantyEvidenceLinked
    && evidence.requiredChecklistItems > 0
    && evidence.checklistCompleted === evidence.requiredChecklistItems
    && evidence.packageSubmitted
    && evidence.inboxVisible
    && evidence.packageAccepted
    && evidence.packageClosed
    && evidence.warrantyClosed
    && evidence.projectCompleted
    && evidence.finalReadPassed
    && evidence.projectDeleted
    && evidence.projectDeletionVerified
    && evidence.storageCleaned
    && evidence.permissionRestored;
}
