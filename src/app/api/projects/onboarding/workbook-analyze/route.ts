import { NextRequest, NextResponse } from "next/server";
import { canEditProject } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { validateExcelFile } from "@/lib/excel/import-parser";
import { analyzeProjectWorkbookBuffer, parseProjectWorkbookSheetOverrides } from "@/lib/excel/project-workbook-import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!canEditProject(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Excel-файл не передан." }, { status: 400 });

  const validationError = validateExcelFile(file.name, file.size);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const startsAt = String(formData?.get("startsAt") ?? "");
  let sheetOverrides;
  try {
    sheetOverrides = parseProjectWorkbookSheetOverrides(formData?.get("sheetOverrides"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Некорректная карта листов." }, { status: 400 });
  }
  const analysis = analyzeProjectWorkbookBuffer(Buffer.from(await file.arrayBuffer()), file.name, "onboarding-preview", { startsAt, sheetOverrides });
  if (analysis.errors.length) return NextResponse.json({ error: analysis.errors[0], analysis }, { status: 422 });

  return NextResponse.json({
    ok: true,
    analysis,
    writes: {
      projectCreated: false,
      importCommitted: false,
      documentPersisted: false
    }
  });
}
