import { cookies } from "next/headers";
import { getEnvStatus } from "@/lib/env";
import { localUser, type AppRole, type AppUser } from "./permissions";

const roleMap: Record<string, AppRole> = {
  owner: "OWNER",
  admin: "ADMIN",
  manager: "MANAGER",
  viewer: "VIEWER"
};

export function getCurrentUser(): AppUser | null {
  const status = getEnvStatus();
  const roleCookie = cookies().get("pgs_role")?.value;
  const role = roleCookie ? roleMap[roleCookie] : undefined;

  if (role) {
    return {
      id: "session-user",
      name: role === "VIEWER" ? "Viewer" : "Demo Admin",
      email: "demo@pgs.local",
      role,
      authenticated: true
    };
  }

  if (!status.authRequired) return localUser("OWNER");
  return null;
}
