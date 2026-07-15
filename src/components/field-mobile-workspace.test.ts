import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FieldMobileWorkspace } from "@/components/field-mobile-workspace";

describe("FieldMobileWorkspace", () => {
  it("renders explicit local capture controls without a server mutation on render", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(createElement(FieldMobileWorkspace, {
      projectId: "project-1",
      projectName: "Тестовый объект",
      currentUser: { authenticated: true, role: "MANAGER", name: "Прораб" },
      currentUserLoaded: true,
      onReportSynced: () => undefined,
      onDocumentSynced: () => undefined
    }));

    expect(html).toContain("Field Mobile / Offline v1");
    expect(html).toContain("Сохранить на устройстве");
    expect(html).toContain("Синхронизировать (0)");
    expect(html).toContain("FIFO · только явная отправка");
    expect(html).toContain("Редактирование серверных записей offline не выполняется");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
