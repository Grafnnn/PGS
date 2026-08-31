import { z } from "zod";
import type { DailyReportCrewMember, ResourceKind } from "@/lib/types";

export const dailyReportCrewMemberSchema = z.object({
  resourceId: z.string().min(1).max(200),
  name: z.string().trim().min(2).max(240),
  profession: z.string().trim().max(240).default(""),
  kind: z.enum(["worker", "engineer", "crew"]),
  headcount: z.coerce.number().int().min(1).max(500).default(1)
});

export const dailyReportCrewResourceIdsSchema = z.array(z.string().min(1).max(200)).max(200).default([]);

export function parseDailyReportCrewMembers(value: unknown): DailyReportCrewMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = dailyReportCrewMemberSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function dailyReportCrewCounts(items: DailyReportCrewMember[]) {
  return items.reduce((totals, item) => {
    if (item.kind === "engineer") totals.engineers += item.headcount;
    else totals.workers += item.headcount;
    return totals;
  }, { workers: 0, engineers: 0 });
}

export function buildDailyReportCrewMembers(items: Array<{
  resourceId: string;
  resource: { name: string; profession: string | null; kind: string; headcount: number };
}>): DailyReportCrewMember[] {
  return items.flatMap((item) => {
    if (!(["worker", "engineer", "crew"] as string[]).includes(item.resource.kind)) return [];
    return [{
      resourceId: item.resourceId,
      name: item.resource.name,
      profession: item.resource.profession ?? "",
      kind: item.resource.kind as Exclude<ResourceKind, "equipment">,
      headcount: item.resource.headcount
    }];
  });
}
