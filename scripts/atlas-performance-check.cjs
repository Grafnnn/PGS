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
const manifest=loadTs('src/assets/project-models/troitsk-b24-atlas-3-2.manifest.json');
const derived=loadTs('src/assets/project-models/troitsk-b24-atlas-3-2.drawings.json');
const assetRoot=path.join(root,'src/assets/project-models/troitsk-b24-atlas-3-2');
function bytes(name){const a=manifest.files[name]||derived.files[name];const b=fs.readFileSync(path.join(assetRoot,a.storage));return a.compressed?zlib.gunzipSync(b):b;}
function data(name){let packed;vm.runInNewContext(bytes(name).toString(),{window:{ALBUM_ACCEPT:(_key,value)=>packed=value}});return JSON.parse(zlib.gunzipSync(Buffer.from(packed,'base64')));}
const rawWorker=JSON.parse(bytes('assets/worker_bundle.js').toString().split('window.ALBUM_WORKER_SOURCE=')[1].trim().replace(/;$/,''));
function sha(b){return crypto.createHash('sha256').update(Buffer.from(b)).digest('hex');}
function fixture(which,width=1000,height=620){
  const index=data('data/index.js'),rows=index.rows||index.values.map(v=>Object.fromEntries(index.columns.map((k,i)=>[k,v[i]]))),h=data('data/hierarchy.js');
  const ids=which==='building'?h.activeIndices:[rows.findIndex(row=>row.key==='F2_MU1')];
  if(ids.some(i=>i<0))throw new Error('Missing benchmark scene');
  const blocks=[...new Set(ids.map(i=>rows[i].block))].map(id=>data('blocks/'+id+'.js'));
  const nv=blocks.reduce((n,b)=>n+b.vertices,0),nf=blocks.reduce((n,b)=>n+b.faces,0),buffer=new ArrayBuffer(nv*12+nf*15);
  const vv=new Float32Array(buffer,0,nv*3),ff=new Uint32Array(buffer,nv*12,nf*3),nn=new Int8Array(buffer,nv*12+nf*12,nf*3),info=new Array(rows.length),meta=new Array(rows.length);
  let vo=0,fo=0;
  for(const b of blocks){const source=Buffer.from(b.geometry_b64,'base64'),binary=source.buffer.slice(source.byteOffset,source.byteOffset+source.byteLength);vv.set(new Float32Array(binary,0,b.vertices*3),vo*3);const f=new Uint32Array(binary,b.vertices*12,b.faces*3);for(let j=0;j<f.length;j++)ff[fo*3+j]=f[j]+vo;nn.set(new Int8Array(binary,b.vertices*12+b.faces*12,b.faces*3),fo*3);for(const[i,a,vc,c,fc]of b.info){info[i]=[vo+a,vc,fo+c,fc];const e=rows[i];meta[i]={bounds:e.bounds,rgb:[1,3,5].map(k=>parseInt((e.color||'#999999').slice(k,k+2),16))};}vo+=b.vertices;fo+=b.faces;}
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const id of ids)for(let a=0;a<3;a++){low[a]=Math.min(low[a],rows[id].bounds[0][a]);high[a]=Math.max(high[a],rows[id].bounds[1][a]);}
  const size=Math.max(.25,Math.hypot(...low.map((v,a)=>high[a]-v))),camera={yaw:-.95,pitch:.68,target:low.map((v,a)=>(v+high[a])/2),size,scale:Math.min(width,height)*.78/size,pan:[0,0]};
  return {init:{type:'init',buffer,vertices:nv,faces:nf,info,meta},request:{type:'render',width,height,camera,visible:ids,selected:-1,selectedIndices:[],opacity:1,offsets:{}},blocks:blocks.length};
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
  http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost'),baseline=url.searchParams.has('baseline'),name=decodeURIComponent(url.pathname).replace(/^\/model-assets\/troitsk-b24-atlas-3-2\//,'').replace(/^\//,'')||'index.html';
    if(name==='drawing.html'){const page=loadTs('src/lib/project-atlas-drawing-viewer.ts').atlasDrawingPage(url);if(!page){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html');res.end(page.html);return;}
    const asset=manifest.files[name]||derived.files[name];if(!asset){res.writeHead(404);res.end();return;}
    let b=bytes(name);
    if(name==='assets/album.js')b=Buffer.from(baseline?baselineAlbum(drawing.adaptProjectAtlasDrawings(b.toString())):perf.adaptProjectAtlasPerformance(drawing.adaptProjectAtlasDrawings(b.toString())));
    if(name==='assets/worker_bundle.js'&&!baseline)b=Buffer.from(perf.adaptProjectAtlasWorkerBundle(b.toString()));
    if(name==='index.html')b=Buffer.from(b.toString().replace('<script>','<style>'+drawing.atlasDrawingStyles+controls.atlasControlsStyles+'</style><script>').replace('src="assets/album.js"','src="assets/album.js?'+(baseline?'baseline=1':'after=1')+'"').replace('src="assets/worker_bundle.js"','src="assets/worker_bundle.js?'+(baseline?'baseline=1':'after=1')+'"'));
    res.setHeader('Content-Type',asset.contentType);res.setHeader('Cache-Control','no-store');res.end(b);
  }).listen(port,'127.0.0.1',()=>console.log('Native before/after: http://127.0.0.1:'+port+'/model-assets/troitsk-b24-atlas-3-2/index.html?perf=1#node/building (add &baseline=1 for before)'));
}
function handoff(folder){fs.mkdirSync(folder,{recursive:true});for(const name of ['project-atlas-controls.ts','project-atlas-performance-adapter.ts','project-atlas-performance-adapter.test.ts'])fs.copyFileSync(path.join(root,'src/lib',name),path.join(folder,name));fs.writeFileSync(path.join(folder,'album.performance.js'),perf.adaptProjectAtlasPerformance(bytes('assets/album.js').toString()));fs.writeFileSync(path.join(folder,'worker.performance.js'),perf.adaptProjectAtlasWorker(rawWorker));fs.writeFileSync(path.join(folder,'controls.css'),controls.atlasControlsStyles);}
const mode=process.argv[2];if(mode==='bench')bench().catch(e=>{console.error(e);process.exitCode=1;});else if(mode==='serve')serve(Number(process.argv[3]||3018));else if(mode==='handoff')handoff(process.argv[3]);else throw new Error('Use bench | serve [port] | handoff <folder>');
