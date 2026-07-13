import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/permissions";

const getCurrentUserMock = vi.fn();
const analyzeProjectWorkbookBufferMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: getCurrentUserMock }));
vi.mock("@/lib/excel/project-workbook-import", () => ({ analyzeProjectWorkbookBuffer: analyzeProjectWorkbookBufferMock }));

const owner: AppUser = { id: "owner", name: "Owner", email: "owner@pgs.local", role: "OWNER", authenticated: true };

function requestWithFormData(formData: () => Promise<FormData>) {
  return { formData } as never;
}

describe("project workbook onboarding analysis route", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    analyzeProjectWorkbookBufferMock.mockReset();
  });

  it("rejects unauthenticated requests before reading multipart data", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const formData = vi.fn(async () => new FormData());
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(formData));

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
    expect(analyzeProjectWorkbookBufferMock).not.toHaveBeenCalled();
  });

  it("returns a read-only distribution preview for authorized project creators", async () => {
    getCurrentUserMock.mockResolvedValue(owner);
    analyzeProjectWorkbookBufferMock.mockReturnValue({ errors: [], summary: { budgetItems: 10 }, modules: [] });
    const form = new FormData();
    form.append("file", new File(["xlsx"], "project.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    form.append("startsAt", "2026-07-01");
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(async () => form));
    const body = await response.json() as { ok?: boolean; writes?: Record<string, boolean> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.writes).toEqual({ projectCreated: false, importCommitted: false, documentPersisted: false });
    expect(analyzeProjectWorkbookBufferMock).toHaveBeenCalledWith(expect.any(Buffer), "project.xlsx", "onboarding-preview", { startsAt: "2026-07-01" });
  });
});
