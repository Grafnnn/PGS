import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectDeleteDangerZone } from "./project-workspace";

const noop = () => undefined;

describe("ProjectDeleteDangerZone", () => {
  it("keeps delete disabled for non-admin roles", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectDeleteDangerZone, {
        projectName: "Демо объект",
        canDelete: false,
        roleLoaded: true,
        role: "VIEWER",
        confirmationName: "Демо объект",
        confirmed: true,
        saving: false,
        deleted: false,
        onNameChange: noop,
        onConfirmChange: noop,
        onDelete: noop
      })
    );

    expect(html).toContain("Удаление доступно только OWNER/ADMIN");
    expect(html).toContain("disabled");
  });

  it("enables delete only after exact project name and explicit checkbox", () => {
    const html = renderToStaticMarkup(
      React.createElement(ProjectDeleteDangerZone, {
        projectName: "Демо объект",
        canDelete: true,
        roleLoaded: true,
        role: "OWNER",
        confirmationName: "Демо объект",
        confirmed: true,
        saving: false,
        deleted: false,
        onNameChange: noop,
        onConfirmChange: noop,
        onDelete: noop
      })
    );

    expect(html).toContain("Удалить проект");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("Введите точное имя проекта");
  });
});
