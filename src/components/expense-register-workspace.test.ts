import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpenseRegisterWorkspace } from "@/components/expense-register-workspace";

describe("ExpenseRegisterWorkspace", () => {
  it("exposes manual entry, receipt recognition and itemized export without running a provider on render", () => {
    const markup = renderToStaticMarkup(createElement(ExpenseRegisterWorkspace, { projectId: "project-1", canEdit: true, canDelete: true }));
    expect(markup).toContain("Реестр расходов");
    expect(markup).toContain("Без чека");
    expect(markup).toContain("Загрузить чек");
    expect(markup).toContain("Расходы по статьям");
    expect(markup).toContain("Диаграмма появится после добавления первого расхода");
    expect(markup).toContain("/api/projects/project-1/expenses/export");
    expect(markup).not.toContain("receipt-preview");
  });
});
