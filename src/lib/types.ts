export type ProjectStatus = "draft" | "planning" | "active" | "paused" | "completed" | "archived";
export type BudgetKind = "work" | "material" | "equipment" | "payroll" | "subcontract" | "overhead" | "other";
export type WorkStatus = "not_started" | "in_progress" | "done" | "delayed" | "stopped";
export type RiskPriority = "low" | "medium" | "high" | "critical";
export type RiskStatus = "open" | "in_progress" | "closed" | "deferred";
export type PaymentDirection = "incoming" | "outgoing";

export type UserRole =
  | "super_admin"
  | "owner"
  | "project_manager"
  | "finance"
  | "technical_director"
  | "pto"
  | "procurement"
  | "site_engineer"
  | "subcontractor";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  code?: string;
  customer: string;
  object: string;
  objectType?: string;
  address: string;
  description?: string;
  contractAmount: number;
  vatMode: "vat" | "no_vat";
  vatPercent?: number;
  startsAt: string;
  endsAt: string;
  manager: string;
  tenderSource?: string;
  paymentNotes?: string;
  volumeChangeMode?: string;
  templateId?: string;
  selectedModules?: string[];
  status: ProjectStatus;
  isSmokeProject?: boolean;
}

export interface ProjectCostCode {
  id: string;
  projectId: string;
  parentId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  segment: "wbs" | "cost";
  costType: "capital" | "expense";
  status: "active" | "inactive";
  source: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BudgetItem {
  id: string;
  projectId: string;
  costCodeId?: string | null;
  section: string;
  subsection?: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  plannedUnitPrice: number;
  actualUnitPrice: number;
  forecastUnitPrice: number;
  kind: BudgetKind;
  source: string;
  comment?: string;
}

export interface ScheduleItem {
  id: string;
  projectId: string;
  budgetItemId?: string;
  costCodeId?: string | null;
  name: string;
  owner: string;
  startsAt: string;
  endsAt: string;
  plannedQty: number;
  actualQty: number;
  status: WorkStatus;
  dependency?: string;
}

export interface Material {
  id: string;
  projectId: string;
  costCodeId?: string | null;
  name: string;
  unit: string;
  requiredQty: number;
  orderedQty: number;
  deliveredQty: number;
  consumedQty: number;
  plannedUnitPrice: number;
  actualUnitPrice: number;
  supplier: string;
  neededAt: string;
  status: "required" | "requested" | "approving" | "ordered" | "in_transit" | "delivered" | "closed" | "cancelled";
}

export interface ProcurementRequest {
  id: string;
  projectId: string;
  title: string;
  initiator: string;
  neededAt: string;
  priority: RiskPriority;
  status: "draft" | "submitted" | "approved" | "ordered" | "closed" | "rejected";
  items: Array<{ id?: string; materialId: string; costCodeId?: string | null; name: string; qty: number; unit: string; comment?: string }>;
}

export interface Payment {
  id: string;
  projectId: string;
  costCodeId?: string | null;
  title: string;
  counterparty: string;
  direction: PaymentDirection;
  plannedAt: string;
  paidAt?: string;
  amount: number;
  status: "planned" | "approved" | "paid" | "overdue";
  category: "customer" | "supplier" | "subcontractor" | "payroll" | "tax" | "overhead" | "loan";
}

export interface DailyReport {
  id: string;
  projectId: string;
  date: string;
  author: string;
  weather: string;
  workers: number;
  engineers: number;
  equipment: string;
  completedWorks: string;
  materialsReceived: string;
  materialsConsumed: string;
  downtime: string;
  issues: string;
  status: "draft" | "submitted" | "checked" | "approved";
}

export interface Risk {
  id: string;
  projectId: string;
  title: string;
  reason: string;
  priority: RiskPriority;
  owner: string;
  dueAt: string;
  status: RiskStatus;
}

export interface AiMessage {
  id: string;
  projectId: string;
  userId: string;
  prompt: string;
  response: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  projectId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  entity: string;
  entityId: string;
  action: string;
  summary?: string | null;
  createdAt: string;
}

export type ProjectActionStatus = "open" | "in_progress" | "waiting_approval" | "blocked" | "done";

export interface ProjectActionItem {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  sourceModule: string;
  targetTab?: string | null;
  priority: RiskPriority;
  status: ProjectActionStatus;
  assignee?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  requiresApproval: boolean;
  approvedAt?: string | null;
  approvedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ChangeOrderStatus = "draft" | "open" | "submitted" | "revision_required" | "approved" | "executed" | "rejected" | "void";

export interface ProjectChangeOrder {
  id: string;
  projectId: string;
  commitmentId?: string | null;
  sequence: number;
  number: string;
  kind: "potential" | "request" | "owner" | "subcontract" | "directive";
  scope: "in_scope" | "budget_only" | "out_of_scope" | "contingency";
  title: string;
  description?: string | null;
  reason?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  counterparty?: string | null;
  status: ChangeOrderStatus;
  currency: string;
  scheduleImpactDays: number;
  estimatedAmount: number;
  proposedAmount: number;
  submittedAmount: number;
  approvedAmount: number;
  committedAmount: number;
  linkedDocumentId?: string | null;
  linkedDocumentVersion?: number | null;
  approvalWorkflowRunId?: string | null;
  decisionComment?: string | null;
  dueAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  executedAt?: string | null;
  linkedDocument?: { title: string; fileName?: string | null } | null;
  approvalWorkflowRun?: { id: string; title: string; status: string } | null;
  items: Array<{
    id: string;
    budgetItemId?: string | null;
    costCodeId?: string | null;
    sequence: number;
    code?: string | null;
    description: string;
    quantity: number;
    unit: string;
    estimatedUnitPrice: number;
    proposedUnitPrice: number;
    submittedUnitPrice: number;
    approvedUnitPrice: number;
    committedUnitPrice: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type ProjectCommitmentType = "owner_contract" | "subcontract" | "purchase_order" | "service_order";
export type ProjectCommitmentStatus = "draft" | "submitted" | "revision_required" | "approved" | "active" | "completed" | "terminated" | "rejected" | "void";
export type ProjectPaymentApplicationStatus = "draft" | "submitted" | "approved" | "rejected" | "paid" | "void";

export interface ProjectPaymentApplication {
  id: string;
  projectId: string;
  commitmentId: string;
  paymentId?: string | null;
  sequence: number;
  number: string;
  periodStart: string;
  periodEnd: string;
  status: ProjectPaymentApplicationStatus;
  currentAmount: number;
  materialsStored: number;
  retentionAmount: number;
  netAmount: number;
  notes?: string | null;
  decisionComment?: string | null;
  payment?: { id: string; title: string; status: string; amount: number; direction: string } | null;
  lines: Array<{
    id: string;
    commitmentLineId: string;
    previousAmount: number;
    currentAmount: number;
    materialsStored: number;
    retentionAmount: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCommitment {
  id: string;
  projectId: string;
  sequence: number;
  number: string;
  type: ProjectCommitmentType;
  title: string;
  counterparty: string;
  externalNumber?: string | null;
  status: ProjectCommitmentStatus;
  currency: string;
  retentionPercent: number;
  paymentTerms?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  sourceProcurementRequestId?: string | null;
  linkedDocumentId?: string | null;
  linkedDocumentVersion?: number | null;
  approvalWorkflowRunId?: string | null;
  decisionComment?: string | null;
  linkedDocument?: { title: string; fileName?: string | null } | null;
  sourceProcurementRequest?: { id: string; title: string } | null;
  approvalWorkflowRun?: { id: string; title: string; status: string } | null;
  lines: Array<{
    id: string;
    budgetItemId?: string | null;
    costCodeId?: string | null;
    sourceProcurementRequestItemId?: string | null;
    sequence: number;
    code?: string | null;
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    scheduledValue: number;
    costCode?: { code: string; name: string } | null;
  }>;
  changeOrders: Array<{ id: string; number: string; title: string; status: string; approvedAmount: number; committedAmount: number }>;
  paymentApplications: ProjectPaymentApplication[];
  values: {
    original: number;
    approvedChanges: number;
    revised: number;
    approvedApplications: number;
    paid: number;
    retentionHeld: number;
    remaining: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type QualityInspectionType = "incoming" | "work" | "hold_point" | "final";
export type QualityInspectionStatus = "planned" | "in_progress" | "passed" | "failed" | "closed" | "void";
export type QualityCheckResult = "pending" | "pass" | "fail" | "na";
export type QualityIssueType = "observation" | "punch" | "ncr" | "defect";
export type QualityIssueStatus = "open" | "in_progress" | "ready_for_verification" | "verified" | "closed" | "void";

export interface ProjectQualityInspection {
  id: string;
  projectId: string;
  sequence: number;
  number: string;
  type: QualityInspectionType;
  title: string;
  location?: string | null;
  inspector?: string | null;
  responsibleParty?: string | null;
  status: QualityInspectionStatus;
  scheduledAt?: string | null;
  decisionComment?: string | null;
  linkedScheduleItemId?: string | null;
  costCodeId?: string | null;
  linkedDocumentId?: string | null;
  linkedDocumentVersion?: number | null;
  linkedScheduleItem?: { id: string; name: string; status: string } | null;
  costCode?: { id: string; code: string; name: string } | null;
  linkedDocument?: { id: string; title: string; fileName?: string | null } | null;
  checks: Array<{ id: string; sequence: number; title: string; requirement?: string | null; result: QualityCheckResult; comment?: string | null }>;
  issues: Array<{ id: string; number: string; title: string; status: QualityIssueStatus; severity: RiskPriority; acceptanceBlocker: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectQualityIssue {
  id: string;
  projectId: string;
  inspectionId?: string | null;
  sequence: number;
  number: string;
  type: QualityIssueType;
  title: string;
  description: string;
  location?: string | null;
  severity: RiskPriority;
  status: QualityIssueStatus;
  responsibleParty?: string | null;
  dueAt?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  decisionComment?: string | null;
  acceptanceBlocker: boolean;
  costImpact: number;
  scheduleImpactDays: number;
  linkedScheduleItemId?: string | null;
  costCodeId?: string | null;
  sourceDailyReportId?: string | null;
  linkedDocumentId?: string | null;
  linkedDocumentVersion?: number | null;
  verificationWorkflowRunId?: string | null;
  inspection?: { id: string; number: string; title: string; status: string } | null;
  linkedScheduleItem?: { id: string; name: string; status: string } | null;
  costCode?: { id: string; code: string; name: string } | null;
  linkedDocument?: { id: string; title: string; fileName?: string | null } | null;
  verificationWorkflowRun?: { id: string; title: string; status: string } | null;
  evidence: Array<{
    id: string;
    phase: "opening" | "corrective" | "closure";
    documentId?: string | null;
    documentVersionId?: string | null;
    documentVersion?: number | null;
    titleSnapshot: string;
    fileNameSnapshot?: string | null;
    note?: string | null;
    createdAt: string;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    statusBefore?: string | null;
    statusAfter?: string | null;
    comment?: string | null;
    createdByName?: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDocument {
  id: string;
  projectId: string;
  category: string;
  title: string;
  filePath: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  storageKey?: string | null;
  uploadedAt?: string | null;
  previewAvailable?: boolean;
  version: number;
  author: string;
  comment?: string | null;
  createdAt: string;
}

export interface ProjectDocumentVersion {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType?: string | null;
  sizeBytes: number;
  storageKey: string;
  uploadedByName?: string | null;
  previewAvailable: boolean;
  createdAt: string;
}

export type RfiStatus = "draft" | "open" | "answered" | "closed";

export interface ProjectRfi {
  id: string;
  projectId: string;
  number: string;
  sequence: number;
  subject: string;
  question: string;
  discipline?: string | null;
  location?: string | null;
  priority: RiskPriority;
  status: RfiStatus;
  assignee?: string | null;
  dueAt?: string | null;
  sentAt?: string | null;
  answeredAt?: string | null;
  closedAt?: string | null;
  linkedDocumentId?: string | null;
  linkedDocumentVersion?: number | null;
  linkedDocumentVersionId?: string | null;
  responses: Array<{ id: string; body: string; createdByName?: string | null; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export type SubmittalStatus = "draft" | "submitted" | "approved" | "rejected" | "revise_required" | "closed";

export interface ProjectSubmittal {
  id: string;
  projectId: string;
  number: string;
  sequence: number;
  title: string;
  category: string;
  specSection?: string | null;
  revision: number;
  status: SubmittalStatus;
  reviewer?: string | null;
  dueAt?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  closedAt?: string | null;
  linkedDocumentId?: string | null;
  linkedDocumentVersion?: number | null;
  linkedDocumentVersionId?: string | null;
  reviews: Array<{ id: string; revision: number; decision: string; comment?: string | null; createdByName?: string | null; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export type DocumentTransmittalStatus = "draft" | "issued" | "acknowledged" | "approved" | "revise_required" | "closed";

export interface ProjectDocumentTransmittal {
  id: string;
  projectId: string;
  number: string;
  sequence: number;
  subject: string;
  purpose?: string | null;
  recipient?: string | null;
  ccRecipients?: string | null;
  reviewer?: string | null;
  dueAt?: string | null;
  status: DocumentTransmittalStatus;
  revision: number;
  issuedAt?: string | null;
  acknowledgedAt?: string | null;
  reviewedAt?: string | null;
  closedAt?: string | null;
  items: Array<{
    id: string;
    documentId?: string | null;
    documentVersionId?: string | null;
    documentVersion?: number | null;
    titleSnapshot: string;
    fileNameSnapshot?: string | null;
    categorySnapshot?: string | null;
  }>;
  events: Array<{
    id: string;
    revision: number;
    eventType: string;
    decision?: string | null;
    comment?: string | null;
    createdByName?: string | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
    isActive: boolean;
  };
}

export interface DemoState {
  users: User[];
  projects: Project[];
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  dailyReports: DailyReport[];
  risks: Risk[];
  aiMessages: AiMessage[];
}
