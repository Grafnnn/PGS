export type AiScenario =
  | "summary"
  | "budget-review"
  | "schedule-review"
  | "procurement-review"
  | "finance-review"
  | "risk-review"
  | "document-review"
  | "daily-report-summary"
  | "executive-report"
  | "draft-text";

export type AiStatus = "on_track" | "attention" | "critical" | "unknown";
export type AiSeverity = "low" | "medium" | "high" | "critical";
export type AiActionPriority = "low" | "medium" | "high";

export type AiFinding = {
  severity: AiSeverity;
  title: string;
  description: string;
  source?: string;
  recommendation?: string;
};

export type AiRecommendedAction = {
  priority: AiActionPriority;
  title: string;
  description: string;
};

export type AiInsightResponse = {
  title: string;
  scenario: AiScenario;
  overallStatus?: AiStatus;
  summary: string;
  findings: AiFinding[];
  recommendedActions: AiRecommendedAction[];
  subject?: string;
  draftText?: string;
  recommendedAttachments?: string[];
  dataUsed: string[];
  dataLimitations: string[];
  generatedAt: string;
  provider: "deterministic" | "openai" | "degraded";
};

export type AiRunInput = {
  projectId: string;
  scenario: AiScenario;
  textType?: string;
  topic?: string;
  instructions?: string;
};

export type AiProjectContext = {
  project: {
    id: string;
    name: string;
    customer: string;
    object: string;
    address: string;
    status?: string;
    manager: string;
    contractAmount: number;
    startsAt: string;
    endsAt: string;
  };
  budget: {
    itemCount: number;
    totalPlannedCost: number;
    totalActualCost: number;
    totalForecastCost: number;
    forecastProfit: number;
    forecastMarginPercent: number;
    zeroPrices: Array<{ id: string; name: string; section: string }>;
    zeroQty: Array<{ id: string; name: string; section: string }>;
    missingUnits: Array<{ id: string; name: string; section: string }>;
    duplicateNames: Array<{ name: string; count: number; sections: string[] }>;
    largeItems: Array<{ id: string; name: string; section: string; amount: number; sharePercent: number }>;
    suspicious: Array<{ id: string; name: string; section: string; reason: string }>;
    sections: Array<{ name: string; forecastCost: number; items: number }>;
  };
  schedule: {
    itemCount: number;
    completionPercent: number;
    delayed: Array<{ id: string; name: string; owner: string; endsAt: string; dependency?: string }>;
    upcoming: Array<{ id: string; name: string; owner: string; startsAt: string; endsAt: string }>;
    missingOwners: Array<{ id: string; name: string }>;
    missingDates: Array<{ id: string; name: string; owner: string }>;
  };
  materials: {
    itemCount: number;
    deficit: Array<{ id: string; name: string; unit: string; shortage: number; neededAt: string; supplier: string }>;
    dueSoon: Array<{ id: string; name: string; neededAt: string; status: string }>;
    overBudget: Array<{ id: string; name: string; plannedUnitPrice: number; actualUnitPrice: number }>;
    missingSupplier: Array<{ id: string; name: string }>;
  };
  procurement: {
    active: Array<{ id: string; title: string; status: string; priority: string; neededAt: string }>;
    critical: Array<{ id: string; title: string; priority: string; neededAt: string }>;
    supplierQuotes: Array<{ id: string; material: string; supplier: string; price: number; deliveryDays: number; vatIncluded: boolean }>;
    materialsWithoutQuotes: Array<{ id: string; name: string; supplier: string }>;
  };
  finance: {
    paymentCount: number;
    incomingPayments: number;
    outgoingPayments: number;
    cashGap: number;
    financingNeed: number;
    paidIncoming: number;
    unpaidIncoming: number;
    paidOutgoing: number;
    unpaidOutgoing: number;
    overdue: Array<{ id: string; title: string; amount: number; plannedAt: string }>;
  };
  risks: Array<{ id: string; title: string; priority: string; status: string; owner: string; dueAt: string; reason: string }>;
  documents: Array<{ id: string; title: string; category: string; mimeType?: string | null; uploadedAt?: string | null; previewAvailable?: boolean }>;
  dailyReports: Array<{ id: string; date: string; author: string; completedWorks: string; issues: string; status: string; workers: number; engineers: number }>;
  dataLimitations: string[];
};
