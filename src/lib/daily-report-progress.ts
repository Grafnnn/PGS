import { parseDailyReportWorkOutputs } from "@/lib/daily-report-work-outputs";
import type { WorkStatus } from "@/lib/types";

export type DailyReportProgressDelta = {
  scheduleItemId: string;
  quantity: number;
  workNames: string[];
};

export function dailyReportProgressDeltas(value: unknown): DailyReportProgressDelta[] {
  const grouped = new Map<string, DailyReportProgressDelta>();
  for (const output of parseDailyReportWorkOutputs(value)) {
    if (!output.scheduleItemId || output.quantity <= 0) continue;
    const current = grouped.get(output.scheduleItemId);
    if (current) {
      current.quantity += output.quantity;
      if (!current.workNames.includes(output.workName)) current.workNames.push(output.workName);
      continue;
    }
    grouped.set(output.scheduleItemId, {
      scheduleItemId: output.scheduleItemId,
      quantity: output.quantity,
      workNames: [output.workName]
    });
  }
  return [...grouped.values()];
}

export function scheduleStatusForActual(
  currentStatus: WorkStatus,
  plannedQty: number,
  actualQty: number
): WorkStatus {
  if (plannedQty > 0 && actualQty >= plannedQty) return "done";
  if (currentStatus === "delayed" || currentStatus === "stopped") return currentStatus;
  return actualQty > 0 ? "in_progress" : "not_started";
}
