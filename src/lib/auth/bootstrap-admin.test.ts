import { describe, expect, it, vi } from "vitest";
import { ensureBootstrapAdmin, type BootstrapAdminStore } from "./bootstrap-admin";

function store(overrides: Partial<BootstrapAdminStore> = {}): BootstrapAdminStore {
  return {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "user-created" }),
    ...overrides
  };
}

describe("ensureBootstrapAdmin", () => {
  it("preserves an existing administrator without rehashing or updating the password", async () => {
    const existing = { id: "user-existing" };
    const bootstrapStore = store({ findByEmail: vi.fn().mockResolvedValue(existing) });
    const hashPassword = vi.fn();

    const result = await ensureBootstrapAdmin(
      bootstrapStore,
      { email: " Admin@Example.com ", name: "Admin", password: "new-bootstrap-password" },
      hashPassword
    );

    expect(result).toEqual({ user: existing, created: false });
    expect(bootstrapStore.findByEmail).toHaveBeenCalledWith("admin@example.com");
    expect(bootstrapStore.create).not.toHaveBeenCalled();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("creates a missing administrator with a normalized email and hashed bootstrap password", async () => {
    const bootstrapStore = store();
    const hashPassword = vi.fn().mockResolvedValue("hashed-password");

    const result = await ensureBootstrapAdmin(
      bootstrapStore,
      { email: " Admin@Example.com ", name: "Admin", password: "bootstrap-password" },
      hashPassword
    );

    expect(result).toEqual({ user: { id: "user-created" }, created: true });
    expect(bootstrapStore.create).toHaveBeenCalledWith({
      email: "admin@example.com",
      name: "Admin",
      passwordHash: "hashed-password",
      appRole: "OWNER",
      isActive: true
    });
  });

  it("requires a bootstrap password only when the administrator does not exist", async () => {
    await expect(
      ensureBootstrapAdmin(store(), { email: "admin@example.com", name: "Admin" }, vi.fn())
    ).rejects.toThrow("FIRST_ADMIN_PASSWORD is required");
  });
});
