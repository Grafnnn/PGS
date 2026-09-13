export type Project3dModel = {
  slug: string;
  title: string;
  subtitle: string;
  revision: string;
  updatedAt: string;
  disclaimer: string;
  assetPath: string;
  publicUrl: string;
  assetBaseUrl?: string;
};

type ProjectIdentity = {
  id?: string | null;
  name?: string | null;
  code?: string | null;
  object?: string | null;
  address?: string | null;
};

const troitskBuilding24Model: Project3dModel = {
  slug: "troitsk-building-24-atlas-3-2",
  title: "3D Атлас здания 24",
  subtitle: "Здание, разделы, узлы и чертежи. 562 геоблока и 10 412 физических объектов",
  revision: "3.2",
  updatedAt: "13.09.2026",
  disclaimer: "Координационный атлас. Не исполнительная съёмка; завершение рабочей документации и отсутствие коллизий не заявляются.",
  assetPath: "src/assets/project-models/troitsk-b24-atlas-3-2",
  assetBaseUrl: "/model-assets/troitsk-b24-atlas-3-2/",
  publicUrl: "/models/troitsk-building-24#node/building"
};

const TROITSK_PROJECT_ID = "cmteg9g33000for4oc06rko5a";

// Explicit publication allowlist. Never resolve arbitrary project IDs on a public route.
export function getPublicProject3dModel(slug: string): Project3dModel | null {
  return slug === "troitsk-building-24" ? troitskBuilding24Model : null;
}

function normalizeProjectIdentity(project: ProjectIdentity) {
  return [project.name, project.code, project.object, project.address]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
}

export function getProject3dModel(project: ProjectIdentity): Project3dModel | null {
  if (project.id === TROITSK_PROJECT_ID) return troitskBuilding24Model;

  const identity = normalizeProjectIdentity(project);
  return identity.includes("троицк") && (identity.includes("здание 24") || identity.includes("кровл"))
    ? troitskBuilding24Model
    : null;
}

export function project3dModelViewerUrl(projectId: string, revision?: string) {
  const url = `/api/projects/${encodeURIComponent(projectId)}/model-viewer`;
  return revision ? `${url}?v=${encodeURIComponent(revision)}` : url;
}

export function getProject3dPresentation(project: ProjectIdentity) {
  const model = getProject3dModel(project);
  if (model && project.id) return {
    model,
    url: `${project3dModelViewerUrl(project.id, model.revision)}&embed=monolith-v1#node/building`,
    isPreview: false
  };
  // The existing local showcase is explicitly separate from the demo object's data.
  if (process.env.NODE_ENV === "development" && project.id === "project-demo") return {
    model: troitskBuilding24Model,
    url: "/design-contest/model?embed=monolith-v1#module=master&view=overview",
    isPreview: true
  };
  return null;
}
