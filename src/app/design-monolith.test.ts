import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pages = readFileSync("src/app/design-monolith-pages.css", "utf8");
const semantic = readFileSync("src/app/design-monolith-semantic.css", "utf8");

describe("Obsidian legacy surface compatibility", () => {
  it("pairs intelligence text with a theme surface", () => {
    expect(semantic).toContain(`body.design-monolith .app-shell .intelligence-signal {
  background-color: var(--surface);
  color: var(--text);
}`);
  });

  it("preserves readable workbook review warnings", () => {
    expect(pages).toContain(`body.design-monolith .app-shell .project-workbook-sheet-row.needs-review {
  background-color: var(--yellow-soft);
  color: var(--text);
  box-shadow: inset 3px 0 var(--yellow);
}`);
    expect(pages).toContain(`body.design-monolith .app-shell .project-workbook-mapping-action {
  background-color: var(--yellow-soft);
  border-color: var(--yellow);
  color: var(--text);
}`);
  });

  it("does not leave disabled workbook rows on a hardcoded light surface", () => {
    expect(pages).toContain(`body.design-monolith .app-shell .project-workbook-sheet-row.is-disabled {
  background-color: var(--panel-muted);
  color: var(--muted);
}`);
  });
});
