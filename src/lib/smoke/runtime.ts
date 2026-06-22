import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { CREATE_STAGING_SMOKE_USER_CONFIRM, createOrRotateStagingSmokeUser, type StagingSmokeUserReport } from "./user";

const STAGING_SMOKE_EMAIL = "smoke+staging-runtime@pgs.local";
const AI_SMOKE_PROMPT = "Кратко перечисли 3 риска по демо-проекту на основании доступного контекста. Если данных недостаточно, так и скажи.";

type SmokeStatus = "pass" | "fail" | "skip";

export interface RuntimeSmokeCheck {
  name: string;
  status: SmokeStatus;
  httpStatus?: number;
  detail?: string;
}

export interface RuntimeSmokeResult {
  ok: boolean;
  smokeUser: StagingSmokeUserReport;
  checks: RuntimeSmokeCheck[];
  liveAi: RuntimeSmokeCheck & {
    requested: boolean;
    responseChars?: number;
    providerError?: string;
  };
  secretsPrinted: false;
}

export interface RuntimeSmokeInput {
  baseUrl: string;
  includeLiveAi?: boolean;
  requestId: string;
}

function generateSmokePassword() {
  return `${randomBytes(27).toString("base64url")}A1!`;
}

function cookieFrom(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function check(name: string, response: Response, expected: number[]): RuntimeSmokeCheck {
  return {
    name,
    status: expected.includes(response.status) ? "pass" : "fail",
    httpStatus: response.status
  };
}

function failed(name: string, error: unknown): RuntimeSmokeCheck {
  return {
    name,
    status: "fail",
    detail: error instanceof Error ? error.message.slice(0, 160) : "request failed"
  };
}

async function get(baseUrl: string, path: string, cookie: string, requestId: string) {
  return await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-request-id": requestId,
      ...(cookie ? { cookie } : {})
    }
  });
}

async function postJson(baseUrl: string, path: string, body: unknown, cookie: string, requestId: string) {
  return await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

export async function runStagingSmokeBootstrap(input: RuntimeSmokeInput): Promise<RuntimeSmokeResult> {
  const password = generateSmokePassword();
  const smokeUser = await createOrRotateStagingSmokeUser(prisma, {
    ...process.env,
    APP_ENV: "staging",
    NODE_ENV: "production",
    CREATE_STAGING_SMOKE_USER_CONFIRM,
    SMOKE_EMAIL: STAGING_SMOKE_EMAIL,
    SMOKE_PASSWORD: password
  });

  const checks: RuntimeSmokeCheck[] = [];
  let sessionCookie = "";

  try {
    const login = await postJson(input.baseUrl, "/api/auth/login", { email: STAGING_SMOKE_EMAIL, password }, "", input.requestId);
    sessionCookie = cookieFrom(login);
    checks.push({ ...check("login", login, [200]), detail: sessionCookie ? undefined : "session cookie was not set" });
    if (!sessionCookie) checks[checks.length - 1].status = "fail";
  } catch (error) {
    checks.push(failed("login", error));
  }

  try {
    checks.push(check("auth me", await get(input.baseUrl, "/api/auth/me", sessionCookie, input.requestId), [200]));
  } catch (error) {
    checks.push(failed("auth me", error));
  }

  try {
    checks.push(check("project-demo read", await get(input.baseUrl, "/api/projects/project-demo", sessionCookie, input.requestId), [200]));
  } catch (error) {
    checks.push(failed("project-demo read", error));
  }

  try {
    checks.push(check("project-smoke read", await get(input.baseUrl, "/api/projects/project-smoke", sessionCookie, input.requestId), [200]));
  } catch (error) {
    checks.push(failed("project-smoke read", error));
  }

  try {
    checks.push(check("unauth AI guard", await postJson(input.baseUrl, "/api/projects/project-demo/ai/chat", { prompt: "access-control smoke" }, "", input.requestId), [403]));
  } catch (error) {
    checks.push(failed("unauth AI guard", error));
  }

  try {
    checks.push(
      check(
        "authenticated missing-project AI guard",
        await postJson(input.baseUrl, "/api/projects/project-missing-ai/ai/chat", { prompt: "access-control smoke" }, sessionCookie, input.requestId),
        [404]
      )
    );
  } catch (error) {
    checks.push(failed("authenticated missing-project AI guard", error));
  }

  let liveAi: RuntimeSmokeResult["liveAi"] = {
    name: "live AI smoke",
    status: "skip",
    requested: false,
    detail: "includeLiveAi was not true"
  };

  if (input.includeLiveAi) {
    liveAi = {
      name: "live AI smoke",
      status: "fail",
      requested: true
    };
    try {
      const response = await postJson(input.baseUrl, "/api/projects/project-demo/ai/chat", { prompt: AI_SMOKE_PROMPT }, sessionCookie, input.requestId);
      const body = (await response.json().catch(() => null)) as { ok?: boolean; response?: string; error?: string } | null;
      liveAi = {
        name: "live AI smoke",
        status: response.status === 200 && body?.ok === true && Boolean(body.response) ? "pass" : "fail",
        requested: true,
        httpStatus: response.status,
        responseChars: typeof body?.response === "string" ? body.response.length : 0,
        providerError: body?.error
      };
    } catch (error) {
      liveAi = { ...liveAi, detail: error instanceof Error ? error.message.slice(0, 160) : "request failed" };
    }
  }

  return {
    ok: checks.every((item) => item.status === "pass") && (liveAi.status === "pass" || liveAi.status === "skip"),
    smokeUser,
    checks,
    liveAi,
    secretsPrinted: false
  };
}
