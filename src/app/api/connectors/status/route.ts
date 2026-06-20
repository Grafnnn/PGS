import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { connectorSummary, getConnectorStatuses } from "@/lib/connectors/status";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return apiError(requestId, "FORBIDDEN", "Forbidden", 403);

  try {
    const items = getConnectorStatuses();
    return apiOk(requestId, { items, summary: connectorSummary(items) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available. Start PostgreSQL and run prisma migrate/seed.", 503);
    }
    console.error(error);
    return apiError(requestId, "CONNECTOR_STATUS_FAILED", "Connector status request failed", 500);
  }
}
