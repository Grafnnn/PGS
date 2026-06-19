import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { generateTemporaryPassword, normalizeAdminRole, serializeAdminUser, validatePasswordCandidate } from "@/lib/admin/users";
import { getDemoContext } from "@/lib/project-data";

async function auditOrganizationId() {
  const organization = await prisma.organization.findFirst({ select: { id: true } });
  if (organization) return organization.id;
  return (await getDemoContext()).organizationId;
}

function jsonError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
  }
  console.error(error);
  return NextResponse.json({ error: "Admin users request failed" }, { status: 500 });
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const users = await prisma.user.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] });
    return NextResponse.json({ items: users.map(serializeAdminUser) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const name = String(body.name ?? "").trim();
    const role = normalizeAdminRole(body.role);
    const temporaryPassword = body.password ? String(body.password) : generateTemporaryPassword();
    const passwordError = validatePasswordCandidate(temporaryPassword);

    if (!email || !email.includes("@")) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });

    const organizationId = await auditOrganizationId();
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          appRole: role,
          passwordHash: await hashPassword(temporaryPassword),
          isActive: true,
          memberships: { create: { organizationId, role: role === "OWNER" ? "owner" : "project_manager" } }
        }
      });
      await writeAudit(tx, {
        organizationId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "user",
        entityId: user.id,
        action: "create",
        summary: `Создан пользователь: ${user.email}`,
        after: { id: user.id, email: user.email, role }
      });
      return user;
    });

    return NextResponse.json({ item: serializeAdminUser(created), temporaryPassword }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 409 });
    }
    return jsonError(error);
  }
}
