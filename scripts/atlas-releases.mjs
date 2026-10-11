const releases = {
  "v12-11": { release: "V12_11", files: 4480, bytes: 321337615, sha256: "4444d0edfd4a519686cfe6bb20bc6ee3d93c8a10acf9fa3ed656199cd9bcf33c" },
  "dou200-r1-21": { release: "DOU200_R1_21", directory: "DOU200_ATLAS_R1_21", tag: "atlas-dou200-r1-21", assetDirectory: "dou200-r1-21", files: 5959, bytes: 284363594, sha256: "a4ba23ddc8a7628f4ed6f7087541c2023301affd9d61d332d41e2fad09bf2468" }
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
