export interface BootstrapAdminUser {
  id: string;
}

export interface BootstrapAdminStore {
  findByEmail(email: string): Promise<BootstrapAdminUser | null>;
  create(input: {
    email: string;
    name: string;
    passwordHash: string;
    appRole: "OWNER";
    isActive: true;
  }): Promise<BootstrapAdminUser>;
}

export async function ensureBootstrapAdmin(
  store: BootstrapAdminStore,
  input: {
    email: string;
    name: string;
    password?: string;
  },
  hashPassword: (password: string) => Promise<string>
) {
  const email = input.email.trim().toLowerCase();
  const existing = await store.findByEmail(email);

  if (existing) return { user: existing, created: false };
  if (!input.password) throw new Error("FIRST_ADMIN_PASSWORD is required when creating the first administrator.");

  const user = await store.create({
    email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    appRole: "OWNER",
    isActive: true
  });

  return { user, created: true };
}
