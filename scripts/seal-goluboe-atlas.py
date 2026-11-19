"""Verify the approved website and seal it without changing supplied bytes."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "58e99ffadbe1efd010880ceba9fb014f6bd712a7a3dc5cc98317516bf4c6748a"
MANIFEST_SHA = "67e15cd76438aa7b90a7b87d81e462ee563fd0c2de6fee7b69e44417d177fa73"
METADATA_SHA = "f805c03c10daed837feecabb0a712bc65eaf1a4fab21ca7f8d1db203aca23689"
SOURCE_ROOT = "Atlas_goluboe-vodovod"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_1"
archive, source_manifest, handoff, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA, "Wrong source archive"
assert sha(source_manifest.read_bytes()) == MANIFEST_SHA, "Wrong source manifest"
receipt = json.loads(handoff.read_text())
assert receipt["zip_sha256"] == SOURCE_SHA and receipt["manifest_sha256"] == MANIFEST_SHA
assert receipt["metadata_sha256"] == METADATA_SHA and receipt["files"] == 204
expected = {}
for line in source_manifest.read_text().splitlines():
    digest, relative = line.split("  ", 1)
    assert relative not in expected and len(digest) == 64
    expected[relative] = digest
assert len(expected) == 204
files = {}
with zipfile.ZipFile(archive) as source:
    assert source.testzip() is None
    for info in source.infolist():
        name = PurePosixPath(info.filename)
        assert not name.is_absolute() and ".." not in name.parts and "\\" not in info.filename
        assert name.parts[0] == SOURCE_ROOT and not stat.S_ISLNK(info.external_attr >> 16)
        if info.is_dir():
            continue
        assert all(ord(c) < 128 for c in info.filename) or info.flag_bits & 0x800
        relative = str(PurePosixPath(*name.parts[1:]))
        assert relative not in files and relative in expected
        value = source.read(info)
        assert sha(value) == expected[relative], relative
        files[relative] = value
assert set(files) == set(expected)
assert sha(files["data/metadata-light.js"]) == METADATA_SHA
assert "CURRENT_RELEASE.json" not in files and "MANIFEST.json" not in files
assert sum(name.lower().endswith(".pdf") for name in files) == 6
inventory = [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(files.items())]
tree_sha = sha(json.dumps(inventory, ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_1", "projectId": "goluboe-vodovod", "revision": "R1.1",
    "publishedDate": "2026-11-19", "sourceArchiveSha256": SOURCE_SHA,
    "suppliedManifestSha256": MANIFEST_SHA, "sourceTreeSha256": tree_sha,
    "suppliedFiles": 204, "geometryChangedFromSuppliedRelease": False,
    "elementAssignmentsChanged": False, "newEngineeringApproval": False,
    "registryRecords": 144, "libraryRecords": 158, "worldBodies": 37, "localBodies": 37,
    "remarks": 19, "pdfs": 6, "znpOriginalIncluded": False,
    "limitations": ["The model represents design documentation PD 19/26-2026, not engineering acceptance.",
                    "Issue G-01 retains the single pipeline versus two or more required by ZnP.",
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
    assert sealed.testzip() is None and len(sealed.infolist()) == 206
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": tree_sha}))
