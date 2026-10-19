import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import { gunzipSync } from "node:zlib";

// Preserve supplied model data and the established public source-link integration.
const [source, output, publicExcerpt] = process.argv.slice(2);
if (!source || !output || !publicExcerpt) throw new Error("Provide website, new output directory and previously public excerpt");
const sha = data => createHash("sha256").update(data).digest("hex");
async function inventory(root, prefix = "") {
  const files = [];
  for (const name of (await readdir(path.join(root, prefix))).sort()) {
    if (name === ".DS_Store" || name.startsWith("._")) continue;
    const relative = path.posix.join(prefix, name), stat = await lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
    if (stat.isDirectory()) files.push(...await inventory(root, relative));
    else if (stat.isFile()) {
      const data = await readFile(path.join(root, relative));
      files.push({ path: relative, bytes: data.length, sha256: sha(data) });
    } else throw new Error(`Unsupported file: ${relative}`);
  }
  return files;
}
const files = await inventory(source);
if (files.some(file => /^(qa|ids)\//.test(file.path) || ["CURRENT_RELEASE.json", "MANIFEST.json"].includes(file.path))) throw new Error("Expected unsealed website only");
if (files.some(file => file.path.startsWith("engineering/") && !/^engineering\/history\/branch_R15_B\/sources\/r13\/AR_PDF01[67]\.jpg$/.test(file.path))) throw new Error("Unexpected engineering archive payload");
const window = {};
vm.runInNewContext(await readFile(path.join(source, "data/release-info.js"), "utf8"), { window }, { timeout: 1000 });
const release = window.ATLAS_RELEASE;
if (release.release !== "3D_ATLAS_V12_16" || release.elements !== 10795 || release.rebar_on_demand !== 13325) throw new Error("Unexpected Troitsk release");
await mkdir(output);
const directory = "TROITSK_B24_ATLAS_V12_16", root = path.join(output, directory);
await cp(source, root, { recursive: true, filter: name => path.basename(name) !== ".DS_Store" && !path.basename(name).startsWith("._") });
const sourceTreeSha256 = sha(JSON.stringify(files));
const read = name => readFile(path.join(root, name), "utf8");
const write = (name, data) => writeFile(path.join(root, name), data);
function replace(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Unexpected integration source: ${before}`);
  return text.replace(before, after);
}
const excerpt = await readFile(publicExcerpt);
const excerptSha = "2afa4d7c3b1bb2fed48d3de1be3bc6e75add72b15b306ca4bd08db6eced6349f";
if (sha(excerpt) !== excerptSha) throw new Error("Previously public excerpt changed");
await write("drawings/R13_AR_PRIMARY_PAGES.pdf", excerpt);
const links = await read("assets/package-links.js"), match = links.match(/var C=(\{[^\n]+\});/);
if (!match) throw new Error("Unknown package map");
const map = JSON.parse(match[1]);
map.map["engineering/history/branch_R15_B/sources/r13/R13_AR_PRIMARY_PAGES.pdf"] = "drawings/R13_AR_PRIMARY_PAGES.pdf";
await write("assets/package-links.js", links.replace(match[0], `var C=${JSON.stringify(map)};`));
const recoveryWindow = {};
vm.runInNewContext(await read("data/source_recovery.js"), { window: recoveryWindow }, { timeout: 1000 });
const libraryWindow = {};
vm.runInNewContext(await read("data/library.js"), { window: libraryWindow }, { timeout: 1000 });
const library = JSON.parse(gunzipSync(Buffer.from(libraryWindow.ATLAS_LIBRARY_GZIP, "base64")));
const sourceCount = Object.keys({ ...library.sources, ...recoveryWindow.AtlasSourceRecoveryData.sources }).length;
const nodesWindow = {};
vm.runInNewContext(await read("data/nodes.js"), { window: nodesWindow }, { timeout: 1000 });
const nodes = JSON.parse(gunzipSync(Buffer.from(nodesWindow.ATLAS_NODES_GZIP, "base64"))).nodes.length;
if (nodes !== 559 || sourceCount !== 396) throw new Error("Unexpected source or nodes register");
await write("assets/atlas-engine.js", replace(await read("assets/atlas-engine.js"), "sourceAvailability:()=>albumSources,", "sourceAvailability:()=>albumSources,sourceLinks:o=>albumLinks(o),"));
await write("assets/atlas-card.js", replace(await read("assets/atlas-card.js"), "const links = ((o.albumRecord && o.albumRecord.sources) || []).filter", "const links = window.__FULL_ATLAS.sourceLinks(o).filter"));
await write("library.html", replace(await read("library.html"), '<script src="assets/library.js"></script>', '<script src="data/source_recovery.js"></script><script src="assets/source-recovery/runtime.js"></script><script src="assets/library.js"></script>'));
await write("assets/library.js", replace(await read("assets/library.js"), "delete window.ATLAS_LIBRARY_GZIP;", "delete window.ATLAS_LIBRARY_GZIP;const recovery=window.AtlasSourceRecovery.create(window.AtlasSourceRecoveryData,D.sources);D.sources=recovery.sources;D.records=D.records.map(r=>({...r,sources:recovery.links({sourceKeys:r.sources,albumRecord:r})}));"));
await writeFile(path.join(root, "CURRENT_RELEASE.json"), JSON.stringify({
  release: "V12_16", label: "V12.16", sourceDate: release.date, publishedDate: "2026-10-19", sourceTreeSha256,
  suppliedFiles: files.length, geometryChangedFromSuppliedRelease: false, elementAssignmentsChanged: false, newEngineeringApproval: false,
  elements: release.elements, rebarOnDemand: release.rebar_on_demand, catalogueTypes: release.catalogue_types,
  sources: sourceCount, nodes, unplaced: release.unplaced,
  restoredPublicExcerpt: { path: "drawings/R13_AR_PRIMARY_PAGES.pdf", sha256: excerptSha },
  integrationFixes: ["Previously public recovery PDF", "Recovered source links in cards and library"],
  limitations: ["47 positions remain without confirmed placement.", "Publication and navigation checks do not constitute engineering approval.", "Original drawings and engineering archive are not published; supplied archive-only links remain explicitly unavailable."]
}, null, 2) + "\n");
const sealed = await inventory(root);
const changed = new Set(["assets/package-links.js", "assets/atlas-engine.js", "assets/atlas-card.js", "library.html", "assets/library.js"]);
for (const file of files) if (!changed.has(file.path) && sealed.find(item => item.path === file.path)?.sha256 !== file.sha256) throw new Error(`Author file changed: ${file.path}`);
await writeFile(path.join(root, "MANIFEST.json"), JSON.stringify({ release: "V12_16", sourceTreeSha256, files: sealed }));
const zip = path.join(output, `${directory}_FULL.zip`);
execFileSync("zip", ["-qr", zip, directory], { cwd: output });
const archive = await readFile(zip);
console.log(JSON.stringify({ directory, zip, files: sealed.length + 1, suppliedFiles: files.length, sourceTreeSha256, bytes: archive.length, sha256: sha(archive) }));
