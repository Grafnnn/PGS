const releases = {
  "v12-11": { release: "V12_11", files: 4480, bytes: 321337615, sha256: "4444d0edfd4a519686cfe6bb20bc6ee3d93c8a10acf9fa3ed656199cd9bcf33c" },
  "dou200-r1-24": { release: "DOU200_R1_24", directory: "DOU200_ATLAS_R1_24", tag: "atlas-dou200-r1-24", assetDirectory: "dou200-r1-24", files: 6271, bytes: 288028032, sha256: "a316f42ec3d7a1e329cc52ce3c92210b1736039cc9afad62beaacbb90643ed68" }
};

export function atlasRelease(version = "v12-11") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = entry.directory ?? `TROITSK_B24_ATLAS_${entry.release}`;
  const tag = entry.tag ?? `atlas-r25${version}`;
  const assetDirectory = entry.assetDirectory ?? `troitsk-r25${version}`;
  return { ...entry, version, directory, root: `src/assets/project-models/${assetDirectory}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/${tag}/${directory}_FULL.zip` };
}
