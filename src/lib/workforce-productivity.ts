import type { ProjectLaborDemand, ResourceKind } from "@/lib/types";

type PeopleKind = Exclude<ResourceKind, "equipment">;

export type ProductivityNormSource = "labor-demand" | "resource" | "workbook";
export type ProductivityNormConfidence = "low" | "medium" | "high";
export type ProductivityNormMatch = "profession" | "family";

export type ProductivityNormSample = {
  category: PeopleKind;
  profession: string;
  function?: string | null;
  norm: number;
  unit?: string | null;
  weight?: number;
  source: ProductivityNormSource;
};

export type ProductivityNormBenchmark = {
  id: string;
  category: PeopleKind;
  profession: string;
  professionKey: string;
  family: string | null;
  norm: number;
  unit: string;
  sampleCount: number;
  sourceCount: number;
  sources: ProductivityNormSource[];
  minimum: number;
  maximum: number;
  dispersionPercent: number;
  confidence: ProductivityNormConfidence;
  autoApplicable: boolean;
};

export type ProductivityNormRecommendation = ProductivityNormBenchmark & {
  match: ProductivityNormMatch;
  explanation: string;
};

const familyPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "earth", pattern: /земл|грунт|котлован|транше|засып|песчан|щебен/i },
  { id: "concrete", pattern: /бетон|монолит|арматур|опалуб|фундамент/i },
  { id: "masonry", pattern: /камен|кладк|кирпич|блок|перегород/i },
  { id: "finish", pattern: /отдел|штукатур|шпатлев|маляр|окрас|плиточ|потол/i },
  { id: "roof", pattern: /кровл|гидроизоляц|пароизоляц|парапет/i },
  { id: "facade", pattern: /фасад|утеплен.*стен|витраж/i },
  { id: "engineering", pattern: /инженерн|электр|эом|ов|вк|вентил|отоплен|водоснаб|канализ|слаботоч|пнр/i },
  { id: "welding", pattern: /свар|металлоконструк|трубопровод/i },
  { id: "site", pattern: /благоустр|дорог|асфальт|газон|бордюр|площадк/i }
];

const genericProfessionTokens = new Set(["рабоч", "рабочий", "бригад", "бригада", "сотрудник", "специалист"]);

function finite(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function round(value: number, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[²]/g, "2")
    .replace(/[³]/g, "3")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim();
}

function stemToken(value: string) {
  if (value.length < 5) return value;
  const stemmed = value.replace(
    /(щиками|щикам|щиков|щика|щики|щик|никами|никам|ников|ника|ники|ник|истами|истам|истов|иста|исты|ист|ерами|ерам|еров|ера|еры|ами|ями|ого|ему|ому|ов|ев|ей|ы|и|а|я|ь)$/u,
    ""
  );
  return stemmed.length >= 3 ? stemmed : value;
}

function professionTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(/\s+/)
    .map(stemToken)
    .filter((item) => item.length >= 2 && !genericProfessionTokens.has(item));
}

export function productivityProfessionKey(value: string | null | undefined) {
  return Array.from(new Set(professionTokens(value))).sort().join("-");
}

export function productivityFamily(value: string | null | undefined) {
  const text = normalizeText(value);
  return familyPatterns.find((item) => item.pattern.test(text))?.id ?? null;
}

export function normalizeProductivityUnit(value: string | null | undefined) {
  const display = (value ?? "")
    .trim()
    .replace(/м²/gi, "м2")
    .replace(/м³/gi, "м3")
    .replace(/\s+/g, " ");
  return display || "ед./чел.-мес.";
}

function productivityUnitKey(value: string | null | undefined) {
  return normalizeProductivityUnit(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/человеко[- .]?месяц(?:а|ев)?/g, "челмес")
    .replace(/чел[. -]?мес[.]?/g, "челмес")
    .replace(/[^a-zа-я0-9]+/giu, "");
}

