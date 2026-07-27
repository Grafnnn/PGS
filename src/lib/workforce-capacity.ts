import { z } from "zod";
import type {
  BudgetItem,
  ProjectLaborDemand,
  ProjectPayrollPolicy,
  ResourceKind,
  WorkforceResource
} from "@/lib/types";

export const resourceKinds = ["worker", "engineer", "crew", "equipment"] as const;
export const resourceEmploymentTypes = ["staff", "hired", "subcontract", "owned", "rented"] as const;
export const resourceStatuses = ["active", "unavailable", "maintenance", "archived"] as const;
export const resourceAssignmentStatuses = ["planned", "active", "completed"] as const;
export const laborDemandCategories = ["worker", "engineer", "crew"] as const;

export const DEFAULT_PAYROLL_POLICY: Omit<ProjectPayrollPolicy, "id" | "projectId"> = {
  insuranceContributionRate: 30,
  accidentContributionRate: 0,
  personalIncomeTaxRate: 13,
  workingHoursPerMonth: 160,
  sourceYear: 2026,
  notes: "Плановый базовый тариф. Уточните льготы, класс профриска и накопленную годовую базу с бухгалтерией."
};

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const workforceAssignmentSchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  allocationPercent: z.coerce.number().int().min(1).max(200).default(100),
  plannedHours: z.coerce.number().min(0).max(1_000_000).default(0),
  plannedOutput: z.coerce.number().min(0).max(1_000_000_000).default(0),
  status: z.enum(resourceAssignmentStatuses).default("planned"),
  notes: optionalText(2000)
}).refine((value) => value.endsAt >= value.startsAt, { message: "Assignment end must be after start", path: ["endsAt"] });

export const workforceResourceCreateSchema = z.object({
  kind: z.enum(resourceKinds),
  name: z.string().trim().min(2).max(160),
  profession: optionalText(160),
  employmentType: z.enum(resourceEmploymentTypes),
  headcount: z.coerce.number().int().min(1).max(500).default(1),
  capacityHoursPerMonth: z.coerce.number().min(0).max(100_000).default(160),
  productivityNorm: z.coerce.number().min(0).max(1_000_000).default(0),
  productivityUnit: optionalText(80),
  monthlyCost: z.coerce.number().min(0).max(1_000_000_000).default(0),
  grossMonthlySalary: z.coerce.number().min(0).max(1_000_000_000).default(0),
  hourlyCost: z.coerce.number().min(0).max(10_000_000).default(0),
  certifications: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  status: z.enum(resourceStatuses).default("active"),
  notes: optionalText(2000),
  assignment: workforceAssignmentSchema
});

export const workforceResourceUpdateSchema = workforceResourceCreateSchema.partial().extend({
  assignment: z.object({
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    allocationPercent: z.coerce.number().int().min(1).max(200).optional(),
    plannedHours: z.coerce.number().min(0).max(1_000_000).optional(),
    plannedOutput: z.coerce.number().min(0).max(1_000_000_000).optional(),
    status: z.enum(resourceAssignmentStatuses).optional(),
    notes: optionalText(2000)
  }).optional()
});

export const existingWorkforceResourceAssignmentSchema = z.object({
  resourceId: z.string().min(1).max(160),
  assignment: workforceAssignmentSchema
});

export const payrollPolicySchema = z.object({
  insuranceContributionRate: z.coerce.number().min(0).max(100).default(DEFAULT_PAYROLL_POLICY.insuranceContributionRate),
  accidentContributionRate: z.coerce.number().min(0).max(100).default(DEFAULT_PAYROLL_POLICY.accidentContributionRate),
  personalIncomeTaxRate: z.coerce.number().min(0).max(100).default(DEFAULT_PAYROLL_POLICY.personalIncomeTaxRate),
  workingHoursPerMonth: z.coerce.number().positive().max(744).default(DEFAULT_PAYROLL_POLICY.workingHoursPerMonth),
  sourceYear: z.coerce.number().int().min(2020).max(2100).default(DEFAULT_PAYROLL_POLICY.sourceYear),
  notes: optionalText(2000)
});

