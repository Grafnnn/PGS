import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PWA production packaging", () => {
  it("ships the service worker and offline fallback in the runtime image", () => {
    expect(existsSync("public/sw.js")).toBe(true);
    expect(existsSync("public/offline.html")).toBe(true);
    expect(readFileSync("Dockerfile", "utf8")).toContain("COPY --from=builder /app/public ./public");
  });
});
