export type ConnectorMode = "disabled" | "read_only" | "enabled";

export type ConnectorId = "github" | "google_drive" | "gmail" | "google_calendar" | "render" | "vercel" | "openai";

export interface ConnectorConfig {
  id: ConnectorId;
  label: string;
  mode: ConnectorMode;
  configured: boolean;
  metadata?: Record<string, string>;
  notes: string[];
  warnings: string[];
}

export interface ConnectorStatus extends ConnectorConfig {
  lastCheckedAt: string;
}
