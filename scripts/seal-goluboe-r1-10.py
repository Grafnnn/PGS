"""Seal the exact Goluboe R1.10 site against its separately supplied manifest."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "4c53cac43c8074ac86982cb96bd6a5772c2f72524061bf68ee43b11f81c8b6b8"
MANIFEST_SHA = "20bd393d6a17de0580d071c3e40b9da57c9356db47ce3940dd168ad62bacc25c"
UPSTREAM_MANIFEST_SHA = "42b28ffa312074b7b61ef37b26a46f025d0fd04f67a4948a23c9704ae3dbe18e"
WORKER_SHA = "9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_10"
SITE = "Atlas_goluboe-vodovod"
archive, supplied_manifest, upstream_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert archive.stat().st_size == 23671870 and sha(archive.read_bytes()) == SOURCE_SHA
assert sha(upstream_manifest.read_bytes()) == UPSTREAM_MANIFEST_SHA
upstream_release = json.loads(upstream_manifest.read_bytes())
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_9"
upstream = {entry["path"]: entry["sha256"] for entry in upstream_release["files"] if entry["path"] != "CURRENT_RELEASE.json"}
expected = {}
files = {}
with zipfile.ZipFile(archive) as source:
    assert source.testzip() is None
    assert len(source.namelist()) == len(set(source.namelist()))
    manifest = supplied_manifest.read_bytes()
    assert sha(manifest) == MANIFEST_SHA
    for line in manifest.decode().splitlines():
        digest, name = line.split("  ", 1)
        name = SITE + "/" + name
        assert name not in expected and len(digest) == 64
        expected[name] = digest
    assert len(expected) == 337
    for info in source.infolist():
        name = PurePosixPath(info.filename)
        assert not name.is_absolute() and ".." not in name.parts and "\\" not in info.filename
        assert not stat.S_ISLNK(info.external_attr >> 16)
        assert name.parts[0] == SITE
        if info.is_dir():
            continue
        assert all(ord(c) < 128 for c in info.filename) or info.flag_bits & 0x800
        value = source.read(info)
        assert sha(value) == expected[info.filename], info.filename
        files[str(name.relative_to(SITE))] = value
assert {SITE + "/" + name for name in files} == set(expected)
changed = {
    "assets/atlas-engine.js": "3b80cb930d56ba16f4feb56032af9a9690bd33603bb7d5968a3912c7935c5342",
    "assets/offline-manifest.js": "d4328e998a91dd22349575102fb94fd6d20fa5cf1574716336f15b32cfde5306",
    "data/release-info.js": "fbcb6287eb5770362035dcbeee13266ccb1de73e19b9c50128eaafd3395f4278",
    "project/field-pilot-overlay.js": "7997e075e22699130739707f4ffcebde9a8ab749ae16b1321d686ccb2dbfe278",
    "project/plan-controls.js": "41eb23cc22fa321d2c66eb319076eec1d66a6a0bc0f1f50a48f70b05ea36682b",
    "project/terrain-tools.js": "55772fde08b631b37f7c7b832e4406d9157e700aee96d488f4d60bf7771f4f64",
    "project/underground-view.js": "6358a82161b87068d0f0824cca7f7f44a644b8ec564a9d111b1b7c774055b807",
}
assert len(upstream) == 337 and set(changed) <= set(upstream)
supplied = {name: sha(value) for name, value in files.items()}
assert supplied == {**upstream, **changed}
assert {name for name, digest in supplied.items() if digest != upstream[name]} == set(changed)
# Check the supplied unpacked tree independently of the ZIP and checksum list.
unpacked = archive.parent / SITE
assert unpacked.is_dir() and not unpacked.is_symlink()
disk_files = set()
for entry in unpacked.rglob("*"):
    assert not entry.is_symlink(), entry
    if entry.is_dir():
        continue
    name = entry.relative_to(unpacked).as_posix()
    assert entry.is_file() and entry.read_bytes() == files[name], name
    disk_files.add(name)
assert disk_files == set(files)
assert sha(files["assets/graphics-optimization-module.js"]) == "c81effd846d63b04e7a4c233ba8d7534e09008778de66c1dfa298e4188c96673"
assert sha(files["service-worker.js"]) == WORKER_SHA
assert sum(name.lower().endswith(".pdf") for name in files) == 6
assert "CURRENT_RELEASE.json" not in files and "MANIFEST.json" not in files
offline = "assets/offline-manifest.js"
lines = files[offline].decode().splitlines()

def literal(key):
    matches = [line for line in lines if line.startswith(key + "=")]
    assert len(matches) == 1
    return json.loads(matches[0].removesuffix(";").split("=", 1)[1])

cached = literal("self.ATLAS_OFFLINE_FILES")
sizes = literal("self.ATLAS_OFFLINE_SIZES")
assert len(cached) == len(set(cached)) == 332 and set(cached) == set(sizes)
assert sum(name.lower().endswith(".pdf") for name in cached) == 3
assert {"project/underground-view.js", "assets/graphics-optimization-module.js", "assets/atlas-engine.js", "project/config.js",
        "data/geometry_00.js", "data/geometry_02.js", "data/geometry_03.js"} <= set(cached) and offline not in cached
assert all(sizes[name] == len(files[name]) for name in cached)
build = literal("self.ATLAS_OFFLINE_VERSION")
assert build == "field-bf0d5282df7a"
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
corrected_tree_sha = sha(json.dumps(inventory(files), ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_10", "projectId": "goluboe-vodovod", "revision": "R1.10",
    "publishedDate": "2026-11-22", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedFiles": 337, "publicationModifiedFiles": [],
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": UPSTREAM_MANIFEST_SHA,
    "changedFromUpstream": sorted(changed), "addedToUpstream": [], "offlineVersion": build,
    "workerSha256": WORKER_SHA, "geometryChangedFromSuppliedRelease": False, "newEngineeringApproval": False, "znpOriginalIncluded": False, "pdfs": 6,
    "limitations": ["The display-only underground view and field kit cover PK0+00 through PK0+45.",
                    "Model-derived values are not an as-built survey or engineering acceptance.",
                    "Source geometry and source documents are unchanged from R1.9.",
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
        info = zipfile.ZipInfo(ROOT + "/" + name, (2026, 11, 22, 0, 0, 0))
        sealed.writestr(info, value, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
with zipfile.ZipFile(output) as sealed:
    assert sealed.testzip() is None and len(sealed.infolist()) == 339
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": corrected_tree_sha,
                  "manifestSha256": sha(files["MANIFEST.json"]), "offlineVersion": build,
                  "workerSha256": WORKER_SHA}))
