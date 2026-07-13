import { describe, expect, it } from "vitest";
import { buildClaimsNoticesIntelligence } from "@/lib/claims-notices-intelligence";

describe("buildClaimsNoticesIntelligence", () => {
  it("does not claim that notices are controlled without project evidence", () => {
    const model = buildClaimsNoticesIntelligence({});
    expect(model.summary.status).toBe("no_data");
    expect(model.summary.tone).toBe("info");
  });

  it("creates review-only notice candidates from changes, delays and risks", () => {
    const model = buildClaimsNoticesIntelligence({
      project: { name: "Объект", contractAmount: 1_000_000 },
      budgetItems: [{ id: "b", projectId: "p", section: "Монолит", code: "", name: "Дополнительное армирование", unit: "т", qty: 2, plannedUnitPrice: 100_000, actualUnitPrice: 0, forecastUnitPrice: 130_000, kind: "work", source: "ВОР", comment: "изменение заказчика" }],
      scheduleItems: [{ id: "s", projectId: "p", name: "Монолит", owner: "ПТО", startsAt: "2026-01-01", endsAt: "2026-01-10", plannedQty: 10, actualQty: 10, status: "stopped" }],
      risks: [{ id: "r", projectId: "p", title: "Изменение проектных решений", reason: "Требуется согласование заказчика", priority: "critical", owner: "РП", dueAt: "2026-02-01", status: "open" }],
      documents: [{ id: "d", projectId: "p", category: "Переписка", title: "Письмо заказчика", filePath: "safe", version: 1, author: "РП", createdAt: "2026-01-01" }]
    });
    expect(model.summary.status).toBe("needs_review");
    expect(model.summary.noticeCount).toBeGreaterThanOrEqual(3);
    expect(model.summary.urgentCount).toBeGreaterThan(0);
    expect(model.summary.evidenceDocuments).toBeGreaterThan(0);
    expect(model.notices.some((notice) => notice.kind === "change_notice")).toBe(true);
    expect(model.notices.some((notice) => notice.kind === "delay_notice")).toBe(true);
    expect(model.notices.every((notice) => notice.draftText.includes("до отправки") || notice.draftText.includes("до направления"))).toBe(true);
  });
});
