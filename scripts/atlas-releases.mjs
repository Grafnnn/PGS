const releases = {
  "v12-1": { release: "V12_1", files: 4459, bytes: 321096315, sha256: "affee12d6b29122615ba535cb9d46d3062f4bd3ef07e23af7585a2e066f6ee2d" }
};

export function atlasRelease(version = "v12-1") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = `TROITSK_B24_ATLAS_${entry.release}`;
  return { ...entry, version, directory, root: `src/assets/project-models/troitsk-r25${version}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/atlas-r25${version}/${directory}_FULL.zip` };
}
