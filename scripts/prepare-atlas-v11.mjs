import {execFileSync} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync, gunzipSync} from 'node:zlib';

execFileSync(process.execPath,['scripts/prepare-atlas-r25v5.mjs','v11'],{stdio:'inherit'});
const root='src/assets/project-models/troitsk-r25v11';
const index=JSON.parse(await readFile(`${root}/index.json`,'utf8'));
if(index.pgsPatch==='verified-drawing-links-v5') process.exit(0);
const read=async name=>{
  const f=index.files[name], pack=await readFile(`${root}/${f.pack}`);
  const stored=pack.subarray(f.offset,f.offset+f.storedBytes);
  return f.compressed?gunzipSync(stored):stored;
};
const sha=b=>createHash('sha256').update(b).digest('hex');
function replaceOnce(text,before,after) {
  if(text.includes(after)) return text;
  if(text.split(before).length!==2) throw new Error('Unknown V11 source: '+before.slice(0,70));
  return text.replace(before,after);
}
const chunks=[];let offset=0;
function append(name,bytes) {
  const stored=gzipSync(bytes,{level:9});
  index.files[name]={...index.files[name],pack:'part-12.bin',offset,storedBytes:stored.length,bytes:bytes.length,compressed:true,sha256:sha(bytes)};
  chunks.push(stored);offset+=stored.length;
}
const file='assets/atlas-card.js';
let card=(await read(file)).toString();
const before="window.open(s.pdf_url.split('#')[0] + '#page=' + plan.pdfPage, '_blank', 'noopener');";
const after="const href = s.pdf_url.split('#')[0] + '#page=' + plan.pdfPage; const mapped = window.AtlasPackageLinks && window.AtlasPackageLinks.map(href); window.open(mapped ? mapped.href : href, '_blank', 'noopener');";
if (!card.includes(after)) {
  if(card.split(before).length!==2) throw new Error('Unknown V11 drawing navigation');
  card=card.replace(before,after);
}
card=replaceOnce(card,
  'const links = ((o.albumRecord && o.albumRecord.sources) || []).filter',
  'const assigned = window.__FULL_ATLAS.sourceLinks(o);\n    const links = assigned.filter');
append(file,Buffer.from(card));
let engine=(await read('assets/atlas-engine.js')).toString();
// Navigation may still be nested or already moved when asynchronous metadata resolves.
engine=replaceOnce(engine,"$('left').insertBefore(reviewControls,$('studyNavigation'));","$('studyNavigation').before(reviewControls);");
append('assets/atlas-engine.js',Buffer.from(replaceOnce(engine,
  'sourceAvailability:()=>albumSources,',
  'sourceAvailability:()=>albumSources,sourceLinks:o=>albumLinks(o),')));
const libraryHtml=(await read('library.html')).toString().replaceAll('<span data-release="sources">237</span>','<span>280</span>');
append('library.html',Buffer.from(replaceOnce(libraryHtml,
  '<script src="assets/library.js"></script>',
  '<script src="assets/source-recovery/registry.js"></script><script src="assets/source-recovery/runtime.js"></script><script src="assets/library.js"></script>')));
const library=(await read('assets/library.js')).toString();
append('assets/library.js',Buffer.from(replaceOnce(library,
  'delete window.ATLAS_LIBRARY_GZIP;',
  `delete window.ATLAS_LIBRARY_GZIP;const recovery=window.AtlasSourceRecovery.create(window.AtlasSourceRecoveryData,D.sources);D.sources=recovery.sources;D.records=D.records.map(r=>({...r,sources:recovery.links({sourceKeys:r.sources,albumRecord:r})}));$('sourcesTab').textContent='Источники · 237 + 43 восстановленных';`)));
const css=(await read('assets/prototype.css')).toString();
const breakpoint='@media (max-width: 1180px) and (min-width: 851px)';
append('assets/prototype.css',Buffer.from(replaceOnce(css,breakpoint,'@media (max-width: 1400px) and (min-width: 851px)')));
const release=JSON.parse((await read('CURRENT_RELEASE.json')).toString());
release.pgsRuntimeFix='Route alternate-sheet PDF buttons through the same verified package links as anchors.';
release.pgsRecoveryFix='Reuse the supplied source-recovery registry in element cards and the drawing library; no new engineering assignments.';
release.pgsStartupFix='Insert review controls beside the current navigation node regardless of metadata/prototype loading order.';
release.pgsLayoutFix='Use existing compact toolbar mode through 1400px to avoid overlapping labels with the inspector open.';
append('CURRENT_RELEASE.json',Buffer.from(JSON.stringify(release,null,2)));
const manifest=JSON.parse((await read('MANIFEST.json')).toString());
manifest.files=manifest.files.map(f=>({...f,bytes:index.files[f.path].bytes,sha256:index.files[f.path].sha256}));
append('MANIFEST.json',Buffer.from(JSON.stringify(manifest)));
const pack=Buffer.concat(chunks);
await writeFile(`${root}/part-12.bin`,pack);
index.packs['part-12.bin']={bytes:pack.length,sha256:sha(pack)};
index.pgsPatch='verified-drawing-links-v5';
await writeFile(`${root}/index.json`,JSON.stringify(index));
console.log('Atlas V11: verified drawing links and compact toolbar prepared');
