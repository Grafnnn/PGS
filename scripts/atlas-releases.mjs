const releases = {
  "v12-18": { release: "V12_18", files: 4661, bytes: 419472395, sha256: "329b84daa82dbd74b1b7153dc0ccb891a3f27dbab9f1f0a9d3cd22eac7c407f5" },
  "dou200-r1-27": { release: "DOU200_R1_27", directory: "DOU200_ATLAS_R1_27", tag: "atlas-dou200-r1-27", assetDirectory: "dou200-r1-27", files: 6303, bytes: 309497953, sha256: "e4673730988aea3fdc6e69b3546c794ea78a2971ad3a4a83a94ee28ba3471e9a" },
  "zagoryanka-1500-r1-0": { release: "ZAGORYANKA_1500_R1_0", directory: "ZAGORYANKA_1500_ATLAS_R1_0", tag: "atlas-zagoryanka-1500-r1-0", assetDirectory: "zagoryanka-1500-r1-0", files: 167, bytes: 15496464, sha256: "abdfb943d354372a21897f767489411fa43b16b0fdd97df0c69074cf5db4b5e6" },
  "goluboe-vodovod-r1-1": { release: "GOLUBOE_VODOVOD_R1_1", directory: "GOLUBOE_VODOVOD_ATLAS_R1_1", tag: "atlas-goluboe-vodovod-r1-1", assetDirectory: "goluboe-vodovod-r1-1", files: 206, bytes: 22775395, sha256: "630660210574dfbc2a1fa144d7bb7aa8bac0e935ff90a9f146baa346c9874303" }
};

export function atlasRelease(version = "v12-18") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = entry.directory ?? `TROITSK_B24_ATLAS_${entry.release}`;
  const tag = entry.tag ?? `atlas-r25${version}`;
  const assetDirectory = entry.assetDirectory ?? `troitsk-r25${version}`;
  return { ...entry, version, directory, root: `src/assets/project-models/${assetDirectory}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/${tag}/${directory}_FULL.zip` };
}
