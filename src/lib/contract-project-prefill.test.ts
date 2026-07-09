import { describe, expect, it } from "vitest";
import {
  extractProjectPrefillFromContractText,
  inferAcceptanceTerms,
  inferPaymentTerms,
  inferVatMode,
  inferVolumeChangeMode,
  mergePrefillIntoProjectDraft
} from "./contract-project-prefill";

const syntheticContract = `
ДОГОВОР ПОДРЯДА N 12
Заказчик: ООО "Город Заказчик"
Подрядчик: ООО "ПГС Подряд"
Объект строительства: Административное здание районного центра
Адрес объекта: г. Москва, ул. Строителей, д. 10
Предмет договора: Подрядчик обязуется выполнить строительно-монтажные работы по объекту.
Цена договора составляет 12 500 000,00 руб., в том числе НДС 20%.
Срок выполнения работ: с 01.07.2026 по 30.09.2026.
Аванс 30% от цены договора перечисляется в течение 5 банковских дней.
Оплата производится по этапам после подписания актов выполненных работ.
Приемка работ оформляется актами КС-2 и справками КС-3.
Объемы могут быть изменены по соглашению сторон.
Пеня 0,1% за каждый день просрочки.
Гарантийное удержание 5% до передачи исполнительной документации.
`;

describe("contract project prefill", () => {
  it("returns explicit no-data warnings for empty text", () => {
    const result = extractProjectPrefillFromContractText({ text: "" });

    expect(result.warnings).toContain("Текст договора пустой или не извлечен.");
    expect(result.missingFields).toContain("заказчик");
    expect(result.confidenceByField).toEqual({});
  });

  it("extracts customer contractor object amount dates and terms from synthetic Russian contract", () => {
    const result = extractProjectPrefillFromContractText({ text: syntheticContract, fileName: "contract.txt" });

    expect(result.customerName).toBe("ООО \"Город Заказчик\"");
    expect(result.contractorName).toBe("ООО \"ПГС Подряд\"");
    expect(result.projectName).toBe("Административное здание районного центра");
    expect(result.objectAddress).toBe("г. Москва, ул. Строителей, д. 10");
    expect(result.contractAmount).toBe(12_500_000);
    expect(result.vatMode).toBe("including_vat");
    expect(result.vatPercent).toBe(20);
    expect(result.startDate).toBe("2026-07-01");
    expect(result.finishDate).toBe("2026-09-30");
    expect(result.paymentTerms).toContain("Оплата производится");
    expect(result.advanceTerms).toContain("Аванс 30%");
    expect(result.acceptanceTerms).toContain("КС-2");
    expect(result.volumeChangeMode).toBe("can_change");
    expect(result.penalties).toContain("Пеня");
    expect(result.retention).toContain("удержание");
    expect(result.warnings).toContain("В договоре найдены штрафы/пени; проверьте договорные риски перед подписанием.");
    expect(result.evidenceByField.contractAmount).toContain("Цена договора");
  });

  it("detects no-vat and fact-based volume modes without inventing missing dates", () => {
    const text = `
    Заказчик: АО "Инвест"
    Объект: Инженерные сети водоснабжения
    Цена договора 4 000 000 руб. без НДС.
    Расчет производится по фактически выполненным объемам.
    `;
    const result = extractProjectPrefillFromContractText({ text });

    expect(result.vatMode).toBe("no_vat");
    expect(result.volumeChangeMode).toBe("fact_based");
    expect(result.startDate).toBeUndefined();
    expect(result.finishDate).toBeUndefined();
    expect(result.missingFields).toContain("дата начала");
    expect(result.objectType).toBe("engineering");
  });

  it("keeps ambiguous values missing and surfaces warnings", () => {
    const result = extractProjectPrefillFromContractText({ text: "Договор. Работы выполняются по заявкам сторон." });

    expect(result.contractAmount).toBeUndefined();
    expect(result.customerName).toBeUndefined();
    expect(result.missingFields).toContain("сумма договора");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("exposes standalone inference helpers", () => {
    expect(inferVatMode("Стоимость 100 руб. без НДС").vatMode).toBe("no_vat");
    expect(inferPaymentTerms("Оплата после подписания КС-2. Аванс 10%.").paymentTerms).toContain("Оплата");
    expect(inferVolumeChangeMode("Объемы могут быть изменены дополнительным соглашением.").volumeChangeMode).toBe("can_change");
    expect(inferAcceptanceTerms("Стороны подписывают акты выполненных работ КС-2 и КС-3.").acceptanceTerms).toContain("КС-2");
  });

  it("does not overwrite manual draft values unless explicitly requested", () => {
    const prefill = extractProjectPrefillFromContractText({ text: syntheticContract });
    const draft = {
      name: "Ручное название",
      customer: "",
      object: "",
      address: "",
      contractAmount: "",
      startsAt: "",
      endsAt: "",
      manager: "РП"
    };

    const safeMerge = mergePrefillIntoProjectDraft(draft, prefill);
    expect(safeMerge.name).toBe("Ручное название");
    expect(safeMerge.customer).toBe("ООО \"Город Заказчик\"");

    const explicitMerge = mergePrefillIntoProjectDraft(draft, prefill, { overwrite: true, fields: ["projectName"] });
    expect(explicitMerge.name).toBe("Административное здание районного центра");
  });
});
