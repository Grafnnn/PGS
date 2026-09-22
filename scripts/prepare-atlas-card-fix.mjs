import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const baseRoot='src/assets/project-models/troitsk-r25v8-ui4', root='src/assets/project-models/troitsk-r25v8-ui5';
const base=JSON.parse(await readFile(`${baseRoot}/index.json`,'utf8'));
const files=Object.fromEntries(Object.entries(base.files).map(([n,a])=>[n,{...a,source:a.source||'v8-ui4'}]));
const chunks=[];let offset=0;
async function original(name){const a=base.files[name],dir=a.source?`src/assets/project-models/troitsk-r25${a.source}`:baseRoot;const p=await readFile(`${dir}/${a.pack}`),b=p.subarray(a.offset,a.offset+a.storedBytes);return(a.compressed?gunzipSync(b):b).toString();}
function append(name,text,contentType='text/javascript; charset=utf-8'){const b=Buffer.from(text),packed=gzipSync(b,{level:9});files[name]={pack:'ui.bin',offset,storedBytes:packed.length,bytes:b.length,compressed:true,sha256:createHash('sha256').update(b).digest('hex'),contentType};chunks.push(packed);offset+=packed.length;}
const old=await readFile('src/assets/atlas-ui/20260922-card/engineering-fields.js','utf8');
const updated=await readFile('src/assets/atlas-ui/20260922-card-fix/engineering-fields.js','utf8');
const script=await original('assets/prototype.js');
if(script.split(old).length!==2)throw Error('Expected one engineering fields module');
append('assets/prototype.js',script.replace(old,updated));
const revision='20260922-6-explicit-dimensions';
for(const name of ['CURRENT_RELEASE.json','UI_RELEASE.json']){const data=JSON.parse(await original(name));data.ui_revision=revision;data.release='R25_V8_UI_20260922_CARD_FIX';append(name,JSON.stringify(data),'application/json');}
append('assets/offline-manifest.js',`self.ATLAS_OFFLINE_VERSION=${JSON.stringify(revision)};\nself.ATLAS_OFFLINE_FILES=${JSON.stringify(Object.keys(files))};\nself.ATLAS_OFFLINE_SIZES=${JSON.stringify(Object.fromEntries(Object.entries(files).map(([n,a])=>[n,a.bytes])))};\n`);
append('MANIFEST.json',JSON.stringify({release:'R25_V8_UI_20260922_CARD_FIX',files:Object.entries(files).filter(([n])=>n!=='MANIFEST.json').map(([path,a])=>({path,size:a.bytes,sha256:a.sha256}))}),'application/json');
await mkdir(root,{recursive:true});await writeFile(`${root}/ui.bin`,Buffer.concat(chunks));await writeFile(`${root}/index.json`,JSON.stringify({release:'R25_V8_UI_20260922_CARD_FIX',files}));
console.log(JSON.stringify({revision,bytes:offset}));
