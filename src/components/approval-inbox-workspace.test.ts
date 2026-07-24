import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovalInboxWorkspace } from "@/components/approval-inbox-workspace";

describe("ApprovalInboxWorkspace", () => {
  it("renders the global decision surface and stable filters before client data arrives", () => {
    const html = renderToStaticMarkup(createElement(ApprovalInboxWorkspace));
    expect(html).toContain("Notifications &amp; Approval Inbox");
    expect(html).toContain("Мои решения");
    expect(html).toContain("Активные");
    expect(html).toContain("Решения");
    expect(html).toContain("Просрочено");
    expect(html).toContain("Блокеры");
    expect(html).toContain("Все проекты");
    expect(html).toContain("Все источники");
    expect(html).toContain("Собираем очередь решений");
  });
});
