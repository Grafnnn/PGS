import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { inboxStateMutationSchema, normalizeInboxState, parseInboxItemKey } from "@/lib/approval-inbox";
import { loadApprovalInbox } from "@/lib/approval-inbox-data";
import { prisma } from "@/lib/prisma";

const MAX_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const data = inboxStateMutationSchema.parse(await request.json().catch(() => ({})));
    if (!parseInboxItemKey(data.itemKey)) return NextResponse.json({ error: "Invalid inbox item key" }, { status: 400 });

    const now = new Date();
    const snoozedUntil = data.snoozedUntil ? new Date(data.snoozedUntil) : null;
    if (data.action === "snooze" && (!snoozedUntil || snoozedUntil <= now || snoozedUntil.getTime() - now.getTime() > MAX_SNOOZE_MS)) {
      return NextResponse.json({ error: "Snooze date must be within the next 30 days" }, { status: 400 });
    }

    const inbox = await loadApprovalInbox(user, now);
    const item = inbox.items.find((candidate) => candidate.key === data.itemKey);
    if (!item) return NextResponse.json({ error: "Inbox item not found" }, { status: 404 });

    const patch =
      data.action === "read"
        ? { readAt: now }
        : data.action === "unread"
          ? { readAt: null }
          : data.action === "archive"
            ? { archivedAt: now, readAt: now }
            : data.action === "restore"
              ? { archivedAt: null }
              : data.action === "snooze"
                ? { snoozedUntil, readAt: now }
                : { snoozedUntil: null };

    const updated = await prisma.inboxItemState.upsert({
      where: { userId_itemKey: { userId: user.id, itemKey: data.itemKey } },
      create: { userId: user.id, itemKey: data.itemKey, ...patch },
      update: patch
    });

    return NextResponse.json({
      ok: true,
      itemKey: data.itemKey,
      ...normalizeInboxState(
        {
          readAt: updated.readAt?.toISOString() ?? null,
          snoozedUntil: updated.snoozedUntil?.toISOString() ?? null,
          archivedAt: updated.archivedAt?.toISOString() ?? null
        },
        now
      )
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid inbox state" }, { status: 400 });
    return NextResponse.json({ error: "Inbox state update failed" }, { status: 500 });
  }
}
