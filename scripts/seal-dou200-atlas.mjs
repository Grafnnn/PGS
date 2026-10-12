import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";

const [source, output, revision = "R1.21"] = process.argv.slice(2);
if (!source || !output) throw new Error("Provide the supplied website and a new output directory");
if (!/^R1\.\d+$/.test(revision)) throw new Error("Invalid release revision");
const releaseId = `DOU200_${revision.replace(".", "_")}`;
const hash = data => createHash("sha256").update(data).digest("hex");
async function inventory(root, prefix = "") {
  const files = [];
  for (const name of (await readdir(path.join(root, prefix))).sort()) {
    if (name === ".DS_Store" || name.startsWith("._")) continue;
    const relative = prefix ? `${prefix}/${name}` : name;
    const stat = await lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
    if (stat.isDirectory()) files.push(...await inventory(root, relative));
    else if (stat.isFile()) {
      const data = await readFile(path.join(root, relative));
      files.push({ path: relative, bytes: data.length, sha256: hash(data) });
    } else throw new Error(`Unsupported file: ${relative}`);
  }
  return files;
}
const sourceFiles = await inventory(source);
if (sourceFiles.some(file => /^(qa|ids|engineering)\//.test(file.path))) throw new Error("Expected website, not engineering archive");
if (sourceFiles.some(file => ["CURRENT_RELEASE.json", "MANIFEST.json"].includes(file.path))) throw new Error("Expected unsealed author website");
const window = {};
vm.runInNewContext(await readFile(path.join(source, "data/release-info.js"), "utf8"), { window }, { timeout: 1000 });
const release = window.ATLAS_RELEASE;
if (release.project_id !== "dou-200" || release.release_label !== revision || !/^\d{4}-\d{2}-\d{2}$/.test(release.date)) throw new Error("Unexpected project/release/date");
await mkdir(output); // Refuse to overwrite an existing seal.
const directory = `DOU200_ATLAS_${revision.replace(".", "_")}`;
const root = path.join(output, directory);
await cp(source, root, { recursive: true, filter: filename => ![".DS_Store"].includes(path.basename(filename)) && !path.basename(filename).startsWith("._") });
const sourceTreeSha256 = hash(JSON.stringify(sourceFiles));
await writeFile(path.join(root, "CURRENT_RELEASE.json"), JSON.stringify({
  release: releaseId, projectId: "dou-200", revision, date: release.date,
  sourceTreeSha256, suppliedFiles: sourceFiles.length,
  geometryChangedFromSuppliedRelease: false, elementAssignmentsChanged: false, newEngineeringApproval: false,
  elements: release.elements, catalogueTypes: release.catalogue_types, sources: release.sources,
  sourceCandidate: release.source_candidate, sourceAccepted: release.source_accepted,
  limitations: ["Supplied release is a candidate, not an engineering acceptance.", "Some records have missing fields, conflicts or geometry not accepted; original release statuses are preserved.", "Engineering archive is not published."]
}, null, 2) + "\n");
const files = await inventory(root);
for (const file of sourceFiles) {
  const sealed = files.find(candidate => candidate.path === file.path);
  if (sealed?.sha256 !== file.sha256) throw new Error(`Author file changed: ${file.path}`);
}
await writeFile(path.join(root, "MANIFEST.json"), JSON.stringify({ release: releaseId, sourceTreeSha256, files }, null, 2) + "\n");
const zip = path.join(output, `${directory}_FULL.zip`);
execFileSync("zip", ["-q", "-r", zip, directory], { cwd: output });
const archive = await readFile(zip);
console.log(JSON.stringify({ directory, zip, files: files.length + 1, suppliedFiles: sourceFiles.length, sourceTreeSha256, bytes: archive.length, sha256: hash(archive) }));
