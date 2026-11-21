"""Seal the exact Goluboe R1.3 site against its separately supplied manifest."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "4541dc39a5b02e5a6436770b742ff2e51e084ba4fde9ec877ee17966d5a7131e"
MANIFEST_SHA = "21b1ab128f55983af0a0e37d6503ea705429d7c0ea7ec0ebbc8e63d43e5d448e"
UPSTREAM_MANIFEST_SHA = "64862d0b28d32c43469f3b1ef3a7c77590c41d6d976ec59bd1a74c486e2f67b5"
WORKER_SHA = "9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_3"
SITE = "Atlas_goluboe-vodovod"
archive, supplied_manifest, upstream_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA
assert sha(upstream_manifest.read_bytes()) == UPSTREAM_MANIFEST_SHA
upstream_release = json.loads(upstream_manifest.read_bytes())
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_2_FIELD_PILOT_02_UX_01"
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
    "assets/atlas-engine.js": "1fae07a5262b6b87290839ff764c32347df1ee85467a317d6607cc5e54d5bf2b",
    "assets/atlas-field.js": "df725f495270c0a141333b2b438ff27cbbf8d5ee045157e6a3e878ce8194ffa7",
    "assets/canvas-rasterizer.js": "bd43428a80cb35ab8448bc7c8737db552cbf68709df9a6721ba17d26115600bd",
    "assets/graphics-optimization-module.js": "c5565c4e63a0d7bb5610e8302fdd9b66c1ba358dadab49ba7b2dd1cc23f5b711",
    "assets/offline-manifest.js": "c777c7290f2dfcb22f5ad291d66e4129cda30a41d278efa30a6d2e444db2bb1b",
    "assets/worker-source.js": "2e2b849c80fa6e306de925d1f4b168fe9ece07ad784b0a43455fb7ca4707a7f3",
    "project/config.js": "e1df5428b86e252a76fe2eafb2bf8e350160521fe0a36f5319eb5cd62b40be4d",
    "project/field-pilot-overlay.js": "87761db63e9af940ac389bdb774c55330f1527f335ae25442a51787511a5d1ea",
    "project/plan-controls.js": "ce105ad4f2850e0e2f3f2d9b3135c41af92dc070a2ce1c57898189780f2ec30b",
    "project/terrain-analysis.js": "8aae6f48b180f84509376c4597255f9c6ad20440eb2d1658a778052498a313fb",
    "project/underground-geometry-data.js": "8a55a71b96760ed7e12699244bd9c300aaf714f80ea2f9df3b391fca9dd9519e",
    "project/underground-mesh.js": "4f34c5c2bb6d11264d4a23fcd1c87ad26428afe0de2b1e5b536ef59772ed7a60",
    "project/underground-view.js": "d905611b1dc3240c457fb1061da295c4dea27a839009c47f98a12eebce8a94ac",
}
added = sorted(set(changed) - set(upstream))
assert len(upstream) == 334 and len(added) == 3
supplied = {name: sha(value) for name, value in files.items()}
assert supplied == {**upstream, **changed}
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
assert {"project/field-pilot-overlay.js", *added} <= set(cached) and offline not in cached
assert all(sizes[name] == len(files[name]) for name in cached)
build = literal("self.ATLAS_OFFLINE_VERSION")
assert build == "field-01319f828fba"
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
corrected_tree_sha = sha(json.dumps(inventory(files), ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_3", "projectId": "goluboe-vodovod", "revision": "R1.3",
    "publishedDate": "2026-11-21", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedFiles": 337, "publicationModifiedFiles": [],
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": UPSTREAM_MANIFEST_SHA,
    "changedFromUpstream": sorted(set(changed) & set(upstream)), "addedToUpstream": added, "offlineVersion": build,
    "workerSha256": WORKER_SHA, "geometryChangedFromSuppliedRelease": False, "newEngineeringApproval": False, "znpOriginalIncluded": False, "pdfs": 6,
    "limitations": ["The display-only underground view and field kit cover PK0+00 through PK0+45.",
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
