import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInviteEmail, buildResetPasswordEmail, getEmailProviderStatus } from "./index";
import { ConsoleEmailProvider } from "./console";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("email adapter", () => {
  it("returns console delivery preview without sending real email", async () => {
    const provider = new ConsoleEmailProvider();
    const delivery = await provider.send({ to: "user@example.com", subject: "Invite", text: "Open https://example.com/invite" });
    expect(delivery.delivered).toBe(false);
    expect(delivery.warning).toContain("не отправляет");
  });

  it("builds invite and reset messages", () => {
    expect(buildInviteEmail({ to: "user@example.com", acceptUrl: "https://pgs.local/invite" }).text).toContain("https://pgs.local/invite");
    expect(buildResetPasswordEmail({ to: "user@example.com", resetUrl: "https://pgs.local/reset" }).subject).toContain("Сброс");
  });

  it("warns when console provider is used for production readiness", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getEmailProviderStatus("console").warning).toContain("production");
  });
});