const laborDemandBaseSchema = z.object({
  category: z.enum(laborDemandCategories),
  profession: z.string().trim().min(2).max(160),
  function: optionalText(500),
  grossMonthlySalary: z.coerce.number().min(0).max(1_000_000_000).default(0),
  peakHeadcount: z.coerce.number().min(0).max(10_000).default(0),
  personMonths: z.coerce.number().min(0).max(1_000_000).default(0),
  plannedHours: z.coerce.number().min(0).max(100_000_000).default(0),
  productivityNorm: z.coerce.number().min(0).max(1_000_000_000).default(0),
  productivityUnit: optionalText(80),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  monthlyProfile: z.array(z.object({
    month: z.coerce.number().int().min(1).max(120),
    label: z.string().trim().min(1).max(20),
    headcount: z.coerce.number().min(0).max(10_000)
  })).max(120).default([]),
  source: z.string().trim().min(2).max(300).default("Manual workforce plan"),
  confidence: z.coerce.number().min(0).max(1).default(1),
  notes: optionalText(2000)
});

export const laborDemandCreateSchema = laborDemandBaseSchema.refine(
  (value) => value.endsAt >= value.startsAt,
  { message: "Demand end must be after start", path: ["endsAt"] }
);

export const laborDemandUpdateSchema = laborDemandBaseSchema.partial();

type ResourceRecord = {
  id: string;
  kind: string;
  name: string;
  profession: string | null;
  employmentType: string;
  headcount: number;
  capacityHoursPerMonth: unknown;
  productivityNorm: unknown;
  productivityUnit: string | null;
  monthlyCost: unknown;
  grossMonthlySalary?: unknown;
  hourlyCost: unknown;
  certifications: unknown;
  status: string;
  notes: string | null;
};

type AssignmentRecord = {
  id: string;
  projectId: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  allocationPercent: number;
  plannedHours: unknown;
  plannedOutput: unknown;
  status: string;
  notes: string | null;
};

type ConflictAssignment = Pick<AssignmentRecord, "projectId" | "resourceId" | "startsAt" | "endsAt" | "allocationPercent">;

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 30) : [];
}

function overlaps(left: Pick<AssignmentRecord, "startsAt" | "endsAt">, right: Pick<AssignmentRecord, "startsAt" | "endsAt">) {
  return left.startsAt <= right.endsAt && left.endsAt >= right.startsAt;
}

export function serializeWorkforceResource(
  resource: ResourceRecord,
  assignment: AssignmentRecord,
  allAssignments: ConflictAssignment[]
): WorkforceResource {
  const overlapping = allAssignments.filter((item) => item.resourceId === resource.id && item.projectId !== assignment.projectId && overlaps(item, assignment));
  const otherProjectsPercent = overlapping.reduce((sum, item) => sum + Math.max(0, item.allocationPercent), 0);
  const totalPercent = assignment.allocationPercent + otherProjectsPercent;

  return {
    id: resource.id,
    kind: resource.kind as WorkforceResource["kind"],
    name: resource.name,
    profession: resource.profession,
    employmentType: resource.employmentType as WorkforceResource["employmentType"],
    headcount: resource.headcount,
    capacityHoursPerMonth: number(resource.capacityHoursPerMonth),
    productivityNorm: number(resource.productivityNorm),
    productivityUnit: resource.productivityUnit,
    monthlyCost: number(resource.monthlyCost),
    grossMonthlySalary: number(resource.grossMonthlySalary) || (
      isPayrollResource(resource.kind as ResourceKind, resource.employmentType)
        ? number(resource.monthlyCost) / Math.max(1, resource.headcount)
        : 0
    ),
    hourlyCost: number(resource.hourlyCost),
    certifications: stringList(resource.certifications),
    status: resource.status as WorkforceResource["status"],
    notes: resource.notes,
    assignment: {
      id: assignment.id,
      projectId: assignment.projectId,
      resourceId: assignment.resourceId,
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt.toISOString(),
      allocationPercent: assignment.allocationPercent,
      plannedHours: number(assignment.plannedHours),
      plannedOutput: number(assignment.plannedOutput),
      status: assignment.status as WorkforceResource["assignment"]["status"],
      notes: assignment.notes
    },
    allocation: {
      currentProjectPercent: assignment.allocationPercent,
      otherProjectsPercent,
      totalPercent,
      overlappingProjects: new Set(overlapping.map((item) => item.projectId)).size,
      overloaded: totalPercent > 100
    }
  };
}

function isPeople(kind: ResourceKind) {
  return kind === "worker" || kind === "engineer" || kind === "crew";
}

function isPayrollResource(kind: ResourceKind, employmentType: string) {
  return isPeople(kind) && employmentType !== "subcontract";
}

