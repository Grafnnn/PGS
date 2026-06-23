import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient | PrismaClient;

export interface AuditInput {
  organizationId: string;
  projectId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  entity: string;
  entityId: string;
  action: "create" | "update" | "delete" | "import_preview" | "import_commit" | "accept" | "use";
  summary?: string;
  before?: unknown;
  after?: unknown;
}

const MAX_JSON_CHARS = 6000;

export function auditSummary(input: Pick<AuditInput, "action" | "entity" | "summary">) {
  if (input.summary) return input.summary.slice(0, 500);
  const actionLabel: Record<AuditInput["action"], string> = {
    create: "Создано",
    update: "Обновлено",
    delete: "Удалено",
    import_preview: "Подготовлен импорт",
    import_commit: "Сохранен импорт",
    accept: "Принято",
    use: "Использовано"
  };
  return `${actionLabel[input.action]}: ${input.entity}`;
}

export function safeAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const json = JSON.stringify(value, (_key, nestedValue) => {
    if (typeof nestedValue === "bigint") return nestedValue.toString();
    return nestedValue;
  });
  if (json.length > MAX_JSON_CHARS) {
    return { truncated: true, preview: json.slice(0, MAX_JSON_CHARS) };
  }
  return JSON.parse(json) as Prisma.InputJsonValue;
}

export async function writeAudit(client: TxClient, input: AuditInput) {
  return client.auditLog.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? "local-user",
      actorEmail: input.actorEmail ?? null,
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      summary: auditSummary(input),
      beforeJson: safeAuditJson(input.before),
      afterJson: safeAuditJson(input.after),
      payload: safeAuditJson({ entity: input.entity, action: input.action })
    }
  });
}
