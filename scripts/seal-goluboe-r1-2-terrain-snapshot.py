"""Seal the exact pinned Goluboe terrain-snapshot source files."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

SOURCE_SHA = "a11cb956b7b39a610344b53fb1fbd7b30eebda5f0d550e1af77c8829c0d32c88"
MANIFEST_SHA = "accfaf7bcc72f0f75faa068ad63c382d502188554f6970a32e8446bc037649c2"
ROOT = "GOLUBOE_VODOVOD_ATLAS_R1_2_TERRAIN_SNAPSHOT"
archive, source_manifest, upstream_manifest, destination = map(Path, sys.argv[1:])
sha = lambda value: hashlib.sha256(value).hexdigest()
assert sha(archive.read_bytes()) == SOURCE_SHA
assert sha(source_manifest.read_bytes()) == MANIFEST_SHA
expected = {}
for line in source_manifest.read_text().splitlines():
    digest, name = line.split("  ", 1)
    assert name not in expected and len(digest) == 64
    expected[name] = digest
assert len(expected) == 329
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

upstream_bytes = upstream_manifest.read_bytes()
assert sha(upstream_bytes) == "85c6ad9e9f23cad53a4673f6bdbc10f669340826bad9e8ecfce85710dbc81de5"
upstream_release = json.loads(upstream_bytes)
assert upstream_release["release"] == "GOLUBOE_VODOVOD_R1_2_TERRAIN_DEPTH"
upstream = {entry["path"]: entry["sha256"] for entry in upstream_release["files"] if entry["path"] != "CURRENT_RELEASE.json"}
changed = {
    "assets/atlas-engine.js": "a1a203de679f104cedef317e4b8e52dd7d41915ffa787403fd6de54692a74ab7",
    "assets/offline-manifest.js": "c86e012957060295eab0fde6d11f14a6701893431f5e99e790b995baa23e4819",
    "project/terrain-overlay.js": "34c67b78cf1efcfb83023f20b5b0ba21357123dfe5f2c33fc4d3935048928217",
}
assert len(upstream) == 329 and set(changed) <= set(upstream)
assert expected == {**upstream, **changed}
assert all(upstream[name] != digest for name, digest in changed.items())
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
assert offline not in cached and set(changed) - {offline} <= set(cached)
assert all(sizes[name] == len(files[name]) for name in cached)
signature = "".join(f"{name}\t{digest}\n" for name, digest in sorted(expected.items()) if name != offline)
build = "pkg-" + sha(signature.encode())[:12]
assert literal("self.ATLAS_OFFLINE_VERSION") == build == "pkg-f49a2b22919b"
inventory = lambda values: [{"path": name, "bytes": len(value), "sha256": sha(value)} for name, value in sorted(values.items())]
corrected_tree_sha = sha(json.dumps(inventory(files), ensure_ascii=True, separators=(",", ":")).encode())
metadata = {
    "release": "GOLUBOE_VODOVOD_R1_2_TERRAIN_SNAPSHOT", "projectId": "goluboe-vodovod", "revision": "R1.2",
    "publishedDate": "2026-11-20", "sourceArchiveSha256": SOURCE_SHA, "suppliedManifestSha256": MANIFEST_SHA,
    "sourceTreeSha256": corrected_tree_sha, "suppliedFiles": 329, "offlineVersion": build,
    "publicationModifiedFiles": [],
    "upstreamSourceTreeSha256": upstream_release["sourceTreeSha256"], "upstreamManifestSha256": sha(upstream_bytes),
    "changedFromUpstream": sorted(changed), "unchangedFromUpstream": 326,
    "geometryChangedFromSuppliedRelease": False, "elementAssignmentsChanged": False, "newEngineeringApproval": False,
    "registryRecords": 264, "libraryRecords": 278, "worldBodies": 154, "localBodies": 40,
    "remarks": 23, "pdfs": 6, "znpOriginalIncluded": False,
    "limitations": ["The model represents PD 19/26-2026, not engineering acceptance.",
                    "Contours and depths are derived from the model's visible terrain mesh, not an as-built survey.",
                    "Depth is undefined in terrain cutouts and outside the terrain mesh.",
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
    assert sealed.testzip() is None and len(sealed.infolist()) == 331
    for name, value in files.items():
        assert sealed.read(ROOT + "/" + name) == value
print(json.dumps({"directory": ROOT, "zip": str(output), "files": len(files), "bytes": output.stat().st_size,
                  "sha256": sha(output.read_bytes()), "sourceTreeSha256": corrected_tree_sha,
                  "manifestSha256": sha(files["MANIFEST.json"]), "offlineVersion": build}))
