import type { Material, ProcurementRequest } from "@/lib/types";
import type { IntelligenceIssue, ProcurementIntelligence } from "./types";
import { action, daysBetween, evidence, issue, parseDate } from "./helpers";

export function analyzeProcurement(materials: Material[], requests: ProcurementRequest[], now = new Date()): ProcurementIntelligence {
  const issues: IntelligenceIssue[] = [];
  const deficitMaterials = materials.filter((item) => item.requiredQty > item.orderedQty || item.requiredQty > item.deliveredQty);
  const missingSupplierMaterials = materials.filter((item) => !item.supplier || item.supplier === "Не выбран");
  const missingPriceMaterials = materials.filter((item) => item.plannedUnitPrice <= 0 && item.actualUnitPrice <= 0);
  const neededSoonMaterials = materials.filter((item) => {
    const neededAt = parseDate(item.neededAt);
    return Boolean(neededAt && neededAt >= now && daysBetween(now, neededAt) <= 14);
  });
  const overstockMaterials = materials.filter((item) => item.deliveredQty > item.requiredQty * 1.2 && item.requiredQty > 0);

  for (const item of deficitMaterials) {
    issues.push(
      issue({
        id: `procurement-deficit-${item.id}`,
        category: "procurement",
        title: "Дефицит материала",
        reason: `${item.name}: требуется ${item.requiredQty} ${item.unit}, заказано ${item.orderedQty}, доставлено ${item.deliveredQty}.`,
        score: neededSoonMaterials.some((candidate) => candidate.id === item.id) ? 82 : 68,
        suggestedAction: "Рекомендация по закупке: запросить КП или подтвердить дату поставки.",
        evidence: [
          evidence({
            entityType: "material",
            entityId: item.id,
            label: item.name,
            field: "required/ordered/delivered",
            value: `${item.requiredQty}/${item.orderedQty}/${item.deliveredQty}`,
            explanation: "Потребность не закрыта заказом или поставкой."
          })
        ]
      })
    );
  }

  for (const item of missingSupplierMaterials) {
    issues.push(
      issue({
        id: `procurement-no-supplier-${item.id}`,
        category: "procurement",
        title: "Материал без поставщика",
        reason: `${item.name} не имеет выбранного поставщика.`,
        score: 45,
        suggestedAction: "Запросите коммерческое предложение и назначьте поставщика.",
        evidence: [
          evidence({
            entityType: "material",
            entityId: item.id,
            label: item.name,
            field: "supplier",
            value: item.supplier,
            explanation: "Поставщик нужен для контроля закупки и сроков."
          })
        ]
      })
    );
  }

  for (const item of missingPriceMaterials) {
    issues.push(
      issue({
        id: `procurement-no-price-${item.id}`,
        category: "procurement",
        title: "Материал без цены",
        reason: `${item.name} не имеет плановой или фактической цены.`,
        score: 50,
        suggestedAction: "Уточните бюджетную цену и фактическое КП.",
        evidence: [
          evidence({
            entityType: "material",
            entityId: item.id,
            label: item.name,
            field: "plannedUnitPrice/actualUnitPrice",
            value: `${item.plannedUnitPrice}/${item.actualUnitPrice}`,
            explanation: "Цена нужна для контроля перерасхода."
          })
        ]
      })
    );
  }

  for (const item of overstockMaterials) {
    issues.push(
      issue({
        id: `procurement-overstock-${item.id}`,
        category: "procurement",
        title: "Потенциальный излишек материала",
        reason: `${item.name}: доставлено больше потребности более чем на 20%.`,
        score: 42,
        suggestedAction: "Проверьте складской остаток, списание и будущую потребность.",
        evidence: [
          evidence({
            entityType: "material",
            entityId: item.id,
            label: item.name,
            field: "deliveredQty",
            value: item.deliveredQty,
            explanation: `Потребность ${item.requiredQty} ${item.unit}.`
          })
        ]
      })
    );
  }

  const requestStatusCounts = requests.reduce<Record<string, number>>((counts, request) => {
    counts[request.status] = (counts[request.status] ?? 0) + 1;
    return counts;
  }, {});

  const recommendations = issues.map((item) =>
    action({
      id: `action-${item.id}`,
      category: "procurement",
      actionType:
        item.id.includes("overstock") ? "investigate_overstock" : item.id.includes("supplier") ? "request_supplier_quote" : item.id.includes("deficit") ? "order_material" : "request_supplier_quote",
      priority: item.level,
      title: `Рекомендация по закупке: ${item.title}`,
      description: item.reason,
      suggestedNextStep: item.suggestedAction,
      ownerRole: "Снабжение",
      evidence: item.evidence,
      entityType: item.evidence[0]?.entityType ?? null,
      entityId: item.evidence[0]?.entityId ?? null
    })
  );

  return {
    deficitMaterials,
    missingSupplierMaterials,
    missingPriceMaterials,
    neededSoonMaterials,
    overstockMaterials,
    requestStatusCounts,
    recommendations,
    issues
  };
}
