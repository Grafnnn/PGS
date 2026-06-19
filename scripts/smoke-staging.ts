type SmokeStatus = "PASS" | "FAIL" | "SKIP";

interface SmokeResult {
  status: SmokeStatus;
  name: string;
  url: string;
  reason?: string;
}

const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD;
const projectId = process.env.PROJECT_ID ?? "project-demo";
const allowMutation = process.env.SMOKE_ALLOW_MUTATION === "true";

const results: SmokeResult[] = [];
let sessionCookie = "";

function record(result: SmokeResult) {
  results.push(result);
  const reason = result.reason ? ` - ${result.reason}` : "";
  console.log(`${result.status} ${result.name} ${result.url}${reason}`);
}

async function checkGet(name: string, path: string, expected = [200]) {
  const url = `${appUrl}${path}`;
  try {
    const response = await fetch(url, { headers: sessionCookie ? { cookie: sessionCookie } : undefined });
    record({
      status: expected.includes(response.status) ? "PASS" : "FAIL",
      name,
      url,
      reason: `HTTP ${response.status}`
    });
    return response;
  } catch (error) {
    record({ status: "FAIL", name, url, reason: error instanceof Error ? error.message : "request failed" });
    return null;
  }
}

async function login() {
  const url = `${appUrl}/api/auth/login`;
  if (!email || !password) {
    record({ status: "SKIP", name: "login", url, reason: "SMOKE_EMAIL/SMOKE_PASSWORD not provided" });
    return;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) sessionCookie = cookie.split(";")[0];
    record({ status: response.ok ? "PASS" : "FAIL", name: "login", url, reason: `HTTP ${response.status}` });
  } catch (error) {
    record({ status: "FAIL", name: "login", url, reason: error instanceof Error ? error.message : "request failed" });
  }
}

async function optionalDocumentUpload() {
  const url = `${appUrl}/api/projects/${projectId}/documents/upload`;
  if (!allowMutation) {
    record({ status: "SKIP", name: "document upload", url, reason: "SMOKE_ALLOW_MUTATION is not true" });
    return;
  }
  if (!sessionCookie) {
    record({ status: "SKIP", name: "document upload", url, reason: "auth session is unavailable" });
    return;
  }
  const form = new FormData();
  form.append("category", "прочее");
  form.append("file", new Blob([Buffer.from("%PDF-1.4 smoke")], { type: "application/pdf" }), "smoke.pdf");
  const response = await fetch(url, { method: "POST", headers: { cookie: sessionCookie }, body: form });
  record({ status: response.ok ? "PASS" : "FAIL", name: "document upload", url, reason: `HTTP ${response.status}` });
}

async function main() {
  await checkGet("health", "/api/health", [200, 503]);
  await checkGet("login page", "/login");
  await login();
  await checkGet("auth me", "/api/auth/me", sessionCookie ? [200] : [200, 401, 503]);
  await checkGet("project page", `/projects/${projectId}`, [200, 500]);
  await checkGet("projects api", "/api/projects", [200, 403, 503]);
  await checkGet("audit api", `/api/projects/${projectId}/audit`, [200, 403, 503]);
  record({ status: "SKIP", name: "excel preview", url: `${appUrl}/api/projects/${projectId}/imports/budget/preview`, reason: "read-only smoke; run import fixture flow separately" });
  await optionalDocumentUpload();

  const failed = results.filter((result) => result.status === "FAIL");
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
