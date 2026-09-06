import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractKnowledgeDocument, UnsupportedKnowledgeDocumentError } from "./extract";

function simplePdf(text: string) {
  const escaped = text.replace(/[()\\]/g, (value) => `\\${value}`);
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body);
}

describe("technical document extraction", () => {
  it("extracts searchable rows and sheet locators from Excel", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Раздел", "Материал", "Толщина"],
      ["Кровля", "Утеплитель минераловатный", "150 мм"]
    ]), "Спецификация");
    const bytes = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));

    const extracted = await extractKnowledgeDocument({ fileName: "project.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes });

    expect(extracted.sections[0].locator).toContain("Спецификация");
    expect(extracted.sections[0].text).toContain("Утеплитель минераловатный");
    expect(extracted.sections[0].text).toContain("150 мм");
  });

  it("extracts text with a page locator from PDF", async () => {
    const extracted = await extractKnowledgeDocument({
      fileName: "project.pdf",
      mimeType: "application/pdf",
      bytes: simplePdf("Roof insulation thickness 150 mm")
    });

    expect(extracted.sections[0]).toMatchObject({ locator: "Страница 1" });
    expect(extracted.sections[0].text).toContain("Roof insulation thickness 150 mm");
  });

  it("explains why images cannot be indexed as technical text", async () => {
    await expect(extractKnowledgeDocument({ fileName: "scan.jpg", mimeType: "image/jpeg", bytes: Buffer.from("image") }))
      .rejects.toBeInstanceOf(UnsupportedKnowledgeDocumentError);
  });
});
