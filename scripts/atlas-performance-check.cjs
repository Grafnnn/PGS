// Offline, reproducible renderer comparison and a local native-browser review server.
// Run with Node: scripts/atlas-performance-check.cjs bench | serve [port] | handoff <folder>
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),vm=require('node:vm'),crypto=require('node:crypto');
const {Worker}=require('node:worker_threads'),http=require('node:http'),ts=require('typescript');
const root=process.cwd(),cache=new Map();
function loadTs(name){
  const file=path.join(root,name);if(cache.has(file))return cache.get(file);
  if(file.endsWith('.json'))return JSON.parse(fs.readFileSync(file,'utf8'));
  const exports={};cache.set(file,exports);
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(source,{exports,require:id=>id.startsWith('.')||id.startsWith('@/')?loadTs((id.startsWith('@/')?'src/'+id.slice(2):path.relative(root,path.resolve(path.dirname(file),id)))+(id.endsWith('.json')?'':'.ts')):require(id),Buffer,URL,URLSearchParams,Request,Response,Headers,console,process,performance},{filename:file});
  return exports;
}
const perf=loadTs('src/lib/project-atlas-performance-adapter.ts');
const controls=loadTs('src/lib/project-atlas-controls.ts');
const drawing=loadTs('src/lib/project-atlas-drawing-adapter.ts');
const navigation=loadTs('src/lib/project-atlas-navigation-adapter.ts');
const navigationStyles=loadTs('src/lib/project-atlas-navigation-styles.ts');
const manifest=loadTs('src/assets/project-models/troitsk-b24-atlas-3-2.manifest.json');
const derived=loadTs('src/assets/project-models/troitsk-b24-atlas-3-2.drawings.json');
const assetRoot=path.join(root,'src/assets/project-models/troitsk-b24-atlas-3-2');
function bytes(name){const a=manifest.files[name]||derived.files[name];const b=fs.readFileSync(path.join(assetRoot,a.storage));return a.compressed?zlib.gunzipSync(b):b;}
function data(name){let packed;vm.runInNewContext(bytes(name).toString(),{window:{ALBUM_ACCEPT:(_key,value)=>packed=value}});return JSON.parse(zlib.gunzipSync(Buffer.from(packed,'base64')));}
const rawWorker=JSON.parse(bytes('assets/worker_bundle.js').toString().split('window.ALBUM_WORKER_SOURCE=')[1].trim().replace(/;$/,''));
function sha(b){return crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');}
function fixture(which,width=1000,height=620){
  const index=data('data/index.js'),rows=index.rows||index.values.map(v=>Object.fromEntries(index.columns.map((k,i)=>[k,v[i]]))),h=data('data/hierarchy.js');
  const node=h.nodes[which],ids=which==='building'?h.activeIndices:node?h.order.slice(...node.span).filter(i=>rows[i].physical&&rows[i].bucket==='active'):[rows.findIndex(row=>row.key===which)];
  if(ids.some(i=>i<0))throw new Error('Missing benchmark scene');
  const blocks=[...new Set(ids.map(i=>rows[i].block))].map(id=>data('blocks/'+id+'.js'));
  const nv=blocks.reduce((n,b)=>n+b.vertices,0),nf=blocks.reduce((n,b)=>n+b.faces,0),buffer=new ArrayBuffer(nv*12+nf*15);
  const vv=new Float32Array(buffer,0,nv*3),ff=new Uint32Array(buffer,nv*12,nf*3),nn=new Int8Array(buffer,nv*12+nf*12,nf*3),info=new Array(rows.length),meta=new Array(rows.length);
  let vo=0,fo=0;
  for(const b of blocks){const source=Buffer.from(b.geometry_b64,'base64'),binary=source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);vv.set(new Float32Array(binary,0,b.vertices*3),vo*3);const f=new Uint32Array(binary,b.vertices*12,b.faces*3);for(let j=0;j<f.length;j++)ff[fo*3+j]=f[j]+vo;nn.set(new Int8Array(binary,b.vertices*12+b.faces*12,b.faces*3),fo*3);for(const[i,a,vc,c,fc]of b.info){info[i]=[vo+a,vc,fo+c,fc];const e=rows[i];meta[i]={bounds:e.bounds,rgb:[1,3,5].map(k=>parseInt((e.color||'#999999').slice(k,k+2),16))};}vo+=b.vertices;fo+=b.faces;}
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const id of ids)for(let a=0;a<3;a++){low[a]=Math.min(low[a],rows[id].bounds[0][a]);high[a]=Math.max(high[a],rows[id].bounds[1][a]);}
  const size=Math.max(.25,Math.hypot(...low.map((v,a)=>high[a]-v))),camera={yaw:-.95,pitch:.68,target:low.map((v,a)=>(v+high[a])/2),size,scale:Math.min(width,height)*.78/size,pan:[0,0]};
  return {init:{type:'init',buffer,vertices:nv,faces:nf,info,meta},request:{type:'render',width,height,camera,visible:ids,selected:-1,selectedIndices:[],opacity:1,offsets:{}},blocks:blocks.length,rows,rawBlocks:blocks};
}
function worker(source){
  const w=new Worker("const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=(m,t)=>parentPort.postMessage(m,t);"+source+";parentPort.on('message',m=>self.onmessage({data:m}));",{eval:true});
  return {send:m=>new Promise((resolve,reject)=>{const receive=result=>{w.off('error',fail);if(result.type==='error')reject(new Error(result.error));else resolve(result);},fail=err=>{w.off('message',receive);reject(err);};w.once('message',receive);w.once('error',fail);w.postMessage(m,[m.recyclePixels,m.recycleOwner].filter(Boolean));}),close:()=>w.terminate()};
}
const quantile=(list,p)=>list.slice().sort((a,b)=>a-b)[Math.min(list.length-1,Math.floor(list.length*p))];
async function bench(){
  const report={method:'Node worker_threads; same full geometry/camera sequence; warmup + 12 rotation frames; not native FPS',scenes:[]};
  for(const scene of ['building','F2_MU1']){
    const f=fixture(scene),entry={scene,objects:f.request.visible.length,blocks:f.blocks,vertices:f.init.vertices,faces:f.init.faces,modes:[]},reference=[];
    for(const mode of ['before','after-exact','after-gesture']){
      const w=worker(mode==='before'?rawWorker:perf.adaptProjectAtlasWorker(rawWorker));await w.send(f.init);
      const times=[],roundtrips=[];let recycle={};
      for(let i=-2;i<12;i++){
        const ratio=mode==='after-gesture'?.65:1,request={...f.request,seq:i+3,width:Math.round(f.request.width*ratio),height:Math.round(f.request.height*ratio),camera:{...f.request.camera,yaw:f.request.camera.yaw+Math.max(0,i)*.03,scale:f.request.camera.scale*ratio,pan:f.request.camera.pan.map(n=>n*ratio)},...recycle};
        const start=performance.now(),frame=await w.send(request),elapsed=performance.now()-start;
        if(i>=0){times.push(frame.ms);roundtrips.push(elapsed);const hash=sha(frame.pixels)+sha(frame.owner);if(mode==='before')reference.push(hash);if(mode==='after-exact'&&hash!==reference[i])throw new Error('Pixel/owner mismatch '+scene+'/'+i);}
        if(mode!=='before')recycle={recyclePixels:frame.pixels,recycleOwner:frame.owner};
      }
      await w.close();entry.modes.push({mode,workerP50:quantile(times,.5),workerP95:quantile(times,.95),roundtripP50:quantile(roundtrips,.5),roundtripP95:quantile(roundtrips,.95),pixelOwnerParity:mode==='after-exact'?'12/12':'not applicable'});
      console.log(JSON.stringify(entry.modes.at(-1)));
    }
    const old=worker(rawWorker),updated=worker(perf.adaptProjectAtlasWorker(rawWorker));await old.send(f.init);await updated.send(f.init);
    const variants=[{opacity:.6},{selected:f.request.visible[0]},{selectedIndices:f.request.visible.slice(0,3)},{clip:[[-20,25],[-20,25],[-5,20]],offsets:{[f.request.visible[0]]:.5}}];
    for(const settings of variants){const request={...f.request,...settings,seq:50};const a=await old.send(request),b=await updated.send(request);if(sha(a.pixels)!==sha(b.pixels)||sha(a.owner)!==sha(b.owner))throw new Error('Variant parity mismatch '+scene);}
    await old.close();await updated.close();entry.renderVariantsParity='4/4 (opacity, selected, selection group, clip/explode)';report.scenes.push(entry);
  }
  fs.mkdirSync('/private/tmp/pgs-atlas-performance',{recursive:true});fs.writeFileSync('/private/tmp/pgs-atlas-performance/worker-benchmark.json',JSON.stringify(report,null,2));
}
function baselineAlbum(source){
  source=source.replace('function render(){pick=null;',"let baselineInput=0,baselineRequestInput=0,baselineSubmitted=0,baselineFrames=[];function render(){pick=null;");
  source=source.replace("workerBusy=true;const sel=","workerBusy=true;baselineSubmitted=performance.now();baselineRequestInput=baselineInput;const sel=");
  source=source.replace("render();});canvas.addEventListener('pointerup'","baselineInput=performance.now();render();});canvas.addEventListener('pointerup'");
  return source.replace("window.ALBUM_RENDERED=true;drawOverlay();", "window.ALBUM_RENDERED=true;drawOverlay();const now=performance.now();baselineFrames.push({seq:m.seq,workerMs:m.ms,submitToPresentMs:now-baselineSubmitted,inputToPresentMs:baselineRequestInput?now-baselineRequestInput:null,width:m.width,height:m.height,triangles:m.triangles_tested,at:now});if(baselineFrames.length>180)baselineFrames.shift();canvas.dataset.performance=JSON.stringify({frames:baselineFrames});canvas.dataset.frame=String(m.seq);");
}
function serve(port){
  let embedBundle;
  http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://127.0.0.1:'+port),baseline=url.searchParams.has('baseline'),name=decodeURIComponent(url.pathname).replace(/^\/model-assets\/troitsk-b24-atlas-3-2\//,'').replace(/^\//,'')||'index.html';
    if(url.pathname==='/embedded.html'){
      res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>PGS Atlas embedded review</title><style>body{margin:0;font:14px Arial}.project-model-dialog{padding:0;border:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0}.project-model-dialog-header{display:flex;justify-content:space-between;gap:12px;padding:8px;background:#203942;color:white;font-size:12px}.project-model-dialog-header strong{display:block}.project-model-dialog-actions{display:flex;align-items:center;gap:8px}.project-model-dialog-actions a{color:white}.project-model-stage{height:calc(100% - 58px)}iframe{width:100%;height:100%;border:0}button{min-height:44px;min-width:44px}.project-model-loading{position:absolute;top:58px}</style><div id="root"></div><script src="/embedded-viewer.js"></script>');return;
    }
    if(url.pathname==='/embedded-viewer.js'){
      const fromVitest=require('node:module').createRequire(require.resolve('vitest/package.json')),fromVite=require('node:module').createRequire(fromVitest.resolve('vite'));
      embedBundle ||= fromVite('esbuild').buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ProjectModelViewer,openProjectModelViewer} from './src/components/project-model-viewer';const project={id:'atlas-review',name:'Троицк здание 24'};createRoot(document.getElementById('root')).render(<><button onClick={()=>openProjectModelViewer(project.id)}>Открыть Атлас PGS</button><ProjectModelViewer project={project}/></>);`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'iife',alias:{'@':path.join(root,'src')},define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].contents;
      res.setHeader('Content-Type','text/javascript');res.end(embedBundle);return;
    }
    if(url.pathname==='/api/projects/atlas-review/model-viewer'){res.writeHead(302,{Location:'/model-assets/troitsk-b24-atlas-3-2/index.html?perf=1'});res.end();return;}
    if(!baseline){try{const response=await loadTs('src/lib/project-atlas-response.ts').projectAtlasAssetResponse(new Request(url,{headers:req.headers}),name.split('/'));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(500);res.end('Preview error');console.error(error);}return;}
    if(name==='drawing.html'){const page=loadTs('src/lib/project-atlas-drawing-viewer.ts').atlasDrawingPage(url);if(!page){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html');res.end(page.html);return;}
    const asset=manifest.files[name]||derived.files[name];if(!asset){res.writeHead(404);res.end();return;}
    let b=bytes(name);
    if(name==='assets/album.js')b=Buffer.from(baseline?baselineAlbum(drawing.adaptProjectAtlasDrawings(b.toString())):navigation.adaptProjectAtlasNavigation(perf.adaptProjectAtlasPerformance(drawing.adaptProjectAtlasDrawings(b.toString()))));
    if(name==='assets/worker_bundle.js'&&!baseline)b=Buffer.from(navigation.adaptProjectAtlasSelectionBundle(perf.adaptProjectAtlasWorkerBundle(b.toString())));
    if(name==='index.html')b=Buffer.from(b.toString().replace('<script>','<style>'+drawing.atlasDrawingStyles+controls.atlasControlsStyles+(baseline?'':navigationStyles.atlasNavigationStyles)+'</style><script>').replace('src="assets/album.js"','src="assets/album.js?'+(baseline?'baseline=1':'after=1')+'"').replace('src="assets/worker_bundle.js"','src="assets/worker_bundle.js?'+(baseline?'baseline=1':'after=1')+'"'));
    res.setHeader('Content-Type',asset.contentType);res.setHeader('Cache-Control','no-store');res.end(b);
  }).listen(port,'127.0.0.1',()=>console.log('Native before/after: http://127.0.0.1:'+port+'/model-assets/troitsk-b24-atlas-3-2/index.html?perf=1#node/building (add &baseline=1 for before)'));
}
function handoff(folder){fs.mkdirSync(folder,{recursive:true});for(const name of ['project-atlas-controls.ts','project-atlas-performance-adapter.ts','project-atlas-performance-adapter.test.ts'])fs.copyFileSync(path.join(root,'src/lib',name),path.join(folder,name));fs.writeFileSync(path.join(folder,'album.performance.js'),perf.adaptProjectAtlasPerformance(bytes('assets/album.js').toString()));fs.writeFileSync(path.join(folder,'worker.performance.js'),perf.adaptProjectAtlasWorker(rawWorker));fs.writeFileSync(path.join(folder,'controls.css'),controls.atlasControlsStyles);}
async function navigationHandoff(folder){
 const target=path.resolve(folder);fs.mkdirSync(path.join(target,'overlay/assets'),{recursive:true});
 const overlays=['index.html','assets/album.js','assets/worker_bundle.js'],response=loadTs('src/lib/project-atlas-response.ts'),entries=[];
 for(const name of overlays){const r=await response.projectAtlasAssetResponse(new Request('https://pgs-frankfurt.onrender.com/model-assets/troitsk-b24-atlas-3-2/'+name),name.split('/'));if(r.status!==200)throw new Error('Cannot generate '+name);const b=Buffer.from(await r.arrayBuffer());fs.writeFileSync(path.join(target,'overlay',name),b);entries.push({path:name,sha256:sha(b),bytes:b.length});}
 const required=Object.keys({...manifest.files,...derived.files}).filter(name=>!overlays.includes(name)).map(name=>{const b=bytes(name);return{path:name,sha256:sha(b),bytes:b.length};});
 const original=overlays.map(name=>({path:name,sha256:sha(bytes(name)),bytes:bytes(name).length}));
 const sources=['project-atlas-navigation-adapter.ts','project-atlas-navigation-logic.ts','project-atlas-navigation-styles.ts','project-atlas-navigation-adapter.test.ts','project-atlas-icons.json','project-atlas-response.ts','project-atlas-drawing-adapter.ts','project-atlas-drawing-viewer.ts','project-atlas-performance-adapter.ts','project-atlas-controls.ts'];
 fs.mkdirSync(path.join(target,'source'),{recursive:true});for(const name of sources)fs.copyFileSync(path.join(root,'src/lib',name),path.join(target,'source',name));
 fs.copyFileSync(__filename,path.join(target,'source/atlas-performance-check.cjs'));fs.copyFileSync(path.join(root,'docs/design/atlas-context-navigation-2026-09-13.md'),path.join(target,'QA.md'));
 fs.writeFileSync(path.join(target,'README.md'),'# PGS Atlas 3.2 UI adapter patch\n\nNOT A FULL ATLAS. No geometry, drawings, project data or credentials are included.\n\nOverlay files replace only index.html, assets/album.js and assets/worker_bundle.js. They are generated from the unchanged PGS frozen 3.2 source plus the drawing, performance and navigation adapters. The source/ folder is an implementation reference, not a standalone build toolchain.\n\nCompatibility: require the exact expanded frozen files AND derived drawing assets listed in MANIFEST.json. The original hashes of the three replaced files are recorded separately; modified prior UI entry files require an explicit reconciliation, never blind overwrite. Keep a backup of the three old UI files. Do not overwrite a newer root release. Validate every required hash before overlaying the three files.\n\nReproduce from this PGS branch with its existing node_modules: node scripts/atlas-performance-check.cjs navigation-handoff <empty-output-folder>. Runtime uses the existing CPU worker, not WebGL. Icons are the bundled Lucide snapshot; no runtime SSR icon import is needed.\n\nThe public PGS route is unchanged. Root owns FULL packaging and independent release approval. See QA.md for measurements and limitations; physical iPhone NOT_RUN.\n');
 const inventory=[];for(const relative of ['README.md','QA.md',...entries.map(e=>'overlay/'+e.path),...sources.map(name=>'source/'+name),'source/atlas-performance-check.cjs']){const b=fs.readFileSync(path.join(target,relative));inventory.push({path:relative,bytes:b.length,sha256:sha(b)});}
 fs.writeFileSync(path.join(target,'MANIFEST.json'),JSON.stringify({format:1,kind:'adapter-patch-not-full',baseCommit:'434d2c8abbfb4fdd7a6d5f44c4c159f749c8593b',required,originalUi:original,overlay:entries,files:inventory,selfExcluded:true},null,2));
 console.log(JSON.stringify({folder:target,files:inventory.length+1,requiredAssets:required.length,geometryIncluded:false}));
}
async function navigationBench(){
 const logic=vm.runInNewContext(loadTs('src/lib/project-atlas-navigation-logic.ts').atlasNavigationLogic+';createAtlasNavigationLogic()',{ArrayBuffer,Float32Array,Uint32Array,Int8Array});
 const h=data('data/hierarchy.js'),entrance=Object.values(h.nodes).find(n=>n.label==='Вход №1'&&n.kind!=='body');
 const targeted=process.argv[3]==='entrance',scenes=targeted?[entrance.id]:['building','section:roof',entrance.id,'F2_MU1'];
 const report={method:'Same Node worker/camera/visible IDs; '+(targeted?'20 warmup pairs + 120 frames':'2 warmup pairs + 12 frames')+' + clipping/opacity/selection; not native FPS',scenes:[]};
 for(const scene of scenes){
  const f=fixture(scene,1000,620),blocks=f.rawBlocks.map(b=>{const a=Buffer.from(b.geometry_b64,'base64');return{...b,binary:a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength)};});
  const start=performance.now(),packed=logic.geometry(blocks,f.request.visible,f.rows),packingMs=performance.now()-start;
  const before=worker(perf.adaptProjectAtlasWorker(rawWorker)),after=worker(navigation.adaptProjectAtlasSelectionWorker(perf.adaptProjectAtlasWorker(rawWorker)));
  const sameFull=worker(navigation.adaptProjectAtlasSelectionWorker(perf.adaptProjectAtlasWorker(rawWorker)));
  try{
   await before.send(f.init);await sameFull.send(f.init);await after.send({type:'init',...packed});
   const pre=[],post=[];let comparisons=0;
   for(let i=targeted?-20:-2;i<(targeted?120:12);i++){
    const request={...f.request,seq:i+21,camera:{...f.request.camera,yaw:f.request.camera.yaw+(Math.max(0,i)%12)*.03}};
    const a=await before.send(request),b=await after.send(request);
    if(sha(a.pixels)!==sha(b.pixels)||sha(a.owner)!==sha(b.owner))throw new Error('Compact idle parity failed '+scene+'/'+i);
    if(i>=0){pre.push(a.ms);post.push(b.ms);comparisons++;}
   }
   for(const setting of [{opacity:.6},{selected:f.request.visible.at(-1)},{clip:[[-20,25],[-20,25],[-5,20]],offsets:{[f.request.visible[0]]:.5}}]){
    const req={...f.request,...setting,seq:99},a=await sameFull.send(req),b=await after.send(req);
    if(sha(a.pixels)!==sha(b.pixels)||sha(a.owner)!==sha(b.owner))throw new Error('Compact selection/clip parity failed '+scene);comparisons++;
   }
   const entry={scene,objects:f.request.visible.length,blocks:f.blocks,oldBytes:f.init.buffer.byteLength,compactBytes:packed.buffer.byteLength,oldTriangles:f.init.faces,compactTriangles:packed.faces,packingMs,workerBeforeP50:quantile(pre,.5),workerBeforeP95:quantile(pre,.95),workerAfterP50:quantile(post,.5),workerAfterP95:quantile(post,.95),pixelOwnerComparisons:comparisons};report.scenes.push(entry);console.log(JSON.stringify(entry));
  }finally{await before.close();await after.close();await sameFull.close();}
 }
 fs.mkdirSync('/private/tmp/pgs-atlas-navigation',{recursive:true});fs.writeFileSync('/private/tmp/pgs-atlas-navigation/'+(targeted?'entrance-repeat':'worker-benchmark')+'.json',JSON.stringify(report,null,2));
}
const mode=process.argv[2];if(mode==='bench')bench().catch(e=>{console.error(e);process.exitCode=1;});else if(mode==='navigation-bench')navigationBench().catch(e=>{console.error(e);process.exitCode=1;});else if(mode==='serve')serve(Number(process.argv[3]||3018));else if(mode==='handoff')handoff(process.argv[3]);else if(mode==='navigation-handoff')navigationHandoff(process.argv[3]).catch(e=>{console.error(e);process.exitCode=1;});else throw new Error('Use bench | navigation-bench | serve [port] | handoff <folder> | navigation-handoff <folder>');
