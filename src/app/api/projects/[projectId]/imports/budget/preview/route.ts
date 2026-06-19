import { NextRequest, NextResponse } from "next/server";
import { parseExcelBuffer, validateExcelFile } from "@/lib/excel/import-parser";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Excel-файл не передан." }, { status: 400 });
  }

  const validationError = validateExcelFile(file.name, file.size);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const preview = parseExcelBuffer(buffer, file.name, params.projectId);

  return NextResponse.json(preview, { status: preview.errors.length ? 422 : 200 });
}
