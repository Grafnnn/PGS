import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/project-route-guards";
import { serializeMaterial, serializeProcurementRequest } from "@/lib/serializers";

const workflowSchema = z.object({
  action: z.enum(["submit", "approve", "receive"]),
  expectedAt: z.coerce.date().optional(),
  items: z.array(z.object({ itemId: z.string().min(1), qty: z.coerce.number().positive() })).max(200).optional()
});

class ProcurementWorkflowConflict extends Error {}

function normalizedUnit(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, "");
}

function materialLinkError(lineName: string) {
  return new ProcurementWorkflowConflict(`Позиция «${lineName}» не связана с актуальным материалом проекта. Исправьте заявку перед продолжением.`);
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function actor(user: { id: string; name?: string | null; email?: string | null }) {
  return { actorId: user.id, actorName: user.name ?? "PGS user", actorEmail: user.email ?? null };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string; requestId: string } }
) {
  const access = await requireProjectAccess(params.projectId, "edit");
  if ("response" in access) return access.response;

  try {
    const data = workflowSchema.parse(await request.json().catch(() => ({})));
    const effectiveRole = await getEffectiveProjectRole(access.user, params.projectId);
    if (data.action === "approve" && !["OWNER", "ADMIN"].includes(effectiveRole ?? "")) {
      return json({ error: "Подтверждать заявки может владелец или администратор проекта." }, 403);
    }

    const current = await prisma.procurementRequest.findFirst({
      where: { id: params.requestId, projectId: params.projectId },
      include: { items: true }
    });
    if (!current) return json({ error: "Заявка не найдена." }, 404);

    if (data.action === "submit") {
      if (current.status !== "draft") return json({ error: "На подтверждение можно передать только черновик." }, 409);
      const item = await prisma.$transaction(async (tx) => {
        const claimed = await tx.procurementRequest.updateMany({
          where: { id: current.id, projectId: params.projectId, status: "draft" },
          data: { status: "submitted", submittedAt: new Date() }
        });
        if (claimed.count !== 1) throw new ProcurementWorkflowConflict();
        const updated = await tx.procurementRequest.findUniqueOrThrow({ where: { id: current.id }, include: { items: true } });
        await writeAudit(tx, {
          organizationId: current.organizationId,
          projectId: params.projectId,
          ...actor(access.user),
          entity: "procurement_request",
          entityId: current.id,
          action: "update",
          summary: `${current.requestNumber ?? current.title}: передана на подтверждение`,
          before: { status: current.status },
          after: { status: "submitted" }
        });
        return updated;
      });
      return json({ item: serializeProcurementRequest(item) });
    }

    if (data.action === "approve") {
      if (current.status !== "submitted") return json({ error: "Подтвердить можно только заявку со статусом «На подтверждении»." }, 409);
      const expectedAt = data.expectedAt ?? current.neededAt;
      const result = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "procurement_requests" WHERE id = ${current.id} FOR UPDATE`;
        const fresh = await tx.procurementRequest.findFirstOrThrow({
          where: { id: current.id, projectId: params.projectId },
          include: { items: true }
        });
        if (fresh.status !== "submitted") throw new ProcurementWorkflowConflict();

        const materials = new Map<string, Awaited<ReturnType<typeof tx.material.findFirst>>>();
        for (const line of fresh.items) {
          if (!line.materialId) throw materialLinkError(line.name);
          const material = await tx.material.findFirst({ where: { id: line.materialId, projectId: params.projectId } });
          if (!material || normalizedUnit(material.unit) !== normalizedUnit(line.unit)) throw materialLinkError(line.name);
          materials.set(line.id, material);
        }

        const claimed = await tx.procurementRequest.updateMany({
          where: { id: fresh.id, projectId: params.projectId, status: "submitted" },
          data: { status: "expected", approvedAt: new Date(), approvedBy: access.user.id, expectedAt }
        });
        if (claimed.count !== 1) throw new ProcurementWorkflowConflict();

        const updatedMaterials = [];
        for (const line of fresh.items) {
          const material = materials.get(line.id)!;
          const orderedQty = Math.max(material.orderedQty.toNumber() + line.qty.toNumber(), material.deliveredQty.toNumber());
          updatedMaterials.push(await tx.material.update({
            where: { id: material.id },
            data: { orderedQty: new Prisma.Decimal(orderedQty), status: "in_transit" }
          }));
        }

        const updated = await tx.procurementRequest.findUniqueOrThrow({ where: { id: fresh.id }, include: { items: true } });
        await writeAudit(tx, {
          organizationId: fresh.organizationId,
          projectId: params.projectId,
          ...actor(access.user),
          entity: "procurement_request",
          entityId: fresh.id,
          action: "accept",
          summary: `${fresh.requestNumber ?? fresh.title}: подтверждена, ожидается ${expectedAt.toISOString().slice(0, 10)}`,
          before: { status: fresh.status },
          after: { status: "expected", expectedAt: expectedAt.toISOString() }
        });
        return { updated, updatedMaterials };
      });
      return json({ item: serializeProcurementRequest(result.updated), materials: result.updatedMaterials.map(serializeMaterial) });
    }

    if (!["expected", "approved", "ordered", "partially_received"].includes(current.status)) {
      return json({ error: "Принимать можно только подтверждённую ожидаемую поставку." }, 409);
    }

    const requestedQuantities = new Map((data.items ?? []).map((item) => [item.itemId, item.qty]));
    const result = await prisma.$transaction(async (tx) => {
      // Serialize receipts for one request so concurrent warehouse actions cannot over-receive a line.
      await tx.$queryRaw`SELECT id FROM "procurement_requests" WHERE id = ${current.id} FOR UPDATE`;
      const fresh = await tx.procurementRequest.findFirstOrThrow({
        where: { id: current.id, projectId: params.projectId },
        include: { items: true }
      });
      if (!["expected", "approved", "ordered", "partially_received"].includes(fresh.status)) throw new ProcurementWorkflowConflict();

      const updatedMaterials = [];
      const receivedLines: Array<{ itemId: string; qty: number }> = [];
      const selectedLines = fresh.items.filter((line) => {
        const remaining = Math.max(line.qty.toNumber() - line.receivedQty.toNumber(), 0);
        const qty = requestedQuantities.size ? requestedQuantities.get(line.id) ?? 0 : remaining;
        return qty > 0;
      });
      const materials = new Map<string, Awaited<ReturnType<typeof tx.material.findFirst>>>();
      for (const line of selectedLines) {
        if (!line.materialId) throw materialLinkError(line.name);
        const material = await tx.material.findFirst({ where: { id: line.materialId, projectId: params.projectId } });
        if (!material || normalizedUnit(material.unit) !== normalizedUnit(line.unit)) throw materialLinkError(line.name);
        materials.set(line.id, material);
      }
      for (const line of fresh.items) {
        const remaining = Math.max(line.qty.toNumber() - line.receivedQty.toNumber(), 0);
        const qty = requestedQuantities.size ? requestedQuantities.get(line.id) ?? 0 : remaining;
        if (qty <= 0) continue;
        if (qty > remaining + 0.0001) throw new ProcurementWorkflowConflict("Количество приёмки превышает остаток заявки.");

        await tx.procurementRequestItem.update({
          where: { id: line.id },
          data: { receivedQty: { increment: new Prisma.Decimal(qty) } }
        });
        receivedLines.push({ itemId: line.id, qty });

        const material = materials.get(line.id);
        if (!material) throw materialLinkError(line.name);
        const deliveredQty = material.deliveredQty.toNumber() + qty;
        const orderedQty = Math.max(material.orderedQty.toNumber(), deliveredQty);
        updatedMaterials.push(await tx.material.update({
          where: { id: material.id },
          data: {
            deliveredQty: new Prisma.Decimal(deliveredQty),
            orderedQty: new Prisma.Decimal(orderedQty),
            status: deliveredQty >= material.requiredQty.toNumber() ? "delivered" : "in_transit"
          }
        }));
      }
      if (!receivedLines.length) throw new ProcurementWorkflowConflict("Укажите количество принятого материала.");

      const lines = await tx.procurementRequestItem.findMany({ where: { requestId: fresh.id } });
      const complete = lines.every((line) => line.receivedQty.greaterThanOrEqualTo(line.qty));
      const updated = await tx.procurementRequest.update({
        where: { id: fresh.id },
        data: { status: complete ? "received" : "partially_received", receivedAt: complete ? new Date() : null },
        include: { items: true }
      });
      await writeAudit(tx, {
        organizationId: fresh.organizationId,
        projectId: params.projectId,
        ...actor(access.user),
        entity: "procurement_request",
        entityId: fresh.id,
        action: "accept",
        summary: `${fresh.requestNumber ?? fresh.title}: материалы приняты на склад`,
        before: { status: fresh.status },
        after: { status: updated.status, receivedLines }
      });
      return { updated, updatedMaterials };
    });

    return json({ item: serializeProcurementRequest(result.updated), materials: result.updatedMaterials.map(serializeMaterial) });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Проверьте данные операции.", issues: error.flatten() }, 400);
    if (error instanceof ProcurementWorkflowConflict) return json({ error: error.message || "Статус заявки уже изменился. Обновите экран." }, 409);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Не удалось выполнить операцию с заявкой." }, 500);
  }
}
