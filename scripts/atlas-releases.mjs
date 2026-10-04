const releases = {
  "v12-10": { release: "V12_10", files: 4480, bytes: 321317921, sha256: "9e339c3a635735e8c97dfedb977038b09bfd0058eeae9758dea28c57529725fc" }
};

export function atlasRelease(version = "v12-10") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = `TROITSK_B24_ATLAS_${entry.release}`;
  return { ...entry, version, directory, root: `src/assets/project-models/troitsk-r25${version}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/atlas-r25${version}/${directory}_FULL.zip` };
}
