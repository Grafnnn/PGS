import type {
  AvailableWorkforceResource,
  ProjectLaborDemand,
  ProjectPayrollPolicy,
  ResourceKind,
  WorkforceResource
} from "@/lib/types";
import { DEFAULT_PAYROLL_POLICY } from "@/lib/workforce-capacity";

type PeopleKind = Exclude<ResourceKind, "equipment">;

export type WorkforceStaffingAction = "covered" | "assign-existing" | "combine" | "hire" | "hire-or-subcontract";

export type WorkforceStaffingCandidate = {
  resourceId: string;
  name: string;
  profession: string;
  kind: PeopleKind;
  employmentType: AvailableWorkforceResource["employmentType"];
  headcount: number;
  availableHeadcount: number;
  availablePercent: number;
  grossMonthlySalary: number;
};

export type WorkforceStaffingGap = {
  key: string;
  monthKey: string;
  monthLabel: string;
  monthStartsAt: string;
  monthEndsAt: string;
  category: PeopleKind;
  profession: string;
  demandIds: string[];
  requiredHeadcount: number;
  assignedHeadcount: number;
  gapHeadcount: number;
  coveragePercent: number;
  grossMonthlySalary: number;
  estimatedEmployerCost: number;
  candidates: WorkforceStaffingCandidate[];
  action: WorkforceStaffingAction;
};

export type WorkforceStaffingMonth = {
  key: string;
  label: string;
  requiredHeadcount: number;
  assignedHeadcount: number;
  gapHeadcount: number;
  rows: WorkforceStaffingGap[];
};

type DemandBucket = {
  category: PeopleKind;
  profession: string;
  demandIds: Set<string>;
  weightedSalary: number;
  requiredHeadcount: number;
};

const DAY = 86_400_000;
const MAX_MONTHS = 60;

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function monthStart(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addMonths(value: Date, count: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + count, 1));
}

function monthEnd(value: Date) {
  return new Date(addMonths(value, 1).getTime() - DAY);
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value: Date) {
  const label = new Intl.DateTimeFormat("ru-RU", { month: "short", year: "numeric", timeZone: "UTC" }).format(value);
  return label.replace(".", "");
}

function monthRange(startsAt: string, endsAt: string) {
  const start = monthStart(startsAt);
  const end = monthStart(endsAt);
  if (!start || !end || end < start) return [];
  const result: Date[] = [];
  for (let cursor = start; cursor <= end && result.length < MAX_MONTHS; cursor = addMonths(cursor, 1)) result.push(cursor);
  return result;
}

function stemToken(value: string) {
  const normalized = value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, "");
  if (normalized.length < 5) return normalized;
  const stemmed = normalized.replace(
    /(щиками|щикам|щиков|щика|щики|щик|никами|никам|ников|ника|ники|ник|истами|истам|истов|иста|исты|ист|ерами|ерам|еров|ера|еры|ами|ями|ого|ему|ому|ов|ев|ей|ы|и|а|я|ь)$/u,
    ""
  );
  return stemmed.length >= 3 ? stemmed : normalized;
}

function professionTokens(value: string | null | undefined) {
  return new Set(
    (value ?? "")
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .split(/[^a-zа-я0-9]+/u)
      .map(stemToken)
      .filter((item) => item.length >= 2 && !["рабоч", "бригад", "сотрудник", "итр"].includes(item))
  );
}

function categoryScore(demand: PeopleKind, resource: ResourceKind) {
  if (resource === "equipment") return 0;
  if (demand === resource) return 1;
  if ((demand === "worker" || demand === "crew") && (resource === "worker" || resource === "crew")) return 0.85;
  return 0;
}

export function workforceProfessionMatchScore(
  demandCategory: PeopleKind,
  demandProfession: string,
  resourceKind: ResourceKind,
  resourceProfession: string | null | undefined
) {
  const category = categoryScore(demandCategory, resourceKind);
  if (!category) return 0;
  const demand = professionTokens(demandProfession);
  const resource = professionTokens(resourceProfession);
  if (!demand.size || !resource.size) return 0;
  const demandText = [...demand].join(" ");
  const resourceText = [...resource].join(" ");
  if (demandText === resourceText) return category;
  if (demandText.includes(resourceText) || resourceText.includes(demandText)) return category * 0.9;
  const intersection = [...demand].filter((item) => resource.has(item)).length;
  const union = new Set([...demand, ...resource]).size;
  return category * (union ? intersection / union : 0);
}

function overlapsMonth(startsAt: string, endsAt: string, month: Date) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  return start <= monthEnd(month) && end >= month;
}

