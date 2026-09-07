import React, { type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ProjectCommandCenter } from "@/components/project-command-center";
import { projectTabs } from "@/components/project-module-menu";

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function setup() {
  const onNavigate = vi.fn();
  const tree = ProjectCommandCenter({
    project: { id: "audit-project", name: "Audit project", contractAmount: 1000000 },
    budgetItems: [], scheduleItems: [], materials: [], procurementRequests: [], payments: [],
    dailyReports: [], risks: [], readiness: null, documentChecklist: [], intelligence: null,
    onNavigate, onRunAiSummary: vi.fn()
  });
  return { buttons: elements(tree).filter((element) => element.type === "button"), onNavigate };
}

describe("command center navigation", () => {
  it("opens modules directly from recommended shortcuts without hidden drilldown anchors", () => {
    const { buttons, onNavigate } = setup();
    const expected: Record<string, string> = {
      "ВОР": "Бюджет / ВОР", "График": "График", "Снабжение": "Материалы",
      "Финансы": "Финансы", "Договор": "Договор / Тендер", "КП / Подача": "КП / Подача"
    };
    for (const button of buttons.filter((element) => element.props.className === "app-chip")) {
      button.props.onClick();
      expect(onNavigate).toHaveBeenLastCalledWith(expected[String(button.key)] ?? String(button.key));
    }
    expect(onNavigate).toHaveBeenCalled();
  });

  it.each([
    ["baseline", "Аналитика"], ["readiness", "Аналитика"], ["budget", "Бюджет / ВОР"],
    ["cash", "Финансы"], ["costToComplete", "Финансы"], ["schedule", "График"],
    ["risks", "Риски"], ["acceptance", "КС"], ["contract", "Договор / Тендер"],
    ["notices", "Договор / Тендер"], ["proposal", "КП / Подача"], ["execution", "Исполнение"],
    ["fieldOps", "Рапорты"], ["evidence", "Рапорты"], ["quality", "Риски"], ["materials", "Материалы"]
  ])("opens %s KPI in %s", (key, tab) => {
    const { buttons, onNavigate } = setup();
    const button = buttons.find((element) => element.key === key && String(element.props.className).startsWith("command-kpi "));
    expect(button).toBeDefined();
    button!.props.onClick();
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(tab);
  });

  it("keeps status and action links inside known project modules", () => {
    const { buttons, onNavigate } = setup();
    for (const button of buttons.filter((element) => /^(status-board-item|action-center-item)/.test(String(element.props.className)))) {
      button.props.onClick();
      expect(projectTabs).toContain(onNavigate.mock.calls.at(-1)?.[0]);
    }
    expect(onNavigate).toHaveBeenCalled();
  });
});
