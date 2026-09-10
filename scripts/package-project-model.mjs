import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

// Publish only the supplied portable viewer, not the full working archive.
const input = process.argv[2];
assert(input, "Usage: node scripts/package-project-model.mjs <R10 portable HTML>");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = await readFile(input);
assert.equal(sha(source), "466259334b6d4e251035ba9e4dfd14e071062edf046ec4a65f3a08e99f6afdd7");
const html = source.toString("utf8");
const start = html.indexOf("const URI=");
const end = html.indexOf(";const AMAP=", start);
assert(start > 0 && end > start);
const uris = JSON.parse(html.slice(start + "const URI=".length, end));
const extensions = {
  "image/webp": "webp", "image/svg+xml": "svg", "image/png": "png", "image/jpeg": "jpg",
  "application/pdf": "pdf", "application/json": "json", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx"
};
const assetDir = "public/model-assets/troitsk-b24-r10";
const modelDir = "src/assets/project-models";
await mkdir(assetDir, { recursive: true });
await mkdir(modelDir, { recursive: true });
const assets = [];
const webUris = [];
for (const [index, uri] of uris.entries()) {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(uri);
  assert(match && extensions[match[1]], "Unsupported portable asset");
  // Keep document downloads as data URIs: the sandbox has an opaque origin,
  // which would ignore download filenames on same-host HTTP document links.
  if (!match[1].startsWith("image/")) { webUris.push(uri); continue; }
  const bytes = Buffer.from(match[2], "base64");
  const hash = sha(bytes);
  const name = `${hash}.${extensions[match[1]]}`;
  await writeFile(path.join(assetDir, name), bytes);
  const url = `/model-assets/troitsk-b24-r10/${name}`;
  webUris.push(url);
  assets.push({ index, url, sha256: hash, bytes: bytes.length });
}

// Only replace the data-URI table. Geometry, module mappings and renderer stay exact.
const webStyle = await readFile("scripts/project-model-web.css", "utf8");
const adapter = `<style id="pgs-model-web-style">${webStyle}</style>`;
const webHtml = (html.slice(0, start) + "const URI=" + JSON.stringify(webUris) + html.slice(end)).replace("</head>", adapter + "</head>");
const compressed = gzipSync(webHtml, { level: 9 });
await writeFile(path.join(modelDir, "troitsk-b24-r10.html.gz"), compressed);
const manifest = {
  revision: "R10 local", date: "2026-09-10", sourceFile: path.basename(input),
  sourceBytes: source.length, sourceSha256: sha(source),
  htmlBytes: Buffer.byteLength(webHtml), htmlSha256: sha(webHtml), gzipBytes: compressed.length,
  geometryAndRendererUnchanged: true, webStyleSha256: sha(webStyle), assets
};
const manifestPath = path.join(modelDir, "troitsk-b24-r10.manifest.json");
const previous = await readFile(manifestPath, "utf8").then(JSON.parse).catch((error) => { if (error.code === "ENOENT") return null; throw error; });
const currentUrls = new Set(assets.map((a) => a.url));
for (const old of previous?.assets ?? []) {
  assert(/^\/model-assets\/troitsk-b24-r10\/[a-f0-9]{64}\.[a-z]+$/.test(old.url));
  if (!currentUrls.has(old.url)) await unlink(`public${old.url}`).catch((error) => { if (error.code !== "ENOENT") throw error; });
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ ...manifest, assets: assets.length }));
