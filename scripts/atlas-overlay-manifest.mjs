export function rebuildAtlasManifest(base, release, overlays, appendPaths = []) {
  const pending = new Map(overlays);
  const append = new Set(appendPaths);
  if (append.size !== appendPaths.length) throw new Error("Duplicate Atlas manifest append path");
  const names = new Set();
  const files = base.files.map(file => {
    if (names.has(file.path)) throw new Error("Duplicate Atlas baseline manifest path: " + file.path);
    names.add(file.path);
    if (append.has(file.path)) throw new Error("Atlas append path already exists in the baseline: " + file.path);
    const next = pending.get(file.path);
    if (!next) return file;
    pending.delete(file.path);
    return { ...file, bytes: next.bytes, sha256: next.sha256 };
  });
  // ASCII paths sort identically in JavaScript and the author's UTF-8 manifest builder.
  for (const path of [...append].sort()) {
    if (!/^[\x20-\x7e]+$/.test(path) || path.includes("\\") || path === "MANIFEST.json" ||
        path.split("/").some(part => !part || part === "." || part === "..")) {
      throw new Error("Invalid Atlas manifest append path: " + path);
    }
    const next = pending.get(path);
    if (!next) throw new Error("Atlas append path has no overlay file: " + path);
    files.push({ path, bytes: next.bytes, sha256: next.sha256 });
    pending.delete(path);
  }
  if (pending.size) throw new Error("Undeclared Atlas manifest append path: " + pending.keys().next().value);
  return JSON.stringify({ ...base, release, files }, null, 2) + "\n";
}
