import { z } from "zod";

export const costCodeStatusSchema = z.enum(["active", "inactive"]);
export const costCodeSegmentSchema = z.enum(["wbs", "cost"]);
export const costCodeTypeSchema = z.enum(["capital", "expense"]);

export const costCodeCreateSchema = z.object({
  parentId: z.string().trim().min(1).nullable().optional(),
  code: z.string().trim().min(1).max(64).regex(/^[A-Za-zА-Яа-я0-9_-]+(?:\.[A-Za-zА-Яа-я0-9_-]+)*$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().default(""),
  segment: costCodeSegmentSchema.default("cost"),
  costType: costCodeTypeSchema.default("expense"),
  status: costCodeStatusSchema.default("active")
}).strict();

export const costCodeUpdateSchema = costCodeCreateSchema.partial().strict();

export const costCodeBaselineSchema = z.object({
  mode: z.enum(["preview", "commit"]),
  confirm: z.boolean().optional().default(false)
}).strict().superRefine((value, ctx) => {
  if (value.mode === "commit" && !value.confirm) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirm"], message: "Explicit confirmation is required" });
});

export const costCodeAssignmentSchema = z.object({
  entityType: z.enum(["budget_item", "schedule_item", "material", "procurement_item", "payment", "change_order_item"]),
  entityId: z.string().trim().min(1),
  costCodeId: z.string().trim().min(1).nullable()
}).strict();

export type CostCodeEntityType = z.infer<typeof costCodeAssignmentSchema>["entityType"];

export type CostCodeRecord = {
  id: string;
  parentId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  segment: string;
  costType: string;
  status: string;
  source: string;
  sortOrder: number;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export type BaselineBudgetItem = {
  id: string;
  section: string;
  subsection?: string | null;
  kind: string;
  name: string;
};

export type CostCodeBaselineNode = {
  key: string;
  parentKey: string | null;
  code: string;
  name: string;
  segment: "wbs" | "cost";
  costType: "expense";
  source: "vor_baseline";
  sortOrder: number;
};

export type CostCodeBaselineAssignment = {
  entityType: "budget_item";
  entityId: string;
  code: string;
  reason: string;
};

const kindLabels: Record<string, string> = {
  work: "Работы",
  material: "Материалы",
  equipment: "Механизмы",
  payroll: "ФОТ",
  subcontract: "Субподряд",
  overhead: "Накладные расходы",
  other: "Прочие затраты"
};

function text(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function stable(values: Iterable<string>) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ru"));
}

function segment(index: number) {
  return String(index + 1).padStart(2, "0");
}

export function buildCostCodeBaseline(items: BaselineBudgetItem[]) {
  const nodes: CostCodeBaselineNode[] = [];
  const assignments: CostCodeBaselineAssignment[] = [];
  const sections = stable(items.map((item) => text(item.section, "Без раздела")));

  sections.forEach((section, sectionIndex) => {
    const sectionCode = segment(sectionIndex);
    const sectionKey = `section:${section}`;
    nodes.push({ key: sectionKey, parentKey: null, code: sectionCode, name: section, segment: "wbs", costType: "expense", source: "vor_baseline", sortOrder: sectionIndex });
    const sectionItems = items.filter((item) => text(item.section, "Без раздела") === section);
    const subsections = stable(sectionItems.map((item) => text(item.subsection, "Основной объём")));

    subsections.forEach((subsection, subsectionIndex) => {
      const subsectionCode = `${sectionCode}.${segment(subsectionIndex)}`;
      const subsectionKey = `${sectionKey}:subsection:${subsection}`;
      nodes.push({ key: subsectionKey, parentKey: sectionKey, code: subsectionCode, name: subsection, segment: "wbs", costType: "expense", source: "vor_baseline", sortOrder: subsectionIndex });
      const subsectionItems = sectionItems.filter((item) => text(item.subsection, "Основной объём") === subsection);
      const kinds = stable(subsectionItems.map((item) => item.kind || "other"));

      kinds.forEach((kind, kindIndex) => {
        const code = `${subsectionCode}.${segment(kindIndex)}`;
        const key = `${subsectionKey}:kind:${kind}`;
        nodes.push({ key, parentKey: subsectionKey, code, name: kindLabels[kind] ?? kind, segment: "cost", costType: "expense", source: "vor_baseline", sortOrder: kindIndex });
        subsectionItems.filter((item) => (item.kind || "other") === kind).forEach((item) => assignments.push({
          entityType: "budget_item",
          entityId: item.id,
          code,
          reason: `${section} / ${subsection} / ${kindLabels[kind] ?? kind}`
        }));
      });
    });
  });

  return {
    nodes,
    assignments,
    summary: {
      budgetItems: items.length,
      sections: sections.length,
      codes: nodes.length,
      leafCodes: nodes.filter((node) => node.segment === "cost").length,
      assignments: assignments.length
    }
  };
}

export function serializeCostCode(item: CostCodeRecord) {
  return {
    id: item.id,
    parentId: item.parentId ?? null,
    code: item.code,
    name: item.name,
    description: item.description ?? null,
    segment: item.segment,
    costType: item.costType,
    status: item.status,
    source: item.source,
    sortOrder: item.sortOrder,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt
  };
}

export function costCodeCoverage(input: {
  codes: CostCodeRecord[];
  budgetItems: Array<{ costCodeId?: string | null }>;
  scheduleItems: Array<{ costCodeId?: string | null; budgetItemId?: string | null }>;
  materials: Array<{ costCodeId?: string | null }>;
  procurementItems: Array<{ costCodeId?: string | null }>;
  payments: Array<{ costCodeId?: string | null }>;
  changeOrderItems: Array<{ costCodeId?: string | null; budgetItemId?: string | null }>;
}) {
  const count = (items: Array<{ costCodeId?: string | null }>) => ({ total: items.length, linked: items.filter((item) => Boolean(item.costCodeId)).length });
  const categories = {
    budget: count(input.budgetItems),
    schedule: count(input.scheduleItems),
    materials: count(input.materials),
    procurement: count(input.procurementItems),
    payments: count(input.payments),
    changes: count(input.changeOrderItems)
  };
  const total = Object.values(categories).reduce((sum, item) => sum + item.total, 0);
  const linked = Object.values(categories).reduce((sum, item) => sum + item.linked, 0);
  return {
    codes: input.codes.length,
    activeCodes: input.codes.filter((item) => item.status === "active").length,
    total,
    linked,
    percent: total ? Math.round((linked / total) * 100) : 0,
    categories
  };
}
