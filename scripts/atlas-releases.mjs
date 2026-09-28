const releases = {
  v5: { release: "R25_FINAL_V5", files: 30614, bytes: 630022254, sha256: "3d9e37415d6adcb24146b031c8e787d5dd20fc414ab0214b3027aa508e6c922f" },
  v8: { release: "R25_FINAL_V8", files: 30646, bytes: 825715771, sha256: "b4522e8690c9e9dce03b1109ada99fee293dd3d5bd55bfb1b74a7459de6c7b5e" },
  v11: { release: "V11", files: 4351, bytes: 288520181, sha256: "1efa1c3087b19e9bb7aa85493323c016c82b029531d9d5e437221f667b03e3f8" }
};

export function atlasRelease(version = "v5") {
  if (!Object.hasOwn(releases, version)) throw new Error("Unknown Atlas release");
  const entry = releases[version];
  const directory = `TROITSK_B24_ATLAS_${entry.release}`;
  return { ...entry, version, directory, root: `src/assets/project-models/troitsk-r25${version}`,
    url: `https://github.com/Grafnnn/PGS/releases/download/atlas-r25${version}/${directory}_FULL.zip` };
}
