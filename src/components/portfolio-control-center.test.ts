import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PortfolioControlCenter } from "@/components/portfolio-control-center";
import { buildPortfolioControlModel } from "@/lib/portfolio-control";

describe("PortfolioControlCenter", () => {
  it("renders portfolio controls and honest empty states", () => {
    const html = renderToStaticMarkup(createElement(PortfolioControlCenter, { model: buildPortfolioControlModel([]) }));
    expect(html).toContain("Portfolio Control Center");
    expect(html).toContain("Сравнение объектов");
    expect(html).toContain("Нагрузка руководителей");
    expect(html).toContain("Нет платежного календаря");
  });
});
