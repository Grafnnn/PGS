"""Seal the exact Goluboe R1.9 site against its separately supplied manifest."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "6f44734eade603893e1fc41f50e519870701e2e1781e8ff2395d12729ffb4718"
MANIFEST_SHA = "64e86a44d0a506c2f628fabda1e2f96050c86e4e815700e559ee892148a19bf1"
UPSTREAM_MANIFEST_SHA = "f6650086a23eb7e9229e332e8c6f289df94d69ccc1ae7281c560cc84a2303486"
WORKER_SHA = "9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_9"
SITE = "Atlas_goluboe-vodovod"
archive, supplied_manifest, upstream_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert archive.stat().st_size == 23667453 and sha(archive.read_bytes()) == SOURCE_SHA
assert sha(upstream_manifest.read_bytes()) == UPSTREAM_MANIFEST_SHA
upstream_release = json.loads(upstream_manifest.read_bytes())
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_8"
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
    "assets/atlas-engine.js": "10f51bc5f529f9ad30727450e703bb4a3296baef996899a3d4cf675509ea8576",
    "assets/atlas-field.js": "d1ed855c07c249a3f7a05747a6b2d9dfd625c554473380e4765d6da22cec4d9e",
    "assets/offline-manifest.js": "d9c0b4773ab2d8b1518676a0654620b4eed8bf4962a1bd94ad42bd1221bdcc70",
    "project/field-pilot-overlay.js": "ce09c2a7d1a2107203f36fbcb53e594be11f9b6e3d0e715acb85ceced95846a1",
    "project/plan-controls.js": "5927df18060cf4cf8f97626d23abc5e5d84785f55321be0eb428fa8f2b11d397",
    "project/profile-waterline.html": "20828ff21f51cdabeb0e7e206e728088a5cc84c05795b159e9ffc3006db4c0bd",
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
assert len(cached) == len(set(cached)) and set(cached) == set(sizes)
assert {"project/underground-view.js", "assets/graphics-optimization-module.js", "assets/atlas-engine.js", "project/config.js",
        "data/geometry_00.js", "data/geometry_02.js", "data/geometry_03.js"} <= set(cached) and offline not in cached
assert all(sizes[name] == len(files[name]) for name in cached)
build = literal("self.ATLAS_OFFLINE_VERSION")
assert build == "field-91e81891091d"
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
corrected_tree_sha = sha(json.dumps(inventory(files), ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_9", "projectId": "goluboe-vodovod", "revision": "R1.9",
    "publishedDate": "2026-11-21", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedFiles": 337, "publicationModifiedFiles": [],
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": UPSTREAM_MANIFEST_SHA,
    "changedFromUpstream": sorted(changed), "addedToUpstream": [], "offlineVersion": build,
    "workerSha256": WORKER_SHA, "geometryChangedFromSuppliedRelease": False, "newEngineeringApproval": False, "znpOriginalIncluded": False, "pdfs": 6,
    "limitations": ["The display-only underground view and field kit cover PK0+00 through PK0+45.",
                    "Model-derived values are not an as-built survey or engineering acceptance.",
                    "Display geometry and source documents are unchanged from R1.8.",
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
        info = zipfile.ZipInfo(ROOT + "/" + name, (2026, 11, 21, 0, 0, 0))
        sealed.writestr(info, value, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
with zipfile.ZipFile(output) as sealed:
    assert sealed.testzip() is None and len(sealed.infolist()) == 339
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": corrected_tree_sha,
                  "manifestSha256": sha(files["MANIFEST.json"]), "offlineVersion": build,
                  "workerSha256": WORKER_SHA}))