export function buildWorkforceCapacitySummary(
  items: WorkforceResource[],
  demands: ProjectLaborDemand[] = [],
  policy: ProjectPayrollPolicy | null = null
) {
  const active = items.filter((item) => item.status === "active" && item.assignment.status !== "completed");
  const people = active.filter((item) => isPeople(item.kind));
  const equipment = active.filter((item) => item.kind === "equipment");
  const effectivePolicy = policy ?? { projectId: "", ...DEFAULT_PAYROLL_POLICY };
  const allocatedCapacityHours = people.reduce(
    (sum, item) => sum + item.capacityHoursPerMonth * item.headcount * item.assignment.allocationPercent / 100,
    0
  );
  const assignedPlannedHours = people.reduce((sum, item) => sum + item.assignment.plannedHours, 0);
  const monthlyDemand = new Map<number, number>();
  for (const demand of demands) {
    for (const month of demand.monthlyProfile) {
      monthlyDemand.set(month.month, (monthlyDemand.get(month.month) ?? 0) + month.headcount);
    }
  }
  const demandHeadcount = monthlyDemand.size
    ? Math.max(...monthlyDemand.values())
    : demands.reduce((sum, item) => sum + item.peakHeadcount, 0);
  const demandHours = demandHeadcount * effectivePolicy.workingHoursPerMonth;
  const plannedHours = demands.length ? demandHours : assignedPlannedHours;
  const payroll = people.reduce(
    (sum, item) => sum + (
      isPayrollResource(item.kind, item.employmentType)
        ? item.grossMonthlySalary * item.headcount * item.assignment.allocationPercent / 100
        : 0
    ),
    0
  );
  const equipmentCost = equipment.reduce((sum, item) => sum + item.monthlyCost * item.assignment.allocationPercent / 100, 0);
  const shortageHours = Math.max(0, plannedHours - allocatedCapacityHours);
  const certificationGaps = people.filter((item) => item.certifications.length === 0).length;
  const overloaded = active.filter((item) => item.allocation.overloaded).length;

  return {
    headcount: people.reduce((sum, item) => sum + item.headcount, 0),
    engineers: people.filter((item) => item.kind === "engineer").reduce((sum, item) => sum + item.headcount, 0),
    equipment: equipment.length,
    payroll,
    equipmentCost,
    allocatedCapacityHours,
    plannedHours,
    assignedPlannedHours,
    demandHours,
    demandHeadcount,
    shortageHeadcount: Math.max(0, demandHeadcount - people.reduce((sum, item) => sum + item.headcount, 0)),
    shortageHours,
    certificationGaps,
    overloaded,
    status: overloaded || shortageHours > 0 ? "attention" as const : active.length ? "controlled" as const : "no_data" as const
  };
}

type PayrollPolicyRecord = {
  id?: string;
  projectId: string;
  insuranceContributionRate: unknown;
  accidentContributionRate: unknown;
  personalIncomeTaxRate: unknown;
  workingHoursPerMonth: unknown;
  sourceYear: number;
  notes: string | null;
};

type LaborAllocationRecord = {
  id: string;
  budgetItemId: string | null;
  workCode: string | null;
  workName: string;
  sharePercent: unknown;
  personMonths: unknown;
  plannedHours: unknown;
  requiredHeadcount: unknown;
  confidence: unknown;
  reason: string | null;
};

type LaborDemandRecord = {
  id: string;
  projectId: string;
  importBatchId: string | null;
  category: string;
  profession: string;
  function: string | null;
  grossMonthlySalary: unknown;
  peakHeadcount: unknown;
  personMonths: unknown;
  plannedHours: unknown;
  productivityNorm: unknown;
  productivityUnit: string | null;
  startsAt: Date;
  endsAt: Date;
  monthlyProfile: unknown;
  source: string;
  sourceSheet: string | null;
  sourceRow: number | null;
  confidence: unknown;
  notes: string | null;
  allocations: LaborAllocationRecord[];
};

export function serializePayrollPolicy(record: PayrollPolicyRecord | null, projectId: string): ProjectPayrollPolicy {
  if (!record) return { projectId, ...DEFAULT_PAYROLL_POLICY };
  return {
    id: record.id,
    projectId: record.projectId,
    insuranceContributionRate: number(record.insuranceContributionRate),
    accidentContributionRate: number(record.accidentContributionRate),
    personalIncomeTaxRate: number(record.personalIncomeTaxRate),
    workingHoursPerMonth: number(record.workingHoursPerMonth),
    sourceYear: record.sourceYear,
    notes: record.notes
  };
}

