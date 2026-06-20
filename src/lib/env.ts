import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().url().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  OPENAI_API_KEY: z.string().optional(),
  AUTH_REQUIRED: z.enum(["true", "false"]).default("false"),
  SESSION_SECRET: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["console", "gmail", "smtp"]).default("console"),
  EMAIL_FROM: z.string().optional(),
  GITHUB_REPO: z.string().default("Grafnnn/PGS"),
  GITHUB_CONNECTOR_MODE: z.enum(["disabled", "read_only", "enabled"]).default("read_only"),
  GOOGLE_DRIVE_CONNECTOR_MODE: z.enum(["disabled", "read_only", "enabled"]).default("disabled"),
  GMAIL_CONNECTOR_MODE: z.enum(["disabled", "read_only", "enabled"]).default("disabled"),
  GOOGLE_CALENDAR_CONNECTOR_MODE: z.enum(["disabled", "read_only", "enabled"]).default("disabled"),
  RENDER_CONNECTOR_MODE: z.enum(["disabled", "read_only", "enabled"]).default("disabled"),
  VERCEL_CONNECTOR_MODE: z.enum(["disabled", "read_only", "enabled"]).default("disabled"),
  OPENAI_CONNECTOR_MODE: z.enum(["disabled", "read_only", "enabled"]).default("disabled"),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(60_000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().positive().default(8),
  RESET_RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(15 * 60_000),
  RESET_RATE_LIMIT_MAX: z.coerce.number().positive().default(5),
  DEMO_ADMIN_EMAIL: z.string().email().default("demo@pgs.local"),
  DEMO_ADMIN_PASSWORD: z.string().default("demo-password-change-me"),
  FIRST_ADMIN_EMAIL: z.string().email().optional(),
  FIRST_ADMIN_PASSWORD: z.string().optional(),
  FIRST_ADMIN_NAME: z.string().default("PGS Admin"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(250).default(50),
  UPLOAD_DIR: z.string().default("./storage/uploads"),
  UPLOAD_STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
  S3_PUBLIC_BASE_URL: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  GIT_SHA: z.string().optional()
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}

export function getEnvStatus() {
  const env = getEnv();
  const production = env.NODE_ENV === "production";
  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (production && env.AUTH_REQUIRED !== "true") missing.push("AUTH_REQUIRED=true");
  if (production && !env.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (production && env.UPLOAD_STORAGE_PROVIDER === "s3") {
    if (!env.S3_BUCKET) missing.push("S3_BUCKET");
    if (!env.S3_REGION) missing.push("S3_REGION");
    if (!env.S3_ACCESS_KEY_ID) missing.push("S3_ACCESS_KEY_ID");
    if (!env.S3_SECRET_ACCESS_KEY) missing.push("S3_SECRET_ACCESS_KEY");
  }

  return {
    production,
    authRequired: env.AUTH_REQUIRED === "true" || production,
    authMode: env.AUTH_REQUIRED === "true" || production ? "db-session" : "dev-fallback",
    aiConfigured: Boolean(env.OPENAI_API_KEY),
    appUrl: env.APP_URL,
    emailProvider: env.EMAIL_PROVIDER,
    uploadProvider: env.UPLOAD_STORAGE_PROVIDER,
    maxUploadMb: env.MAX_UPLOAD_MB,
    appVersion: process.env.npm_package_version ?? "0.1.0",
    gitSha: env.GIT_SHA,
    missing
  };
}
