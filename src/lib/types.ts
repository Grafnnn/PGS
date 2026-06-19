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
  customer: string;
  object: string;
  address: string;
  contractAmount: number;
  vatMode: "vat" | "no_vat";
  startsAt: string;
  endsAt: string;
  manager: string;
  status: ProjectStatus;
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
  entity: string;
  entityId: string;
  action: string;
  summary?: string | null;
  createdAt: string;
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
