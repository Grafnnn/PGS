import { describe, expect, it } from "vitest";
import { acceptedInviteMessage } from "@/lib/invite-acceptance";

describe("invite acceptance feedback", () => {
  it("does not claim that an existing account password was replaced", () => {
    expect(acceptedInviteMessage(true)).toContain("паролем существующей учётной записи");
    expect(acceptedInviteMessage(true)).toContain("пароль не изменялся");
  });

  it("confirms the new password only for a new account", () => {
    expect(acceptedInviteMessage(false)).toContain("новым паролем");
  });
});
