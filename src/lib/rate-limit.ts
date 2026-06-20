type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(input: { key: string; limit: number; windowMs: number; now?: number }): RateLimitResult {
  const now = input.now ?? Date.now();
  const existing = buckets.get(input.key);
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + input.windowMs };
  bucket.count += 1;
  buckets.set(input.key, bucket);

  const allowed = bucket.count <= input.limit;
  return {
    allowed,
    remaining: Math.max(input.limit - bucket.count, 0),
    retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - now) / 1000)
  };
}

export function resetRateLimitBuckets() {
  buckets.clear();
}
