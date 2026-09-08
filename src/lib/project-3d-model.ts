export type Project3dModel = {
  slug: string;
  title: string;
  subtitle: string;
  revision: string;
  updatedAt: string;
  disclaimer: string;
  assetPath: string;
};

type ProjectIdentity = {
  id?: string | null;
  name?: string | null;
  code?: string | null;
  object?: string | null;
  address?: string | null;
};

const troitskBuilding24Model: Project3dModel = {
  slug: "troitsk-building-24-r06",
  title: "3D-модель здания 24",
  subtitle: "Общая модель, кровля, лестница Л-1, перекрытия, фундаменты и входы",
  revision: "R06",
  updatedAt: "08.09.2026",
  disclaimer: "Координационная модель по проектным чертежам, не исполнительная съемка.",
  assetPath: "src/assets/project-models/troitsk-b24-r06.html.gz"
};

const TROITSK_PROJECT_ID = "cmteg9g33000for4oc06rko5a";

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
    url: `${project3dModelViewerUrl(project.id, model.revision)}&embed=monolith-v1`,
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
