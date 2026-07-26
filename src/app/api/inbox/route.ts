import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { loadApprovalInbox } from "@/lib/approval-inbox-data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const inbox = await loadApprovalInbox(user);
    const summaryOnly = new URL(request.url).searchParams.get("summary") === "1";
    return NextResponse.json(
      summaryOnly
        ? { summary: inbox.summary, generatedAt: new Date().toISOString() }
        : { items: inbox.items, summary: inbox.summary, projects: inbox.projects, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Inbox load failed" }, { status: 500 });
  }
}
