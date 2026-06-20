import { describe, expect, it } from "vitest";
import { generateTemporaryPassword, isLastActiveOwner, serializeAdminUser, validatePasswordCandidate } from "./users";

describe("admin user helpers", () => {
  it("never serializes password hashes", () => {
    const serialized = serializeAdminUser({
      id: "u1",
      email: "a@pgs.local",
      name: "Admin",
      appRole: "OWNER",
      isActive: true,
      lastLoginAt: null,
      createdAt: new Date("2026-06-19T00:00:00Z")
    });

    expect(serialized).not.toHaveProperty("passwordHash");
    expect(serialized.role).toBe("OWNER");
  });

  it("validates temporary passwords and owner safety", () => {
    expect(validatePasswordCandidate("short")).toContain("12");
    expect(validatePasswordCandidate("pgs-admin-local")).toContain("obvious");
    expect(validatePasswordCandidate(generateTemporaryPassword())).toBeNull();
    expect(isLastActiveOwner({ targetUserId: "u1", activeOwnerIds: ["u1"] })).toBe(true);
    expect(isLastActiveOwner({ targetUserId: "u1", activeOwnerIds: ["u1", "u2"] })).toBe(false);
  });
});
