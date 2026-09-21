import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { atlasRelease } from "./atlas-releases.mjs";

const release = atlasRelease(process.argv[2]);
const { sha256: expected, url, root } = release;
const run = promisify(execFile);
async function hashFile(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}
async function verifiedCache() {
  try {
    const index = JSON.parse(await readFile(path.join(root, "index.json"), "utf8"));
    if (index.archiveSha256 !== expected || Object.keys(index.files).length !== release.files) return false;
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
    console.log(`${release.release}: downloading sealed public source release`);
    const response = await fetch(url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`Atlas download failed: ${response.status}`);
    const zip = path.join(temp, "release.zip"), hash = createHash("sha256");
    let bytes = 0;
    await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, encoding, callback) {
      bytes += chunk.length;
      if (bytes > release.bytes) return callback(new Error("Atlas archive exceeds sealed size"));
      hash.update(chunk); callback(null, chunk);
    } }), createWriteStream(zip));
    if (bytes !== release.bytes || hash.digest("hex") !== expected) throw new Error("Atlas archive integrity mismatch");
    await run("unzip", ["-q", zip, "-d", path.join(temp, "source")], { maxBuffer: 1024 * 1024 });
    const { stdout } = await run(process.execPath, ["scripts/package-atlas-r25v5.mjs", path.join(temp, "source", release.directory), release.version], { maxBuffer: 1024 * 1024 });
    console.log(stdout.trim());
    if (!await verifiedCache()) throw new Error("Atlas packaging integrity mismatch");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
