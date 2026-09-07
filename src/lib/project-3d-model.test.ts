import { describe, expect, it } from "vitest";
import { getProject3dModel, project3dModelViewerUrl } from "@/lib/project-3d-model";

describe("project 3D model registry", () => {
  it("resolves the published R03 model for the production Troitsk project", () => {
    expect(getProject3dModel({ id: "cmteg9g33000for4oc06rko5a" })).toMatchObject({ revision: "R03", slug: "troitsk-building-24-r03" });
  });

  it("recognizes a recreated Troitsk building project but not unrelated projects", () => {
    expect(getProject3dModel({ id: "new-id", name: "Троицк", object: "Ремонт кровли здания 24" })).not.toBeNull();
    expect(getProject3dModel({ id: "other", name: "Склад", object: "Капитальный ремонт" })).toBeNull();
  });

  it("encodes project identifiers in the protected viewer URL", () => {
    expect(project3dModelViewerUrl("project / 24")).toBe("/api/projects/project%20%2F%2024/model-viewer");
  });
});
