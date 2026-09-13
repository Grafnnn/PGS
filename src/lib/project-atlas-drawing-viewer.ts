import { createHash } from "node:crypto";
import drawings from "@/assets/project-models/troitsk-b24-atlas-3-2.drawings.json";

type Drawing = (typeof drawings.sources)[keyof typeof drawings.sources];
const sources: Record<string, Drawing> = drawings.sources;
const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const href = (file: string) => file.split("/").map(encodeURIComponent).join("/");

export function atlasDrawingPage(url: URL) {
  const key = url.searchParams.get("source") ?? "";
  if (!Object.prototype.hasOwnProperty.call(sources, key)) return null;
  const source = sources[key];
  const pageMode = url.searchParams.get("view") === "page";
  if (pageMode && !source.pageFile) return null;
  const file = pageMode ? source.pageFile! : source.file;
  const label = pageMode ? `PDF, страница ${source.pdfPage}` : "Исходный чертёж";
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(source.title)} · Троицк 3.2</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;font:14px/1.4 Arial,sans-serif;color:#173541;background:#f3f6f7}body{display:flex;flex-direction:column}header{flex:none;padding:12px 16px;background:white;border-bottom:1px solid #dbe4e8;display:flex;align-items:center;gap:12px;flex-wrap:wrap}header>div:first-child{flex:1;min-width:200px}h1{font-size:16px;font-weight:600;margin:0;overflow-wrap:anywhere}p{font-size:12px;color:#6d818b;margin:3px 0 0}.tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap}button,a{font:inherit;color:#173541;background:white;border:1px solid #dbe4e8;border-radius:3px;min-height:44px;padding:10px 12px;cursor:pointer;text-decoration:none}button:hover,a:hover{background:#edf4f5}button:focus-visible,a:focus-visible{outline:3px solid #71baca;outline-offset:2px}.icon{width:44px;padding:0;font-size:20px}#scale{width:48px;text-align:center;font-size:12px;font-variant-numeric:tabular-nums}#surface{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}#sheet{display:block;margin:16px auto;background:white;max-width:none}#error{padding:16px;color:#9b3423}[hidden]{display:none!important}@media(max-width:520px){header{padding:10px;gap:8px}h1{font-size:14px}.tools{width:100%}.tools a{font-size:12px}#close{margin-left:auto}}
</style></head><body><header><div><h1>${escape(source.title)}</h1><p>${escape(label)}${source.printedSheet ? ` · Лист ${escape(source.printedSheet)}` : ""}</p></div><div class="tools">
<button id="out" class="icon" aria-label="Уменьшить" title="Уменьшить">−</button><span id="scale" aria-live="polite">…</span><button id="in" class="icon" aria-label="Увеличить" title="Увеличить">+</button><button id="fit">Вписать</button>
${source.pdf ? `<a href="${escape(href(source.pdf))}" download>Скачать PDF</a>` : `<a href="${escape(href(source.file))}" download>Скачать чертёж</a>`}<button id="close" title="Вернуться к Атласу">Закрыть лист</button></div></header>
<div id="surface"><p id="error" hidden>Не удалось загрузить чертёж. Исходный файл доступен по кнопке скачивания.</p><img id="sheet" src="${escape(href(file))}" alt="${escape(source.title)}" decoding="async"></div>
<script>
const sheet=document.getElementById('sheet'),surface=document.getElementById('surface');let scale=1;
function zoom(value){scale=Math.max(.05,Math.min(4,value));sheet.style.width=Math.round(sheet.naturalWidth*scale)+'px';document.getElementById('scale').textContent=Math.round(scale*100)+'%';}
function fit(){if(!sheet.naturalWidth)return;zoom(Math.min((surface.clientWidth-32)/sheet.naturalWidth,(surface.clientHeight-32)/sheet.naturalHeight));surface.scrollTop=0;surface.scrollLeft=0;}
document.getElementById('in').onclick=()=>zoom(scale*1.4);document.getElementById('out').onclick=()=>zoom(scale/1.4);document.getElementById('fit').onclick=fit;
document.getElementById('close').onclick=()=>window.close();window.addEventListener('keydown',e=>{if(e.key==='Escape')window.close();});
sheet.onload=fit;sheet.onerror=()=>{document.getElementById('error').hidden=false;sheet.hidden=true;};if(sheet.complete)fit();
</script></body></html>`;
  return { html, etag: `W/"${createHash("sha256").update(html).digest("hex")}"` };
}
