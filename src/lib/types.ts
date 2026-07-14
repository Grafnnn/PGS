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

export interface BudgetItem {
  id: string;
  projectId: string;
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
  items: Array<{ materialId: string; name: string; qty: number; unit: string; comment?: string }>;
}

export interface Payment {
  id: string;
  projectId: string;
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
