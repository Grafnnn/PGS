import { describe, expect, it } from "vitest";
import { normalizePhotoVolumeResult, parseRawPhotoVolumeResult } from "./photo-volume-estimation";

const works = [{
  scheduleItemId: "schedule-1",
  workName: "Монтаж кровельного покрытия",
  unit: "м²",
  plannedQuantity: 100,
  completedQuantity: 20,
  remainingQuantity: 80
}];

describe("photo volume estimation", () => {
  it("keeps a bounded suggestion and restores trusted work metadata", () => {
    const raw = parseRawPhotoVolumeResult({
      summary: "На фото виден размеченный участок.",
      suggestions: [{
        scheduleItemId: "schedule-1",
        suggestedQuantity: 12.3456,
        confidence: "medium",
        basis: "Размеры нанесены на основание.",
        needsManualMeasurement: false
      }],
      limitations: []
    });

    expect(normalizePhotoVolumeResult(raw, works)).toEqual({
      summary: "На фото виден размеченный участок.",
      suggestions: [{
        scheduleItemId: "schedule-1",
        workName: "Монтаж кровельного покрытия",
        suggestedQuantity: 12.346,
        unit: "м²",
        confidence: "medium",
        basis: "Размеры нанесены на основание.",
        needsManualMeasurement: false
      }],
      limitations: []
    });
  });

  it("rejects an estimate above the remaining schedule quantity", () => {
    const raw = parseRawPhotoVolumeResult({
      summary: "Черновик готов.",
      suggestions: [{
        scheduleItemId: "schedule-1",
        suggestedQuantity: 90,
        confidence: "high",
        basis: "Видимый участок.",
        needsManualMeasurement: false
      }],
      limitations: []
    });
    const result = normalizePhotoVolumeResult(raw, works);

    expect(result.suggestions[0]).toEqual(expect.objectContaining({
      suggestedQuantity: null,
      confidence: "low",
      needsManualMeasurement: true
    }));
    expect(result.limitations[0]).toContain("превышающая остаток");
  });

  it("returns an explicit manual-measurement row when AI omits a work", () => {
    const raw = parseRawPhotoVolumeResult({ summary: "Масштаб не виден.", suggestions: [], limitations: ["Нет масштаба."] });
    const result = normalizePhotoVolumeResult(raw, works);

    expect(result.suggestions[0]).toEqual(expect.objectContaining({
      scheduleItemId: "schedule-1",
      suggestedQuantity: null,
      needsManualMeasurement: true
    }));
  });
});
