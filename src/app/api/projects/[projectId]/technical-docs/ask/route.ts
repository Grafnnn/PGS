import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { sanitizeAiJournalText, sanitizeAiJournalValue, sanitizeAiRunError } from "@/lib/ai-run-journal";
import { getOpenAiRuntimeConfig } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { ensureGoogleDriveKnowledgeFresh, projectKnowledgeFingerprint, searchProjectKnowledge } from "@/lib/technical-documentation/index";
import { answerTechnicalQuestion, TechnicalQuestionProviderError } from "@/lib/technical-documentation/qa";
import { knowledgeExcerpt } from "@/lib/technical-documentation/search";

export const runtime = "nodejs";

const SCENARIO = "technical-documentation-qa-v1";
const PROMPT_VERSION = "technical-documentation-qa-v3";
const requestSchema = z.object({ question: z.string().trim().min(3).max(1_000) });

function asRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : null;
}

function answerCacheKey(question: string, fingerprint: string) {
  const normalized = question.toLocaleLowerCase("ru-RU").replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(`${PROMPT_VERSION}:${fingerprint}:${normalized}`).digest("hex");
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user || !(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rateLimit = checkRateLimit({ key: `technical-docs:${user.id}:${params.projectId}`, limit: 20, windowMs: 5 * 60_000 });
  if (!rateLimit.allowed) {
    return new NextResponse(JSON.stringify({ error: "Слишком много вопросов. Повторите позже." }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": String(rateLimit.retryAfterSeconds) }
    });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Введите технический вопрос длиной от 3 до 1000 символов." }, { status: 400 });
  const [project, knowledge] = await Promise.all([
    prisma.project.findUnique({ where: { id: params.projectId }, select: { name: true, organizationId: true } }),
    ensureGoogleDriveKnowledgeFresh(params.projectId)
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const matches = await searchProjectKnowledge(params.projectId, parsed.data.question);
  if (!matches.length) {
    return NextResponse.json({
      result: {
        answer: "В проиндексированной документации проекта подтверждение не найдено. Уточните формулировку, обновите базу документов или оформите RFI.",
        confidence: "low",
        notFound: true,
        followUps: ["Проверьте, загружен ли нужный раздел проекта и есть ли в PDF текстовый слой."],
        citations: [],
        cached: false,
        provider: "deterministic",
        knowledge
      }
    });
  }

  const sources = matches.map((match, index) => ({
    sourceId: `S${index + 1}`,
    title: match.title,
    locator: match.locator,
    text: match.text
  }));
  const candidateCitations = matches.map((match, index) => ({
    sourceId: `S${index + 1}`,
    title: match.title,
    locator: match.locator,
    excerpt: knowledgeExcerpt(match.text, parsed.data.question),
    sourceUrl: match.sourceUrl,
    sourceKind: match.sourceKind
  }));

  const fingerprint = await projectKnowledgeFingerprint(params.projectId);
  const cacheKey = answerCacheKey(parsed.data.question, fingerprint);
  const cachedRuns = await prisma.aiRun.findMany({
    where: { projectId: params.projectId, scenario: SCENARIO, status: "succeeded" },
    orderBy: { createdAt: "desc" },
    take: 30
  });
  const cached = cachedRuns.find((run) => asRecord(run.inputJson)?.cacheKey === cacheKey);
  if (cached) {
    const output = asRecord(cached.outputJson);
    if (output) {
      const citationIds = new Set(
        (Array.isArray(output.citations) ? output.citations : [])
          .map((citation) => asRecord(citation)?.sourceId)
          .filter((sourceId): sourceId is string => typeof sourceId === "string")
      );
      return NextResponse.json({
        result: {
          ...output,
          citations: candidateCitations.filter((citation) => citationIds.has(citation.sourceId)),
          cached: true,
          knowledge
        }
      });
    }
  }
  if (!getOpenAiRuntimeConfig().enabled) {
    return NextResponse.json({
      result: {
        answer: "AI-формирование ответа сейчас отключено. Ниже показаны наиболее релевантные фрагменты проектной документации для быстрой проверки.",
        confidence: "low",
        notFound: false,
        followUps: ["Сверьте формулировку и числовые значения с указанными местами в исходных файлах."],
        citations: candidateCitations,
        cached: false,
        provider: "deterministic",
        knowledge
      }
    });
  }
  const startedAt = Date.now();
  const run = await prisma.aiRun.create({
    data: {
      organizationId: project.organizationId,
      projectId: params.projectId,
      userId: user.authenticated ? user.id : null,
      scenario: SCENARIO,
      promptVersion: PROMPT_VERSION,
      inputJson: { question: sanitizeAiJournalText(parsed.data.question, 1_000), cacheKey, sourceIds: sources.map((source) => source.sourceId) },
      status: "running",
      provider: "openai"
    }
  });
  try {
    const answer = await answerTechnicalQuestion({ projectName: project.name, question: parsed.data.question, sources });
    const citedIds = new Set(answer.citationIds);
    const citations = candidateCitations.filter((source) => citedIds.has(source.sourceId));
    const result = {
      answer: answer.answer,
      confidence: answer.confidence,
      notFound: answer.notFound,
      followUps: answer.followUps,
      citations,
      cached: false,
      provider: answer.provider,
      knowledge
    };
    await prisma.aiRun.update({
      where: { id: run.id },
      data: {
        status: "succeeded",
        outputJson: sanitizeAiJournalValue(result) as Prisma.InputJsonValue,
        durationMs: Date.now() - startedAt,
        completedAt: new Date()
      }
    });
    return NextResponse.json({ result });
  } catch (error) {
    await prisma.aiRun.update({
      where: { id: run.id },
      data: {
        status: "failed",
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
        sanitizedError: sanitizeAiRunError(error)
      }
    });
    if (error instanceof TechnicalQuestionProviderError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Не удалось сформировать ответ по документации." }, { status: 500 });
  }
}
