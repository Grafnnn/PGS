const releases = {
  v11: { release: "V11", files: 4351, bytes: 288520181, sha256: "1efa1c3087b19e9bb7aa85493323c016c82b029531d9d5e437221f667b03e3f8" }
};

export function atlasRelease(version = "v11") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = `TROITSK_B24_ATLAS_${entry.release}`;
  return { ...entry, version, directory, root: `src/assets/project-models/troitsk-r25${version}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/atlas-r25${version}/${directory}_FULL.zip` };
}
