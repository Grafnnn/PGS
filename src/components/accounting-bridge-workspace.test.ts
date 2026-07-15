import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccountingBridgeWorkspace } from "./accounting-bridge-workspace";

describe("AccountingBridgeWorkspace", () => {
  it("renders the guarded bridge without starting export or import on render", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const html = renderToStaticMarkup(createElement(AccountingBridgeWorkspace, { projectId: "project-1", onPaymentsChanged: vi.fn() }));
    expect(html).toContain("ERP &amp; Accounting Bridge v1");
    expect(html).toContain("Сверка файла");
    expect(html).toContain("Экспорт JSON");
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
