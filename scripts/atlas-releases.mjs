const releases = {
  "v12-8": { release: "V12_8", files: 4480, bytes: 321251124, sha256: "1d00f7483302c39af853f4b15927a75caaa15542f0bfc90fa6f34c914f46bc0c" }
};

export function atlasRelease(version = "v12-8") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = `TROITSK_B24_ATLAS_${entry.release}`;
  return { ...entry, version, directory, root: `src/assets/project-models/troitsk-r25${version}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/atlas-r25${version}/${directory}_FULL.zip` };
}
