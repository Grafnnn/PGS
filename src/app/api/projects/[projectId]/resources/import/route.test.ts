import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  resourceCreate: vi.fn(),
  assignmentCreate: vi.fn(),
  writeAudit: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    organizationResource: { findMany: vi.fn() },
    projectPayrollPolicy: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      organizationResource: { create: mocks.resourceCreate },
      projectResourceAssignment: { create: mocks.assignmentCreate }
    }))
  }
}));

function registerFile() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Сотрудники в штате (ТРОИЦК)"],
    [],
    ["п/п", "Наименование должности", "ФИО", "Заработная плата (на руки)", "Заработная плата (с учетом налогов)", "Примечание"],
    [1, "Прораб", "Иванов И.И.", 100000, 137000, "полный день"],
    [2, "Кровельщик", "Петров П.П.", 80000, 109600, "высотные работы"]
  ]), "ФОТ");
  return new File([XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })], "troitsk.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
}

function request(action: "preview" | "commit", selectedKeys: string[] = []) {
  const form = new FormData();
  form.set("action", action);
  form.set("file", registerFile());
  if (action === "commit") form.set("selectedKeys", JSON.stringify(selectedKeys));
  return new Request("https://pgs.local/api/projects/project-1/resources/import", { method: "POST", body: form }) as never;
}

describe("workforce register import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      id: "project-1",
      organizationId: "org-1",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-01T00:00:00.000Z")
    } as never);
    vi.mocked(prisma.organizationResource.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.projectPayrollPolicy.findUnique).mockResolvedValue(null);
    mocks.resourceCreate.mockResolvedValue({ id: "resource-1" });
    mocks.assignmentCreate.mockResolvedValue({ id: "assignment-1" });
  });

  it("checks permission before reading multipart input", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "broken" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("previews the Troitsk-style register without writing", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("preview"), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.preview.rows).toEqual([
      expect.objectContaining({ key: "ФОТ:4", name: "Иванов И.И.", profession: "Прораб", existingStatus: "new" }),
      expect.objectContaining({ key: "ФОТ:5", name: "Петров П.П.", profession: "Кровельщик", existingStatus: "new" })
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates only explicitly selected rows and records one sanitized audit", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("commit", ["ФОТ:4"]), { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.resourceCreate).toHaveBeenCalledTimes(1);
    expect(mocks.resourceCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Иванов И.И.", profession: "Прораб", kind: "engineer", headcount: 1 })
    }));
    expect(mocks.assignmentCreate).toHaveBeenCalledTimes(1);
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "workforce_register_import",
      summary: expect.stringContaining("создано 1")
    }));
  });

  it("skips a person already assigned to the project", async () => {
    vi.mocked(prisma.organizationResource.findMany).mockResolvedValue([{
      id: "resource-existing",
      name: "Иванов И.И.",
      profession: "Прораб",
      assignments: [{ id: "assignment-existing" }]
    }] as never);
    const { POST } = await import("./route");
    const response = await POST(request("preview"), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(body.preview.rows[0]).toMatchObject({ existingStatus: "assigned" });
  });
});
