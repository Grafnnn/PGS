import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, lstat, open } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { atlasRelease } from "./atlas-releases.mjs";

const source = process.argv[2];
if (!source) throw new Error("Provide the verified Atlas release directory");
const release = atlasRelease(process.argv[3]);
const { root } = release;
const sha = (data) => createHash("sha256").update(data).digest("hex");
const manifestBytes = await readFile(path.join(source, "MANIFEST.json"));
const manifest = JSON.parse(manifestBytes);
if (manifest.release !== release.release || manifest.files.length !== release.files - 1) throw new Error("Wrong release");
const mime = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json", svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", pdf: "application/pdf", glb: "model/gltf-binary", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
await mkdir(root, { recursive: true });
const files = {}, blobs = new Map(), packs = {};
let part = 0, offset = 0, handle, packHash;
async function closePack() {
  if (!handle) return;
  await handle.close();
  packs[`part-${part}.bin`] = { bytes: offset, sha256: packHash.digest("hex") };
}
const sourceFiles = manifest.files.map(file => ({ ...file, bytes: release.version === "v8" ? file.size : file.bytes }));
for (const file of [...sourceFiles, { path: "MANIFEST.json", bytes: manifestBytes.length, sha256: sha(manifestBytes) }]) {
  if (path.isAbsolute(file.path) || file.path.split("/").some(p => !p || p === ".." || p === ".") || file.path.includes("\\")) throw new Error("Unsafe path");
  const filename = path.join(source, file.path);
  if (!(await lstat(filename)).isFile()) throw new Error("Non-file payload");
  const data = await readFile(filename);
  if (data.length !== file.bytes || sha(data) !== file.sha256) throw new Error(`Invalid payload: ${file.path}`);
  let blob = blobs.get(file.sha256);
  if (!blob) {
    // Deduplicate identical payloads; keep every original URL and every source byte.
    const gzip = gzipSync(data, { level: 9 });
    const compress = !/\.(pdf|glb)$/i.test(file.path) && gzip.length < data.length * 0.95;
    const stored = compress ? gzip : data;
    if (!handle || (offset && offset + stored.length > 32 * 1024 * 1024)) {
      await closePack();
      part++; offset = 0;
      handle = await open(path.join(root, `part-${part}.bin`), "w");
      packHash = createHash("sha256");
    }
    await handle.write(stored, 0, stored.length, offset);
    packHash.update(stored);
    blob = { pack: `part-${part}.bin`, offset, storedBytes: stored.length, compressed: compress };
    offset += stored.length;
    blobs.set(file.sha256, blob);
  }
  files[file.path] = { ...blob, bytes: data.length, sha256: file.sha256, contentType: mime[path.extname(file.path).slice(1)] ?? "application/octet-stream" };
}
await closePack();
await writeFile(path.join(root, "index.json"), JSON.stringify({ release: manifest.release, archiveSha256: release.sha256, sourceManifestSha256: sha(manifestBytes), packs, files }));
console.log(JSON.stringify({ release: manifest.release, files: Object.keys(files).length, unique: blobs.size, packs: part, storedBytes: Object.values(packs).reduce((n, p) => n + p.bytes, 0) }));