export function serializeLaborDemand(record: LaborDemandRecord): ProjectLaborDemand {
  const monthlyProfile = Array.isArray(record.monthlyProfile)
    ? record.monthlyProfile.filter((item): item is { month: number; label: string; headcount: number } => (
        Boolean(item) &&
        typeof item === "object" &&
        Number.isFinite(Number((item as { month?: unknown }).month)) &&
        typeof (item as { label?: unknown }).label === "string" &&
        Number.isFinite(Number((item as { headcount?: unknown }).headcount))
      )).map((item) => ({ month: Number(item.month), label: item.label, headcount: Number(item.headcount) }))
    : [];
  return {
    id: record.id,
    projectId: record.projectId,
    importBatchId: record.importBatchId,
    category: record.category as ProjectLaborDemand["category"],
    profession: record.profession,
    function: record.function,
    grossMonthlySalary: number(record.grossMonthlySalary),
    peakHeadcount: number(record.peakHeadcount),
    personMonths: number(record.personMonths),
    plannedHours: number(record.plannedHours),
    productivityNorm: number(record.productivityNorm),
    productivityUnit: record.productivityUnit,
    startsAt: record.startsAt.toISOString(),
    endsAt: record.endsAt.toISOString(),
    monthlyProfile,
    source: record.source,
    sourceSheet: record.sourceSheet,
    sourceRow: record.sourceRow,
    confidence: number(record.confidence),
    notes: record.notes,
    allocations: record.allocations.map((item) => ({
      id: item.id,
      budgetItemId: item.budgetItemId,
      workCode: item.workCode,
      workName: item.workName,
      sharePercent: number(item.sharePercent),
      personMonths: number(item.personMonths),
      plannedHours: number(item.plannedHours),
      requiredHeadcount: number(item.requiredHeadcount),
      confidence: number(item.confidence),
      reason: item.reason
    }))
  };
}

function assignmentMonths(item: WorkforceResource) {
  const start = new Date(item.assignment.startsAt);
  const end = new Date(item.assignment.endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return 0;
  return Math.max(1 / 30.4375, (end.getTime() - start.getTime() + 86_400_000) / (30.4375 * 86_400_000));
}

export function buildWorkforceEconomics(input: {
  resources: WorkforceResource[];
  demands?: ProjectLaborDemand[];
  policy?: ProjectPayrollPolicy | null;
  budgetItems?: BudgetItem[];
  contractAmount?: number;
}) {
  const resources = input.resources.filter(
    (item) => isPayrollResource(item.kind, item.employmentType) && item.status === "active" && item.assignment.status !== "completed"
  );
  const demands = input.demands ?? [];
  const policy = input.policy ?? { projectId: "", ...DEFAULT_PAYROLL_POLICY };
  const assignedGrossPayroll = resources.reduce(
    (sum, item) => sum + item.grossMonthlySalary * item.headcount * item.assignment.allocationPercent / 100 * assignmentMonths(item),
    0
  );
  const demandGrossPayroll = demands.reduce((sum, item) => sum + item.grossMonthlySalary * item.personMonths, 0);
  const grossPayroll = demands.length ? Math.max(demandGrossPayroll, assignedGrossPayroll) : assignedGrossPayroll;
  const insuranceContributions = grossPayroll * policy.insuranceContributionRate / 100;
  const accidentContributions = grossPayroll * policy.accidentContributionRate / 100;
  const employerContributions = insuranceContributions + accidentContributions;
  const withheldPersonalIncomeTax = grossPayroll * policy.personalIncomeTaxRate / 100;
  const netPayroll = Math.max(0, grossPayroll - withheldPersonalIncomeTax);
  const totalEmployerCost = grossPayroll + employerContributions;
  const budgetItems = input.budgetItems ?? [];
  const payrollBudget = budgetItems
    .filter((item) => item.kind === "payroll")
    .reduce((sum, item) => sum + item.qty * item.forecastUnitPrice, 0);
  const baseForecastCost = budgetItems.reduce((sum, item) => sum + item.qty * item.forecastUnitPrice, 0);
  const uncoveredEmployerCost = Math.max(0, totalEmployerCost - payrollBudget);
  const adjustedForecastCost = baseForecastCost + uncoveredEmployerCost;
  const contractAmount = Math.max(0, input.contractAmount ?? 0);
  const adjustedForecastProfit = contractAmount - adjustedForecastCost;
  const adjustedForecastMarginPercent = contractAmount > 0 ? adjustedForecastProfit / contractAmount * 100 : 0;

  return {
    assignedGrossPayroll,
    demandGrossPayroll,
    grossPayroll,
    insuranceContributions,
    accidentContributions,
    employerContributions,
    withheldPersonalIncomeTax,
    netPayroll,
    totalEmployerCost,
    payrollBudget,
    uncoveredEmployerCost,
    adjustedForecastCost,
    adjustedForecastProfit,
    adjustedForecastMarginPercent,
    policy,
    demandRows: demands.length,
    assignedResources: resources.length
  };
}
