import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";

const requireProjectAccessMock = vi.fn();
const loadPipelineDataMock = vi.fn();
const buildProcurementDraftMock = vi.fn();
const commitProcurementDraftMock = vi.fn();

vi.mock("@/lib/project-route-guards", () => ({
  requireProjectAccess: (...args: unknown[]) => requireProjectAccessMock(...args)
}));

vi.mock("@/lib/project-pipeline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-pipeline")>("@/lib/project-pipeline");
  return {
    ...actual,
    loadPipelineData: (...args: unknown[]) => loadPipelineDataMock(...args),
    buildProcurementDraft: (...args: unknown[]) => buildProcurementDraftMock(...args),
    commitProcurementDraft: (...args: unknown[]) => commitProcurementDraftMock(...args)
  };
});

function request(body: unknown) {
  return new Request("http://test.local/api/projects/project-demo/procurement/draft-from-import", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" }
  });
}

describe("procurement draft-from-import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireProjectAccessMock.mockResolvedValue({ user: { id: "user-1" }, project: { id: "project-demo", organizationId: "org-demo" } });
    loadPipelineDataMock.mockResolvedValue({ project: { id: "project-demo" } });
    buildProcurementDraftMock.mockReturnValue({ items: [], summary: { materials: 0 } });
    commitProcurementDraftMock.mockResolvedValue({ draft: { items: [] }, created: [] });
  });

  it("allows preview with view permission only", async () => {
    const response = await POST(request({}), { params: { projectId: "project-demo" } });
    expect(response!.status).toBe(200);
    expect(requireProjectAccessMock).toHaveBeenCalledWith("project-demo", "view");
    expect(commitProcurementDraftMock).not.toHaveBeenCalled();
  });

  it("requires edit permission and explicit confirmation for commit", async () => {
    const response = await POST(request({ commit: true }), { params: { projectId: "project-demo" } });
    expect(response!.status).toBe(409);
    expect(requireProjectAccessMock).toHaveBeenCalledWith("project-demo", "edit");
    expect(commitProcurementDraftMock).not.toHaveBeenCalled();
  });

  it("returns forbidden response for viewer commit attempts", async () => {
    requireProjectAccessMock.mockResolvedValue({ response: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) });
    const response = await POST(request({ commit: true, confirmed: true }), { params: { projectId: "project-demo" } });
    expect(response!.status).toBe(403);
    expect(commitProcurementDraftMock).not.toHaveBeenCalled();
  });
});
