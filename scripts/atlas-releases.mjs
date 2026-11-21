const releases = {
  "v12-18": { release: "V12_18", files: 4661, bytes: 419472395, sha256: "329b84daa82dbd74b1b7153dc0ccb891a3f27dbab9f1f0a9d3cd22eac7c407f5" },
  "dou200-r1-27": { release: "DOU200_R1_27", directory: "DOU200_ATLAS_R1_27", tag: "atlas-dou200-r1-27", assetDirectory: "dou200-r1-27", files: 6303, bytes: 309497953, sha256: "e4673730988aea3fdc6e69b3546c794ea78a2971ad3a4a83a94ee28ba3471e9a" },
  "zagoryanka-1500-r1-0": { release: "ZAGORYANKA_1500_R1_0", directory: "ZAGORYANKA_1500_ATLAS_R1_0", tag: "atlas-zagoryanka-1500-r1-0", assetDirectory: "zagoryanka-1500-r1-0", files: 167, bytes: 15496464, sha256: "abdfb943d354372a21897f767489411fa43b16b0fdd97df0c69074cf5db4b5e6" },
  "goluboe-vodovod-r1-2-terrain-snapshot": { release: "GOLUBOE_VODOVOD_R1_2_TERRAIN_SNAPSHOT", directory: "GOLUBOE_VODOVOD_ATLAS_R1_2_TERRAIN_SNAPSHOT", tag: "atlas-goluboe-vodovod-r1-2-terrain-snapshot", assetDirectory: "goluboe-vodovod-r1-2-terrain-snapshot", files: 331, bytes: 23557810, sha256: "c3c7b600be8dfc1460ed71c0a9387844b0bf114e18472e6979cc9e9d12721f4d" },
  "goluboe-vodovod-r1-2-field-pilot-01": { release: "GOLUBOE_VODOVOD_R1_2_FIELD_PILOT_01", directory: "GOLUBOE_VODOVOD_ATLAS_R1_2_FIELD_PILOT_01", tag: "atlas-goluboe-vodovod-r1-2-field-pilot-01", assetDirectory: "goluboe-vodovod-r1-2-field-pilot-01", files: 335, bytes: 23610674, sha256: "c545e880c6f1c6042dccf5560cd9e4f9e055fd6a9853ca333ee350cb7fec6774" },
  "goluboe-vodovod-r1-2-field-pilot-02": { release: "GOLUBOE_VODOVOD_R1_2_FIELD_PILOT_02", directory: "GOLUBOE_VODOVOD_ATLAS_R1_2_FIELD_PILOT_02", tag: "atlas-goluboe-vodovod-r1-2-field-pilot-02", assetDirectory: "goluboe-vodovod-r1-2-field-pilot-02", files: 336, bytes: 23614933, sha256: "10211efdf7e4a8d4bf8fba68c24414cb76ec2f304bb00d35277bac0a5948825c" },
  "goluboe-vodovod-r1-2-field-pilot-02-ux-01": { release: "GOLUBOE_VODOVOD_R1_2_FIELD_PILOT_02_UX_01", directory: "GOLUBOE_VODOVOD_ATLAS_R1_2_FIELD_PILOT_02_UX_01", tag: "atlas-goluboe-vodovod-r1-2-field-pilot-02-ux-01", assetDirectory: "goluboe-vodovod-r1-2-field-pilot-02-ux-01", files: 336, bytes: 23627927, sha256: "0aa27fb0377e8ec98de65f7988bd021b1c70a347eb1bc41c634111b21b5c5f45" },
  "goluboe-vodovod-r1-3": { release: "GOLUBOE_VODOVOD_R1_3", directory: "GOLUBOE_VODOVOD_ATLAS_R1_3", tag: "atlas-goluboe-vodovod-r1-3", assetDirectory: "goluboe-vodovod-r1-3", files: 339, bytes: 23643978, sha256: "721f3379631398ddab5b412768f9c821f0d4371ba1bd4e4f199316f83abb56d7" },
  "goluboe-vodovod-r1-4": {
    release: "GOLUBOE_VODOVOD_R1_4", directory: "GOLUBOE_VODOVOD_ATLAS_R1_4", assetDirectory: "goluboe-vodovod-r1-4", files: 339,
    base: "goluboe-vodovod-r1-3", manifestSha256: "f6df69c6463f2decb7e3ebd50f5300ba506e2ff8aab966493f51781761459927",
    overlay: ["assets/graphics-optimization-module.js", "assets/offline-manifest.js", "CURRENT_RELEASE.json", "MANIFEST.json"]
  },
  "goluboe-vodovod-r1-5": {
    release: "GOLUBOE_VODOVOD_R1_5", directory: "GOLUBOE_VODOVOD_ATLAS_R1_5", assetDirectory: "goluboe-vodovod-r1-5", files: 339,
    base: "goluboe-vodovod-r1-3", manifestSha256: "b3e7edd1eeeed6a9955b8222a7fce192781e0dd9f40e9718ebbe9ed3f86b1388",
    overlay: ["assets/graphics-optimization-module.js", "assets/atlas-engine.js", "data/geometry_02.js", "assets/offline-manifest.js", "CURRENT_RELEASE.json", "MANIFEST.json"],
    overlayFrom: { "assets/graphics-optimization-module.js": "goluboe-vodovod-r1-4" }
  }
};

export function atlasRelease(version = "v12-18") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = entry.directory ?? `TROITSK_B24_ATLAS_${entry.release}`;
  const tag = entry.tag ?? `atlas-r25${version}`;
  const assetDirectory = entry.assetDirectory ?? `troitsk-r25${version}`;
  return { ...entry, version, directory, root: `src/assets/project-models/${assetDirectory}`,
    url: entry.base ? undefined : `https://github.com/Grafnnn/PGS/releases/download/${tag}/${directory}_FULL.zip` };
}
