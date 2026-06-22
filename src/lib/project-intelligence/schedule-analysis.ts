import type { Material, ScheduleItem } from "@/lib/types";
import type { IntelligenceIssue, RiskLevel, ScheduleIntelligence } from "./types";
import { dateOnly, daysBetween, evidence, forecastWindows, issue, parseDate } from "./helpers";
import { scoreToRiskLevel } from "./risk-scoring";

export function analyzeSchedule(items: ScheduleItem[], materials: Material[], now = new Date()): ScheduleIntelligence {
  const issues: IntelligenceIssue[] = [];
  const noDateTasks = items.filter((item) => !parseDate(item.startsAt) || !parseDate(item.endsAt));
  const noOwnerTasks = items.filter((item) => !item.owner?.trim());
  const overdueTasks = items.filter((item) => {
    const endsAt = parseDate(item.endsAt);
    return Boolean(endsAt && endsAt < now && item.status !== "done");
  });
  const upcomingTasks = items
    .filter((item) => {
      const startsAt = parseDate(item.startsAt);
      return Boolean(startsAt && startsAt >= now && daysBetween(now, startsAt) <= 30);
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  for (const item of overdueTasks) {
    issues.push(
      issue({
        id: `schedule-overdue-${item.id}`,
        category: "schedule",
        title: "Просроченная работа",
        reason: `${item.name} должна была завершиться ${item.endsAt}.`,
        score: item.status === "delayed" ? 80 : 70,
        suggestedAction: "Обновите статус, причину просрочки и план восстановления.",
        evidence: [
          evidence({
            entityType: "scheduleItem",
            entityId: item.id,
            label: item.name,
            field: "endsAt",
            value: item.endsAt,
            explanation: "Дата окончания уже прошла, работа не закрыта."
          })
        ]
      })
    );
  }

  for (const item of noDateTasks) {
    issues.push(
      issue({
        id: `schedule-no-date-${item.id}`,
        category: "schedule",
        title: "Работа без корректных дат",
        reason: `${item.name} не имеет полной пары дат начала/окончания.`,
        score: 45,
        suggestedAction: "Заполните даты, чтобы прогноз сроков был надежным.",
        evidence: [
          evidence({
            entityType: "scheduleItem",
            entityId: item.id,
            label: item.name,
            field: "startsAt/endsAt",
            value: `${item.startsAt || "-"} / ${item.endsAt || "-"}`,
            explanation: "Без дат работа не участвует в прогнозе."
          })
        ]
      })
    );
  }

  for (const item of noOwnerTasks) {
    issues.push(
      issue({
        id: `schedule-no-owner-${item.id}`,
        category: "schedule",
        title: "Работа без ответственного",
        reason: `${item.name} не закреплена за ответственным.`,
        score: 40,
        suggestedAction: "Назначьте РП/ПТО/прораба для контроля работы.",
        evidence: [
          evidence({
            entityType: "scheduleItem",
            entityId: item.id,
            label: item.name,
            field: "owner",
            value: item.owner,
            explanation: "Отсутствие владельца снижает управляемость графика."
          })
        ]
      })
    );
  }

  const deficitMaterials = materials.filter((material) => material.deliveredQty < material.requiredQty);
  const tasksWithoutMaterials = upcomingTasks.slice(0, 10).flatMap((task) => {
    if (!deficitMaterials.length) return [];
    const material = deficitMaterials.find((candidate) => task.name.toLowerCase().includes(candidate.name.toLowerCase().split(" ")[0]));
    if (!material) return [];
    return [
      issue({
        id: `schedule-material-${task.id}-${material.id}`,
        category: "schedule",
        title: "Ближайшая работа без закрытого материала",
        reason: `${task.name} начинается ${task.startsAt}, материал ${material.name} поставлен не полностью.`,
        score: 75,
        suggestedAction: "Синхронизируйте график и снабжение до начала работ.",
        evidence: [
          evidence({
            entityType: "scheduleItem",
            entityId: task.id,
            label: task.name,
            field: "startsAt",
            value: task.startsAt,
            explanation: "Работа в ближайшем окне."
          }),
          evidence({
            entityType: "material",
            entityId: material.id,
            label: material.name,
            field: "deliveredQty",
            value: material.deliveredQty,
            explanation: `Потребность ${material.requiredQty} ${material.unit}.`
          })
        ]
      })
    ];
  });
  issues.push(...tasksWithoutMaterials);

  const forecast = forecastWindows.map((windowDays) => {
    const riskCount = items.filter((item) => {
      const startsAt = parseDate(item.startsAt);
      const endsAt = parseDate(item.endsAt);
      return Boolean((startsAt && daysBetween(now, startsAt) <= windowDays && startsAt >= now) || (endsAt && endsAt < now && item.status !== "done"));
    }).length;
    const level: RiskLevel = scoreToRiskLevel(Math.min(100, riskCount * 18 + overdueTasks.length * 20));
    return {
      windowDays,
      riskLevel: level,
      riskCount,
      summary: riskCount ? `В окне до ${dateOnly(new Date(now.getTime() + windowDays * 86_400_000))} есть ${riskCount} работ к контролю.` : "Критичных работ в окне нет."
    };
  });

  return {
    overdueTasks,
    noDateTasks,
    noOwnerTasks,
    upcomingTasks,
    tasksWithoutMaterials,
    forecast,
    issues
  };
}
