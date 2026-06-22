import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type IntelligenceCategory = "budget" | "schedule" | "procurement" | "finance" | "documents" | "risks" | "import" | "ai";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface IntelligenceEvidence {
  entityType: "budgetItem" | "material" | "scheduleItem" | "procurementItem" | "payment" | "document" | "importBatch" | "risk" | "project" | "unknown";
  entityId?: string | null;
  label: string;
  field?: string | null;
  value?: string | number | boolean | null;
  explanation: string;
  documentId?: string | null;
  page?: number | null;
  section?: string | null;
  snippet?: string | null;
}

export interface IntelligenceIssue {
  id: string;
  category: IntelligenceCategory;
  title: string;
  reason: string;
  level: RiskLevel;
  score: number;
  suggestedAction: string;
  evidence: IntelligenceEvidence[];
}

export interface IntelligenceAction {
  id: string;
  category: IntelligenceCategory;
  actionType: string;
  priority: RiskLevel;
  title: string;
  description: string;
  suggestedNextStep: string;
  dueDate?: string | null;
  ownerRole?: string | null;
  evidence: IntelligenceEvidence[];
  entityType?: IntelligenceEvidence["entityType"] | null;
  entityId?: string | null;
}

export interface RiskRadarCard {
  category: IntelligenceCategory;
  title: string;
  level: RiskLevel;
  score: number;
  shortReason: string;
  suggestedAction: string;
  evidence: IntelligenceEvidence[];
}

export interface ProjectIntelligenceContext {
  project: Project;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  documents: ProjectDocument[];
  risks: Risk[];
}

export interface BudgetIntelligence {
  topCostItems: Array<{ id: string; name: string; section: string; amount: number; sharePercent: number }>;
  missingPriceItems: BudgetItem[];
  zeroQuantityItems: BudgetItem[];
  amountMismatches: IntelligenceIssue[];
  duplicateItems: IntelligenceIssue[];
  materialSharePercent: number;
  workSharePercent: number;
  issues: IntelligenceIssue[];
  importWarnings: IntelligenceIssue[];
}

export interface ScheduleIntelligence {
  overdueTasks: ScheduleItem[];
  noDateTasks: ScheduleItem[];
  noOwnerTasks: ScheduleItem[];
  upcomingTasks: ScheduleItem[];
  tasksWithoutMaterials: IntelligenceIssue[];
  forecast: Array<{ windowDays: 7 | 14 | 30; riskLevel: RiskLevel; riskCount: number; summary: string }>;
  issues: IntelligenceIssue[];
}

export interface ProcurementIntelligence {
  deficitMaterials: Material[];
  missingSupplierMaterials: Material[];
  missingPriceMaterials: Material[];
  neededSoonMaterials: Material[];
  overstockMaterials: Material[];
  requestStatusCounts: Record<string, number>;
  recommendations: IntelligenceAction[];
  issues: IntelligenceIssue[];
}

export interface FinanceIntelligence {
  incomingPlanned: number;
  outgoingPlanned: number;
  unpaidAmount: number;
  overdueAmount: number;
  possibleCashGap: number;
  upcomingPayments: Payment[];
  overduePayments: Payment[];
  forecast: Array<{ windowDays: 7 | 14 | 30; outgoing: number; incoming: number; financingNeed: number }>;
  issues: IntelligenceIssue[];
}

export interface DocumentsIntelligence {
  missingKeyDocuments: IntelligenceIssue[];
  uncategorizedDocuments: ProjectDocument[];
  staleDocuments: ProjectDocument[];
  reviewRecommendations: IntelligenceAction[];
  ragReadiness: {
    status: "placeholder";
    message: string;
  };
  issues: IntelligenceIssue[];
}

export interface ExecutiveSummary {
  headline: string;
  projectName: string;
  status: string;
  budgetTotal: number;
  plannedMarginPercent: number;
  forecastMarginPercent: number;
  paymentFact: number;
  upcomingCriticalDates: string[];
  conclusions: string[];
  missingData: string[];
}

export interface ProjectIntelligenceSnapshot {
  generatedAt: string;
  project: Project;
  executiveSummary: ExecutiveSummary;
  radar: RiskRadarCard[];
  budget: BudgetIntelligence;
  schedule: ScheduleIntelligence;
  procurement: ProcurementIntelligence;
  finance: FinanceIntelligence;
  documents: DocumentsIntelligence;
  actions: IntelligenceAction[];
  deterministicSummary: string;
  ai: {
    status: "available" | "unavailable" | "degraded";
    message: string;
  };
}

export interface AiIntelligenceSummary {
  status: "success" | "unavailable" | "degraded";
  executiveSummary: string;
  keyRisks: string[];
  recommendedActions: string[];
  managementNote: string;
  assumptions: string[];
  missingData: string[];
  source: "openai" | "deterministic";
}
