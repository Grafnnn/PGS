import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/permissions";

const getCurrentUserMock = vi.fn();
const canProjectMock = vi.fn();
const parseExcelBufferMock = vi.fn();
const validateExcelFileMock = vi.fn();
const projectFindUniqueMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: canProjectMock
}));

vi.mock("@/lib/excel/import-parser", () => ({
  parseExcelBuffer: parseExcelBufferMock,
  validateExcelFile: validateExcelFileMock
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: projectFindUniqueMock
    },
    $transaction: transactionMock
  }
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn()
}));

const authorizedUser: AppUser = {
  id: "user-1",
  name: "Project Manager",
  email: "pm@pgs.local",
  role: "MANAGER",
  authenticated: true
};

function requestWithFormData(formData: () => Promise<FormData>) {
  return { formData } as never;
}

async function responseJson(response: Response) {
  return (await response.json()) as { error?: string };
}

describe("budget import preview route", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    canProjectMock.mockReset();
    parseExcelBufferMock.mockReset();
    validateExcelFileMock.mockReset();
    projectFindUniqueMock.mockReset();
    transactionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 before reading form-data when user is unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const formData = vi.fn(async () => {
      throw new Error("formData should not be read");
    });
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(formData), { params: { projectId: "project-demo" } });

    expect(response.status).toBe(401);
    await expect(responseJson(response)).resolves.toEqual({ error: "Unauthorized" });
    expect(formData).not.toHaveBeenCalled();
    expect(canProjectMock).not.toHaveBeenCalled();
    expect(projectFindUniqueMock).not.toHaveBeenCalled();
    expect(parseExcelBufferMock).not.toHaveBeenCalled();
  });

  it("returns 403 before reading form-data when user lacks project import access", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(false);
    const formData = vi.fn(async () => {
      throw new Error("formData should not be read");
    });
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(formData), { params: { projectId: "project-demo" } });

    expect(response.status).toBe(403);
    await expect(responseJson(response)).resolves.toEqual({ error: "Forbidden" });
    expect(canProjectMock).toHaveBeenCalledWith(authorizedUser, "project-demo", "import");
    expect(projectFindUniqueMock).not.toHaveBeenCalled();
    expect(formData).not.toHaveBeenCalled();
    expect(parseExcelBufferMock).not.toHaveBeenCalled();
  });

  it("returns 404 for missing projects before reading form-data", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue(null);
    const formData = vi.fn(async () => {
      throw new Error("formData should not be read");
    });
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(formData), { params: { projectId: "missing-project" } });

    expect(response.status).toBe(404);
    await expect(responseJson(response)).resolves.toEqual({ error: "Project not found" });
    expect(projectFindUniqueMock).toHaveBeenCalledWith({ where: { id: "missing-project" }, select: { id: true, organizationId: true } });
    expect(formData).not.toHaveBeenCalled();
    expect(parseExcelBufferMock).not.toHaveBeenCalled();
  });

  it("lets authorized import users reach existing file validation", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo", organizationId: "org-demo" });
    const formData = vi.fn(async () => new FormData());
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(formData), { params: { projectId: "project-demo" } });

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Excel-файл не передан." });
    expect(canProjectMock).toHaveBeenCalledWith(authorizedUser, "project-demo", "import");
    expect(formData).toHaveBeenCalledTimes(1);
    expect(parseExcelBufferMock).not.toHaveBeenCalled();
  });
});
