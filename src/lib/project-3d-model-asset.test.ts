import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { getProject3dModel } from "@/lib/project-3d-model";
import manifest from "@/assets/project-models/troitsk-b24-r10.manifest.json";

it("reconstructs the exact R10 portable source from the web package and deferred assets", async () => {
  const model = getProject3dModel({ id: "cmteg9g33000for4oc06rko5a" });
  const compressed = await readFile(model!.assetPath);
  const source = gunzipSync(compressed);
  const sha = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
  expect(source.byteLength).toBe(manifest.htmlBytes);
  expect(sha(source)).toBe(manifest.htmlSha256);
  expect(compressed.byteLength).toBeLessThan(8_000_000);
  expect(source.indexOf("window.R06_PORTABLE=true")).toBeGreaterThan(0);
  const mimes: Record<string, string> = { webp: "image/webp", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", pdf: "application/pdf", json: "application/json", csv: "text/csv", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  const webStyle = await readFile("scripts/project-model-web.css", "utf8");
  expect(sha(webStyle)).toBe(manifest.webStyleSha256);
  const html = source.toString().replace(`<style id="pgs-model-web-style">${webStyle}</style>`, "");
  const start = html.indexOf("const URI=");
  const end = html.indexOf(";const AMAP=", start);
  const uris: string[] = JSON.parse(html.slice(start + "const URI=".length, end));
  expect(uris.some((uri) => uri.startsWith("data:application/pdf;base64,"))).toBe(true);
  expect(uris.some((uri) => uri.startsWith("data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"))).toBe(true);
  for (const asset of manifest.assets) {
    expect(asset.url).toMatch(/^\/model-assets\/troitsk-b24-r10\/[a-f0-9]{64}\.[a-z]+$/);
    const bytes = await readFile(`public${asset.url}`);
    expect(asset.url).toMatch(/\.(png|jpg|webp|svg)$/);
    expect(bytes.length).toBe(asset.bytes);
    expect(sha(bytes)).toBe(asset.sha256);
    expect(uris[asset.index]).toBe(asset.url);
    uris[asset.index] = `data:${mimes[asset.url.split(".").pop()!]};base64,${bytes.toString("base64")}`;
  }
  // Exact round-trip also verifies geometry, module mappings, warnings and scripts.
  const original = html.slice(0, start) + "const URI=" + JSON.stringify(uris) + html.slice(end);
  expect(Buffer.byteLength(original)).toBe(manifest.sourceBytes);
  expect(sha(original)).toBe(manifest.sourceSha256);
}, 20_000);
