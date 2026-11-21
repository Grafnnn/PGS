"""Seal the exact Goluboe R1.7 site against its separately supplied manifest."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "42e797de09a563e51679c75d837c92f8f3f2ad4ab074cdf32ef2d57e908456c6"
MANIFEST_SHA = "8a71eaf132f08ac3b555c4d49860a57aa3a0459acf95961609e3ddf7fb354ee3"
UPSTREAM_MANIFEST_SHA = "5b1a5b31141fae560f5cf09a2b764b498501572cef188167c57cc0b54273b133"
WORKER_SHA = "9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_7"
SITE = "Atlas_goluboe-vodovod"
archive, supplied_manifest, upstream_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert archive.stat().st_size == 23653201 and sha(archive.read_bytes()) == SOURCE_SHA
assert sha(upstream_manifest.read_bytes()) == UPSTREAM_MANIFEST_SHA
upstream_release = json.loads(upstream_manifest.read_bytes())
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_6"
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
    "assets/offline-manifest.js": "9ba8e47ffe3064815da16e74bd1d17e0e5a4e920534c14a4d24fc125e86ccdc5",
    "data/geometry_00.js": "0f64cc7ee039210b5f5e5b7828728f41b9b188514ca954cdcd75e7e370dd0c81",
    "data/geometry_02.js": "937d9af9315f1474d840591f7cd3ef886d0b7a63b074010dccb842f07505ed50",
    "data/geometry_03.js": "7433145746215b008ff6d8e5bcf9dc6eb334cdb09c072bc32d8c7a1ef73c4db2",
}
assert len(upstream) == 337 and set(changed) <= set(upstream)
supplied = {name: sha(value) for name, value in files.items()}
assert supplied == {**upstream, **changed}
assert sha(files["assets/graphics-optimization-module.js"]) == "c81effd846d63b04e7a4c233ba8d7534e09008778de66c1dfa298e4188c96673"
assert sha(files["assets/atlas-engine.js"]) == "9b2198d0944d0286e39d7fb7e73027df92d70a83f6b0b350515894afea9ccd77"
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
assert {"project/underground-view.js", "assets/graphics-optimization-module.js", "assets/atlas-engine.js",
        "data/geometry_00.js", "data/geometry_02.js", "data/geometry_03.js"} <= set(cached) and offline not in cached
assert all(sizes[name] == len(files[name]) for name in cached)
build = literal("self.ATLAS_OFFLINE_VERSION")
assert build == "field-922182d99d5f"
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
corrected_tree_sha = sha(json.dumps(inventory(files), ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_7", "projectId": "goluboe-vodovod", "revision": "R1.7",
    "publishedDate": "2026-11-21", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedFiles": 337, "publicationModifiedFiles": [],
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": UPSTREAM_MANIFEST_SHA,
    "changedFromUpstream": sorted(changed), "addedToUpstream": [], "offlineVersion": build,
    "workerSha256": WORKER_SHA, "geometryChangedFromSuppliedRelease": False, "newEngineeringApproval": False, "znpOriginalIncluded": False, "pdfs": 6,
    "limitations": ["The display-only underground view and field kit cover PK0+00 through PK0+45.",
                    "Model-derived values are not an as-built survey or engineering acceptance.",
                    "Seven geometry records have display mesh refinements only; no engineering geometry changes.",
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
