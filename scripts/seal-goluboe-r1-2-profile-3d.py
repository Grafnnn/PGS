"""Seal the pinned R1.2 transport ZIP, preserving every supplied byte."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "21ecc601029163bdf02e06406b65790387a37e6056e29bccbc093c84e1d13f2f"
MANIFEST_SHA = "36b6a9b0980e780045bbc6f6a620a6c538feb7e3b38eb19c8f46cb5146a6ff15"
METADATA_SHA = "8d4b8ae4af19f2802d6d6b68f0fbc45294cd6a3a791061fdd2cb4eae072ac07a"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_2_PROFILE_3D"
archive, source_manifest, destination = map(Path, sys.argv[1:])
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
        assert (archive.parent / "Atlas_goluboe-vodovod" / relative).read_bytes() == value
        files[relative] = value
assert set(files) == set(expected)
assert sha(files["data/metadata-light.js"]) == METADATA_SHA
assert sha(files["project/plan-controls.js"]) == "6298a3d675940bfb86c57a28faa398ad103fe48b7a1c71137134099d684c110b"
assert sha(files["project/profile-up1.html"]) == "760f9f49b6e6f642f91c281165a7305725ea9644b4ffb859ef79754142178da5"
assert sha(files["project/profile-waterline.html"]) == "f102607075e1011141acb7da2bde56110e5598d6cf2d4893a8699bb9ce7b19da"
assert sha(files["project/section-kv1.html"]) == "c552cb4766108eb1d1c7de94004241e5feccf7d7be4c631dc399447150931977"
assert sha(files["assets/offline-manifest.js"]) == "4c78cb3e1c977a2f6644a782393b6beeb32d025de6dd9a1869b89483dcc275c3"
assert sha(files["project/config.js"]) == "de4a12461d58a90aa8e1c41dc99a092ec8f8cf9224c0b7fe43de069b167d03cd"
assert sha(files["project/profile-world-data.js"]) == "b2bc0d1c06d5ed0aa45e2f0db7e29aa5f0678354881cb1418a0e9f183bbee219"
assert sha(files["project/profile-world-overlay.js"]) == "76dd9158739c87c1ebc606a9ea810454a4b4f1c8aee697554f9dce4963f40c7a"
assert "CURRENT_RELEASE.json" not in files and "MANIFEST.json" not in files
assert sum(name.lower().endswith(".pdf") for name in files) == 6
inventory = [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(files.items())]
tree_sha = sha(json.dumps(inventory, ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_2_PROFILE_3D", "projectId": "goluboe-vodovod", "revision": "R1.2",
    "publishedDate": "2026-11-19", "sourceArchiveSha256": SOURCE_SHA,
    "suppliedManifestSha256": MANIFEST_SHA, "sourceTreeSha256": tree_sha,
    "suppliedFiles": 326, "geometryChangedFromSuppliedRelease": False,
    "elementAssignmentsChanged": False, "newEngineeringApproval": False,
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
    "sourceTreeSha256": tree_sha,
    "files": [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(files.items())]}, separators=(",", ":")).encode()
destination.mkdir(exist_ok=False)
for name, value in files.items():
    target = destination / ROOT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(value)
output = destination / (ROOT + "_FULL.zip")
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as sealed:
    for name, value in sorted(files.items()):
        info = zipfile.ZipInfo(ROOT + "/" + name, (2026, 11, 19, 0, 0, 0))
        sealed.writestr(info, value, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
with zipfile.ZipFile(output) as sealed:
    assert sealed.testzip() is None and len(sealed.infolist()) == 328
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": tree_sha}))
