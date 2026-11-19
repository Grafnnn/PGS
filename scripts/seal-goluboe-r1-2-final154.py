"""Seal the pinned R1.2 transport ZIP, preserving every supplied byte."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "f60e553651333c23796a5cc6fc7859feccc03713874453ac242686c5f8e00dee"
MANIFEST_SHA = "660bdacc42344e701f21e6c82ddf147c1f5cbc1bd5fd92313acf26757fc1c346"
METADATA_SHA = "8d4b8ae4af19f2802d6d6b68f0fbc45294cd6a3a791061fdd2cb4eae072ac07a"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_2_FINAL154"
archive, source_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA
assert sha(source_manifest.read_bytes()) == MANIFEST_SHA
expected = {}
for line in source_manifest.read_text().splitlines():
    digest, name = line.split("  ", 1)
    assert name not in expected and len(digest) == 64
    expected[name] = digest
assert len(expected) == 321
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
assert sha(files["project/plan-controls.js"]) == "61e25144432e6724ff4f1303024161ff630fe0a5d64879e4a162f1b87935e0f5"
assert "CURRENT_RELEASE.json" not in files and "MANIFEST.json" not in files
assert sum(name.lower().endswith(".pdf") for name in files) == 6
inventory = [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(files.items())]
tree_sha = sha(json.dumps(inventory, ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_2_FINAL154", "projectId": "goluboe-vodovod", "revision": "R1.2",
    "publishedDate": "2026-11-19", "sourceArchiveSha256": SOURCE_SHA,
    "suppliedManifestSha256": MANIFEST_SHA, "sourceTreeSha256": tree_sha,
    "suppliedFiles": 321, "geometryChangedFromSuppliedRelease": False,
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
    assert sealed.testzip() is None and len(sealed.infolist()) == 323
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": tree_sha}))
