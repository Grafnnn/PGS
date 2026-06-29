import { z } from "zod";

export type ImportRowKind = "ignored" | "section" | "budget_item" | "material" | "schedule_item" | "unknown";
export type AssistedImportRowKind = "section_header" | "stage" | "work_item" | "material_item" | "equipment_item" | "labor_item" | "subtotal" | "note" | "unknown";
export type ImportEntityType = "budgetItem" | "material" | "scheduleItem" | "section" | "unknown";
export type ImportRowStatus = "ready" | "warning" | "error" | "skipped";
export type ImportMode = "append" | "replace_budget" | "replace_materials" | "replace_budget_materials" | "replace_schedule" | "replace_all";
export type ImportBatchStatus = "previewed" | "committed" | "failed";
export type ImportSheetDetectedType = "works" | "materials" | "schedule" | "mixed" | "unknown";
export type ImportSuspiciousFlag =
  | "duplicate"
  | "amountMismatch"
  | "missingPrice"
  | "missingQuantity"
  | "unknownClassification"
  | "skippedTotalRow"
  | "hiddenRow"
  | "lowConfidence"
  | "negativeValue";

export const EXCEL_IMPORT_PARSER_VERSION = "excel_import_v1";

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

export type ColumnTarget = keyof ColumnMap;

export interface ImportColumnDetail {
  target: ColumnTarget;
  sourceIndex?: number;
  sourceHeader?: string;
  confidence: number;
  samples: string[];
}

export interface RawSheetRow {
  sheetName: string;
  rowNumber: number;
  values: unknown[];
  formulaCells?: string[];
  hidden?: boolean;
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

export interface ImportSheetMapping {
  sheetName: string;
  headerRow: number | null;
  columns: ColumnMap;
  included?: boolean;
  detectedType?: ImportSheetDetectedType;
  confidence?: number;
  sampleRows?: string[][];
  columnDetails?: ImportColumnDetail[];
  rows: number;
  parsedRows: number;
  hiddenRows: number;
  formulaCells: number;
  warnings: string[];
}

export interface ImportPreviewRow {
  id: string;
  sheetName: string;
  sourceRowNumber: number;
  originalNumber?: string;
  normalizedNumber?: string;
  rowKind?: AssistedImportRowKind;
  confidence?: number;
  status: ImportRowStatus;
  entityType: ImportEntityType;
  section?: string;
  name?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  normalizedJson: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  suspiciousFlags: ImportSuspiciousFlag[];
}

export interface ImportSourceRow {
  sheetName: string;
  rowNumber: number;
  values: string[];
  formulaCells?: string[];
  hidden?: boolean;
}

export interface ImportExplanation {
  status: "deterministic" | "ai" | "degraded";
  summary: string;
  blockingIssues: string[];
  warningsToReview: string[];
  suggestedMappingFixes: string[];
  recommendedNextSteps: string[];
  managementNote: string;
  confidence: number;
  missingData: string[];
}

export interface ImportPreview {
  importBatchId?: string;
  projectId: string;
  fileName: string;
  fileSize?: number;
  parserVersion: string;
  sheets: string[];
  mapping: ImportSheetMapping[];
  summary: {
    totalRows: number;
    parsedRows: number;
    readyRows?: number;
    warningRows?: number;
    errorRows?: number;
    skippedRows?: number;
    ignoredRows: number;
    sections: number;
    budgetItems: number;
    materials: number;
    scheduleItems: number;
    workRows?: number;
    materialRows?: number;
    unknownRows: number;
    duplicateRows: number;
    hiddenRows: number;
    formulaCells: number;
    estimatedTotalAmount?: number;
    errors: number;
    warnings: number;
  };
  sections: ImportSection[];
  budgetItems: ImportBudgetItem[];
  materials: ImportMaterial[];
  scheduleItems: ImportScheduleItem[];
  unknownRows: UnknownImportRow[];
  previewRows?: ImportPreviewRow[];
  sourceRows?: ImportSourceRow[];
  explanation?: ImportExplanation;
  warnings: string[];
  errors: string[];
}

export interface ImportCommitPlan {
  mode: ImportMode;
  sections: ImportSection[];
  budgetItems: ImportBudgetItem[];
  materials: ImportMaterial[];
  scheduleItems: ImportScheduleItem[];
  warnings: string[];
  summary: ImportPreview["summary"];
}

export const importModes = ["append", "replace_budget", "replace_materials", "replace_budget_materials", "replace_schedule", "replace_all"] as const;
export const wizardImportModes = ["append", "replace_budget", "replace_materials", "replace_budget_materials"] as const;

export const columnMapSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  name: z.number().int().nonnegative().optional(),
  unit: z.number().int().nonnegative().optional(),
  qty: z.number().int().nonnegative().optional(),
  unitPrice: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative().optional(),
  section: z.number().int().nonnegative().optional(),
  note: z.number().int().nonnegative().optional(),
  startsAt: z.number().int().nonnegative().optional(),
  endsAt: z.number().int().nonnegative().optional()
});

export const importSectionSchema = z.object({
  name: z.string().min(1),
  sheetName: z.string(),
  rowNumber: z.coerce.number().int().positive()
});

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

export const importMaterialSchema = z.object({
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
});

export const importScheduleItemSchema = z.object({
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
});

