import React, { type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DailyPhotoAiWorkspace } from "./daily-photo-ai-workspace";
import type { DailyReport } from "@/lib/types";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = {
    useState: vi.fn(),
    useRef: vi.fn(),
    useMemo: (factory: () => unknown) => factory(),
    useEffect: vi.fn()
  };
  return { ...actual, ...hooks, default: { ...actual, ...hooks } };
});

// Exercise the component's event handlers with persistent hook state, without a browser or AI.
function renderWorkspace() {
  const slots: unknown[] = [];
  let cursor = 0;
  vi.mocked(React.useState).mockImplementation((initial?: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [slots[index], (value: unknown) => {
      slots[index] = typeof value === "function" ? value(slots[index]) : value;
    }] as ReturnType<typeof React.useState>;
  });
  vi.mocked(React.useRef).mockImplementation((initial: unknown) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index] as ReturnType<typeof React.useRef>;
  });
  const reports = [report("report-1"), report("report-2")];
  return () => {
    cursor = 0;
    return DailyPhotoAiWorkspace({
      projectId: "project-1", reports,
      currentUser: { authenticated: true, role: "MANAGER" }, currentUserLoaded: true
    });
  };
}

function report(id: string): DailyReport {
  return {
    id, projectId: "project-1", date: "2026-09-01", author: "Foreman", status: "draft",
    weather: "", workers: 1, engineers: 0, equipment: "", completedWorks: "Roof installation",
    materialsReceived: "", materialsConsumed: "", downtime: "", issues: "",
    evidenceDocuments: [{
      id: `${id}-photo`, projectId: "project-1", dailyReportId: id, category: "photo",
      title: id, filePath: `${id}.jpg`, mimeType: "image/jpeg", version: 1,
      author: "Foreman", createdAt: "2026-09-01"
    }]
  };
}

function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function find(tree: ReactNode, predicate: (element: ReactElement) => boolean) {
  const match = elements(tree).find(predicate);
  if (!match) throw new Error("Control not found");
  return match;
}

function answerResponse(answer: string) {
  return new Response(JSON.stringify({ result: {
    answer, confidence: "medium", observations: [], risks: [], recommendedActions: [], limitations: []
  } }), { status: 200 });
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

async function flushResponse() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("daily photo analysis response ownership", () => {
  it("does not display a response for the previous report after switching reports", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const render = renderWorkspace();
    find(render(), (element) => element.type === "textarea").props.onChange({ target: { value: "Inspect the roof" } });
    find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.onClick();
    expect(fetchMock.mock.calls[0][0]).toContain("/report-1/photo-question");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ question: "Inspect the roof", documentIds: ["report-1-photo"] });

    find(render(), (element) => element.type === "select").props.onChange({ target: { value: "report-2" } });
    pending.resolve(answerResponse("RESPONSE_FOR_REPORT_1"));
    await flushResponse();

    expect(find(render(), (element) => element.type === "select").props.value).toBe("report-2");
    expect(elements(render()).some((element) => element.props.className === "daily-photo-answer")).toBe(false);
  });

  it("keeps a newer answer when an older request finishes last", async () => {
    const older = deferredResponse();
    const newer = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise));
    const render = renderWorkspace();
    find(render(), (element) => element.type === "textarea").props.onChange({ target: { value: "First question" } });
    find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.onClick();
    find(render(), (element) => element.type === "textarea").props.onChange({ target: { value: "Second question" } });
    const submit = find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit");
    expect(submit.props.disabled).toBe(false);
    submit.props.onClick();
    newer.resolve(answerResponse("NEW_ANSWER"));
    await flushResponse();
    older.resolve(answerResponse("OLD_ANSWER"));
    await flushResponse();

    const renderedAnswer = find(render(), (element) => element.props.className === "daily-photo-answer");
    expect(elements(renderedAnswer).some((element) => element.props.children === "NEW_ANSWER")).toBe(true);
    expect(elements(renderedAnswer).some((element) => element.props.children === "OLD_ANSWER")).toBe(false);
  });

  it("does not let an old error clear the loading state of the current question", async () => {
    const older = deferredResponse();
    const newer = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise));
    const render = renderWorkspace();
    find(render(), (element) => element.type === "textarea").props.onChange({ target: { value: "First question" } });
    find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.onClick();
    find(render(), (element) => element.type === "textarea").props.onChange({ target: { value: "Second question" } });
    find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.onClick();
    older.resolve(new Response(JSON.stringify({ error: "OLD_ERROR" }), { status: 500 }));
    await flushResponse();

    expect(find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.disabled).toBe(true);
    expect(elements(render()).some((element) => element.props.role === "alert")).toBe(false);
    newer.resolve(answerResponse("CURRENT_ANSWER"));
    await flushResponse();
    expect(find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.disabled).toBe(false);
  });

  it("discards an answer after its photo has been deselected", async () => {
    const pending = deferredResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const render = renderWorkspace();
    find(render(), (element) => element.type === "textarea").props.onChange({ target: { value: "Inspect the roof" } });
    find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.onClick();
    find(render(), (element) => element.type === "button" && element.props["aria-pressed"] === true).props.onClick();
    pending.resolve(answerResponse("DESELECTED_PHOTO_ANSWER"));
    await flushResponse();

    expect(elements(render()).some((element) => element.props.className === "daily-photo-answer")).toBe(false);
    expect(find(render(), (element) => element.props.className === "button primary daily-photo-ai-submit").props.disabled).toBe(true);
  });
});
