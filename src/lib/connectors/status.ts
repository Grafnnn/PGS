import { getConnectorConfig } from "./config";
import type { ConnectorStatus } from "./types";

function scrubMetadata(metadata?: Record<string, string>) {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !key.toLowerCase().includes("secret") && !key.toLowerCase().includes("token") && !key.toLowerCase().includes("key"))
  );
}

export function getConnectorStatuses(now = new Date()): ConnectorStatus[] {
  const lastCheckedAt = now.toISOString();
  return getConnectorConfig().map((connector) => ({
    ...connector,
    metadata: scrubMetadata(connector.metadata),
    lastCheckedAt
  }));
}

export function connectorSummary(statuses = getConnectorStatuses()) {
  return {
    total: statuses.length,
    configured: statuses.filter((connector) => connector.configured).length,
    enabled: statuses.filter((connector) => connector.mode === "enabled").length,
    warnings: statuses.flatMap((connector) => connector.warnings.map((warning) => `${connector.label}: ${warning}`))
  };
}
