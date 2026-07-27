import { describe, expect, it } from "vitest";
import { parseProjectWorkbookBuffer } from "@/lib/excel/project-workbook-import";
import {
  buildWorkforcePayrollImportSmokeWorkbook,
  inspectWorkforcePayrollImportPreview,
  workforcePayrollImportSmokePassed
} from "./workforce-payroll-import";

describe("workforce payroll Excel staging smoke helpers", () => {
  it("builds a synthetic workbook that produces payroll demand and a complete VOR allocation", () => {
    const fixture = buildWorkforcePayrollImportSmokeWorkbook("run-123");
    const preview = parseProjectWorkbookBuffer(
      fixture.bytes,
      fixture.fileName,
      "project-smoke",
      { startsAt: "2026-07-01" }
    );
    const inspected = inspectWorkforcePayrollImportPreview(
      { ...preview, importBatchId: "batch-smoke" },
      fixture
    );

    expect(inspected.recognized).toBe(true);
    expect(inspected.payrollItem).toMatchObject({
      name: fixture.profession,
      kind: "payroll",
      qty: fixture.expectedPersonMonths,
      plannedUnitPrice: fixture.grossMonthlySalary
    });
    expect(inspected.demand).toMatchObject({
      profession: fixture.profession,
      grossMonthlySalary: fixture.grossMonthlySalary,
      personMonths: fixture.expectedPersonMonths,
      plannedHours: fixture.expectedPlannedHours
    });
    expect(inspected.workAllocation).toMatchObject({
      budgetName: fixture.workName,
      sharePercent: 100,
      plannedHours: fixture.expectedPlannedHours
    });
    expect(preview.sections.some((item) => item.name.startsWith(fixture.marker))).toBe(true);
    expect(preview.scheduleItems.every((item) => item.name.startsWith(fixture.marker))).toBe(true);
    expect(JSON.stringify(fixture)).not.toMatch(/password|database_url|access_token|cookie|session/i);
  });

  it("passes only when preview, commit, economics, cleanup, and role restoration all pass", () => {
    const complete = {
      previewRecognized: true,
      commitCreated: true,
      demandListed: true,
      allocationLinked: true,
      payrollCalculated: true,
      taxesCalculated: true,
      economicsCalculated: true,
      cleanupPassed: true,
      roleRestored: true
    };

    expect(workforcePayrollImportSmokePassed(complete)).toBe(true);
    for (const key of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(workforcePayrollImportSmokePassed({ ...complete, [key]: false })).toBe(false);
    }
  });
});
