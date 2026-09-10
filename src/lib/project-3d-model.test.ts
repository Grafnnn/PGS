import { afterEach, describe, expect, it, vi } from "vitest";
import { getProject3dModel, getPublicProject3dModel, getProject3dPresentation, project3dModelViewerUrl } from "@/lib/project-3d-model";

afterEach(() => vi.unstubAllEnvs());

describe("project 3D model registry", () => {
  it("resolves R10 and exposes a stable explicitly published URL", () => {
    expect(getProject3dModel({ id: "cmteg9g33000for4oc06rko5a" })).toMatchObject({ revision: "R10 local", slug: "troitsk-building-24-r10", assetPath: "src/assets/project-models/troitsk-b24-r10.html.gz" });
    expect(getPublicProject3dModel("troitsk-building-24")).toBe(getProject3dModel({ id: "cmteg9g33000for4oc06rko5a" }));
    expect(getPublicProject3dModel("troitsk-building-24")?.publicUrl).toBe("/models/troitsk-building-24#module=master");
    expect(getPublicProject3dModel("cmteg9g33000for4oc06rko5a")).toBeNull();
  });

  it("recognizes a recreated Troitsk building project but not unrelated projects", () => {
    expect(getProject3dModel({ id: "new-id", name: "Троицк", object: "Ремонт кровли здания 24" })).not.toBeNull();
    expect(getProject3dModel({ id: "other", name: "Склад", object: "Капитальный ремонт" })).toBeNull();
  });

  it("encodes project identifiers in the protected viewer URL", () => {
    expect(project3dModelViewerUrl("project / 24")).toBe("/api/projects/project%20%2F%2024/model-viewer");
  });

  it("invalidates a previously cached model when its revision changes", () => {
    expect(project3dModelViewerUrl("project-24", "R06")).toBe("/api/projects/project-24/model-viewer?v=R06");
    expect(project3dModelViewerUrl("project-24", "R06 / test")).toContain("?v=R06%20%2F%20test");
  });
});

describe("project 3D presentation", () => {
  it("keeps actual project models on the authenticated API even in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getProject3dPresentation({ id: "cmteg9g33000for4oc06rko5a" })).toMatchObject({
      url: "/api/projects/cmteg9g33000for4oc06rko5a/model-viewer?v=R10%20local&embed=monolith-v1#module=master",
      isPreview: false
    });
  });

  it("labels the local demo showcase separately without assigning it to the demo project", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getProject3dModel({ id: "project-demo" })).toBeNull();
    expect(getProject3dPresentation({ id: "project-demo" })).toMatchObject({
      url: "/design-contest/model?embed=monolith-v1#module=master&view=overview",
      isPreview: true,
      model: { slug: "troitsk-building-24-r10" }
    });
    expect(getProject3dPresentation({ id: "unrelated-project" })).toBeNull();
  });

  it("does not expose a showcase fallback outside development", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getProject3dPresentation({ id: "project-demo" })).toBeNull();
    expect(getProject3dPresentation({ id: "unrelated-project" })).toBeNull();
    vi.stubEnv("NODE_ENV", "test");
    expect(getProject3dPresentation({ id: "project-demo" })).toBeNull();
  });
});
