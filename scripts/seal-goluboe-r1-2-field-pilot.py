"""Seal only the approved pilot site, with the pinned offline worker fix."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "6f1d57810e4f36b8c680fc18e9c9d3ded49f062d9961ce260f83d05e7b738f1d"
MANIFEST_SHA = "7763dc790d62ce61073d5d31b45ff1a89f2124b41e9d7cdbb51761534dfcc330"
UPSTREAM_MANIFEST_SHA = "364918ef8b0a2bc112a58db48fb775720784f19c153216d73b6321a9cbc6b5eb"
WORKER_SHA = "df64f858b849ac8ca83b2ec9139f0418795ffc3606b935fc7215df006eee5298"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_2_FIELD_PILOT_01"
SITE = "Atlas_goluboe-vodovod"
archive, upstream_manifest, fixed_worker, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA
assert sha(upstream_manifest.read_bytes()) == UPSTREAM_MANIFEST_SHA
upstream_release = json.loads(upstream_manifest.read_bytes())
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_2_TERRAIN_SNAPSHOT"
upstream = {entry["path"]: entry["sha256"] for entry in upstream_release["files"] if entry["path"] != "CURRENT_RELEASE.json"}
expected = {}
files = {}
with zipfile.ZipFile(archive) as source:
    assert source.testzip() is None
    assert len(source.namelist()) == len(set(source.namelist()))
    manifest = source.read("SHA256SUMS")
    assert sha(manifest) == MANIFEST_SHA
    for line in manifest.decode().splitlines():
        digest, name = line.split("  ", 1)
        assert name.startswith(SITE + "/") and name not in expected and len(digest) == 64
        expected[name] = digest
    assert len(expected) == 333
    for info in source.infolist():
        name = PurePosixPath(info.filename)
        assert not name.is_absolute() and ".." not in name.parts and "\\" not in info.filename
        assert not stat.S_ISLNK(info.external_attr >> 16)
        if info.is_dir() or name.parts[0] != SITE:
            continue
        assert all(ord(c) < 128 for c in info.filename) or info.flag_bits & 0x800
        value = source.read(info)
        assert sha(value) == expected[info.filename], info.filename
        files[str(name.relative_to(SITE))] = value
assert {SITE + "/" + name for name in files} == set(expected)
changed = {
    "assets/offline-manifest.js": "41b77361ef7ce9b36e8ac4dd9c6bdf06dccc3a19312cbbd266cbdae6cebfe083",
    "project/config.js": "420ad22a76673a7a1401465addd773b77007c793e627121be386a159b4079de1",
    "project/terrain-tools.js": "1c7d9313f34561adf93abbd8c3fff193c7fe159be70d2556ea0793ec1874cfbf",
    "service-worker.js": "c6609a4c40727a8fff873f657aa04e3d8c6ab055cb0258badfc52cd25e6ef5a2",
}
added = {
    "assets/atlas-field-offline.js": "431707122eaf336b7cae8eba9d1e1d65a7e587181495a1f4bc910e1d61406bad",
    "assets/atlas-field-print.js": "e858b4989436f2a7b2771968dc6f53f2692d48be55e25004bf0aafc5a9c262ee",
    "assets/atlas-field.js": "cfba1964f600a371c42dd2ab0ee4b21f9dc9e31b12ab19cc13e775c94e8bc7f2",
    "project/field-data.js": "c6abcdcc957f96f949ec3fc4dcebbcb84f8cf43c105eb3cd26312b0811cb417b",
}
assert len(upstream) == 329 and set(changed) <= set(upstream) and not set(added) & set(upstream)
supplied = {name: sha(value) for name, value in files.items()}
assert supplied == {**upstream, **changed, **added}
assert sum(name.lower().endswith(".pdf") for name in files) == 6
assert "CURRENT_RELEASE.json" not in files and "MANIFEST.json" not in files
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
tree_sha = lambda values: sha(json.dumps(inventory(values), ensure_ascii=True, separators=(",", ":")).encode())
supplied_tree = tree_sha(files)

worker = "service-worker.js"
files[worker] = fixed_worker.read_bytes()
assert sha(files[worker]) == WORKER_SHA
# The supplied allowlist includes the field PDFs. Use the normalizing fallback for
# their full requests too, not only for Range and URLs with a query string.
exact_branch = b"if(url.search||!ALLOW.has(path))"
assert files[worker].count(exact_branch) == 1
files[worker] = files[worker].replace(exact_branch, b"if(url.search||path.startsWith('albums/')||!ALLOW.has(path))")
start = files[worker].index(b"function sameUrl(")
end = files[worker].index(b"function r416(", start)
files[worker] = files[worker][:start] + b"""function cacheUrls(u){
 const variants=new Set([u]),url=new URL(u);
 if(url.origin===ROOT.origin&&url.pathname.startsWith(ROOT.pathname+'albums/')){
  const literal=url.pathname.replace(/%28/gi,'(').replace(/%29/gi,')');
  url.pathname=literal;variants.add(url.href);
  url.pathname=literal.replace(/[(]/g,'%28').replace(/[)]/g,'%29');variants.add(url.href);
 }
 return variants;
}
async function fromCache(u){
 const c=await caches.open(CACHE),variants=cacheUrls(u);
 for(const ignoreSearch of [false,true])for(const key of variants){
  const response=await c.match(key,{ignoreSearch});if(response)return response;
 }
 return null;
}
""" + files[worker][end:]
offline = "assets/offline-manifest.js"
lines = files[offline].decode().splitlines(keepends=True)
def literal(key):
    matches = [line for line in lines if line.startswith(key + "=")]
    assert len(matches) == 1
    return json.loads(matches[0].strip().removesuffix(";").split("=", 1)[1])

cached = literal("self.ATLAS_OFFLINE_FILES")
sizes = literal("self.ATLAS_OFFLINE_SIZES")
assert len(cached) == len(set(cached)) and set(cached) == set(sizes)
assert worker in cached and offline not in cached
assert all(sizes[name] == len(files[name]) for name in cached if name != worker)
assert literal("self.ATLAS_OFFLINE_VERSION") == "field-650e72851e7d"
signature = "".join(f"{name}\t{sha(value)}\n" for name, value in sorted(files.items()) if name != offline)
build = "field-" + sha(signature.encode())[:12]
sizes[worker] = len(files[worker])
updates = {"self.ATLAS_OFFLINE_VERSION": build, "self.ATLAS_OFFLINE_SIZES": sizes}
files[offline] = "".join(
    key + "=" + json.dumps(updates[key], ensure_ascii=False, separators=(",", ":")) + ";\n"
    if (key := line.split("=", 1)[0]) in updates else line
    for line in lines
).encode()
modified = sorted(name for name in files if sha(files[name]) != supplied[name])
assert modified == [offline, worker]
corrected_tree_sha = tree_sha(files)
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_2_FIELD_PILOT_01", "projectId": "goluboe-vodovod", "revision": "R1.2-field-1",
    "publishedDate": "2026-11-20", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedSourceTreeSha256": supplied_tree, "suppliedFiles": 333,
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": UPSTREAM_MANIFEST_SHA,
    "publicationModifiedFiles": modified, "offlineVersion": build,
    "upstreamFixedWorkerSha256": WORKER_SHA, "workerSha256": sha(files[worker]),
    "geometryChangedFromSuppliedRelease": False, "newEngineeringApproval": False, "pdfs": 6,
    "limitations": ["Pilot limited to PK0+00 through PK0+45 in the field kit.",
                    "Model-derived values are not an as-built survey or engineering acceptance.",
                    "Source qualifications and unavailable data remain visible."]
}
files["CURRENT_RELEASE.json"] = (json.dumps(metadata, indent=2) + "\n").encode()
files["MANIFEST.json"] = json.dumps({"release": metadata["release"], "sourceArchiveSha256": SOURCE_SHA,
    "sourceTreeSha256": corrected_tree_sha, "files": inventory(files)}, separators=(",", ":")).encode()
destination.mkdir(exist_ok=False)
for name, value in files.items():
    target = destination / ROOT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(value)
output = destination / (ROOT + "_FULL.zip")
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as sealed:
    for name, value in sorted(files.items()):
        info = zipfile.ZipInfo(ROOT + "/" + name, (2026, 11, 20, 0, 0, 0))
        sealed.writestr(info, value, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
with zipfile.ZipFile(output) as sealed:
    assert sealed.testzip() is None and len(sealed.infolist()) == 335
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": corrected_tree_sha,
                  "manifestSha256": sha(files["MANIFEST.json"]), "offlineVersion": build,
                  "workerSha256": sha(files[worker])}))
