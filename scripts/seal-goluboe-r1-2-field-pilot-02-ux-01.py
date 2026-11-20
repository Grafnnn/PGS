"""Seal the exact Field Pilot 02 UX 01 site, excluding ZIP-root support files."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "b63456d28031fafd10a02eba7d7725c2ca2a9ffa3a5b76a0167de7359d5a5ef1"
MANIFEST_SHA = "63a2612d4c34c147b2279c010c7a9324a6153cdd9d913252c56ed9c8de2b46a2"
UPSTREAM_MANIFEST_SHA = "1c7ef217bae4f1d5183e4b0f446493dabdf92ef01d15cd9e940585d0f230d301"
WORKER_SHA = "9ae05e295372984a45d5b15990ff1449d393e8d07ca0a59955716ef139907259"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_2_FIELD_PILOT_02_UX_01"
SITE = "Atlas_goluboe-vodovod"
archive, upstream_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA
assert sha(upstream_manifest.read_bytes()) == UPSTREAM_MANIFEST_SHA
upstream_release = json.loads(upstream_manifest.read_bytes())
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_2_FIELD_PILOT_02"
upstream = {entry["path"]: entry["sha256"] for entry in upstream_release["files"] if entry["path"] != "CURRENT_RELEASE.json"}
expected = {}
files = {}
with zipfile.ZipFile(archive) as source:
    assert source.testzip() is None
    assert len(source.namelist()) == len(set(source.namelist()))
    manifest = source.read("SHA256SUMS")
    assert sha(manifest) == MANIFEST_SHA
    for line in manifest.decode().splitlines():
        digest, name = line.split("  ", 1)
        assert name.startswith(SITE + "/") and name not in expected and len(digest) == 64
        expected[name] = digest
    assert len(expected) == 334
    for info in source.infolist():
        name = PurePosixPath(info.filename)
        assert not name.is_absolute() and ".." not in name.parts and "\\" not in info.filename
        assert not stat.S_ISLNK(info.external_attr >> 16)
        if info.is_dir() or name.parts[0] != SITE:
            continue
        assert all(ord(c) < 128 for c in info.filename) or info.flag_bits & 0x800
        value = source.read(info)
        assert sha(value) == expected[info.filename], info.filename
        files[str(name.relative_to(SITE))] = value
assert {SITE + "/" + name for name in files} == set(expected)
changed = {
    "assets/atlas-field-offline.js": "83cc87cd69073781752810aa317a081f87442d09e58dbba30ab74c85323e8719",
    "assets/atlas-field-print.js": "547a1b42d3437ae4b9dc68415122fa51a0ea234a87d8dbd256780e772d6219e7",
    "assets/atlas-field.js": "5dc9bef5bd274b378bd513fb42dbb7e00105dd2c33780cab558b301244225c88",
    "assets/offline-manifest.js": "d9f42f73f5388ab0b32d2569a9945e1c4a357279a7600297dcd632899604a37b",
    "project/field-data.js": "c0a959f966784ee3e95e298fa212a936156d6e89628e9a0ccfd2941a7ad37019",
    "project/field-pilot-overlay.js": "ef80fbab76b27ad52c95dcba0ed30d73bfae63fbd814ff71dc73006e0e196336",
    "project/terrain-overlay.js": "a4cda532a1449c360841eb71189c94076595b1c1585baea1e2a19c7017bb31d0",
    "project/terrain-tools.js": "7bf1ef845cbd786e979fa6408598adc31e3f85ca7f4dd18f485cc751a444f7d5",
}
overlay = "project/field-pilot-overlay.js"
assert len(upstream) == 334 and set(changed) <= set(upstream)
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
assert overlay in cached and offline not in cached
assert all(sizes[name] == len(files[name]) for name in cached)
build = literal("self.ATLAS_OFFLINE_VERSION")
assert build == "field-e58fc482c96a"
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
corrected_tree_sha = sha(json.dumps(inventory(files), ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_2_FIELD_PILOT_02_UX_01", "projectId": "goluboe-vodovod", "revision": "R1.2-field-2-ux-1",
    "publishedDate": "2026-11-21", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedFiles": 334, "publicationModifiedFiles": [],
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": UPSTREAM_MANIFEST_SHA,
    "changedFromUpstream": sorted(changed), "addedToUpstream": [], "offlineVersion": build,
    "workerSha256": WORKER_SHA, "geometryChangedFromSuppliedRelease": False, "newEngineeringApproval": False, "pdfs": 6,
    "limitations": ["Pilot limited to PK0+00 through PK0+45 in the field kit.",
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
    assert sealed.testzip() is None and len(sealed.infolist()) == 336
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": corrected_tree_sha,
                  "manifestSha256": sha(files["MANIFEST.json"]), "offlineVersion": build,
                  "workerSha256": WORKER_SHA}))
