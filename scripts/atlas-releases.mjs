const releases = {
  "v12-16": { release: "V12_16", files: 4566, bytes: 404807634, sha256: "5c7da828e1269f44320ec3edf4ef6d8fe9a2bc7a67be845f3b5249f3a1f76bc4" },
  "dou200-r1-27": { release: "DOU200_R1_27", directory: "DOU200_ATLAS_R1_27", tag: "atlas-dou200-r1-27", assetDirectory: "dou200-r1-27", files: 6303, bytes: 309497953, sha256: "e4673730988aea3fdc6e69b3546c794ea78a2971ad3a4a83a94ee28ba3471e9a" }
};

export function atlasRelease(version = "v12-16") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = entry.directory ?? `TROITSK_B24_ATLAS_${entry.release}`;
  const tag = entry.tag ?? `atlas-r25${version}`;
  const assetDirectory = entry.assetDirectory ?? `troitsk-r25${version}`;
  return { ...entry, version, directory, root: `src/assets/project-models/${assetDirectory}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/${tag}/${directory}_FULL.zip` };
}
