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
  slug: "troitsk-building-24-atlas-v12-16",
  title: "3D Атлас здания 24",
  subtitle: "Здание, чертежи и каталог: 2 950 типов, 10 795 элементов здания",
  revision: "V12.16",
  updatedAt: "19.10.2026",
  disclaimer: "Координационный атлас. 47 позиций без подтверждённого размещения. Армирование загружается отдельно по запросу. Не исполнительная съёмка и не утверждение рабочей документации.",
  assetPath: "src/assets/project-models/troitsk-r25v12-16",
  assetBaseUrl: "/model-assets/troitsk-r25v12-16/",
  publicUrl: "/models/troitsk-building-24#node/building"
};

const TROITSK_PROJECT_ID = "cmteg9g33000for4oc06rko5a";

const dou200Model: Project3dModel = {
  slug: "dou200-atlas-r1-27",
  title: "3D Атлас ДОУ 200 мест",
  subtitle: "Здание, чертежи и каталог: 5 954 карточки, 15 726 тел в мире",
  revision: "R1.27",
  updatedAt: "15.10.2026",
  disclaimer: "Координационный атлас-кандидат. Статусы неподтверждённой геометрии, неполных данных и конфликтов сохранены. Не инженерная приёмка и не утверждение рабочей документации.",
  assetPath: "src/assets/project-models/dou200-r1-27",
  assetBaseUrl: "/model-assets/dou200-r1-27/",
  publicUrl: "/models/dou200#node/building"
};

// Explicit publication allowlist. Never resolve arbitrary project IDs on a public route.
export function getPublicProject3dModel(slug: string): Project3dModel | null {
  if (slug === "troitsk-building-24") return troitskBuilding24Model;
  if (slug === "dou200") return dou200Model;
  return null;
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
