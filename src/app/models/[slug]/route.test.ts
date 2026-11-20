import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readFile: vi.fn(), access: vi.fn(), find: vi.fn() }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.find } } }));
import { GET } from "./route";
import { GET as privateGET } from "@/app/api/projects/[projectId]/model-viewer/route";

describe("Atlas V11 publication", () => {
  beforeEach(() => vi.clearAllMocks());
  it("preserves the public alias without sessions or project lookups", async () => {
    const response = await GET(new Request("https://pgs.local/models/troitsk-building-24"), { params: { slug: "troitsk-building-24" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/model-assets/troitsk-r25v12-18/index.html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("publishes DOU200 under its own anonymous alias without changing Troitsk", async () => {
    const response = await GET(new Request("https://pgs.local/models/dou200"), { params: { slug: "dou200" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/model-assets/dou200-r1-27/index.html");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("publishes Zagoryanka separately without project access or database reads", async () => {
    const response = await GET(new Request("https://pgs.local/models/zagoryanka-1500"), { params: { slug: "zagoryanka-1500" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/model-assets/zagoryanka-1500-r1-0/index.html");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it("publishes Goluboe without project access or database reads", async () => {
    const response = await GET(new Request("https://pgs.local/models/goluboe-vodovod"), { params: { slug: "goluboe-vodovod" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
  it.each(["kv1", "up1", "vzu"])("retains the allowlisted Goluboe view %s on the permanent alias", async (view) => {
    const response = await GET(new Request(`https://pgs.local/models/goluboe-vodovod?pdExc=${view}&pdCard=1&next=https://elsewhere.test`), { params: { slug: "goluboe-vodovod" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html?pdExc=${view}&pdCard=1`);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it.each(["kv1", "up1", "vzu"])("retains the safe general-scene locate flag %s", async (view) => {
    const response = await GET(new Request(`https://pgs.local/models/goluboe-vodovod?pdLocate=${view}&next=https://elsewhere.test`), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).toBe(`/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html?pdLocate=${view}`);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it.each(["other", "https://elsewhere.test", "../.env"])("rejects an unknown general-scene locate value %s", async (value) => {
    const response = await GET(new Request(`https://pgs.local/models/goluboe-vodovod?pdLocate=${encodeURIComponent(value)}&pdCard=1`), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html");
  });
  it.each(["troitsk-building-24", "dou200", "zagoryanka-1500"])("does not retain Goluboe locate flags on %s", async (slug) => {
    const response = await GET(new Request(`https://pgs.local/models/${slug}?pdLocate=up1&pdSoil=1&pdExc=kv1&pdProfile=1&pdFrom=0&pdTo=45`), { params: { slug } });
    expect(response.headers.get("location")).not.toContain("?");
  });
  it("retains only the safe Goluboe plan flag and rejects an unknown excavation", async () => {
    const response = await GET(new Request("https://pgs.local/models/goluboe-vodovod?pdExc=other&pdCard=1&pdPlan=1&next=https://elsewhere.test"), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html?pdPlan=1");
  });
  it("retains the soil overlay only for the general-scene UP-1 focus", async () => {
    const response = await GET(new Request("https://pgs.local/models/goluboe-vodovod?pdLocate=up1&pdSoil=1&next=https://elsewhere.test"), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html?pdLocate=up1&pdSoil=1");
  });
  it.each(["pdSoil=1", "pdLocate=kv1&pdSoil=1", "pdLocate=vzu&pdSoil=1", "pdExc=up1&pdSoil=1", "pdLocate=other&pdSoil=1", "pdLocate=up1&pdSoil=0", "pdLocate=up1&pdSoil=https://elsewhere.test"])("rejects unsupported soil context: %s", async (query) => {
    const response = await GET(new Request(`https://pgs.local/models/goluboe-vodovod?${query}`), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).not.toContain("pdSoil");
  });
  it.each(["other-project", "cmteg9g33000for4oc06rko5a", "..", "%2e%2e", "troitsk-building-24/../../.env"])("rejects unpublished identifiers: %s", async (slug) => {
    expect((await GET(new Request("https://pgs.local/models/invalid"), { params: { slug } })).status).toBe(404);
  });
  it.each([
    ["0", "400", "0", "400"], ["0", "45", "0", "45"],
    ["20,5", "45", "20.5", "45"], ["10.125", "35.250", "10.125", "35.25"],
    ["0", "0,001", "0", "0.001"], [" 020,500 ", "045", "20.5", "45"]
  ])("retains a bounded profile deep link %s-%s with normalized distances", async (from, to, expectedFrom, expectedTo) => {
    const query = new URLSearchParams({ pdProfile: "1", pdFrom: from, pdTo: to, next: "https://elsewhere.test" });
    const response = await GET(new Request(`https://pgs.local/models/goluboe-vodovod?${query}`), { params: { slug: "goluboe-vodovod" } });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html?pdProfile=1&pdFrom=${expectedFrom}&pdTo=${expectedTo}`);
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it.each([
    ["45", "20"], ["20", "20"], ["400", "401"], ["-1", "45"],
    ["0", "400.001"], ["0", "NaN"], ["1e1", "45"], ["0", "Infinity"],
    ["0", "https://elsewhere.test"], ["0", ""], ["", "45"], ["0.0001", "45"], [".5", "45"]
  ])("drops both malformed profile boundaries %s-%s, retaining only enabled mode", async (from, to) => {
    const query = new URLSearchParams({ pdProfile: "1", pdFrom: from, pdTo: to });
    const response = await GET(new Request(`https://pgs.local/models/goluboe-vodovod?${query}`), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html?pdProfile=1");
  });
  it.each(["", "0", "other"])("does not retain distances without the exact profile flag %s", async (flag) => {
    const response = await GET(new Request(`https://pgs.local/models/goluboe-vodovod?pdProfile=${flag}&pdFrom=0&pdTo=45`), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html");
  });
  it("preserves previously allowlisted soil and locate flags alongside profile mode", async () => {
    const response = await GET(new Request("https://pgs.local/models/goluboe-vodovod?pdLocate=up1&pdSoil=1&pdProfile=1&pdFrom=0&pdTo=45"), { params: { slug: "goluboe-vodovod" } });
    expect(response.headers.get("location")).toBe("/model-assets/goluboe-vodovod-r1-2-terrain-depth/index.html?pdLocate=up1&pdSoil=1&pdProfile=1&pdFrom=0&pdTo=45");
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
    expect(response.headers.get("location")).toBe("/model-assets/troitsk-r25v12-18/index.html?embed=monolith-v1");
    expect(mocks.access).toHaveBeenCalledWith("cmteg9g33000for4oc06rko5a", "view");
  });
});
