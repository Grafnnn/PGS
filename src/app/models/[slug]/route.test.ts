import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), access: vi.fn(), find: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.find } } }));
import { GET } from "./route";
import { GET as privateGET } from "@/app/api/projects/[projectId]/model-viewer/route";

describe("Atlas R25v5 publication", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves the public alias without sessions or project lookups", async () => {
    const response = await GET(new Request("https://pgs.local/models/troitsk-building-24"), { params: { slug: "troitsk-building-24" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/model-assets/troitsk-r25v5/index.html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it.each(["other-project", "cmteg9g33000for4oc06rko5a", "..", "%2e%2e", "troitsk-building-24/../../.env"])("rejects unpublished identifiers: %s", async (slug) => {
    expect((await GET(new Request("https://pgs.local/models/invalid"), { params: { slug } })).status).toBe(404);
  });
  it.each([401, 403])("keeps private project viewer protected: %s", async (status) => {
    mocks.access.mockResolvedValue({ response: new Response("Denied", { status }) });
    const response = await privateGET(new Request("https://pgs.local/api/model?embed=monolith-v1"), { params: { projectId: "cmteg9g33000for4oc06rko5a" } });
    expect(response.status).toBe(status);
    expect(response.headers.has("location")).toBe(false);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it("opens the same release after project authorization and preserves embed mode", async () => {
    mocks.access.mockResolvedValue({ user: { id: "user-1" } });
    mocks.find.mockResolvedValue({ id: "cmteg9g33000for4oc06rko5a" });
    const response = await privateGET(new Request("https://pgs.local/api/model?embed=monolith-v1"), { params: { projectId: "cmteg9g33000for4oc06rko5a" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/model-assets/troitsk-r25v5/index.html?embed=monolith-v1");
    expect(mocks.access).toHaveBeenCalledWith("cmteg9g33000for4oc06rko5a", "view");
  });
});
