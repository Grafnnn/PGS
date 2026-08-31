import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("WorkforceAdmissionRequests", () => {
  it("keeps admission approval explicit and documents masked", () => {
    const source = readFileSync("src/components/workforce-admission-requests.tsx", "utf8");
    expect(source).toContain("Заявки на допуск сотрудников");
    expect(source).toContain("Согласовать и завести");
    expect(source).toContain("Полные серии и номера паспортов");
    expect(source).toContain("documentLast4");
    expect(source).not.toContain("documentNumber");
  });

  it("links approved employees to the Plan day crew picker", () => {
    const source = readFileSync("src/components/reports-workflow.tsx", "utf8");
    expect(source).toContain("Кто работает");
    expect(source).toContain("Поиск сотрудника");
    expect(source).toContain("Выбрать видимых");
    expect(source).toContain("Заявки на допуск");
  });
});
