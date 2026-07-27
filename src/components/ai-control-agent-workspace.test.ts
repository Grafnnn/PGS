import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AiControlAgentWorkspace } from "@/components/ai-control-agent-workspace";

describe("AiControlAgentWorkspace", () => {
  it("renders an explicit preview gate and no automatic mutation state", () => {
    const html = renderToStaticMarkup(createElement(AiControlAgentWorkspace, {
      projectId: "project-1",
      canEdit: true,
      onNavigate: vi.fn()
    }));
    expect(html).toContain("AI Control Agent v2");
    expect(html).toContain("Собрать план");
    expect(html).toContain("До команды данные проекта не анализируются");
    expect(html).not.toContain("Создать выбранные действия");
  });
});
