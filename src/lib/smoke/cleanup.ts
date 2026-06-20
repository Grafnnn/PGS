export const SMOKE_PROJECT_ID = "project-smoke";
export const SMOKE_PREFIX = "SMOKE-";
export const SMOKE_EMAIL_FRAGMENT = "smoke+";

export function assertSmokeCleanupConfirm(value: string | undefined) {
  if (value !== SMOKE_PROJECT_ID) {
    throw new Error(`Refusing smoke cleanup. Set SMOKE_CLEANUP_CONFIRM=${SMOKE_PROJECT_ID}.`);
  }
}

export function isSmokeMarkedText(value: string | null | undefined) {
  return Boolean(value?.startsWith(SMOKE_PREFIX));
}

export function isSmokeEmail(value: string | null | undefined) {
  return Boolean(value?.toLowerCase().includes(SMOKE_EMAIL_FRAGMENT));
}

export function assertSmokeMutationTarget(projectId: string, appEnv = process.env.APP_ENV ?? process.env.NODE_ENV) {
  if (projectId !== SMOKE_PROJECT_ID) throw new Error(`Mutation smoke is only allowed against ${SMOKE_PROJECT_ID}.`);
  if (appEnv === "production") throw new Error("Mutation smoke is blocked when APP_ENV or NODE_ENV is production.");
}
