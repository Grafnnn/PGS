import { getEnv } from "@/lib/env";
import { ConsoleEmailProvider } from "./console";
import type { EmailMessage, EmailProvider, EmailProviderName } from "./types";

export function getEmailProvider(): EmailProvider {
  const env = getEnv();
  if (env.EMAIL_PROVIDER === "console") return new ConsoleEmailProvider();
  return new ConsoleEmailProvider();
}

export function getEmailProviderStatus(providerName: EmailProviderName = getEnv().EMAIL_PROVIDER) {
  const production = getEnv().NODE_ENV === "production";
  return {
    provider: providerName,
    configured: providerName === "console" || providerName === "gmail" || providerName === "smtp",
    warning: production && providerName === "console" ? "EMAIL_PROVIDER=console безопасен для dev, но не доставляет письма в production." : null
  };
}

export function buildInviteEmail(input: { to: string; acceptUrl: string; projectName?: string | null }): EmailMessage {
  const projectLine = input.projectName ? `Проект: ${input.projectName}\n` : "";
  return {
    to: input.to,
    subject: "Приглашение в PGS",
    text: `Вас пригласили в PGS.\n${projectLine}Ссылка для принятия приглашения: ${input.acceptUrl}\nСсылка одноразовая и имеет срок действия.`
  };
}

export function buildResetPasswordEmail(input: { to: string; resetUrl: string }): EmailMessage {
  return {
    to: input.to,
    subject: "Сброс пароля PGS",
    text: `Для сброса пароля PGS откройте ссылку: ${input.resetUrl}\nСсылка одноразовая и имеет срок действия.`
  };
}
