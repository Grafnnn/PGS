"""Seal only the verified publication ZIP, preserving every supplied file."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "408cfc2cece28aebb5cd14a6a5be29edd164f42d2b9e00751f8fc7f8ee5ea022"
SOURCE_ROOT = "Atlas_zagoryanka-1500"
ROOT = "ZAGORYANKA_1500_ATLAS_R1_0"
archive, handoff, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA, "Wrong source archive"
expected = json.loads(handoff.read_text())
assert expected["zip_sha256"] == SOURCE_SHA
assert archive.stat().st_size == expected["zip_bytes"] == 15489553
assert len(expected["files"]) == 165
files = {}
with zipfile.ZipFile(archive) as source:
    assert source.testzip() is None, "Archive CRC failed"
    for info in source.infolist():
        name = PurePosixPath(info.filename)
        assert not name.is_absolute() and ".." not in name.parts
        assert name.parts[0] == SOURCE_ROOT and "\\" not in info.filename
        assert not stat.S_ISLNK(info.external_attr >> 16)
        if info.is_dir():
            continue
        assert all(ord(c) < 128 for c in info.filename) or info.flag_bits & 0x800
        relative = str(PurePosixPath(*name.parts[1:]))
        assert relative not in files and relative in expected["files"]
        value = source.read(info)
        assert sha(value) == expected["files"][relative]["sha256"]
        assert len(value) == expected["files"][relative]["bytes"]
        files[relative] = value
assert set(files) == set(expected["files"])
assert "CURRENT_RELEASE.json" not in files and "MANIFEST.json" not in files
inventory = [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(files.items())]
tree_sha = sha(json.dumps(inventory, ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "ZAGORYANKA_1500_R1_0", "projectId": "zagoryanka-1500", "revision": "R1.0",
    "publishedDate": "2026-11-19", "sourceArchiveSha256": SOURCE_SHA, "sourceTreeSha256": tree_sha,
    "suppliedFiles": 165, "geometryChangedFromSuppliedRelease": False, "elementAssignmentsChanged": False,
    "newEngineeringApproval": False, "registryRecords": 99, "libraryRecords": 111,
    "bodies": 34, "profileBodies": 11, "localBodies": 23, "plannedStages": 45, "remarks": 11,
    "limitations": ["The route and wells have no confirmed plan placement.",
                    "The world view is an unfolded longitudinal profile, not a surveyed site model.",
                    "Local geometry, inventory-only records and open design issues remain as supplied.",
                    "Construction progress remains local-only; no server synchronization is provided."]
}
files["CURRENT_RELEASE.json"] = (json.dumps(metadata, indent=2) + "\n").encode()
manifest = {"release": metadata["release"], "sourceArchiveSha256": SOURCE_SHA, "sourceTreeSha256": tree_sha,
            "files": [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(files.items())]}
files["MANIFEST.json"] = json.dumps(manifest, separators=(",", ":")).encode()
destination.mkdir(exist_ok=False)
folder = destination / ROOT
for name, value in files.items():
    target = folder / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(value)
output = destination / (ROOT + "_FULL.zip")
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as out:
    for name, value in sorted(files.items()):
        out.writestr(ROOT + "/" + name, value)
with zipfile.ZipFile(output) as sealed:
    assert sealed.testzip() is None
    assert len(sealed.infolist()) == 167
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files),
                  "bytes": output.stat().st_size, "sha256": sha(output.read_bytes()), "sourceTreeSha256": tree_sha}))