function demandMonths(demand: ProjectLaborDemand) {
  const start = monthStart(demand.startsAt);
  if (!start) return [];
  if (demand.monthlyProfile.length) {
    return demand.monthlyProfile
      .filter((item) => item.month >= 1 && item.month <= MAX_MONTHS)
      .map((item) => ({ month: addMonths(start, item.month - 1), headcount: Math.max(0, finite(item.headcount)) }));
  }
  const months = monthRange(demand.startsAt, demand.endsAt);
  const fallback = demand.peakHeadcount || (months.length ? demand.personMonths / months.length : 0);
  return months.map((month) => ({ month, headcount: Math.max(0, finite(fallback)) }));
}

function bucketKey(category: PeopleKind, profession: string) {
  return `${category}:${[...professionTokens(profession)].join("-") || profession.toLocaleLowerCase("ru-RU")}`;
}

function buildDemandBuckets(demands: ProjectLaborDemand[]) {
  const months = new Map<string, { month: Date; buckets: Map<string, DemandBucket> }>();
  for (const demand of demands) {
    for (const item of demandMonths(demand)) {
      if (!item.headcount) continue;
      const key = monthKey(item.month);
      const month = months.get(key) ?? { month: item.month, buckets: new Map<string, DemandBucket>() };
      const professionKey = bucketKey(demand.category, demand.profession);
      const bucket = month.buckets.get(professionKey) ?? {
        category: demand.category,
        profession: demand.profession,
        demandIds: new Set<string>(),
        weightedSalary: 0,
        requiredHeadcount: 0
      };
      bucket.demandIds.add(demand.id);
      bucket.weightedSalary += Math.max(0, finite(demand.grossMonthlySalary)) * item.headcount;
      bucket.requiredHeadcount += item.headcount;
      month.buckets.set(professionKey, bucket);
      months.set(key, month);
    }
  }
  return [...months.values()].sort((left, right) => left.month.getTime() - right.month.getTime());
}

function allocateAssignedResources(month: Date, buckets: Map<string, DemandBucket>, resources: WorkforceResource[]) {
  const assigned = new Map<string, number>();
  const active = resources.filter((item) => (
    item.kind !== "equipment" &&
    item.status === "active" &&
    item.assignment.status !== "completed" &&
    overlapsMonth(item.assignment.startsAt, item.assignment.endsAt, month)
  ));
  for (const resource of active) {
    const best = [...buckets.entries()]
      .map(([key, bucket]) => ({
        key,
        score: workforceProfessionMatchScore(bucket.category, bucket.profession, resource.kind, resource.profession)
      }))
      .filter((item) => item.score >= 0.45)
      .sort((left, right) => right.score - left.score)[0];
    if (!best) continue;
    const headcount = resource.headcount * Math.max(0, resource.assignment.allocationPercent) / 100;
    assigned.set(best.key, (assigned.get(best.key) ?? 0) + headcount);
  }
  return assigned;
}

function candidateAvailability(candidate: AvailableWorkforceResource, month: Date) {
  const committedPercent = candidate.commitments
    .filter((item) => overlapsMonth(item.startsAt, item.endsAt, month))
    .reduce((sum, item) => sum + Math.max(0, item.allocationPercent), 0);
  const availablePercent = Math.max(0, 100 - committedPercent);
  return {
    availablePercent,
    availableHeadcount: candidate.headcount * availablePercent / 100
  };
}

function candidatesFor(
  bucket: DemandBucket,
  month: Date,
  candidates: AvailableWorkforceResource[]
): WorkforceStaffingCandidate[] {
  return candidates
    .filter((item) => item.kind !== "equipment" && item.status === "active")
    .map((item) => {
      const score = workforceProfessionMatchScore(bucket.category, bucket.profession, item.kind, item.profession);
      const availability = candidateAvailability(item, month);
      return {
        score,
        resourceId: item.id,
        name: item.name,
        profession: item.profession ?? "",
        kind: item.kind as PeopleKind,
        employmentType: item.employmentType,
        headcount: item.headcount,
        availableHeadcount: availability.availableHeadcount,
        availablePercent: availability.availablePercent,
        grossMonthlySalary: item.grossMonthlySalary
      };
    })
    .filter((item) => item.score >= 0.45 && item.availableHeadcount > 0)
    .sort((left, right) => right.score - left.score || right.availableHeadcount - left.availableHeadcount)
    .slice(0, 5)
    .map(({ score: _score, ...item }) => ({ ...item, availableHeadcount: round(item.availableHeadcount) }));
}

function actionFor(gapHeadcount: number, candidates: WorkforceStaffingCandidate[], category: PeopleKind): WorkforceStaffingAction {
  if (gapHeadcount <= 0) return "covered";
  const available = candidates.reduce((sum, item) => sum + item.availableHeadcount, 0);
  if (available >= gapHeadcount) return "assign-existing";
  if (available > 0) return "combine";
  return category === "engineer" ? "hire" : "hire-or-subcontract";
}

