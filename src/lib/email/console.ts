import type { EmailDeliveryPreview, EmailMessage, EmailProvider } from "./types";

export class ConsoleEmailProvider implements EmailProvider {
  name = "console" as const;

  async send(message: EmailMessage): Promise<EmailDeliveryPreview> {
    const production = process.env.NODE_ENV === "production";
    const preview: EmailDeliveryPreview = {
      provider: this.name,
      delivered: false,
      to: message.to,
      subject: message.subject,
      previewText: production ? "[redacted in production console provider]" : message.text,
      warning: "Console provider не отправляет реальные письма."
    };

    if (process.env.NODE_ENV !== "test" && !production) {
      console.info("[email:console]", { to: message.to, subject: message.subject, previewText: message.text });
    }

    return preview;
  }
}
