import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password helpers", () => {
  it("hashes and verifies without exposing the plain password", async () => {
    const hash = await hashPassword("pgs-admin-local");

    expect(hash).not.toBe("pgs-admin-local");
    await expect(verifyPassword("pgs-admin-local", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });
});
