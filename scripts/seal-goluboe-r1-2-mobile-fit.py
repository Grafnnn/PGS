"""Seal two exact responsive CSS fixes over the pinned R1.2 source package."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "21ecc601029163bdf02e06406b65790387a37e6056e29bccbc093c84e1d13f2f"
MANIFEST_SHA = "36b6a9b0980e780045bbc6f6a620a6c538feb7e3b38eb19c8f46cb5146a6ff15"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_2_MOBILE_FIT"
archive, source_manifest, working, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA
assert sha(source_manifest.read_bytes()) == MANIFEST_SHA
expected = {}
for line in source_manifest.read_text().splitlines():
    digest, name = line.split("  ", 1)
    assert name not in expected and len(digest) == 64
    expected[name] = digest
assert len(expected) == 326
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
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
tree_sha = lambda values: sha(json.dumps(inventory(values), ensure_ascii=True, separators=(",", ":")).encode())
upstream_tree_sha = tree_sha(files)
assert upstream_tree_sha == "1e5c15d19407c3f9ab644e504d07c37dc800fa1c13a331b61d4c51d6136b1431"
changes = {
    "assets/atlas-shell.css": (
        "  .atlas-shell .as-tools { margin-left: 0; }",
        "  .atlas-shell .as-tools { margin-left: 0; flex: 0 0 auto; }"),
    "project/profile-waterline.html": (
        "  thead th{font-size:.74rem}th,td{padding:.36rem .27rem}canvas{height:330px}}",
        "  thead th{font-size:.74rem}th,td{padding:.36rem .27rem}canvas{height:330px}.methods li{white-space:normal}}")
}
assert {str(p.relative_to(working)) for p in working.rglob("*") if p.is_file()} == set(files)
for name, value in list(files.items()):
    assert not (working / name).is_symlink()
    if name in changes:
        before, after = (text.encode() for text in changes[name])
        assert value.count(before) == 1
        files[name] = value.replace(before, after)
    assert (working / name).read_bytes() == files[name], name

# Keep the original cache file list; update its build identity and changed byte sizes.
offline = "assets/offline-manifest.js"
lines = files[offline].decode().splitlines(keepends=True)
assignments = {}
for line in lines:
    if line.startswith("self.ATLAS_OFFLINE_"):
        key, literal = line.strip().removesuffix(";").split("=", 1)
        assignments[key] = json.loads(literal)
cached = assignments["self.ATLAS_OFFLINE_FILES"]
assert len(cached) == len(set(cached)) and all(name in files and name != offline for name in cached)
signature = "".join(f"{name}\t{sha(value)}\n" for name, value in sorted(files.items()) if name != offline)
build = "pkg-" + sha(signature.encode())[:12]
updates = {"self.ATLAS_OFFLINE_VERSION": build, "self.ATLAS_OFFLINE_SIZES": {name: len(files[name]) for name in cached}}
for key, value in updates.items():
    assert sum(line.startswith(key + "=") for line in lines) == 1
    lines = [key + "=" + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + ";\n" if line.startswith(key + "=") else line for line in lines]
files[offline] = "".join(lines).encode()
modified = sorted(name for name in files if sha(files[name]) != expected[name])
assert modified == sorted([*changes, offline])
assert sum(name.lower().endswith(".pdf") for name in files) == 6
corrected_tree_sha = tree_sha(files)
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_2_MOBILE_FIT", "projectId": "goluboe-vodovod", "revision": "R1.2",
    "publishedDate": "2026-11-20", "sourceArchiveSha256": SOURCE_SHA,
    "suppliedManifestSha256": MANIFEST_SHA, "upstreamSourceTreeSha256": upstream_tree_sha,
    "sourceTreeSha256": corrected_tree_sha, "suppliedFiles": 326,
    "modifiedSuppliedFiles": modified, "unchangedSuppliedFiles": 323, "offlineVersion": build,
    "uiFixes": ["Prevent mobile search tools from shrinking below their button width.",
                "Allow profile method labels to wrap on narrow screens."],
    "geometryChangedFromSuppliedRelease": False, "elementAssignmentsChanged": False, "newEngineeringApproval": False,
    "registryRecords": 264, "libraryRecords": 278, "worldBodies": 154, "localBodies": 40,
    "remarks": 23, "pdfs": 6, "znpOriginalIncluded": False,
    "limitations": ["The model represents PD 19/26-2026, not engineering acceptance.",
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
    assert sealed.testzip() is None and len(sealed.infolist()) == 328
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": corrected_tree_sha,
                  "manifestSha256": sha(files["MANIFEST.json"]), "offlineVersion": build,
                  "modifiedFiles": {name: sha(files[name]) for name in modified}}))
