import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("RFI & Submittals workspace", () => {
  const source = fs.readFileSync(new URL("./rfi-submittals-workspace.tsx", import.meta.url), "utf8");

  it("exposes explicit RFI and submittal workflow actions", () => {
    for (const marker of ["Новый RFI", "Отправить", "Ответить", "Закрыть", "Новая подача на согласование", "Вернуть на доработку", "Подать Rev", "История решений"]) {
      expect(source).toContain(marker);
    }
  });

  it("does not mutate workflow on render", () => {
    expect(source).toContain(': "POST"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain('method: "DELETE"');
    expect(source).not.toContain("useEffect(() => void update(");
  });
});
