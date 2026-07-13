import type { DailyReport, Project, ScheduleItem } from "@/lib/types";

export type ResourcesEquipmentTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ResourcesEquipmentStatus = "no_reports" | "needs_review" | "blocked" | "controlled";
export type ResourcesEquipmentTarget = "Рапорты" | "График" | "Исполнение" | "Риски";

export type ResourcesEquipmentInput = {
  project?: Partial<Project> | null;
  dailyReports?: DailyReport[] | null;
  scheduleItems?: ScheduleItem[] | null;
};

export type ResourcesEquipmentModel = {
  summary: {
    status: ResourcesEquipmentStatus;
    tone: ResourcesEquipmentTone;
    headline: string;
    nextStep: string;
    reportCount: number;
    latestWorkers: number;
    latestEngineers: number;
    averageWorkers: number;
    averageEngineers: number;
    equipmentUnits: number;
    downtimeReports: number;
    equipmentDowntimeReports: number;
    stoppedWorks: number;
  };
  equipment: Array<{ name: string; mentions: number; lastSeen: string; tone: ResourcesEquipmentTone }>;
  signals: Array<{ id: string; title: string; detail: string; source: string; tone: ResourcesEquipmentTone; targetTab: ResourcesEquipmentTarget; nextAction: string }>;
  actions: Array<{ title: string; detail: string; priority: "low" | "medium" | "high"; ownerRole: "РП" | "Прораб" | "Механик" | "ПТО"; targetTab: ResourcesEquipmentTarget }>;
  handoff: { title: string; copyText: string };
  limitations: string[];
};

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function readableDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function equipmentNames(value: string | null | undefined) {
  return (value ?? "")
    .split(/[,;.\n]+/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isEquipmentDowntime(value: string) {
  return /техник|экскаватор|кран|погрузчик|бульдозер|самосвал|компрессор|генератор|автовышк|механизм|неисправ|поломк/i.test(value);
}

export function buildResourcesEquipmentIntelligence(input: ResourcesEquipmentInput): ResourcesEquipmentModel {
  const project = input.project ?? {};
  const reports = [...(input.dailyReports ?? [])].sort((left, right) => right.date.localeCompare(left.date));
  const schedule = input.scheduleItems ?? [];
  const latest = reports[0];
  const reportCount = reports.length;
  const averageWorkers = reportCount ? Math.round(reports.reduce((sum, item) => sum + Math.max(0, item.workers), 0) / reportCount) : 0;
  const averageEngineers = reportCount ? Math.round(reports.reduce((sum, item) => sum + Math.max(0, item.engineers), 0) / reportCount) : 0;
  const downtimeReports = reports.filter((item) => hasText(item.downtime)).length;
  const equipmentDowntimeReports = reports.filter((item) => isEquipmentDowntime(item.downtime)).length;
  const stoppedWorks = schedule.filter((item) => item.status === "stopped");
  const equipmentByName = new Map<string, { name: string; mentions: number; lastSeen: string }>();

  reports.forEach((report) => equipmentNames(report.equipment).forEach((name) => {
    const key = name.toLocaleLowerCase("ru-RU");
    const current = equipmentByName.get(key);
    if (current) {
      current.mentions += 1;
      if (report.date > current.lastSeen) current.lastSeen = report.date;
    } else {
      equipmentByName.set(key, { name, mentions: 1, lastSeen: report.date });
    }
  }));

  const equipment = [...equipmentByName.values()]
    .sort((left, right) => right.mentions - left.mentions || right.lastSeen.localeCompare(left.lastSeen))
    .map((item) => ({ ...item, tone: equipmentDowntimeReports ? "warn" as const : "info" as const }));
  const workforceDrop = Boolean(latest && reportCount > 1 && latest.workers < Math.max(1, Math.floor(averageWorkers * 0.7)));
  const status: ResourcesEquipmentStatus = !reportCount
    ? "no_reports"
    : equipmentDowntimeReports || stoppedWorks.length
      ? "blocked"
      : downtimeReports || workforceDrop
        ? "needs_review"
        : "controlled";
  const tone: ResourcesEquipmentTone = status === "controlled" ? "good" : status === "blocked" ? "bad" : status === "needs_review" ? "warn" : "info";
  const headline = status === "controlled"
    ? "Ресурсы и техника без критичных отклонений"
    : status === "blocked"
      ? "Техника или остановленные работы требуют восстановительного плана"
      : status === "needs_review"
        ? "Есть отклонения по численности или простоям"
        : "Нет рапортов для контроля ресурсов и техники";
  const nextStep = status === "no_reports"
    ? "Зафиксировать в первом рапорте численность, ИТР, задействованную технику и простои."
    : status === "blocked"
      ? "Назначить владельца восстановления техники и подтвердить влияние на график."
      : workforceDrop
        ? "Сверить снижение численности с фронтами работ и недельным планом."
        : downtimeReports
          ? "Разобрать простои, причину и восстановительный срок по каждой смене."
          : "Подтвердить ресурсный план на ближайшую смену и контрольную точку графика.";
  const signals = [
    ...reports.filter((item) => hasText(item.downtime)).slice(0, 5).map((item) => ({
      id: `downtime:${item.id}`,
      title: `Простой · ${readableDate(item.date)}`,
      detail: item.downtime,
      source: isEquipmentDowntime(item.downtime) ? "Техника" : "Рапорт площадки",
      tone: isEquipmentDowntime(item.downtime) ? "bad" as const : "warn" as const,
      targetTab: "График" as const,
      nextAction: "Зафиксировать причину, ресурс восстановления и влияние на план работ."
    })),
    ...(workforceDrop && latest ? [{
      id: `workforce:${latest.id}`,
      title: "Снижение численности на площадке",
      detail: `В последнем рапорте ${latest.workers} рабочих при среднем ${averageWorkers}.`,
      source: "Рапорт площадки",
      tone: "warn" as const,
      targetTab: "Исполнение" as const,
      nextAction: "Подтвердить у прораба состав бригады и покрытие активных фронтов."
    }] : []),
    ...stoppedWorks.slice(0, 4).map((item) => ({
      id: `schedule:${item.id}`,
      title: `Остановленный фронт: ${item.name}`,
      detail: `${item.actualQty}/${item.plannedQty} · ${item.owner || "владелец не назначен"}`,
      source: "График",
      tone: "bad" as const,
      targetTab: "График" as const,
      nextAction: "Сверить доступность людей и техники перед возобновлением работ."
    }))
  ].slice(0, 12);
  const actions = [
    { title: "Подтвердить ресурс на смену", detail: latest ? `${readableDate(latest.date)}: ${latest.workers} рабочих / ${latest.engineers} ИТР.` : "Нужен первый рапорт.", priority: latest ? "medium" as const : "high" as const, ownerRole: "Прораб" as const, targetTab: "Рапорты" as const },
    { title: "Проверить готовность техники", detail: `${equipment.length} единиц/типов техники отмечено в рапортах; простоев техники ${equipmentDowntimeReports}.`, priority: equipmentDowntimeReports ? "high" as const : "medium" as const, ownerRole: "Механик" as const, targetTab: "Рапорты" as const },
    { title: "Сверить ресурс с графиком", detail: `${stoppedWorks.length} остановленных работ и ${signals.length} ресурсных сигналов.`, priority: stoppedWorks.length ? "high" as const : "medium" as const, ownerRole: "ПТО" as const, targetTab: "График" as const },
    { title: "Подтвердить план восстановления", detail: nextStep, priority: status === "blocked" ? "high" as const : "low" as const, ownerRole: "РП" as const, targetTab: "Исполнение" as const }
  ];
  const copyText = [
    `Resources & equipment: ${headline}`,
    project.name ? `Проект: ${project.name}` : "",
    `Рапорты: ${reportCount}`,
    `Последняя смена: ${latest ? `${latest.workers} рабочих / ${latest.engineers} ИТР` : "нет данных"}`,
    `Техника: ${equipment.length} единиц/типов`,
    `Простои: ${downtimeReports}, из них техника: ${equipmentDowntimeReports}`,
    `Следующий шаг: ${nextStep}`
  ].filter(Boolean).join("\n");

  return {
    summary: { status, tone, headline, nextStep, reportCount, latestWorkers: latest?.workers ?? 0, latestEngineers: latest?.engineers ?? 0, averageWorkers, averageEngineers, equipmentUnits: equipment.length, downtimeReports, equipmentDowntimeReports, stoppedWorks: stoppedWorks.length },
    equipment,
    signals,
    actions,
    handoff: { title: "Resource handoff", copyText },
    limitations: [
      "v1 собирает ресурсный срез из существующих ежедневных рапортов и графика; отдельный табель или путевой лист не создаются.",
      "Численность и готовность техники должны подтверждаться прорабом и механиком перед управленческим решением.",
      "Телеметрия, GPS и автоматическое списание машино-часов не подключаются."
    ]
  };
}