export const importPreviewSummarySchema = z.object({
  totalRows: z.coerce.number().int().nonnegative(),
  parsedRows: z.coerce.number().int().nonnegative(),
  readyRows: z.coerce.number().int().nonnegative().default(0),
  warningRows: z.coerce.number().int().nonnegative().default(0),
  errorRows: z.coerce.number().int().nonnegative().default(0),
  skippedRows: z.coerce.number().int().nonnegative().default(0),
  ignoredRows: z.coerce.number().int().nonnegative(),
  sections: z.coerce.number().int().nonnegative(),
  budgetItems: z.coerce.number().int().nonnegative(),
  materials: z.coerce.number().int().nonnegative(),
  scheduleItems: z.coerce.number().int().nonnegative(),
  workRows: z.coerce.number().int().nonnegative().default(0),
  materialRows: z.coerce.number().int().nonnegative().default(0),
  unknownRows: z.coerce.number().int().nonnegative(),
  duplicateRows: z.coerce.number().int().nonnegative(),
  hiddenRows: z.coerce.number().int().nonnegative(),
  formulaCells: z.coerce.number().int().nonnegative(),
  estimatedTotalAmount: z.coerce.number().nonnegative().default(0),
  errors: z.coerce.number().int().nonnegative(),
  warnings: z.coerce.number().int().nonnegative()
});

export const importColumnDetailSchema = z.object({
  target: z.enum(["index", "name", "unit", "qty", "unitPrice", "total", "section", "note", "startsAt", "endsAt"]),
  sourceIndex: z.coerce.number().int().nonnegative().optional(),
  sourceHeader: z.string().optional(),
  confidence: z.coerce.number().min(0).max(1),
  samples: z.array(z.string())
});

export const importSheetMappingSchema = z.object({
  sheetName: z.string(),
  headerRow: z.coerce.number().int().positive().nullable(),
  columns: columnMapSchema,
  included: z.boolean().default(true),
  detectedType: z.enum(["works", "materials", "schedule", "mixed", "unknown"]).default("unknown"),
  confidence: z.coerce.number().min(0).max(1).default(0),
  sampleRows: z.array(z.array(z.string())).default([]),
  columnDetails: z.array(importColumnDetailSchema).default([]),
  rows: z.coerce.number().int().nonnegative(),
  parsedRows: z.coerce.number().int().nonnegative(),
  hiddenRows: z.coerce.number().int().nonnegative(),
  formulaCells: z.coerce.number().int().nonnegative(),
  warnings: z.array(z.string())
});

export const unknownImportRowSchema = z.object({
  sheetName: z.string(),
  rowNumber: z.coerce.number().int().positive(),
  reason: z.string(),
  values: z.array(z.string())
});

export const importPreviewRowSchema = z.object({
  id: z.string(),
  sheetName: z.string(),
  sourceRowNumber: z.coerce.number().int().positive(),
  originalNumber: z.string().optional(),
  normalizedNumber: z.string().optional(),
  rowKind: z.enum(["section_header", "stage", "work_item", "material_item", "equipment_item", "labor_item", "subtotal", "note", "unknown"]).optional(),
  confidence: z.coerce.number().min(0).max(1).optional(),
  status: z.enum(["ready", "warning", "error", "skipped"]),
  entityType: z.enum(["budgetItem", "material", "scheduleItem", "section", "unknown"]),
  section: z.string().optional(),
  name: z.string().optional(),
  unit: z.string().optional(),
  quantity: z.coerce.number().optional(),
  unitPrice: z.coerce.number().optional(),
  totalAmount: z.coerce.number().optional(),
  normalizedJson: z.record(z.unknown()),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  suspiciousFlags: z.array(
    z.enum(["duplicate", "amountMismatch", "missingPrice", "missingQuantity", "unknownClassification", "skippedTotalRow", "hiddenRow", "lowConfidence", "negativeValue"])
  )
});

export const importSourceRowSchema = z.object({
  sheetName: z.string(),
  rowNumber: z.coerce.number().int().positive(),
  values: z.array(z.string()),
  formulaCells: z.array(z.string()).optional(),
  hidden: z.boolean().optional()
});

export const importExplanationSchema = z.object({
  status: z.enum(["deterministic", "ai", "degraded"]),
  summary: z.string(),
  blockingIssues: z.array(z.string()),
  warningsToReview: z.array(z.string()),
  suggestedMappingFixes: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
  managementNote: z.string(),
  confidence: z.coerce.number().min(0).max(1),
  missingData: z.array(z.string())
});

export const importPreviewSchema = z.object({
  importBatchId: z.string().optional(),
  projectId: z.string(),
  fileName: z.string(),
  fileSize: z.coerce.number().int().nonnegative().optional(),
  parserVersion: z.string().default(EXCEL_IMPORT_PARSER_VERSION),
  sheets: z.array(z.string()),
  mapping: z.array(importSheetMappingSchema),
  summary: importPreviewSummarySchema,
  sections: z.array(importSectionSchema),
  budgetItems: z.array(importBudgetItemSchema),
  materials: z.array(importMaterialSchema),
  scheduleItems: z.array(importScheduleItemSchema),
  unknownRows: z.array(unknownImportRowSchema),
  previewRows: z.array(importPreviewRowSchema).default([]),
  sourceRows: z.array(importSourceRowSchema).optional(),
  explanation: importExplanationSchema.optional(),
  warnings: z.array(z.string()),
  errors: z.array(z.string())
});

export const importCommitRequestSchema = z.object({
  importBatchId: z.string().min(1),
  mode: z.enum(importModes).default("append"),
  replaceConfirmed: z.boolean().default(false)
});

export const importRemapRequestSchema = z.object({
  mapping: z.array(
    z.object({
      sheetName: z.string(),
      headerRow: z.coerce.number().int().positive().nullable().optional(),
      included: z.boolean().optional(),
      columns: columnMapSchema
    })
  )
});

export const importPreviewCommitSchema = z.object({
  mode: z.enum(importModes).default("append"),
  sections: z.array(importSectionSchema),
  budgetItems: z.array(importBudgetItemSchema),
  materials: z.array(importMaterialSchema),
  scheduleItems: z.array(importScheduleItemSchema)
});
