import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { invoiceCreateSchema, serializeProjectInvoice } from "@/lib/invoice-reconciliation";
import { invoiceInclude, resolveInvoiceReferences } from "@/lib/invoice-reconciliation-db";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string } };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const [items, costCodes, commitments, paymentApplications, payments, documents] = await Promise.all([
      prisma.projectInvoice.findMany({
        where: { projectId: params.projectId },
        include: invoiceInclude,
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { sequence: "desc" }]
      }),
      prisma.projectCostCode.findMany({
        where: { projectId: params.projectId, status: "active" },
        select: { id: true, code: true, name: true },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
      }),
      prisma.projectCommitment.findMany({
        where: { projectId: params.projectId, status: { in: ["approved", "active", "completed"] } },
        select: {
          id: true, number: true, title: true, counterparty: true, status: true,
          lines: { select: { scheduledValue: true } }
        },
        orderBy: { sequence: "desc" }
      }),
      prisma.projectPaymentApplication.findMany({
        where: { projectId: params.projectId, status: { in: ["submitted", "approved", "paid"] } },
        select: { id: true, commitmentId: true, number: true, status: true, netAmount: true },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.payment.findMany({
        where: { projectId: params.projectId },
        select: { id: true, title: true, counterparty: true, direction: true, status: true, amount: true },
        orderBy: { plannedAt: "desc" }
      }),
      prisma.document.findMany({
        where: { projectId: params.projectId },
        select: { id: true, title: true, fileName: true, category: true },
        orderBy: { updatedAt: "desc" },
        take: 200
      })
    ]);
    return NextResponse.json({
      items: items.map(serializeProjectInvoice),
      options: {
        costCodes,
        commitments: commitments.map((item) => ({
          ...item,
          amount: item.lines.reduce((sum, line) => sum + Number(line.scheduledValue), 0),
          lines: undefined
        })),
        paymentApplications: paymentApplications.map((item) => ({ ...item, netAmount: Number(item.netAmount) })),
        payments: payments.map((item) => ({ ...item, amount: Number(item.amount) })),
        documents
      },
      summary: {
        total: items.length,
        unmatched: items.filter((item) => item.matchStatus === "unmatched" || item.matchStatus === "blocked").length,
        variance: items.filter((item) => item.matchStatus === "variance").length,
        overdue: items.filter((item) => !["paid", "void"].includes(item.status) && item.dueDate < new Date()).length,
        apOpen: items.filter((item) => item.direction === "AP" && !["paid", "void"].includes(item.status)).reduce((sum, item) => sum + Number(item.grossAmount), 0),
        arOpen: items.filter((item) => item.direction === "AR" && !["paid", "void"].includes(item.status)).reduce((sum, item) => sum + Number(item.grossAmount), 0)
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Invoice register request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = invoiceCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const references = await resolveInvoiceReferences(params.projectId, data);
    if ("error" in references) return NextResponse.json({ error: references.error }, { status: 409 });

    const item = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectInvoice.findFirst({
        where: { projectId: params.projectId },
        orderBy: { sequence: "desc" },
        select: { sequence: true }
      });
      const created = await tx.projectInvoice.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          sequence: (latest?.sequence ?? 0) + 1,
          number: data.number,
          direction: data.direction,
          invoiceType: data.invoiceType,
          counterparty: data.counterparty,
          issueDate: new Date(data.issueDate),
          dueDate: new Date(data.dueDate),
          servicePeriodStart: data.servicePeriodStart ? new Date(data.servicePeriodStart) : null,
          servicePeriodEnd: data.servicePeriodEnd ? new Date(data.servicePeriodEnd) : null,
          grossAmount: data.grossAmount,
          taxAmount: data.taxAmount,
          currency: data.currency.toUpperCase(),
          costCodeId: data.costCodeId || null,
          commitmentId: data.commitmentId || null,
          paymentApplicationId: data.paymentApplicationId || null,
          paymentId: data.paymentId || null,
          linkedDocumentId: data.linkedDocumentId || null,
          notes: data.notes || null,
          createdBy: user?.authenticated ? user.id : null
        },
        include: invoiceInclude
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_invoice",
        entityId: created.id,
        action: "create",
        summary: `Создан счёт ${created.direction} ${created.number}: ${created.counterparty}`,
        after: serializeProjectInvoice(created)
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ item: serializeProjectInvoice(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Invoice number or sequence conflict" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Invoice sequence changed concurrently; retry" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid invoice request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invoice creation failed" }, { status: 500 });
  }
}
