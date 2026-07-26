import { z } from "zod";
import type { ResourceKind, WorkforceResource } from "@/lib/types";

export const resourceKinds = ["worker", "engineer", "crew", "equipment"] as const;
export const resourceEmploymentTypes = ["staff", "hired", "subcontract", "owned", "rented"] as const;
export const resourceStatuses = ["active", "unavailable", "maintenance", "archived"] as const;
export const resourceAssignmentStatuses = ["planned", "active", "completed"] as const;

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

export function buildWorkforceCapacitySummary(items: WorkforceResource[]) {
  const active = items.filter((item) => item.status === "active" && item.assignment.status !== "completed");
  const people = active.filter((item) => isPeople(item.kind));
  const equipment = active.filter((item) => item.kind === "equipment");
  const allocatedCapacityHours = people.reduce(
    (sum, item) => sum + item.capacityHoursPerMonth * item.headcount * item.assignment.allocationPercent / 100,
    0
  );
  const plannedHours = people.reduce((sum, item) => sum + item.assignment.plannedHours, 0);
  const payroll = people.reduce((sum, item) => sum + item.monthlyCost * item.assignment.allocationPercent / 100, 0);
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
    shortageHours,
    certificationGaps,
    overloaded,
    status: overloaded || shortageHours > 0 ? "attention" as const : active.length ? "controlled" as const : "no_data" as const
  };
}
