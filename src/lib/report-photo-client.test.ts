import { describe, expect, it } from "vitest";
import { formatReportPhotoBytes, mapWithConcurrency, reportPhotoFileKey, reportPhotoOutputName } from "./report-photo-client";

describe("report photo client helpers", () => {
  it("builds stable file keys and safe optimized names", () => {
    const file = { name: "Фото смены.JPG", size: 4_000_000, lastModified: 123 };
    expect(reportPhotoFileKey(file as File, 2)).toBe("Фото смены.JPG:4000000:123:2");
    expect(reportPhotoOutputName(file.name)).toBe("Фото смены.webp");
  });

  it("formats upload sizes for the queue", () => {
    expect(formatReportPhotoBytes(400_000)).toContain("КБ");
    expect(formatReportPhotoBytes(4_000_000)).toContain("МБ");
  });

  it("keeps upload concurrency bounded and result order stable", async () => {
    let active = 0;
    let maxActive = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return item * 10;
    });

    expect(maxActive).toBe(2);
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });
});
