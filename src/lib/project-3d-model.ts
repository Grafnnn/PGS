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
  slug: "troitsk-building-24-atlas-v12-18",
  title: "3D Атлас здания 24",
  subtitle: "Здание, чертежи и каталог: 2 950 типов, 10 795 элементов здания",
  revision: "V12.18",
  updatedAt: "23.10.2026",
  disclaimer: "Координационный атлас. 47 позиций без подтверждённого размещения. Армирование загружается отдельно по запросу. Не исполнительная съёмка и не утверждение рабочей документации.",
  assetPath: "src/assets/project-models/troitsk-r25v12-18",
  assetBaseUrl: "/model-assets/troitsk-r25v12-18/",
  publicUrl: "/models/troitsk-building-24#node/building"
};

const troitskPublicModel: Project3dModel = {
  ...troitskBuilding24Model,
  slug: "troitsk-building-24-atlas-v12-21",
  revision: "V12.21",
  updatedAt: "22.11.2026",
  assetPath: "src/assets/project-models/troitsk-r25v12-21",
  assetBaseUrl: "/model-assets/troitsk-r25v12-21/"
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

const zagoryankaModel: Project3dModel = {
  slug: "zagoryanka-1500-atlas-r1-0",
  title: "3D Атлас Загорянка",
  subtitle: "Коллектор Ø1500 · К26–К25: 99 записей реестра, 34 тела модели",
  revision: "R1.0",
  updatedAt: "19.11.2026",
  disclaimer: "Развёрнутый продольный профиль. Плановое положение трассы и колодцев не подтверждено. Локальные тела и позиции только в реестре сохранены. Не исполнительная съёмка и не инженерная приёмка.",
  assetPath: "src/assets/project-models/zagoryanka-1500-r1-0",
  assetBaseUrl: "/model-assets/zagoryanka-1500-r1-0/",
  publicUrl: "/models/zagoryanka-1500#node/building"
};

const ZAGORYANKA_PROJECT_ID = "cmwpge82t0002nqot69h6io2y";

export function getProjectAtlasUrl(projectId: string): string | null {
  return projectId === ZAGORYANKA_PROJECT_ID ? zagoryankaModel.publicUrl : null;
}

const goluboeModel: Project3dModel = {
  slug: "goluboe-vodovod-atlas-r1-16",
  title: "3D Атлас Голубое",
  subtitle: "Водовод до ВЗУ: 390 записей реестра, 238 элементов сцены, 6 PDF",
  revision: "R1.17",
  updatedAt: "24.11.2026",
  disclaimer: "Модель по ПД 19/26-2026. Расхождения со ЗнП № 10 сохранены в замечаниях и заключении; оригинал ЗнП не входит в пакет. Не инженерная приёмка и не исполнительная съёмка.",
  assetPath: "src/assets/project-models/goluboe-vodovod-r1-17",
  assetBaseUrl: "/model-assets/goluboe-vodovod-r1-17/",
  publicUrl: "/models/goluboe-vodovod#node/building"
};

const goluboeFieldPilot: Project3dModel = {
  ...goluboeModel,
  slug: "goluboe-vodovod-field-pilot",
  title: "3D Атлас Голубое · полевой пилот",
  subtitle: "Полевой комплект водовода, ПК0+00 – ПК0+45",
  publicUrl: "/models/goluboe-vodovod-field-pilot"
};

// Explicit publication allowlist. Never resolve arbitrary project IDs on a public route.
export function getPublicProject3dModel(slug: string): Project3dModel | null {
  if (slug === "troitsk-building-24") return troitskPublicModel;
  if (slug === "dou200") return dou200Model;
  if (slug === "zagoryanka-1500") return zagoryankaModel;
  if (slug === "goluboe-vodovod") return goluboeModel;
  if (slug === goluboeFieldPilot.slug) return goluboeFieldPilot;
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
