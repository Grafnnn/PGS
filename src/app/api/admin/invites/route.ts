import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { generateOneTimeToken, hashOneTimeToken, INVITE_TOKEN_TTL_HOURS, tokenExpiresAt } from "@/lib/auth/tokens";
import { normalizeAdminRole } from "@/lib/admin/users";
import { getAdminOrganizationContext } from "@/lib/admin/user-scope";
import { getEnv } from "@/lib/env";
import { buildInviteEmail, getEmailProvider } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const currentUser = await getCurrentUser();

  try {
    const env = getEnv();
    const context = await getAdminOrganizationContext(currentUser);
    if (!context) return apiError(requestId, "ORGANIZATION_NOT_FOUND", "Organization membership is required", 403);
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = normalizeAdminRole(body.role);
    const projectRole = body.projectRole === undefined || body.projectRole === null ? null : normalizeAdminRole(body.projectRole);
    const projectId = body.projectId ? String(body.projectId) : null;
    if (!email || !email.includes("@")) return apiError(requestId, "VALIDATION_ERROR", "Valid email is required", 400);

    const project = projectId
      ? await prisma.project.findFirst({
          where: { id: projectId, organizationId: context.organizationId },
          select: { id: true, name: true, organizationId: true }
        })
      : null;
    if (projectId && !project) return apiError(requestId, "PROJECT_NOT_FOUND", "Project not found", 404);
    const organizationId = context.organizationId;

    const rawToken = generateOneTimeToken();
    const expiresAt = tokenExpiresAt(INVITE_TOKEN_TTL_HOURS);
    const invite = await prisma.$transaction(async (tx) => {
      const created = await tx.userInvite.create({
        data: {
          organizationId,
          email,
          role,
          projectId,
          projectRole,
          tokenHash: hashOneTimeToken(rawToken),
          expiresAt,
          createdById: currentUser?.authenticated ? currentUser.id : null
        }
      });
      await writeAudit(tx, {
        organizationId,
        projectId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "user_invite",
        entityId: created.id,
        action: "create",
        summary: `Создано приглашение: ${email}`,
        after: { email, role, projectId, projectRole, expiresAt: expiresAt.toISOString() }
      });
      return created;
    });

    const acceptUrl = new URL(`/invite/accept?token=${rawToken}`, env.APP_URL).toString();
    const delivery = await getEmailProvider().send(buildInviteEmail({ to: email, acceptUrl, projectName: project?.name }));
    const devPreview = env.NODE_ENV === "production" ? null : { acceptUrl, token: rawToken };
    return apiOk(requestId, { item: { id: invite.id, email: invite.email, role, projectId, projectRole, expiresAt: invite.expiresAt.toISOString() }, delivery, devPreview }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available", 503);
    console.error(error);
    return apiError(requestId, "INVITE_CREATE_FAILED", "Invite creation failed", 500);
  }
}