function quantile(sorted: number[], fraction: number) {
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function trimOutliers<T extends { norm: number }>(samples: T[]) {
  if (samples.length < 4) return samples;
  const sorted = samples.map((item) => item.norm).sort((left, right) => left - right);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const spread = q3 - q1;
  const lower = spread > 0 ? Math.max(0, q1 - spread * 1.5) : q1 * 0.75;
  const upper = spread > 0 ? q3 + spread * 1.5 : q3 * 1.25;
  const retained = samples.filter((item) => item.norm >= lower && item.norm <= upper);
  return retained.length >= 2 ? retained : samples;
}

function confidenceFor(sampleCount: number, dispersionPercent: number): ProductivityNormConfidence {
  if (sampleCount >= 4 && dispersionPercent <= 20) return "high";
  if (sampleCount >= 2 && dispersionPercent <= 40) return "medium";
  return "low";
}

function buildBenchmark(samples: ProductivityNormSample[]): ProductivityNormBenchmark {
  const retained = trimOutliers(samples);
  const totalWeight = retained.reduce((sum, item) => sum + Math.max(0.1, Math.min(24, finite(item.weight) || 1)), 0);
  const norm = retained.reduce(
    (sum, item) => sum + item.norm * Math.max(0.1, Math.min(24, finite(item.weight) || 1)),
    0
  ) / totalWeight;
  const variance = retained.reduce((sum, item) => sum + (item.norm - norm) ** 2, 0) / retained.length;
  const dispersionPercent = norm > 0 ? Math.sqrt(variance) / norm * 100 : 0;
  const confidence = confidenceFor(retained.length, dispersionPercent);
  const profession = retained[0].profession.trim();
  const categories = new Set(retained.map((item) => item.category));
  const category = categories.size === 1 ? retained[0].category : "worker";
  const unit = normalizeProductivityUnit(retained[0].unit);
  const family = productivityFamily(retained.map((item) => `${item.profession} ${item.function ?? ""}`).join(" "));
  const sources = Array.from(new Set(retained.map((item) => item.source))).sort();

  return {
    id: `${category}:${productivityProfessionKey(profession)}:${productivityUnitKey(unit)}`,
    category,
    profession,
    professionKey: productivityProfessionKey(profession),
    family,
    norm: round(norm),
    unit,
    sampleCount: retained.length,
    sourceCount: sources.length,
    sources,
    minimum: round(Math.min(...retained.map((item) => item.norm))),
    maximum: round(Math.max(...retained.map((item) => item.norm))),
    dispersionPercent: round(dispersionPercent, 1),
    confidence,
    autoApplicable: retained.length >= 2 && confidence !== "low"
  };
}

export function buildProductivityNormBenchmarks(samples: ProductivityNormSample[]) {
  const groups = new Map<string, ProductivityNormSample[]>();
  for (const sample of samples) {
    const norm = finite(sample.norm);
    const professionKey = productivityProfessionKey(sample.profession);
    if (
      norm <= 0 ||
      norm > 1_000_000_000 ||
      !professionKey ||
      (sample.category !== "worker" && sample.category !== "crew")
    ) continue;
    const key = `labor:${professionKey}:${productivityUnitKey(sample.unit)}`;
    const group = groups.get(key) ?? [];
    group.push({ ...sample, norm, unit: normalizeProductivityUnit(sample.unit) });
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map(buildBenchmark)
    .sort((left, right) => right.sampleCount - left.sampleCount || left.profession.localeCompare(right.profession, "ru"));
}

function professionScore(target: string, candidate: ProductivityNormBenchmark) {
  const targetKey = productivityProfessionKey(target);
  if (!targetKey || !candidate.professionKey) return 0;
  if (targetKey === candidate.professionKey) return 1;
  const targetTokens = new Set(targetKey.split("-"));
  const candidateTokens = new Set(candidate.professionKey.split("-"));
  const intersection = [...targetTokens].filter((item) => candidateTokens.has(item)).length;
  const union = new Set([...targetTokens, ...candidateTokens]).size;
  const lexical = union ? intersection / union : 0;
  if (targetKey.includes(candidate.professionKey) || candidate.professionKey.includes(targetKey)) return Math.max(0.85, lexical);
  return lexical;
}

export function recommendProductivityNorm(input: {
  category: PeopleKind;
  profession: string;
  function?: string | null;
  unit?: string | null;
  benchmarks: ProductivityNormBenchmark[];
}): ProductivityNormRecommendation | null {
  if (input.category !== "worker" && input.category !== "crew") return null;
  const targetFamily = productivityFamily(`${input.profession} ${input.function ?? ""}`);
  const requestedUnit = input.unit?.trim() ? productivityUnitKey(input.unit) : "";
  const ranked = input.benchmarks
    .filter((item) => item.category === input.category || (item.category !== "engineer" && input.category !== "engineer"))
    .filter((item) => !requestedUnit || productivityUnitKey(item.unit) === requestedUnit)
    .map((item) => {
      const lexical = professionScore(input.profession, item);
      const family = targetFamily && item.family === targetFamily;
      const match: ProductivityNormMatch | null = lexical >= 0.5 ? "profession" : family ? "family" : null;
      const score = lexical * 100 + (family ? 12 : 0) + (item.category === input.category ? 8 : 0)
        + Math.min(10, item.sampleCount) + (item.confidence === "high" ? 5 : item.confidence === "medium" ? 2 : 0);
      return { item, lexical, family, match, score };
    })
    .filter((item) => item.match)
    .sort((left, right) => right.score - left.score || right.item.sampleCount - left.item.sampleCount);
  const selected = ranked[0];
  if (!selected?.match) return null;
  const exactEnough = selected.lexical >= 0.85;
  const familyEnough = Boolean(selected.family && selected.item.sampleCount >= 3 && selected.item.confidence !== "low");
  const autoApplicable = selected.item.autoApplicable && (exactEnough || familyEnough);
  const explanation = selected.match === "profession"
    ? `Среднее по сопоставимой профессии: ${selected.item.sampleCount} наблюд.`
    : `Среднее по сопоставимому виду работ: ${selected.item.sampleCount} наблюд.`;

  return {
    ...selected.item,
    autoApplicable,
    match: selected.match,
    explanation
  };
}

export function enrichLaborDemandsWithAverageProductivity<T extends Pick<
  ProjectLaborDemand,
  "category" | "profession" | "function" | "productivityNorm" | "productivityUnit" | "personMonths" | "confidence" | "notes"
>>(demands: T[]) {
  const benchmarks = buildProductivityNormBenchmarks(demands.map((item) => ({
    category: item.category,
    profession: item.profession,
    function: item.function,
    norm: item.productivityNorm,
    unit: item.productivityUnit,
    weight: Math.max(0.1, Math.min(24, item.personMonths * Math.max(0.25, item.confidence))),
    source: "workbook" as const
  })));
  let applied = 0;
  const items = demands.map((item) => {
    if (item.productivityNorm > 0 || (item.category !== "worker" && item.category !== "crew")) return item;
    const recommendation = recommendProductivityNorm({
      category: item.category,
      profession: item.profession,
      function: item.function,
      unit: item.productivityUnit,
      benchmarks
    });
    if (!recommendation?.autoApplicable) return item;
    applied += 1;
    const note = `Автонорма: ${recommendation.norm} ${recommendation.unit}; ${recommendation.explanation.toLocaleLowerCase("ru-RU")}`;
    return {
      ...item,
      productivityNorm: recommendation.norm,
      productivityUnit: recommendation.unit,
      confidence: Math.min(item.confidence, recommendation.confidence === "high" ? 0.85 : 0.75),
      notes: [item.notes, note].filter(Boolean).join("; ")
    };
  });
  return { items, applied, benchmarks };
}
