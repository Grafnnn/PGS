import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineSnapshot } from "@/lib/project-pipeline";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ access: vi.fn(), buildSnapshot: vi.fn() }));

vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: mocks.access }));
vi.mock("@/lib/project-pipeline", () => ({ buildPipelineSnapshot: mocks.buildSnapshot }));

const access = { user: { id: "user-1" }, project: { id: "project-1", organizationId: "org-1" } };
const context = { params: { projectId: "project-1" } };
const request = () => new Request("https://pgs.local/api/projects/project-1/intelligence");

function snapshot(): PipelineSnapshot {
  const action = {
    id: "action-1", category: "documents" as const, actionType: "upload", priority: "high" as const,
    title: "Upload contract", description: "Contract missing", suggestedNextStep: "Upload document", evidence: []
  };
  return {
    projectId: "project-1",
    latestImport: null,
    readiness: {
      score: 50, status: "partial", summary: "Partial data", checks: [],
      counts: {
        committedImports: 1, importedBudgetItems: 2, importedMaterials: 0, importedWarnings: 0,
        budgetItems: 2, materials: 0, procurementRequests: 0, scheduleItems: 0, cashflowPeriods: 0,
        documents: 0, calculatedRisks: 1
      }
    },
    postImportActions: [action],
    documentChecklist: [{
      key: "contract", title: "Contract", status: "missing", categoryHints: ["contract"], documentIds: [],
      evidence: [], suggestedNextStep: "Upload contract"
    }],
    calculatedRisks: [{ ...action, id: "risk-1" }],
    intelligence: {
      completenessScore: 50, summary: "Partial data", topRisks: [], nextActions: [action],
      missingData: ["Contract"], quickActions: [{ title: "Next steps", prompt: "What next?", deterministicAnswer: "Upload contract" }]
    }
  };
}

describe("project intelligence route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.access.mockResolvedValue(access);
    mocks.buildSnapshot.mockResolvedValue(snapshot());
  });

  it("preserves existing response fields and adds actions and checklist from one snapshot", async () => {
    const expected = snapshot();
    const response = await GET(request(), context);

    expect(response!.status).toBe(200);
    expect(await response!.json()).toEqual({
      readiness: expected.readiness,
      calculatedRisks: expected.calculatedRisks,
      intelligence: expected.intelligence,
      postImportActions: expected.postImportActions,
      documentChecklist: expected.documentChecklist
    });
    expect(mocks.access).toHaveBeenCalledTimes(1);
    expect(mocks.access).toHaveBeenCalledWith("project-1", "view");
    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.buildSnapshot).toHaveBeenCalledWith("project-1");
  });

  it("does not access or serialize the full import preview", async () => {
    const data = snapshot();
    Object.defineProperty(data, "latestImport", {
      enumerable: true,
      get: () => { throw new Error("Import preview must not be included"); }
    });
    mocks.buildSnapshot.mockResolvedValue(data);

    const response = await GET(request(), context);
    const body = await response!.json();

    expect(response!.status).toBe(200);
    expect(body).not.toHaveProperty("latestImport");
    expect(body).not.toHaveProperty("projectId");
    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
  });

  it("retains empty collections as arrays", async () => {
    mocks.buildSnapshot.mockResolvedValue({ ...snapshot(), postImportActions: [], documentChecklist: [], calculatedRisks: [] });

    const response = await GET(request(), context);

    expect(await response!.json()).toMatchObject({ postImportActions: [], documentChecklist: [], calculatedRisks: [] });
    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 404])("returns the guard's %i response without building a snapshot", async (status) => {
    const denied = new Response(JSON.stringify({ error: "Access denied" }), { status });
    mocks.access.mockResolvedValue({ response: denied });

    expect(await GET(request(), context)).toBe(denied);
    expect(mocks.access).toHaveBeenCalledWith("project-1", "view");
    expect(mocks.buildSnapshot).not.toHaveBeenCalled();
  });

  it("awaits authorization before starting the snapshot read", async () => {
    let authorize!: (value: typeof access) => void;
    mocks.access.mockReturnValue(new Promise<typeof access>((resolve) => { authorize = resolve; }));

    const pending = GET(request(), context);
    expect(mocks.buildSnapshot).not.toHaveBeenCalled();
    authorize(access);
    const response = await pending;

    expect(response!.status).toBe(200);
    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing not-found response when the snapshot is missing", async () => {
    mocks.buildSnapshot.mockResolvedValue(null);

    const response = await GET(request(), context);

    expect(response!.status).toBe(404);
    expect(await response!.json()).toEqual({ error: "Project not found" });
    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
  });

  it("propagates snapshot failures without retries or partial responses", async () => {
    const error = new Error("Snapshot unavailable");
    mocks.buildSnapshot.mockRejectedValue(error);

    await expect(GET(request(), context)).rejects.toBe(error);
    expect(mocks.buildSnapshot).toHaveBeenCalledTimes(1);
  });

  it("propagates guard failures without loading data", async () => {
    const error = new Error("Access check unavailable");
    mocks.access.mockRejectedValue(error);

    await expect(GET(request(), context)).rejects.toBe(error);
    expect(mocks.buildSnapshot).not.toHaveBeenCalled();
  });
});
