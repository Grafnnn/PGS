import type { AppRole } from "@/lib/auth/permissions";
import type { DailyReport } from "@/lib/types";

export const dailyReportStatuses = ["draft", "submitted", "checked", "approved"] as const;

const transitions: Record<DailyReport["status"], DailyReport["status"][]> = {
  draft: ["submitted"],
  submitted: ["draft", "checked"],
  checked: ["submitted", "approved"],
  approved: []
};

export function canTransitionDailyReport(from: string, to: string, role: AppRole | null) {
  if (!dailyReportStatuses.includes(from as DailyReport["status"]) || !dailyReportStatuses.includes(to as DailyReport["status"])) return false;
  const current = from as DailyReport["status"];
  const next = to as DailyReport["status"];
  if (from === to) return true;
  if (!role || !transitions[current].includes(next)) return false;
  if (next === "approved") return role === "OWNER" || role === "ADMIN";
  if (next === "checked") return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

export function dailyReportStatusLabel(status: DailyReport["status"]) {
  const labels: Record<DailyReport["status"], string> = {
    draft: "Черновик",
    submitted: "Отправлен",
    checked: "Проверен",
    approved: "Утвержден"
  };
  return labels[status];
}
