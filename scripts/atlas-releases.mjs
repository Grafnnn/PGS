const releases = {
  "v12-11": { release: "V12_11", files: 4480, bytes: 321337615, sha256: "4444d0edfd4a519686cfe6bb20bc6ee3d93c8a10acf9fa3ed656199cd9bcf33c" }
};

export function atlasRelease(version = "v12-11") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = `TROITSK_B24_ATLAS_${entry.release}`;
  return { ...entry, version, directory, root: `src/assets/project-models/troitsk-r25${version}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/atlas-r25${version}/${directory}_FULL.zip` };
}
