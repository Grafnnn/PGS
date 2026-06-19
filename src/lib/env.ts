import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AUTH_REQUIRED: z.enum(["true", "false"]).default("false"),
  SESSION_SECRET: z.string().optional(),
  DEMO_ADMIN_EMAIL: z.string().email().default("demo@pgs.local"),
  DEMO_ADMIN_PASSWORD: z.string().default("demo-password-change-me"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(250).default(50),
  UPLOAD_DIR: z.string().default("./uploads"),
  UPLOAD_STORAGE_PROVIDER: z.enum(["local", "s3-future"]).default("local")
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

  return {
    production,
    authRequired: env.AUTH_REQUIRED === "true" || production,
    aiConfigured: Boolean(env.OPENAI_API_KEY),
    uploadProvider: env.UPLOAD_STORAGE_PROVIDER,
    maxUploadMb: env.MAX_UPLOAD_MB,
    missing
  };
}