export function buildWorkforceStaffingPlan(input: {
  resources: WorkforceResource[];
  demands: ProjectLaborDemand[];
  availableResources?: AvailableWorkforceResource[];
  policy?: ProjectPayrollPolicy | null;
}) {
  const policy = input.policy ?? { projectId: "", ...DEFAULT_PAYROLL_POLICY };
  const demandMonths = buildDemandBuckets(input.demands);
  const allRows: WorkforceStaffingGap[] = [];
  const months: WorkforceStaffingMonth[] = demandMonths.map(({ month, buckets }) => {
    const assigned = allocateAssignedResources(month, buckets, input.resources);
    const rows = [...buckets.entries()].map(([key, bucket]) => {
      const requiredHeadcount = round(bucket.requiredHeadcount);
      const assignedHeadcount = round(assigned.get(key) ?? 0);
      const gapHeadcount = round(Math.max(0, requiredHeadcount - assignedHeadcount));
      const salary = bucket.requiredHeadcount ? bucket.weightedSalary / bucket.requiredHeadcount : 0;
      const candidates = candidatesFor(bucket, month, input.availableResources ?? []);
      const row: WorkforceStaffingGap = {
        key: `${monthKey(month)}:${key}`,
        monthKey: monthKey(month),
        monthLabel: monthLabel(month),
        monthStartsAt: month.toISOString(),
        monthEndsAt: monthEnd(month).toISOString(),
        category: bucket.category,
        profession: bucket.profession,
        demandIds: [...bucket.demandIds],
        requiredHeadcount,
        assignedHeadcount,
        gapHeadcount,
        coveragePercent: requiredHeadcount ? round(Math.min(100, assignedHeadcount / requiredHeadcount * 100), 1) : 0,
        grossMonthlySalary: round(salary),
        estimatedEmployerCost: round(gapHeadcount * salary * (1 + (policy.insuranceContributionRate + policy.accidentContributionRate) / 100)),
        candidates,
        action: actionFor(gapHeadcount, candidates, bucket.category)
      };
      allRows.push(row);
      return row;
    }).sort((left, right) => right.gapHeadcount - left.gapHeadcount || left.profession.localeCompare(right.profession, "ru"));
    return {
      key: monthKey(month),
      label: monthLabel(month),
      requiredHeadcount: round(rows.reduce((sum, item) => sum + item.requiredHeadcount, 0)),
      assignedHeadcount: round(rows.reduce((sum, item) => sum + item.assignedHeadcount, 0)),
      gapHeadcount: round(rows.reduce((sum, item) => sum + item.gapHeadcount, 0)),
      rows
    };
  });

  const requiredPersonMonths = allRows.reduce((sum, item) => sum + item.requiredHeadcount, 0);
  const assignedPersonMonths = allRows.reduce((sum, item) => sum + Math.min(item.requiredHeadcount, item.assignedHeadcount), 0);
  const rowsWithGap = allRows.filter((item) => item.gapHeadcount > 0);
  const uniqueCandidates = new Set(rowsWithGap.flatMap((item) => item.candidates.map((candidate) => candidate.resourceId)));

  return {
    months,
    rows: allRows,
    summary: {
      status: !input.demands.length
        ? "no_data" as const
        : rowsWithGap.length
          ? "attention" as const
          : "controlled" as const,
      coveragePercent: requiredPersonMonths ? round(assignedPersonMonths / requiredPersonMonths * 100, 1) : 0,
      peakRequiredHeadcount: round(Math.max(0, ...months.map((item) => item.requiredHeadcount))),
      peakGapHeadcount: round(Math.max(0, ...months.map((item) => item.gapHeadcount))),
      shortageHours: round(rowsWithGap.reduce((sum, item) => sum + item.gapHeadcount * policy.workingHoursPerMonth, 0)),
      estimatedGapEmployerCost: round(rowsWithGap.reduce((sum, item) => sum + item.estimatedEmployerCost, 0)),
      professionsWithGap: new Set(rowsWithGap.map((item) => `${item.category}:${item.profession}`)).size,
      matchedAvailableResources: uniqueCandidates.size,
      requiredPersonMonths: round(requiredPersonMonths),
      assignedPersonMonths: round(assignedPersonMonths)
    },
    limitations: [
      "Совпадение профессий выполняется по категории и названию; неоднозначные роли нужно проверить вручную.",
      "Один свободный ресурс может подходить нескольким дефицитам. Назначение остаётся отдельным действием пользователя.",
      "Оценка стоимости разрыва использует плановый оклад из потребности и ставки начислений проекта."
    ]
  };
}
