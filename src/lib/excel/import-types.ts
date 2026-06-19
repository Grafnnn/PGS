import { z } from "zod";

export type ImportRowKind = "ignored" | "section" | "budget_item" | "material" | "schedule_item" | "unknown";

export interface ColumnMap {
  index?: number;
  name?: number;
  unit?: number;
  qty?: number;
  unitPrice?: number;
  total?: number;
  section?: number;
  note?: number;
  startsAt?: number;
  endsAt?: number;
}

export interface RawSheetRow {
  sheetName: string;
  rowNumber: number;
  values: unknown[];
}

export interface ImportSection {
  name: string;
  sheetName: string;
  rowNumber: number;
}

export interface ImportBudgetItem {
  section: string;
  code: string;
  name: string;
  unit: string;
  qty: number;
  plannedUnitPrice: number;
  actualUnitPrice: number;
  forecastUnitPrice: number;
  kind: "work" | "material" | "equipment" | "payroll" | "subcontract" | "overhead" | "other";
  source: string;
  comment?: string;
  sheetName: string;
  rowNumber: number;
}

export interface ImportMaterial {
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
  status: string;
  sheetName: string;
  rowNumber: number;
}

export interface ImportScheduleItem {
  name: string;
  owner: string;
  startsAt: string;
  endsAt: string;
  plannedQty: number;
  actualQty: number;
  status: "not_started" | "in_progress" | "done" | "delayed" | "stopped";
  dependency?: string;
  sheetName: string;
  rowNumber: number;
}

export interface UnknownImportRow {
  sheetName: string;
  rowNumber: number;
  reason: string;
  values: string[];
}

export interface ImportPreview {
  projectId: string;
  fileName: string;
  sheets: string[];
  summary: {
    sections: number;
    budgetItems: number;
    materials: number;
    scheduleItems: number;
    unknownRows: number;
    errors: number;
    warnings: number;
  };
  sections: ImportSection[];
  budgetItems: ImportBudgetItem[];
  materials: ImportMaterial[];
  scheduleItems: ImportScheduleItem[];
  unknownRows: UnknownImportRow[];
  warnings: string[];
  errors: string[];
}

export const importBudgetItemSchema = z.object({
  section: z.string().min(1),
  code: z.string().default(""),
  name: z.string().min(2),
  unit: z.string().min(1),
  qty: z.coerce.number().nonnegative(),
  plannedUnitPrice: z.coerce.number().nonnegative(),
  actualUnitPrice: z.coerce.number().nonnegative(),
  forecastUnitPrice: z.coerce.number().nonnegative(),
  kind: z.enum(["work", "material", "equipment", "payroll", "subcontract", "overhead", "other"]),
  source: z.string().default("Excel import"),
  comment: z.string().optional(),
  sheetName: z.string(),
  rowNumber: z.coerce.number().int().positive()
});

export const importPreviewCommitSchema = z.object({
  mode: z.enum(["append", "replace_budget", "replace_materials", "replace_schedule"]).default("append"),
  sections: z.array(
    z.object({
      name: z.string().min(1),
      sheetName: z.string(),
      rowNumber: z.coerce.number().int().positive()
    })
  ),
  budgetItems: z.array(importBudgetItemSchema),
  materials: z.array(
    z.object({
      name: z.string().min(2),
      unit: z.string().min(1),
      requiredQty: z.coerce.number().nonnegative(),
      orderedQty: z.coerce.number().nonnegative(),
      deliveredQty: z.coerce.number().nonnegative(),
      consumedQty: z.coerce.number().nonnegative(),
      plannedUnitPrice: z.coerce.number().nonnegative(),
      actualUnitPrice: z.coerce.number().nonnegative(),
      supplier: z.string().default("Не выбран"),
      neededAt: z.coerce.date(),
      status: z.string().default("required"),
      sheetName: z.string(),
      rowNumber: z.coerce.number().int().positive()
    })
  ),
  scheduleItems: z.array(
    z.object({
      name: z.string().min(2),
      owner: z.string().default("РП"),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      plannedQty: z.coerce.number().nonnegative(),
      actualQty: z.coerce.number().nonnegative(),
      status: z.enum(["not_started", "in_progress", "done", "delayed", "stopped"]),
      dependency: z.string().optional(),
      sheetName: z.string(),
      rowNumber: z.coerce.number().int().positive()
    })
  )
});
