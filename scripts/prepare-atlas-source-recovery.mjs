import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";

const source = "src/assets/atlas-ui/20260922-sources";
const root = "src/assets/project-models/troitsk-r25v8-ui2";
const previousRoot = "src/assets/project-models/troitsk-r25v8-ui1";
const base = JSON.parse(await readFile(`${previousRoot}/index.json`, "utf8"));
const receipt = JSON.parse(await readFile(`${source}/integrity.json`, "utf8"));
const registry = JSON.parse(await readFile(`${source}/assets/source-recovery/registry.json`, "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const files = Object.fromEntries(Object.entries(base.files).map(([name, asset]) => [name, { ...asset, source: asset.source || "v8-ui1" }]));
const chunks = [];
let offset = 0;
const mime = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", json: "application/json", jpg: "image/jpeg" };
function append(name, bytes, contentType) {
  const compressed = gzipSync(bytes, { level: 9 });
  const useGzip = compressed.length < bytes.length * 0.95;
  const stored = useGzip ? compressed : bytes;
  files[name] = { pack: "ui.bin", offset, storedBytes: stored.length, bytes: bytes.length,
    compressed: useGzip, sha256: sha(bytes), contentType };
  chunks.push(stored); offset += stored.length;
}
for (const file of receipt.files) {
  if (!/^(?:index\.html|assets\/[A-Za-z0-9_./-]+)$/.test(file.path)
    || file.path.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid recovery override");
  const filename = path.join(source, file.path);
  if (!(await lstat(filename)).isFile()) throw new Error("Not a regular file");
  const bytes = await readFile(filename);
  if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new Error(`Recovery integrity mismatch: ${file.path}`);
  append(file.path, bytes, mime[path.extname(file.path).slice(1)] ?? "text/plain; charset=utf-8");
}
append("assets/source-recovery/registry.js", Buffer.from(`window.AtlasSourceRecoveryData=${JSON.stringify(registry)};\n`), mime.js);
for (const item of Object.values(registry.sources)) {
  if (!files[item.image]) throw new Error(`Missing recovery image: ${item.image}`);
  const [pdf, fragment] = item.pdf_url.split("#");
  if (!files[pdf] || files[pdf].sha256 !== item.document_sha256 || fragment !== `page=${item.pdf_page}`
    || item.pdf_page < 1 || item.pdf_page > item.pdf_pages) throw new Error(`Invalid recovery PDF: ${item.key}`);
}
const previousRelease = base.files["CURRENT_RELEASE.json"];
const pack = await readFile(path.join(previousRoot, previousRelease.pack));
const stored = pack.subarray(previousRelease.offset, previousRelease.offset + previousRelease.storedBytes);
const metadata = JSON.parse(previousRelease.compressed ? gunzipSync(stored) : stored);
metadata.release = "R25_V8_UI_20260922_SOURCEFIX";
metadata.ui_revision = "20260922-3-sources-1";
metadata.source_recovery = registry.counts;
append("CURRENT_RELEASE.json", Buffer.from(JSON.stringify(metadata, null, 2)), mime.json);
append("UI_RELEASE.json", Buffer.from(JSON.stringify({ release: metadata.release, ui_revision: metadata.ui_revision,
  base_release: "R25_FINAL_V8", source_recovery: registry.counts, geometry_changed: false,
  engineering_data_changed: false, source_navigation_changed: true, new_engineering_approval: false,
  limitations: metadata.limitations, files: receipt.files }, null, 2)), mime.json);
// The new immutable scope must precache its own UI and source resolver together.
const workerAsset = base.files["service-worker.js"];
const workerRoot = workerAsset.source === "v8" ? "src/assets/project-models/troitsk-r25v8" : previousRoot;
const workerPack = await readFile(path.join(workerRoot, workerAsset.pack));
const workerStored = workerPack.subarray(workerAsset.offset, workerAsset.offset + workerAsset.storedBytes);
let worker = (workerAsset.compressed ? gunzipSync(workerStored) : workerStored).toString();
const coreMatch = worker.match(/const CORE=(\[[^;]+\]);/);
if (!coreMatch) throw new Error("Unexpected offline worker format");
const core = JSON.parse(coreMatch[1].replaceAll("'", '"'));
const html = await readFile(`${source}/index.html`, "utf8");
for (const match of html.matchAll(/(?:src|href)="(assets\/[^"]+\.(?:js|css))"/g)) {
  if (!core.includes(match[1])) core.push(match[1]);
}
if (core.some(name => !files[name])) throw new Error("Offline core asset missing");
worker = worker.replace(coreMatch[0], `const CORE=${JSON.stringify(core)};`);
append("service-worker.js", Buffer.from(worker), mime.js);
append("assets/offline-manifest.js", Buffer.from(`self.ATLAS_OFFLINE_VERSION=${JSON.stringify(metadata.ui_revision)};\nself.ATLAS_OFFLINE_FILES=${JSON.stringify(Object.keys(files))};\nself.ATLAS_OFFLINE_SIZES=${JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, asset]) => [name, asset.bytes])))};\n`), mime.js);
append("MANIFEST.json", Buffer.from(JSON.stringify({ release: metadata.release,
  files: Object.entries(files).filter(([name]) => name !== "MANIFEST.json").map(([name, asset]) => ({ path: name, size: asset.bytes, sha256: asset.sha256 })) })), mime.json);
await mkdir(root, { recursive: true });
const uiPack = Buffer.concat(chunks);
await writeFile(`${root}/ui.bin`, uiPack);
await writeFile(`${root}/index.json`, JSON.stringify({ release: metadata.release, files, uiPackSha256: sha(uiPack) }));
console.log(JSON.stringify({ release: metadata.release, counts: registry.counts, bytes: uiPack.length }));
