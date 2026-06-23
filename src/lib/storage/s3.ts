import { createHash, createHmac } from "node:crypto";
import { getEnv } from "@/lib/env";
import type { StorageProvider } from "./types";

const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

export class StorageConfigurationError extends Error {}

type S3Method = "PUT" | "GET" | "DELETE" | "HEAD";

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function encodeKey(key: string) {
  return key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function getS3Config() {
  const env = getEnv();
  const missing = [
    ["S3_BUCKET", env.S3_BUCKET],
    ["S3_REGION", env.S3_REGION],
    ["S3_ACCESS_KEY_ID", env.S3_ACCESS_KEY_ID],
    ["S3_SECRET_ACCESS_KEY", env.S3_SECRET_ACCESS_KEY]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) throw new StorageConfigurationError(`Missing S3 configuration: ${missing.join(", ")}`);
  return {
    bucket: env.S3_BUCKET as string,
    region: env.S3_REGION as string,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    accessKeyId: env.S3_ACCESS_KEY_ID as string,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY as string
  };
}

function objectUrl(storageKey: string) {
  const config = getS3Config();
  const encodedKey = encodeKey(storageKey);
  if (config.forcePathStyle || config.endpoint) {
    const base = (config.endpoint ?? `https://s3.${config.region}.amazonaws.com`).replace(/\/$/, "");
    return new URL(`${base}/${config.bucket}/${encodedKey}`);
  }
  return new URL(`https://${config.bucket}.s3.${config.region}.amazonaws.com/${encodedKey}`);
}

function signRequest(method: S3Method, url: URL, body: Buffer, contentType?: string) {
  const config = getS3Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = method === "PUT" ? sha256(body) : EMPTY_SHA256;
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (contentType) headers["content-type"] = contentType;

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames.map((name) => `${name}:${headers[name]}\n`).join("");
  const signedHeaders = sortedHeaderNames.join(";");
  const canonicalRequest = [method, url.pathname, url.searchParams.toString(), canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  };
}

async function request(method: S3Method, storageKey: string, body: Buffer = Buffer.alloc(0), contentType?: string) {
  const url = objectUrl(storageKey);
  const bodyInit = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const response = await fetch(url, {
    method,
    headers: signRequest(method, url, body, contentType),
    body: method === "PUT" ? bodyInit : undefined,
    signal: controller.signal
  }).finally(() => clearTimeout(timeout));
  if (!response.ok && !(method === "DELETE" && response.status === 404)) {
    throw new Error(`S3 ${method} failed with HTTP ${response.status}`);
  }
  return response;
}

export const s3StorageProvider: StorageProvider = {
  name: "s3",
  async write(storageKey, bytes) {
    await request("PUT", storageKey, Buffer.from(bytes), "application/octet-stream");
    return { storageKey };
  },
  async read(storageKey) {
    const response = await request("GET", storageKey);
    return Buffer.from(await response.arrayBuffer());
  },
  async delete(storageKey) {
    await request("DELETE", storageKey);
  },
  async checkWritable() {
    try {
      await request("HEAD", ".health");
      return true;
    } catch {
      return false;
    }
  }
};
