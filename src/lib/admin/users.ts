import type { AppRole } from "@/lib/auth/permissions";

export interface UserRecordForAdmin {
  id: string;
  email: string;
  name: string;
  appRole: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

export function serializeAdminUser(user: UserRecordForAdmin) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: normalizeAdminRole(user.appRole),
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString()
  };
}

export function normalizeAdminRole(role: string | null | undefined): AppRole {
  const normalized = String(role ?? "VIEWER").toUpperCase();
  if (normalized === "OWNER" || normalized === "ADMIN" || normalized === "MANAGER" || normalized === "VIEWER") return normalized;
  return "VIEWER";
}

export function validatePasswordCandidate(password: string) {
  if (password.length < 12) return "Password must be at least 12 characters";
  const obvious = ["password", "admin", "qwerty", "123456", "pgs-admin-local"];
  if (obvious.some((part) => password.toLowerCase().includes(part))) return "Password is too obvious";
  return null;
}

export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function isLastActiveOwner(input: { targetUserId: string; activeOwnerIds: string[] }) {
  return input.activeOwnerIds.length === 1 && input.activeOwnerIds[0] === input.targetUserId;
}
