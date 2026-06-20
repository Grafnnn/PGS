export type EmailProviderName = "console" | "gmail" | "smtp";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailDeliveryPreview {
  provider: EmailProviderName;
  delivered: boolean;
  to: string;
  subject: string;
  previewText: string;
  warning?: string;
}

export interface EmailProvider {
  name: EmailProviderName;
  send(message: EmailMessage): Promise<EmailDeliveryPreview>;
}
