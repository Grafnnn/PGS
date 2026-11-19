import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ requireProjectAccess: vi.fn(), findProject: vi.fn() }));

vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: mocks.requireProjectAccess }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.findProject } } }));

const params = { projectId: "project-1" };
const exportUrl = "https://pgs.example/api/projects/project-1/work-production-journal/export";

const shift = {
  id: "report-1",
  projectId: params.projectId,
  date: new Date("2026-11-19T12:00:00Z"),
  author: "Ирина Петрова",
  weather: "Снег",
  workers: 4,
  engineers: 1,
  equipment: "Кран",
  completedWorks: "Монтаж арматуры\nПодготовка опалубки",
  materialsReceived: "Арматура",
  materialsConsumed: "",
  downtime: "",
  issues: "",
  shiftHours: 7.5,
  phase: "closed",
  workCategory: "Монолит",
  workOutputs: [{ workName: "Монтаж арматуры", quantity: 2.75, unit: "т", laborHours: 12, profession: "Арматурщик" }],
  status: "submitted"
};

describe("production journal Excel export", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireProjectAccess.mockResolvedValue({ project: { id: params.projectId, organizationId: "org-1" } });
  });

  it("enforces project export permission before reading reports", async () => {
    mocks.requireProjectAccess.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });

    const response = await GET(new Request(exportUrl), { params });

    expect(response.status).toBe(403);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(params.projectId, "export_project");
    expect(mocks.findProject).not.toHaveBeenCalled();
  });

  it("rejects a reversed range without reading reports", async () => {
    const response = await GET(new Request(`${exportUrl}?from=2026-11-20&to=2026-11-19`), { params });

    expect(response.status).toBe(400);
    expect(mocks.findProject).not.toHaveBeenCalled();
  });

  it("exports closed shifts from the requested project and period with numeric production details", async () => {
    mocks.findProject.mockResolvedValue({
      name: "Строительство корпуса",
      dailyReports: [
        shift,
        { ...shift, id: "report-2", status: "approved", workOutputs: null, completedWorks: "=1+1" },
        { ...shift, id: "report-3", status: "draft" },
        { ...shift, id: "report-4", date: new Date("2026-11-18T12:00:00Z") }
      ]
    });

    const response = await GET(new Request(`${exportUrl}?from=2026-11-19&to=2026-11-19`), { params });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.findProject).toHaveBeenCalledWith({
      where: { id: params.projectId, organizationId: "org-1" },
      select: {
        name: true,
        dailyReports: {
          where: { date: { gte: new Date("2026-11-19T00:00:00Z"), lte: new Date("2026-11-19T23:59:59.999Z") } }
        }
      }
    });

    const workbook = XLSX.read(await response.arrayBuffer());
    expect(workbook.SheetNames).toEqual(["Журнал", "Выработка", "Сводка"]);
    const journal = XLSX.utils.sheet_to_json(workbook.Sheets["Журнал"]);
    expect(journal).toHaveLength(2);
    expect(journal).toEqual(expect.arrayContaining([
      expect.objectContaining({ "ID рапорта": "report-1", Дата: "2026-11-19", "Выполненные работы": shift.completedWorks }),
      expect.objectContaining({ "ID рапорта": "report-2", "Выполненные работы": "=1+1" })
    ]));
    expect([workbook.Sheets["Журнал"].C2, workbook.Sheets["Журнал"].C3].find((cell) => cell.v === "=1+1")).toMatchObject({ t: "s" });
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Выработка"])).toEqual([
      expect.objectContaining({ "ID рапорта": "report-1", Объём: 2.75, "Ед. изм.": "т", "Трудозатраты, чел.-ч": 12 })
    ]);
  });

  it("exports and identifies the search results shown in the journal", async () => {
    mocks.findProject.mockResolvedValue({
      name: "Строительство корпуса",
      dailyReports: [
        shift,
        { ...shift, id: "report-2", workCategory: "Отделка", completedWorks: "Окраска стен", workOutputs: null }
      ]
    });
    const url = new URL(exportUrl);
    url.searchParams.set("q", "  ОКРАСКА  ");

    const response = await GET(new Request(url), { params });

    expect(response.status).toBe(200);
    const workbook = XLSX.read(await response.arrayBuffer());
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Журнал"])).toEqual([
      expect.objectContaining({ "ID рапорта": "report-2", "Выполненные работы": "Окраска стен" })
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Сводка"], { header: 1 })).toContainEqual(["Поиск", "ОКРАСКА"]);
  });

  it("exports the exact work across dates without other work from a matching shift", async () => {
    const [output] = shift.workOutputs;
    mocks.findProject.mockResolvedValue({
      name: "Строительство корпуса",
      dailyReports: [
        {
          ...shift,
          workOutputs: [
            output,
            { ...output, workName: "Монтаж арматуры на крыше", quantity: 50 },
            { ...output, workName: "Подготовка опалубки", quantity: 10, unit: "м²" }
          ]
        },
        {
          ...shift,
          id: "report-2",
          date: new Date("2026-11-18T12:00:00Z"),
          workOutputs: [{ ...output, quantity: 0.5 }]
        },
        { ...shift, id: "report-3", workOutputs: null },
        { ...shift, id: "report-4", date: new Date("2026-11-17T12:00:00Z") }
      ]
    });
    const url = new URL(exportUrl);
    url.searchParams.set("from", "2026-11-18");
    url.searchParams.set("work", "монтаж арматуры");

    const response = await GET(new Request(url), { params });

    expect(response.status).toBe(200);
    const workbook = XLSX.read(await response.arrayBuffer());
    expect(workbook.SheetNames).toEqual(["Выработка", "Сводка"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Выработка"])).toEqual([
      expect.objectContaining({ "ID рапорта": "report-1", Дата: "2026-11-19", Работа: "Монтаж арматуры", Объём: 2.75, "Ед. изм.": "т" }),
      expect.objectContaining({ "ID рапорта": "report-2", Дата: "2026-11-18", Работа: "Монтаж арматуры", Объём: 0.5, "Ед. изм.": "т" })
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Сводка"], { header: 1 })).toContainEqual(["Работа", "Монтаж арматуры"]);
  });

  it("keeps an unmatched or invalid work selection from exporting the full journal", async () => {
    mocks.findProject.mockResolvedValue({ name: "Строительство корпуса", dailyReports: [shift] });
    const url = new URL(exportUrl);
    url.searchParams.set("work", "  ");
    expect((await GET(new Request(url), { params })).status).toBe(400);
    expect(mocks.findProject).not.toHaveBeenCalled();

    url.searchParams.set("work", "неизвестная работа");
    const response = await GET(new Request(url), { params });
    expect(response.status).toBe(200);
    const workbook = XLSX.read(await response.arrayBuffer());
    expect(workbook.SheetNames).toEqual(["Выработка", "Сводка"]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets["Выработка"])).toEqual([]);
  });
});
