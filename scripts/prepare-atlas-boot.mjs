import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const baseRoot = 'src/assets/project-models/troitsk-r25v8-ui2';
const root = 'src/assets/project-models/troitsk-r25v8-ui3';
const base = JSON.parse(await readFile(`${baseRoot}/index.json`, 'utf8'));
const files = Object.fromEntries(Object.entries(base.files).map(([name,a]) => [name,{...a,source:a.source || 'v8-ui2'}]));
const chunks = []; let offset = 0;
async function original(name) {
  const a = base.files[name], dir = a.source ? `src/assets/project-models/troitsk-r25${a.source}` : baseRoot;
  const p = await readFile(`${dir}/${a.pack}`), b = p.subarray(a.offset,a.offset+a.storedBytes);
  return (a.compressed ? gunzipSync(b) : b).toString();
}
function append(name, text, contentType = 'text/javascript; charset=utf-8') {
  const b = Buffer.from(text), packed = gzipSync(b, {level:9});
  files[name] = {pack:'ui.bin',offset,storedBytes:packed.length,bytes:b.length,compressed:true,
    sha256:createHash('sha256').update(b).digest('hex'),contentType};
  chunks.push(packed); offset += packed.length;
}
const boot = await readFile('src/assets/atlas-ui/20260922-boot/boot.js','utf8');
const markup = await readFile('src/assets/atlas-ui/20260922-boot/boot.html','utf8');
let html = await original('index.html');
if (!html.includes('<head>') || !html.includes('<body')) throw Error('Unexpected Atlas HTML');
html = html.replace('<head>',`<head><script>${boot}</script>`).replace(/<body([^>]*)>/,`<body$1>${markup}`);
append('index.html',html,'text/html; charset=utf-8');
append('assets/prototype.js',await original('assets/prototype.js')+'\nwindow.AtlasBoot?.ready();\n');
append('assets/prototype.css',await original('assets/prototype.css')+'\n:root{--atlas-shell-style-ready:1}\n','text/css; charset=utf-8');
const revision = '20260922-4-first-paint';
for (const name of ['CURRENT_RELEASE.json','UI_RELEASE.json']) {
  const data = JSON.parse(await original(name)); data.ui_revision=revision; data.release='R25_V8_UI_20260922_BOOTFIX';
  data.first_paint_fix=true; append(name,JSON.stringify(data),'application/json');
}
// Keep the worker scope isolated; index and prototype.js are already precached.
append('assets/offline-manifest.js',`self.ATLAS_OFFLINE_VERSION=${JSON.stringify(revision)};\nself.ATLAS_OFFLINE_FILES=${JSON.stringify(Object.keys(files))};\nself.ATLAS_OFFLINE_SIZES=${JSON.stringify(Object.fromEntries(Object.entries(files).map(([n,a])=>[n,a.bytes])))};\n`);
append('MANIFEST.json',JSON.stringify({release:'R25_V8_UI_20260922_BOOTFIX',files:Object.entries(files).filter(([n])=>n!=='MANIFEST.json').map(([path,a])=>({path,size:a.bytes,sha256:a.sha256}))}),'application/json');
await mkdir(root,{recursive:true}); await writeFile(`${root}/ui.bin`,Buffer.concat(chunks));
await writeFile(`${root}/index.json`,JSON.stringify({release:'R25_V8_UI_20260922_BOOTFIX',files}));
console.log(JSON.stringify({revision,bytes:offset}));
