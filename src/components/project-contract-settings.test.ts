import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectContractSettings } from "@/components/project-contract-settings";

describe("ProjectContractSettings", () => {
  it("renders editable contract fields and the included VAT breakdown", () => {
    const html = renderToStaticMarkup(createElement(ProjectContractSettings, {
      project: {
        id: "project-1",
        organizationId: "org-1",
        name: "Троицк",
        customer: "ИП Варякоис",
        object: "Кровля",
        address: "Троицк",
        contractAmount: 16_037_736.8,
        vatMode: "vat",
        vatPercent: 5,
        startsAt: "2026-09-01",
        endsAt: "2026-12-31",
        manager: "Прораб",
        status: "active"
      },
      canEdit: true,
      roleLoaded: true
    }));

    expect(html).toContain("Реквизиты и договор");
    expect(html).toContain("ИП Варякоис");
    expect(html).toContain("Сумма договора, ₽");
    expect(html).toContain("Ставка НДС, %");
    expect(html).toContain("Стоимость без НДС");
    expect(html).toContain("15 274 035,05");
    expect(html).toContain("763 701,75");
    expect(html).toContain("16 037 736,80");
    expect(html).toContain("Сохранить реквизиты");
  });
});
