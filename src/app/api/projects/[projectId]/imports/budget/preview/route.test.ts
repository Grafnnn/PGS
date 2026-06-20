import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/permissions";

const getCurrentUserMock = vi.fn();
const canProjectMock = vi.fn();
const parseExcelBufferMock = vi.fn();
const validateExcelFileMock = vi.fn();

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
    expect(formData).not.toHaveBeenCalled();
    expect(parseExcelBufferMock).not.toHaveBeenCalled();
  });

  it("lets authorized import users reach existing file validation", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
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
