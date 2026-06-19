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
const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? "development";
const allowProductionMutation = process.env.SMOKE_ALLOW_PRODUCTION_MUTATION === "true";
const smokeRunId = process.env.SMOKE_RUN_ID ?? `SMOKE-${Date.now()}`;

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
  if (appEnv === "production" && !allowProductionMutation) {
    record({ status: "FAIL", name: "mutation safety", url, reason: "Refusing mutation smoke in production" });
    return;
  }
  const form = new FormData();
  form.append("category", "прочее");
  form.append("file", new Blob([Buffer.from(`%PDF-1.4 ${smokeRunId}`)], { type: "application/pdf" }), `${smokeRunId}.pdf`);
  const response = await fetch(url, { method: "POST", headers: { cookie: sessionCookie }, body: form });
  record({ status: response.ok ? "PASS" : "FAIL", name: "document upload", url, reason: `HTTP ${response.status}` });
  if (!response.ok) return;
  const data = (await response.json()) as { item?: { id: string } };
  const documentId = data.item?.id;
  if (!documentId) {
    record({ status: "FAIL", name: "document upload parse", url, reason: "No document id returned" });
    return;
  }
  await checkGet("document download", `/api/projects/${projectId}/documents/${documentId}/download`, [200]);

  const versionForm = new FormData();
  versionForm.append("file", new Blob([Buffer.from(`%PDF-1.4 ${smokeRunId} v2`)], { type: "application/pdf" }), `${smokeRunId}-v2.pdf`);
  const versionUrl = `${appUrl}/api/projects/${projectId}/documents/${documentId}/versions`;
  const versionResponse = await fetch(versionUrl, { method: "POST", headers: { cookie: sessionCookie }, body: versionForm });
  record({ status: versionResponse.ok ? "PASS" : "FAIL", name: "document version upload", url: versionUrl, reason: `HTTP ${versionResponse.status}` });
  if (versionResponse.ok) {
    const versionData = (await versionResponse.json()) as { item?: { id: string } };
    if (versionData.item?.id) await checkGet("document version download", `/api/projects/${projectId}/documents/${documentId}/versions/${versionData.item.id}/download`, [200]);
  }

  const deleteUrl = `${appUrl}/api/projects/${projectId}/documents/${documentId}`;
  const deleteResponse = await fetch(deleteUrl, { method: "DELETE", headers: { cookie: sessionCookie } });
  record({ status: deleteResponse.ok ? "PASS" : "FAIL", name: "document delete", url: deleteUrl, reason: `HTTP ${deleteResponse.status}` });
}

async function main() {
  await checkGet("health", "/api/health", [200, 503]);
  await checkGet("login page", "/login");
  await login();
  await checkGet("auth me", "/api/auth/me", sessionCookie ? [200] : [200, 401, 503]);
  await checkGet("project page", `/projects/${projectId}`, [200, 500]);
  await checkGet("projects api", "/api/projects", [200, 403, 503]);
  await checkGet("audit api", `/api/projects/${projectId}/audit`, [200, 403, 503]);
  await checkGet("documents api", `/api/projects/${projectId}/documents`, [200, 403, 503]);
  await checkGet("project export", `/api/projects/${projectId}/export/json`, [200, 403, 503]);
  await checkGet("audit export", `/api/projects/${projectId}/audit/export/json`, [200, 403, 503]);
  record({ status: "SKIP", name: "excel preview", url: `${appUrl}/api/projects/${projectId}/imports/budget/preview`, reason: "read-only smoke; run import fixture flow separately" });
  await optionalDocumentUpload();

  const failed = results.filter((result) => result.status === "FAIL");
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
