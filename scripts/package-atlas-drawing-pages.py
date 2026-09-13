"""Render only registered PDF pages offline. Requires pypdfium2 and Pillow."""
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import re

import pypdfium2 as pdfium

root = Path(__file__).resolve().parents[1]
asset_root = root / "src/assets/project-models/troitsk-b24-atlas-3-2"
manifest = json.loads(asset_root.with_suffix(".manifest.json").read_text())
if manifest["sourceManifestSha256"] != "0b90daba4cb11f4f2e4155525f515b0b7d69d1a6e499141053b6c5fabd7fc601":
    raise ValueError("Not the frozen Atlas 3.2")


def read_asset(name):
    asset = manifest["files"][name]
    stored = (asset_root / asset["storage"]).read_bytes()
    data = gzip.decompress(stored) if asset["compressed"] else stored
    if hashlib.sha256(data).hexdigest() != asset["sha256"]:
        raise ValueError("Source checksum mismatch: " + name)
    return data


script = read_asset("data/sources.js").decode()
packed = re.search(r'ALBUM_ACCEPT\([^,]+,\s*("[^"]+")', script).group(1)
registry = json.loads(gzip.decompress(base64.b64decode(json.loads(packed))))["sources"]
output = asset_root / "drawing-pages"
output.mkdir(exist_ok=True)
files, sources, rendered, documents = {}, {}, {}, {}
try:
    for key, source in registry.items():
        read_asset(source["file"])
        pdf, page = source.get("pdf"), source.get("pdf_page")
        page_file = None
        if pdf and isinstance(page, int) and page > 0:
            identity = (pdf, page)
            if identity not in rendered:
                if pdf not in documents:
                    documents[pdf] = pdfium.PdfDocument(read_asset(pdf))
                document = documents[pdf]
                if page > len(document):
                    raise ValueError("Invalid registered PDF page")
                sheet = document[page - 1]
                try:
                    scale = 3200 / max(sheet.get_size())
                    bitmap = sheet.render(scale=scale)
                    image = bitmap.to_pil()
                    buffer = io.BytesIO()
                    image.save(buffer, format="WEBP", lossless=True, method=4)
                    data = buffer.getvalue()
                    width, height = image.size
                    image.close()
                    bitmap.close()
                finally:
                    sheet.close()
                sha = hashlib.sha256(data).hexdigest()
                filename = f"drawing-pages/{sha}.webp"
                (asset_root / filename).write_bytes(data)
                files[filename] = {
                    "sha256": sha, "bytes": len(data), "storage": filename,
                    "storedBytes": len(data), "compressed": False, "contentType": "image/webp",
                    "pdf": pdf, "pdfSha256": manifest["files"][pdf]["sha256"], "pdfPage": page,
                    "width": width, "height": height,
                }
                rendered[identity] = filename
                if len(rendered) % 20 == 0:
                    print(f"Rendered {len(rendered)} registered pages", flush=True)
            page_file = rendered[identity]
        sources[key] = {
            "title": source["title"], "file": source["file"], "printedSheet": source.get("printed_sheet"),
            "pdf": pdf, "pdfPage": page, "pageFile": page_file,
        }
finally:
    for document in documents.values():
        document.close()

result = {
    "sourceManifestSha256": manifest["sourceManifestSha256"],
    "sourceRegistrySha256": manifest["files"]["data/sources.js"]["sha256"],
    "renderer": {"name": "pypdfium2", "version": str(pdfium.PYPDFIUM_INFO), "maxDimension": 3200, "format": "lossless WebP"},
    "sources": sources, "files": files,
}
target = root / "src/assets/project-models/troitsk-b24-atlas-3-2.drawings.json"
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
print(json.dumps({"sources": len(sources), "pdfPages": len(rendered), "bytes": sum(f["bytes"] for f in files.values())}))
