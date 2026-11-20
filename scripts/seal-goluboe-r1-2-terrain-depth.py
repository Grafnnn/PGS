"""Seal the pinned terrain/depth release with a scoped publication CSS fix."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "d4bfb3f67612485f7a7542fe6f1661d44d270432274c92f31a6d59aff264561a"
MANIFEST_SHA = "6cb6860ff381d207ff16236a7afd6df8a31da80f961e36efeb46fbcd13b936e7"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_2_TERRAIN_DEPTH"
archive, source_manifest, upstream_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA
assert sha(source_manifest.read_bytes()) == MANIFEST_SHA
expected = {}
for line in source_manifest.read_text().splitlines():
    digest, name = line.split("  ", 1)
    assert name not in expected and len(digest) == 64
    expected[name] = digest
assert len(expected) == 329
files = {}
with zipfile.ZipFile(archive) as source:
    assert source.testzip() is None
    for info in source.infolist():
        name = PurePosixPath(info.filename)
        assert not name.is_absolute() and ".." not in name.parts and "\\" not in info.filename
        assert not stat.S_ISLNK(info.external_attr >> 16)
        if info.is_dir():
            continue
        assert all(ord(c) < 128 for c in info.filename) or info.flag_bits & 0x800
        relative = str(name)
        assert relative not in files and relative in expected
        value = source.read(info)
        assert sha(value) == expected[relative], relative
        files[relative] = value
assert set(files) == set(expected)

upstream_bytes = upstream_manifest.read_bytes()
assert sha(upstream_bytes) == "b846ff31f0c086c4cfefe5c2553fff65384601853a879a94b290c2066c44cde9"
upstream_release = json.loads(upstream_bytes)
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_2_MOBILE_FIT"
upstream = {entry["path"]: entry["sha256"] for entry in upstream_release["files"] if entry["path"] != "CURRENT_RELEASE.json"}
changed = {
    "assets/offline-manifest.js": "b8c929da8b50e4b8addac8528143112218f9a3fd35a5bb75058decb4876520dc",
    "project/config.js": "b5d73d886b15439282a0e82a9c7e52802bf9d3dbcf29e3298c00991bcf408080",
    "project/plan-controls.js": "f2035e45e1191e876e51f9d5fcd7203f41810b133a24e84f99280a325c3dcd6e",
}
added = {
    "project/terrain-analysis.js": "85d2a49b8f89c0dfd6154819e11cb7fe62b61922957a6bdfd860c259a512a84f",
    "project/terrain-overlay.js": "e8fe97ac3d9d936537707f9e3015b92593d05dee8239d982cf2c33091b4fd45a",
    "project/terrain-tools.js": "cea3627f89305cddec4eb97c2ab9eb70f126358859d7ee42873281518771ecf7",
}
assert len(upstream) == 326 and set(changed) <= set(upstream) and not set(added) & set(upstream)
assert expected == {**upstream, **changed, **added}
assert sum(name.lower().endswith(".pdf") for name in files) == 6
assert "CURRENT_RELEASE.json" not in files and "MANIFEST.json" not in files
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
tree_sha = lambda values: sha(json.dumps(inventory(values), ensure_ascii=True, separators=(",", ":")).encode())
supplied_tree_sha = tree_sha(files)

tools = "project/terrain-tools.js"
before = b"#golDepthResult {margin:2px 0 5px;color:#385c70;line-height:1.3}"
assert files[tools].count(before) == 1
files[tools] = files[tools].replace(before, before[:-1] + b";white-space:normal}")
offline = "assets/offline-manifest.js"
lines = files[offline].decode().splitlines(keepends=True)
def literal(key):
    matches = [line for line in lines if line.startswith(key + "=")]
    assert len(matches) == 1
    return json.loads(matches[0].strip().removesuffix(";").split("=", 1)[1])

cached = literal("self.ATLAS_OFFLINE_FILES")
sizes = literal("self.ATLAS_OFFLINE_SIZES")
assert len(cached) == len(set(cached)) and set(cached) == set(sizes)
assert tools in cached and offline not in cached
assert all(sizes[name] == len(files[name]) for name in cached if name != tools)
assert literal("self.ATLAS_OFFLINE_VERSION") == "pkg-c9ee088d7ff6"
signature = "".join(f"{name}\t{sha(value)}\n" for name, value in sorted(files.items()) if name != offline)
build = "pkg-" + sha(signature.encode())[:12]
sizes[tools] = len(files[tools])
updates = {"self.ATLAS_OFFLINE_VERSION": build, "self.ATLAS_OFFLINE_SIZES": sizes}
files[offline] = "".join(
    key + "=" + json.dumps(updates[key], ensure_ascii=False, separators=(",", ":")) + ";\n"
    if (key := line.split("=", 1)[0]) in updates else line
    for line in lines
).encode()
modified = sorted(name for name in files if sha(files[name]) != expected[name])
assert modified == [offline, tools]
corrected_tree_sha = tree_sha(files)
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_2_TERRAIN_DEPTH", "projectId": "goluboe-vodovod", "revision": "R1.2",
    "publishedDate": "2026-11-20", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedSourceTreeSha256": supplied_tree_sha,
    "suppliedFiles": 329, "offlineVersion": build,
    "publicationModifiedFiles": modified,
    "publicationFix": "Wrap depth result text inside the mobile panel.",
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": sha(upstream_bytes),
    "changedFromUpstream": sorted(changed), "addedToUpstream": sorted(added), "unchangedFromUpstream": 323,
    "geometryChangedFromSuppliedRelease": False, "elementAssignmentsChanged": False, "newEngineeringApproval": False,
    "registryRecords": 264, "libraryRecords": 278, "worldBodies": 154, "localBodies": 40,
    "remarks": 23, "pdfs": 6, "znpOriginalIncluded": False,
    "limitations": ["The model represents PD 19/26-2026, not engineering acceptance.",
                    "Contours and depths are derived from the model's visible terrain mesh, not an as-built survey.",
                    "Depth is undefined in terrain cutouts and outside the terrain mesh.",
                    "Design discrepancies and solutions adopted for visualization remain marked in source cards.",
                    "The original ZnP is not included; five PD volumes and the Atlas conclusion are included.",
                    "Unaccepted, local and inventory-only geometry statuses remain as supplied.",
                    "Progress remains local-only, with no PGS server synchronization."]
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
    assert sealed.testzip() is None and len(sealed.infolist()) == 331
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": corrected_tree_sha,
                  "manifestSha256": sha(files["MANIFEST.json"]), "offlineVersion": build,
                  "publicationModifiedFiles": {name: sha(files[name]) for name in modified}}))
