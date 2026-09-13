import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/package-project-atlas.mjs <extracted Atlas 3.2 directory>");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestBytes = await readFile(path.join(source, "manifest.json"));
if (sha(manifestBytes) !== "0b90daba4cb11f4f2e4155525f515b0b7d69d1a6e499141053b6c5fabd7fc601") throw new Error("Not the frozen Atlas 3.2 manifest");
const sourceManifest = JSON.parse(manifestBytes);
const sourceFiles = new Map(sourceManifest.files.map((file) => [file.path, file]));
for (const file of sourceFiles.values()) {
  if (path.isAbsolute(file.path) || file.path.split("/").includes("..")) throw new Error("Unsafe source path");
  const filename = path.join(source, file.path);
  if (!(await lstat(filename)).isFile()) throw new Error(`Not a regular file: ${file.path}`);
  const bytes = await readFile(filename);
  if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new Error(`Source verification failed: ${file.path}`);
}

function decodeData(bytes) {
  const match = bytes.toString().match(/ALBUM_ACCEPT\([^,]+,\s*("[^"]+")/);
  if (!match) throw new Error("Unexpected packed data format");
  return JSON.parse(gunzipSync(Buffer.from(JSON.parse(match[1]), "base64")));
}
const selected = new Set(["index.html", "assets/album.css", "assets/album.js", "assets/core.js", "assets/worker_bundle.js"]);
for (const name of ["catalog", "public_nav", "source_packages", "index", "hierarchy", "sources", "documents", "issues"]) selected.add(`data/${name}.js`);
for (const filename of sourceFiles.keys()) if (/^(blocks|pages)\/[^/]+\.js$/.test(filename)) selected.add(filename);
function collectLinks(value) {
  if (typeof value === "string" && /^(sources|documents)\//.test(value)) selected.add(value);
  else if (Array.isArray(value)) value.forEach(collectLinks);
  else if (value && typeof value === "object") Object.values(value).forEach(collectLinks);
}
for (const name of ["sources", "documents"]) collectLinks(decodeData(await readFile(path.join(source, `data/${name}.js`))));

const output = "src/assets/project-models/troitsk-b24-atlas-3-2";
await mkdir(output, { recursive: true });
const files = {};
const mime = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", csv: "text/csv; charset=utf-8", json: "application/json; charset=utf-8", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
for (const name of [...selected].sort()) {
  const file = sourceFiles.get(name);
  if (!file) throw new Error(`Runtime dependency missing: ${name}`);
  const extension = path.extname(name).slice(1);
  if (extension === "svg") mime.svg = "image/svg+xml";
  if (!mime[extension]) throw new Error(`Unsupported runtime file: ${name}`);
  const bytes = await readFile(path.join(source, name));
  const compressed = ["html", "js", "css", "json", "csv"].includes(extension);
  const stored = compressed ? gzipSync(bytes, { level: 9 }) : bytes;
  const storage = `${file.sha256}.${extension}${compressed ? ".gz" : ""}`;
  await writeFile(path.join(output, storage), stored);
  files[name] = { sha256: file.sha256, bytes: file.bytes, storage, storedBytes: stored.length, compressed, contentType: mime[extension] };
}
const manifest = {
  release: "3.2", sourceRelease: sourceManifest.run_id, sourceManifestSha256: sha(manifestBytes),
  sourceFilesVerified: sourceFiles.size + 1, sourceArchiveSha256: null,
  sourceNote: "User-provided extracted release; all source files verified, original ZIP bytes unavailable.",
  geometryBlocks: sourceManifest.counts.geometry_blocks, activePhysicalObjects: sourceManifest.counts.active_physical_objects,
  geometryChanges: 0, files
};
await writeFile(`${output}.manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ verifiedSourceFiles: manifest.sourceFilesVerified, runtimeFiles: selected.size, packagedBytes: Object.values(files).reduce((sum, file) => sum + file.storedBytes, 0), geometryChanges: 0 }));
