import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { buildCostForecastByCode } from "@/lib/cost-forecast-by-code";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const [costCodes, activeBaseline, latestPeriod, budgetItems, changeOrderItems, commitmentLines, payments] = await Promise.all([
      prisma.projectCostCode.findMany({
        where: { projectId: params.projectId },
        select: { id: true, code: true, name: true, status: true },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
      }),
      prisma.projectControlBaseline.findFirst({
        where: { projectId: params.projectId, status: "active" },
        orderBy: { sequence: "desc" },
        select: { lines: { select: { costCodeId: true, budget: true } } }
      }),
      prisma.projectControlPeriod.findFirst({
        where: { projectId: params.projectId, status: { not: "void" } },
        orderBy: [{ dataDate: "desc" }, { sequence: "desc" }],
        select: {
          id: true,
          dataDate: true,
          lines: {
            select: {
              earnedValue: true,
              actualCost: true,
              baselineLine: { select: { costCodeId: true } }
            }
          }
        }
      }),
      prisma.budgetItem.findMany({
        where: { projectId: params.projectId },
        select: { costCodeId: true, qty: true, plannedUnitPrice: true }
      }),
      prisma.projectChangeOrderItem.findMany({
        where: { changeOrder: { projectId: params.projectId } },
        select: {
          costCodeId: true,
          quantity: true,
          approvedUnitPrice: true,
          committedUnitPrice: true,
          changeOrder: { select: { status: true } }
        }
      }),
      prisma.projectCommitmentLine.findMany({
        where: { commitment: { projectId: params.projectId } },
        select: {
          costCodeId: true,
          scheduledValue: true,
          commitment: { select: { status: true } },
          paymentApplicationLines: {
            select: {
              currentAmount: true,
              materialsStored: true,
              retentionAmount: true,
              application: { select: { status: true } }
            }
          }
        }
      }),
      prisma.payment.findMany({
        where: { projectId: params.projectId },
        select: { costCodeId: true, direction: true, status: true, amount: true }
      })
    ]);

    const model = buildCostForecastByCode({
      costCodes,
      baselineLines: activeBaseline?.lines ?? [],
      budgetItems,
      periodLines: latestPeriod?.lines.map((line) => ({
        costCodeId: line.baselineLine.costCodeId,
        earnedValue: line.earnedValue,
        actualCost: line.actualCost
      })) ?? [],
      changeOrderItems,
      commitmentLines,
      payments
    });
    return NextResponse.json({
      ...model,
      dataDate: latestPeriod?.dataDate.toISOString() ?? null,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Cost forecast request failed" }, { status: 500 });
  }
}
