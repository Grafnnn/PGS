import { describe, expect, it } from "vitest";
import { chunkKnowledgeSections, knowledgeTerms, scoreKnowledgeChunk } from "./search";

describe("technical documentation lexical search", () => {
  it("normalizes Russian terms and adds a stable prefix for word forms", () => {
    const terms = knowledgeTerms("Требования к гидроизоляции кровельного пирога");
    expect(terms).toContain("гидроизоляции");
    expect(terms).toContain("~гидро");
    expect(terms).not.toContain("к");
  });

  it("chunks long sections with source locators", () => {
    const chunks = chunkKnowledgeSections([{ locator: "Страница 12", text: "Утеплитель минераловатный. ".repeat(120) }], { maxChars: 300, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((chunk) => chunk.locator === "Страница 12" && chunk.charCount <= 300)).toBe(true);
    expect(chunks[0].terms).toContain("утеплитель");
  });

  it("ranks exact and title matches above unrelated fragments", () => {
    const questionTerms = knowledgeTerms("марка утеплителя кровли");
    const relevant = scoreKnowledgeChunk({
      questionTerms,
      chunkTerms: knowledgeTerms("Минераловатный утеплитель марки Руф Баттс"),
      title: "Спецификация кровли",
      locator: "Страница 4"
    });
    const unrelated = scoreKnowledgeChunk({ questionTerms, chunkTerms: knowledgeTerms("Арматура класса А500С"), title: "КЖ" });
    expect(relevant).toBeGreaterThan(unrelated);
    expect(unrelated).toBe(0);
  });
});
