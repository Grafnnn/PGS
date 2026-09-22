import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {patchEngine,patchSettings,patchPrototype} from './atlas-ui-state-patch.mjs';
const baseRoot='src/assets/project-models/troitsk-r25v8-ui7',root='src/assets/project-models/troitsk-r25v8-ui8';
const base=JSON.parse(await readFile(`${baseRoot}/index.json`,'utf8'));
const files=Object.fromEntries(Object.entries(base.files).map(([n,a])=>[n,{...a,source:a.source||'v8-ui7'}]));
const chunks=[];let offset=0;
async function original(name){const a=base.files[name],dir=a.source?`src/assets/project-models/troitsk-r25${a.source}`:baseRoot;const p=await readFile(`${dir}/${a.pack}`),b=p.subarray(a.offset,a.offset+a.storedBytes);return(a.compressed?gunzipSync(b):b).toString();}
function append(name,text,contentType='application/json'){const b=Buffer.from(text),packed=gzipSync(b,{level:9});files[name]={pack:'ui.bin',offset,storedBytes:packed.length,bytes:b.length,compressed:true,sha256:createHash('sha256').update(b).digest('hex'),contentType};chunks.push(packed);offset+=packed.length;}
for(const [name,patch]of [['atlas-engine.js',patchEngine],['view-settings.js',patchSettings],['prototype.js',patchPrototype]])append('assets/'+name,patch(await original('assets/'+name)),'text/javascript; charset=utf-8');
const revision='20260923-9-audit-state',release='R25_V8_UI_20260923_AUDIT';
const current=JSON.parse(await original('CURRENT_RELEASE.json'));
append('CURRENT_COVERAGE_REPORT.json',JSON.stringify({
  release,ui_revision:revision,engineering_basis:current.base_release,
  active_world_bodies:current.active_world_bodies,catalogue_packages:current.catalogue_packages,
  new_world_placements:0,unverified_world_placements:47,unrecovered_historical_R11_CF_profiles:4,
  source_conflicts_resolved_by_executor_V6:current.source_conflicts_resolved_by_executor_V6,
  independent_source_acceptance:'Not claimed. Executor V6 resolution is not independent primary engineering acceptance; primary source evidence for 2566 remains incomplete.',
  sources:{active_with_source:10397,original:8557,recovered:1840,remaining_without_source:15,partial:3},
  historical_coverage_report:current.coverage_report,
  base_qa_summary:current.qa_summary,ui_qa_summary:'UI_AUDIT_REPORT.json',
  limitations:current.limitations,
  audit_scope:'UI state and source references only. Geometry and historical reports unchanged; no new engineering approval.'
}));
append('UI_AUDIT_REPORT.json',JSON.stringify({release,ui_revision:revision,scope:'Isolation reset, search scope reset, drawing zoom reopen and current coverage pointer',base_qa_summary:current.qa_summary,regression_tests:'src/lib/project-atlas-audit.test.ts',pr_evidence:'See release PR for test and browser results. This file does not claim independent engineering approval.'}));
for(const name of ['CURRENT_RELEASE.json','UI_RELEASE.json']){const data=JSON.parse(await original(name));data.ui_revision=revision;data.release=release;if(name==='CURRENT_RELEASE.json'){data.historical_coverage_report=data.coverage_report;data.coverage_report='CURRENT_COVERAGE_REPORT.json';data.base_qa_summary=data.qa_summary;data.ui_qa_summary='UI_AUDIT_REPORT.json';}append(name,JSON.stringify(data));}
append('assets/offline-manifest.js',`self.ATLAS_OFFLINE_VERSION=${JSON.stringify(revision)};\nself.ATLAS_OFFLINE_FILES=${JSON.stringify(Object.keys(files))};\nself.ATLAS_OFFLINE_SIZES=${JSON.stringify(Object.fromEntries(Object.entries(files).map(([n,a])=>[n,a.bytes])))};\n`,'text/javascript; charset=utf-8');
append('MANIFEST.json',JSON.stringify({release,files:Object.entries(files).filter(([n])=>n!=='MANIFEST.json').map(([path,a])=>({path,size:a.bytes,sha256:a.sha256}))}));
await mkdir(root,{recursive:true});await writeFile(`${root}/ui.bin`,Buffer.concat(chunks));await writeFile(`${root}/index.json`,JSON.stringify({release,files}));
console.log(JSON.stringify({revision,bytes:offset}));
