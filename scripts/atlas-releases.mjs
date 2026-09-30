const releases = {
  "v11-5": { release: "V11_5", files: 4419, bytes: 318764758, sha256: "4fcc856890de6159e3fafa8349183733581bb8b726a7e79eae5057dc59a6cdfd" }
};

export function atlasRelease(version = "v11-5") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = `TROITSK_B24_ATLAS_${entry.release}`;
  return { ...entry, version, directory, root: `src/assets/project-models/troitsk-r25${version}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/atlas-r25${version}/${directory}_FULL.zip` };
}
