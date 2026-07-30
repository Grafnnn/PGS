import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectCloseoutOverview, ProjectCloseoutWorkspace } from "@/components/project-closeout-workspace";

describe("ProjectCloseoutWorkspace", () => {
  it("renders stable loading shells before protected closeout data arrives", () => {
    const workspace = renderToStaticMarkup(createElement(ProjectCloseoutWorkspace, {
      projectId: "project-1",
      canEdit: true,
      canApprove: true
    }));
    const overview = renderToStaticMarkup(createElement(ProjectCloseoutOverview, {
      projectId: "project-1",
      onOpen: () => undefined
    }));

    expect(workspace).toContain("Загружаю контур сдачи и гарантии");
    expect(overview).toContain("Проверяю готовность к сдаче");
    expect(workspace).not.toContain("undefined");
  });
});
