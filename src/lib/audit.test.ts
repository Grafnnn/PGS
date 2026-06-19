import { describe, expect, it } from "vitest";
import { auditSummary, safeAuditJson } from "./audit";

describe("audit helpers", () => {
  it("formats fallback summaries", () => {
    expect(auditSummary({ action: "create", entity: "budget_item" })).toBe("Создано: budget_item");
    expect(auditSummary({ action: "import_commit", entity: "excel_import" })).toBe("Сохранен импорт: excel_import");
  });

  it("truncates oversized json payloads", () => {
    const result = safeAuditJson({ text: "x".repeat(7000) }) as { truncated?: boolean; preview?: string };

    expect(result.truncated).toBe(true);
    expect(result.preview?.length).toBeLessThanOrEqual(6000);
  });
});
