const releases = {
  "v12-11": { release: "V12_11", files: 4480, bytes: 321337615, sha256: "4444d0edfd4a519686cfe6bb20bc6ee3d93c8a10acf9fa3ed656199cd9bcf33c" },
  "dou200-r1-23": { release: "DOU200_R1_23", directory: "DOU200_ATLAS_R1_23", tag: "atlas-dou200-r1-23", assetDirectory: "dou200-r1-23", files: 6262, bytes: 287404098, sha256: "47e7258af3aa020fe0c8837969f4ce056a398c924fc7cd77a8685ec2d630470c" }
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
