import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { atlasRelease } from "./atlas-releases.mjs";
import { rebuildAtlasManifest } from "./atlas-overlay-manifest.mjs";

const release = atlasRelease(process.argv[2]);
const archive = release.base ? atlasRelease(release.base) : release;
const { root } = release;
const run = promisify(execFile);
async function hashFile(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
async function verifiedCache() {
  try {
    const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
    const sealed = release.base
      ? index.sourceManifestSha256 === release.manifestSha256
      : index.archiveSha256 === archive.sha256 &&
        (!release.manifestSha256 || index.sourceManifestSha256 === release.manifestSha256);
    if (!sealed || index.release !== release.release || Object.keys(index.files).length !== release.files) return false;
    for (const [name, pack] of Object.entries(index.packs)) {
      if (!/^part-\d+\.bin$/.test(name) || await hashFile(path.join(root, name)) !== pack.sha256) return false;
    }
    return true;
  } catch { return false; }
}
if (await verifiedCache()) {
  console.log(`${release.release}: verified local release packs`);
} else {
  const temp = await mkdtemp(path.join(tmpdir(), `pgs-atlas-r25${release.version}-`));
  try {
    console.log(`${release.release}: downloading sealed public source ${archive.release}`);
    const response = await fetch(archive.url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Atlas download failed: ${response.status}`);
    const zip = path.join(temp, "release.zip"), hash = createHash("sha256");
    let bytes = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > archive.bytes) return callback(new Error("Atlas archive exceeds sealed size"));
      hash.update(chunk); callback(null, chunk);
    } }), createWriteStream(zip));
    if (bytes !== archive.bytes || hash.digest("hex") !== archive.sha256) throw new Error("Atlas archive integrity mismatch");
    const extracted = path.join(temp, "source");
    if (archive.utf8Zip && process.platform === "darwin") {
      // Apple's unzip can misdecode UTF-8 entry names in ZIPs that use the UTF-8 flag.
      await mkdir(extracted);
      await run("/usr/bin/tar", ["-xf", zip, "-C", extracted], { maxBuffer: 1024 * 1024 });
    } else {
      const env = archive.utf8Zip ? { ...process.env, LC_ALL: "C.UTF-8" } : process.env;
      await run("unzip", ["-q", zip, "-d", extracted], { maxBuffer: 1024 * 1024, env });
    }
    const source = path.join(extracted, archive.directory);
    if (release.base) {
      // Materialize a complete new release; no runtime cross-version asset requests.
      const replacements = release.rebuildBaseManifest ? new Map() : null;
      for (const name of release.overlay) {
        if (path.isAbsolute(name) || name.split("/").some(part => !part || part === "." || part === "..") || name.includes("\\")) {
          throw new Error("Unsafe Atlas overlay path");
        }
        const from = release.overlayFrom?.[name] ?? release.version;
        const target = path.join(source, name);
        if (replacements && name === "MANIFEST.json") throw new Error("Cannot overlay a reconstructed Atlas manifest");
        if (replacements?.has(name)) throw new Error("Duplicate Atlas overlay path: " + name);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(path.join("scripts", "atlas-deltas", from, name), target);
        if (replacements) {
          const bytes = await readFile(target);
          replacements.set(name, { bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
        }
      }
      if (replacements) {
        // Preserve the author's record order; the packer verifies the exact new manifest digest.
        const filename = path.join(source, "MANIFEST.json");
        const original = await readFile(filename);
        if (createHash("sha256").update(original).digest("hex") !== archive.manifestSha256) {
          throw new Error("Atlas baseline manifest integrity mismatch");
        }
        await writeFile(filename, rebuildAtlasManifest(JSON.parse(original), release.release, replacements, release.manifestAppend));
      }
    }
    if (release.sourceFileManifest) {
      // Project-authored reports are retained verbatim; the packer consumes a separate, pinned manifest.
      const { name, sha256 } = release.sourceFileManifest;
      const report = await readFile(path.join(source, name));
      if (createHash("sha256").update(report).digest("hex") !== sha256) throw new Error("Atlas source file manifest integrity mismatch");
      const files = Object.entries(JSON.parse(report).files).map(([path, { bytes, sha256 }]) => ({ path, bytes, sha256 }));
      files.push({ path: name, bytes: report.length, sha256 });
      files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
      await writeFile(path.join(source, "MANIFEST.json"), JSON.stringify({ release: release.release, files }) + "\n", { flag: "wx" });
    }
    const { stdout } = await run(process.execPath, ["scripts/package-atlas-r25v5.mjs", source, release.version], { maxBuffer: 1024 * 1024 });
    console.log(stdout.trim());
    if (!await verifiedCache()) throw new Error("Atlas packaging integrity mismatch");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
