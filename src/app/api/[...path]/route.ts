import { NextRequest, NextResponse } from "next/server";
import { askProjectAssistant, buildProjectContext, localAiFallback } from "@/lib/ai";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { demoState, getProjectBundle } from "@/lib/demo-data";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

function segments(params: { path?: string[] }) {
  return params.path ?? [];
}

export async function GET(_request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = segments(params);

  if (path.join("/") === "auth/me") {
    return json({ user: demoState.users[0], organization: { id: "org-demo", name: "Демо Строй" } });
  }

  if (path[0] === "projects" && path.length === 1) {
    return json({ projects: demoState.projects });
  }

  if (path[0] === "projects" && path[1]) {
    const projectId = path[1];
    const bundle = getProjectBundle(projectId);

    if (path.length === 2) {
      const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
      const works = workTotals(bundle.scheduleItems);
      const materials = materialTotals(bundle.materials);
      const finance = financeTotals(bundle.payments);
      const autoRisks = deriveAutoRisks(bundle.scheduleItems, bundle.materials, bundle.payments);
      return json({ ...bundle, calculations: { budget, works, materials, finance, autoRisks } });
    }

    const resource = path[2];
    if (resource === "budget") return json({ items: bundle.budgetItems });
    if (resource === "schedule") return json({ items: bundle.scheduleItems });
    if (resource === "materials") return json({ items: bundle.materials });
    if (resource === "procurement") return json({ items: bundle.procurementRequests });
    if (resource === "finance") return json({ payments: bundle.payments, totals: financeTotals(bundle.payments) });
    if (resource === "daily-reports") return json({ items: bundle.dailyReports });
    if (resource === "risks") return json({ items: [...bundle.risks, ...deriveAutoRisks(bundle.scheduleItems, bundle.materials, bundle.payments)] });
    if (resource === "ai" && path[3] === "summary") return json(buildProjectContext(projectId));
  }

  return json({ error: "Endpoint not found", path }, 404);
}

export async function POST(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = segments(params);
  const body = await request.json().catch(() => ({}));

  if (path.join("/") === "auth/register") {
    return json({ user: demoState.users[0], message: "MVP: первый пользователь уже создан в demo seed." }, 201);
  }

  if (path.join("/") === "auth/login") {
    return json({ user: demoState.users[0], token: "local-demo-session" });
  }

  if (path.join("/") === "auth/logout") {
    return json({ ok: true });
  }

  if (path[0] === "projects" && path.length === 1) {
    return json({ project: { id: `project-${Date.now()}`, status: "draft", ...body } }, 201);
  }

  if (path[0] === "projects" && path[1]) {
    const projectId = path[1];
    const resource = path[2];

    if (resource === "ai" && ["chat", "summary", "analyze-budget", "analyze-contract", "procurement-suggestion", "risk-review"].includes(path[3] ?? "")) {
      const prompt = body.prompt ?? body.question ?? promptByAiEndpoint(path[3]);
      const result = path[3] === "chat" ? await askProjectAssistant(projectId, prompt) : { ok: true, status: 200, response: localAiFallback(prompt, projectId) };
      return json({ response: result.response, ok: result.ok, error: "error" in result ? result.error : undefined }, result.status);
    }

    if (resource === "budget" && path[3] === "import") {
      return json({
        imported: false,
        recommendations: [
          "Найдены ожидаемые колонки: наименование, единица, количество, цена, сумма.",
          "Для MVP импорт сохранен как AI-рекомендация; запись в БД подключается через Prisma."
        ]
      });
    }

    return json({ item: { id: `${resource}-${Date.now()}`, projectId, ...body } }, 201);
  }

  return json({ error: "Endpoint not found", path }, 404);
}

export async function PATCH(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = segments(params);
  const body = await request.json().catch(() => ({}));
  return json({ item: { id: path.at(-1), ...body }, path });
}

export async function DELETE(_request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = segments(params);
  return json({ ok: true, deletedId: path.at(-1) });
}

function promptByAiEndpoint(endpoint?: string) {
  switch (endpoint) {
    case "summary":
      return "Сформируй отчет руководству по проекту.";
    case "analyze-budget":
      return "Проверь бюджет, маржинальность и перерасходы.";
    case "analyze-contract":
      return "Проанализируй договор и риски подрядчика.";
    case "procurement-suggestion":
      return "Сформируй предложения по заявкам снабжению.";
    case "risk-review":
      return "Найди ключевые риски и решения на ближайшую неделю.";
    default:
      return "Что сейчас самое важное по проекту?";
  }
}
