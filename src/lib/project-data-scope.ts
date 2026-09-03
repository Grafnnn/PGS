import type { Prisma } from "@prisma/client";
import type { AppUser } from "@/lib/auth/permissions";

const organizationWideRoles = ["owner", "super_admin"] as const;

export function visibleProjectWhere(user?: AppUser | null): Prisma.ProjectWhereInput | undefined {
  if (!user?.authenticated) return undefined;

  return {
    OR: [
      {
        organization: {
          users: {
            some: {
              userId: user.id,
              role: { in: [...organizationWideRoles] }
            }
          }
        }
      },
      {
        organization: { users: { some: { userId: user.id } } },
        members: { some: { userId: user.id } }
      }
    ]
  };
}
