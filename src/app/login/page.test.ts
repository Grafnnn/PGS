import { describe, expect, it } from "vitest";
import { LOGIN_INITIAL_CREDENTIALS } from "@/lib/login-form";

describe("LoginPage", () => {
  it("does not prefill credentials", () => {
    expect(LOGIN_INITIAL_CREDENTIALS).toEqual({
      email: "",
      password: ""
    });
  });
});
