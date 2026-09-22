import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import { atlasRelease } from "./atlas-releases.mjs";

const source = "src/assets/atlas-ui/20260922";
const root = "src/assets/project-models/troitsk-r25v8-ui1";
const base = JSON.parse(await readFile(`${atlasRelease("v8").root}/index.json`, "utf8"));
if (base.archiveSha256 !== atlasRelease("v8").sha256) throw new Error("Wrong V8 base");
const receipt = JSON.parse(await readFile(`${source}/integrity.json`, "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const files = Object.fromEntries(Object.entries(base.files).map(([name, asset]) => [name, { ...asset, source: "v8" }]));
const chunks = [];
let offset = 0;
const mime = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", png: "image/png", svg: "image/svg+xml", json: "application/json" };
function append(name, bytes, contentType) {
  const compressed = gzipSync(bytes, { level: 9 });
  const useGzip = compressed.length < bytes.length * 0.95;
  const stored = useGzip ? compressed : bytes;
  files[name] = { pack: "ui.bin", offset, storedBytes: stored.length, bytes: bytes.length,
    compressed: useGzip, sha256: sha(bytes), contentType };
  chunks.push(stored); offset += stored.length;
}
for (const file of receipt.files) {
  if (!/^(?:[A-Za-z0-9_-]+\.html|assets\/[A-Za-z0-9_./-]+)$/.test(file.path)
    || file.path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Non-UI override");
  const filename = path.join(source, file.path);
  if (!(await lstat(filename)).isFile()) throw new Error("Not a regular file");
  const bytes = await readFile(filename);
  if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new Error(`UI integrity mismatch: ${file.path}`);
  append(file.path, bytes, mime[path.extname(file.path).slice(1)] ?? "text/plain; charset=utf-8");
}
const baseRelease = base.files["CURRENT_RELEASE.json"];
const pack = await readFile(path.join(atlasRelease("v8").root, baseRelease.pack));
const stored = pack.subarray(baseRelease.offset, baseRelease.offset + baseRelease.storedBytes);
const metadata = JSON.parse(baseRelease.compressed ? gunzipSync(stored) : stored);
// Fresh UI evidence stays separate from inherited engineering checks.
metadata.release = "R25_V8_UI_20260922";
metadata.base_release = "R25_FINAL_V8";
metadata.base_zip_sha256 = atlasRelease("v8").sha256;
metadata.title = "3D Atlas - interface update 2026-09-22";
metadata.ui_revision = "20260922-3";
metadata.ui_release_notes = "UI_RELEASE.json";
append("CURRENT_RELEASE.json", Buffer.from(JSON.stringify(metadata, null, 2)), mime.json);
append("UI_RELEASE.json", Buffer.from(JSON.stringify({ release: metadata.release, base_release: metadata.base_release,
  source_ui_revision: metadata.ui_revision, base_archive_sha256: metadata.base_zip_sha256,
  engineering_data_changed: false, geometry_changed: false, new_engineering_approval: false,
  changes: ["Global search", "Compact navigation and tools", "Light and dark themes", "Responsive inspector", "Approved logo"],
  limitations: metadata.limitations, files: receipt.files }, null, 2)), mime.json);
append("MANIFEST.json", Buffer.from(JSON.stringify({ release: metadata.release, base: metadata.base_release,
  files: Object.entries(files).filter(([name]) => name !== "MANIFEST.json").map(([name, asset]) => ({ path: name, size: asset.bytes, sha256: asset.sha256 })) })), mime.json);
await mkdir(root, { recursive: true });
const uiPack = Buffer.concat(chunks);
await writeFile(`${root}/ui.bin`, uiPack);
await writeFile(`${root}/index.json`, JSON.stringify({ release: metadata.release,
  baseArchiveSha256: base.archiveSha256, files, uiPackSha256: sha(uiPack) }));
console.log(JSON.stringify({ release: metadata.release, overrides: receipt.files.length, storedBytes: uiPack.length,
  inheritedFiles: Object.values(files).filter(asset => asset.source === "v8").length }));
