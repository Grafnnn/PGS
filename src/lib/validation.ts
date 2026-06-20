import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().min(2),
  customer: z.string().min(2),
  object: z.string().min(2),
  address: z.string().min(2),
  contractAmount: z.coerce.number().nonnegative(),
  vatMode: z.enum(["vat", "no_vat"]).default("vat"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  manager: z.string().min(2),
  status: z.enum(["draft", "planning", "active", "paused", "completed", "archived"]).default("planning")
});

export const budgetItemSchema = z.object({
  section: z.string().min(1),
  subsection: z.string().optional().nullable(),
  code: z.string().min(1),
  name: z.string().min(2),
  unit: z.string().min(1),
  qty: z.coerce.number().nonnegative(),
  plannedUnitPrice: z.coerce.number().nonnegative(),
  actualUnitPrice: z.coerce.number().nonnegative().optional(),
  forecastUnitPrice: z.coerce.number().nonnegative().optional(),
  kind: z.enum(["work", "material", "equipment", "payroll", "subcontract", "overhead", "other"]),
  source: z.string().default("Ручной ввод"),
  comment: z.string().optional().nullable()
});

export const scheduleItemSchema = z.object({
  budgetItemId: z.string().optional().nullable(),
  name: z.string().min(2),
  owner: z.string().min(2),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  plannedQty: z.coerce.number().nonnegative(),
  actualQty: z.coerce.number().nonnegative().default(0),
  status: z.enum(["not_started", "in_progress", "done", "delayed", "stopped"]).default("not_started"),
  dependency: z.string().optional().nullable()
});

export const materialSchema = z.object({
  name: z.string().min(2),
  unit: z.string().min(1),
  requiredQty: z.coerce.number().nonnegative(),
  orderedQty: z.coerce.number().nonnegative().default(0),
  deliveredQty: z.coerce.number().nonnegative().default(0),
  consumedQty: z.coerce.number().nonnegative().default(0),
  plannedUnitPrice: z.coerce.number().nonnegative(),
  actualUnitPrice: z.coerce.number().nonnegative().default(0),
  supplier: z.string().optional().nullable(),
  neededAt: z.coerce.date(),
  status: z.string().default("required")
});

export const procurementRequestSchema = z.object({
  title: z.string().min(2),
  initiator: z.string().min(2),
  neededAt: z.coerce.date(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  status: z.string().default("draft"),
  items: z
    .array(
      z.object({
        materialId: z.string().optional().nullable(),
        name: z.string().min(2),
        qty: z.coerce.number().positive(),
        unit: z.string().min(1),
        comment: z.string().optional().nullable()
      })
    )
    .default([])
});

export const paymentSchema = z.object({
  title: z.string().min(2),
  counterparty: z.string().min(2),
  direction: z.enum(["incoming", "outgoing"]),
  plannedAt: z.coerce.date(),
  paidAt: z.coerce.date().optional().nullable(),
  amount: z.coerce.number().nonnegative(),
  status: z.enum(["planned", "approved", "paid", "overdue"]).default("planned"),
  category: z.enum(["customer", "supplier", "subcontractor", "payroll", "tax", "overhead", "loan"])
});

export const dailyReportSchema = z.object({
  date: z.coerce.date(),
  author: z.string().min(2),
  weather: z.string().default("Не указано"),
  workers: z.coerce.number().int().nonnegative().default(0),
  engineers: z.coerce.number().int().nonnegative().default(0),
  equipment: z.string().default(""),
  completedWorks: z.string().default(""),
  materialsReceived: z.string().default(""),
  materialsConsumed: z.string().default(""),
  downtime: z.string().default(""),
  issues: z.string().default(""),
  status: z.enum(["draft", "submitted", "checked", "approved"]).default("draft")
});

export const riskSchema = z.object({
  title: z.string().min(2),
  reason: z.string().min(2),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  owner: z.string().min(2),
  dueAt: z.coerce.date(),
  status: z.enum(["open", "in_progress", "closed", "deferred"]).default("open")
});

export const documentSchema = z.object({
  category: z.string().min(2),
  title: z.string().min(2),
  filePath: z.string().min(1),
  version: z.coerce.number().int().positive().default(1),
  author: z.string().min(2),
  comment: z.string().optional().nullable()
});

export const partial = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => schema.partial();
