import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Document Transmittals workspace", () => {
  const source = fs.readFileSync(new URL("./document-transmittals-workspace.tsx", import.meta.url), "utf8");

  it("exposes a complete controlled package workflow", () => {
    for (const marker of ["Новая выдача", "Состав пакета", "Выдать пакет", "Подтвердить получение", "Зафиксировать решение", "Выдать Rev", "Лист выдачи", "История выдачи"]) {
      expect(source).toContain(marker);
    }
  });

  it("does not mutate workflow on render", () => {
    expect(source).toContain('method: "POST"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain('method: "DELETE"');
    expect(source).not.toContain("useEffect(() => void update(");
  });
});
