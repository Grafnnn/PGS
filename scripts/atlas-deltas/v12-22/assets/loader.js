'use strict';
/* V11 (задача D): двоичные блоки геометрии.
   Блок — <script> с base64(gzip(bin)), без fetch/XHR (работает из file://). bin = u32 длина заголовка | JSON-заголовок | тело.
   Позиции объекта — Uint16 относительно его границ (x = lo + q·sc), индексы — Uint16/Uint32.
   В памяти объект держит только компактную запись o.g = {nv,nf,q,lo,sc,idx} (или pf — Float64 для тел ревизий).
   Вложенные массивы o.v/o.f строятся только по запросу (запасной canvas-режим), присваивание o.v/o.f парами
   (переключатели ревизий) переводится в компактную запись. Старый формат блоков (accept) по-прежнему читается. */
window.AtlasChunks=(()=>{
 const slots=new Map();let data,active=0;const queue=[];let pin=new Set();let resident=0,residentBytes=0,metadataDecodeMs=0,binaryBlocks=0,legacyBlocks=0;const byteBudget=(()=>{const L=window.ATLAS_PROJECT&&window.ATLAS_PROJECT.loader,v=L?L.budget_mb:null;return (typeof v==='number'&&Number.isFinite(v)&&v>0?v:24)*1024*1024;})();/* Ядро 1.0 К1: бюджет — ATLAS_PROJECT.loader.budget_mb (нет/null — 24 МБ) */let metaReady,metaResolve;metaReady=new Promise(r=>metaResolve=r);
 const b64=s=>{if(typeof Uint8Array.fromBase64==='function')return Uint8Array.fromBase64(s);const t=atob(s),a=new Uint8Array(t.length);for(let i=0;i<t.length;i++)a[i]=t.charCodeAt(i);return a;};
 async function gunzip(bytes){if(typeof DecompressionStream==='undefined')throw Error('Для распаковки требуется современный Chrome, Edge, Firefox или Safari.');return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
 async function decode(s){return JSON.parse(new TextDecoder().decode(await gunzip(b64(s))));}
 /* ---- компактная геометрия ---- */
 function fromNested(v,f){const nv=v?.length||0,nf=f?.length||0,pf=new Float64Array(nv*3),idx=nv<=65536?new Uint16Array(nf*3):new Uint32Array(nf*3);for(let i=0;i<nv;i++){const p=v[i];pf[i*3]=p[0];pf[i*3+1]=p[1];pf[i*3+2]=p[2];}for(let i=0;i<nf;i++){const t=f[i];idx[i*3]=t[0];idx[i*3+1]=t[1];idx[i*3+2]=t[2];}return {nv,nf,q:null,pf,lo:null,sc:null,idx,bytes:pf.byteLength+idx.byteLength};}
 const isCompact=x=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Number.isInteger(x.nv)&&x.idx;
 function nestedV(g){const out=new Array(g.nv);if(g.pf){for(let i=0;i<g.nv;i++)out[i]=[g.pf[i*3],g.pf[i*3+1],g.pf[i*3+2]];}else{const q=g.q,lo=g.lo,sc=g.sc;for(let i=0;i<g.nv;i++)out[i]=[lo[0]+q[i*3]*sc[0],lo[1]+q[i*3+1]*sc[1],lo[2]+q[i*3+2]*sc[2]];}return out;}
 function nestedF(g){const out=new Array(g.nf),x=g.idx;for(let i=0;i<g.nf;i++)out[i]=[x[i*3],x[i*3+1],x[i*3+2]];return out;}
 function setGeometry(o,geom){const v=geom?.v,f=geom?.f;o.g=isCompact(v)?v:isCompact(geom)?geom:(v?fromNested(v,f):undefined);delete o._vc;delete o._fc;}
 function accessors(o){Object.defineProperty(o,'v',{configurable:true,enumerable:false,get(){if(this._pendV!==undefined)return this._pendV;if(!this.g)return undefined;return this._vc||(this._vc=nestedV(this.g));},set(x){this._pendV=x;commit(this);}});
  Object.defineProperty(o,'f',{configurable:true,enumerable:false,get(){if(this._pendF!==undefined)return this._pendF;if(!this.g)return undefined;return this._fc||(this._fc=nestedF(this.g));},set(x){this._pendF=x;commit(this);}});}
 function commit(o){if(o._pendV===undefined||o._pendF===undefined)return;const v=o._pendV,f=o._pendF;delete o._pendV;delete o._pendF;setGeometry(o,{v,f});}
 function pump(){/* 1.2.3: очередь 6→12 (HTTP/2, первый байт ~3 с; замер — CHANGELOG 1.2.3) */while(active<12&&queue.length){const task=queue.shift();active++;task().finally(()=>{active--;pump();});}}
 function get(i,high=false){let e=slots.get(i);if(e?.state==='ready'){e.last=performance.now();return Promise.resolve();}if(e)return e.promise;
 e={state:'loading',last:performance.now()};e.promise=new Promise((resolve,reject)=>{e.resolve=resolve;e.reject=reject;});slots.set(i,e);queue.push(()=>new Promise(done=>{/* 1.0.4 E1 (В5): сбой тега (onerror / 45 с) — 2 повтора через 400 и 1200 мс новым тегом с cache-bust; поздний ответ прежнего тега не принимается; текст ошибки — по протоколу (ZIP — только для file:), e.code='chunk_load', e.chunk */const src='data/geometry_'+String(i).padStart(2,'0')+'.js';e.tags=new Set();let n=0;const go=()=>{const att=++n,s=document.createElement('script');e.att=att;e.tag=s;e.tags.add(s);s.src=att>1?src+'?r='+Date.now().toString(36)+att:src;s.async=true;if(high)s.fetchPriority='high';const fail=()=>{if(e.att!==att||e.finished||e.accepted)return;clearTimeout(e.timer);s.remove();if(att<3){e.timer=setTimeout(go,att===1?400:1200);return;}slots.delete(i);const er=Error(location.protocol==='file:'?'Не загружен '+s.src.split('?')[0]+'. Распакуйте весь ZIP, сохранив папки.':'Не удалось загрузить часть модели ('+src+'): проблема сети или сервера. Проверьте соединение и повторите.');er.code='chunk_load';er.chunk=i;e.reject(er);done();};e.timer=setTimeout(fail,45000);s.onerror=fail;document.head.append(s);};e.finish=()=>{if(e.finished)return;e.finished=true;clearTimeout(e.timer);if(e.tag)e.tag.remove();done();};go();}));pump();return e.promise;}
 async function install(i,e,items){if(!data)await metaReady;e.items=[];e.tri=0;e.bytes=0;for(const [id,g] of items){const o=data.byId.get(id);if(!o||o._chunk!==i)throw Error('Несогласованный геоблок '+i);if(!Object.getOwnPropertyDescriptor(o,'v')?.get)accessors(o);const rt=window.AtlasWorldSwitchRuntime;rt?.original(id,g,null);const alt=rt?.override(id);setGeometry(o,alt?alt:g);e.items.push(id);e.tri+=o.g?.nf||0;e.bytes+=o.g?.bytes||0;}resident+=e.tri;residentBytes+=e.bytes;e.state='ready';e.last=performance.now();e.resolve();}
 async function accept(i,packed){const e=slots.get(i);if(!e||e.accepted||(e.tags&&e.tags.has(document.currentScript)&&document.currentScript!==e.tag))return;e.accepted=true;try{const a=await decode(packed);legacyBlocks++;e.finish();await install(i,e,a.map(g=>[g.renderId,fromNested(g.v,g.f)]));}catch(err){slots.delete(i);e.reject(err);}finally{e.finish();}}
 async function acceptBinary(i,packed){const e=slots.get(i);if(!e||e.accepted||(e.tags&&e.tags.has(document.currentScript)&&document.currentScript!==e.tag))return;e.accepted=true;try{
  const buf=await gunzip(b64(packed)),hl=new DataView(buf).getUint32(0,true),head=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,4,hl)));
  if(head.v!==2&&head.v!==3)throw Error('Неизвестный формат геоблока '+i);
  /* 1.0.7 E1 (К1): v3 = ATLAS.mesh_precision/1 — у выбранных тел вершины Float64 (pt 'f64', 24 Б на вершину), остальные UInt16 как в v2; только с capability объекта */
  const v3=head.v===3;if(v3){const P=window.ATLAS_PROJECT||{},C=P.capabilities,cap=P.geometry_binary_precision_v3===true||(Array.isArray(C)&&C.includes('geometry_binary_precision_v3'))||(!!C&&typeof C==='object'&&C.geometry_binary_precision_v3===true);if(head.codec!=='ATLAS.mesh_precision/1'||!cap)throw Error('Геоблок '+i+': формат precision v3 не включён для объекта (codec или capability geometry_binary_precision_v3)');}
  const base=4+hl;if(v3&&(base%8||!Array.isArray(head.items)))throw Error('Геоблок '+i+': нарушено выравнивание или состав precision v3');binaryBlocks++;e.finish();const seen=v3?new Set():null;
  await install(i,e,head.items.map(it=>{if(!v3){const q=it.nv?new Uint16Array(buf,base+it.p,it.nv*3):new Uint16Array(0),idx=it.it===2?new Uint16Array(buf,base+it.i,it.nf*3):new Uint32Array(buf,base+it.i,it.nf*3);
   return [it.id,{nv:it.nv,nf:it.nf,q,pf:null,lo:it.lo,sc:it.sc,idx,bytes:q.byteLength+idx.byteLength}];}
   const bad=m=>Error('Геоблок '+i+': precision v3, запись '+it.id+' — '+m),nv=it.nv,nf=it.nf,f64=it.pt==='f64';if(seen.has(it.id))throw bad('повтор id');seen.add(it.id);
   if(!Number.isInteger(nv)||nv<0||!Number.isInteger(nf)||nf<0||(it.pt!=='u16'&&!f64)||(it.it!==2&&it.it!==4)||!Number.isInteger(it.p)||!Number.isInteger(it.i)||it.p<0||it.i<0||it.p%8||it.i%4||base+it.p+nv*(f64?24:6)>buf.byteLength||base+it.i+nf*3*it.it>buf.byteLength)throw bad('нарушены тип, выравнивание или границы');
   const pf=f64?new Float64Array(buf,base+it.p,nv*3):null,q=f64?null:nv?new Uint16Array(buf,base+it.p,nv*3):new Uint16Array(0),idx=it.it===2?new Uint16Array(buf,base+it.i,nf*3):new Uint32Array(buf,base+it.i,nf*3);
   if(pf)for(let k=0;k<pf.length;k++)if(!Number.isFinite(pf[k]))throw bad('вершина не число');for(let k=0;k<idx.length;k++)if(idx[k]>=nv)throw bad('индекс вне вершин');
   return [it.id,{nv,nf,q,pf,lo:it.lo,sc:it.sc,idx,bytes:(pf?pf.byteLength:q.byteLength)+idx.byteLength}];}));
 }catch(err){slots.delete(i);e.reject(err);}finally{e.finish();}}
 /* Вытеснение по разделам (п. 4): блоки текущего раздела закреплены; при превышении бюджета (24 МБ компактной геометрии в памяти;
    всё здание — около 12 МБ) освобождаются блоки других разделов, давно использованные — первыми. */
 function evict(){for(const [i,e] of [...slots].sort((a,b)=>a[1].last-b[1].last)){if(residentBytes<=byteBudget)break;if(pin.has(i)||e.state!=='ready')continue;for(const id of e.items){const o=data.byId.get(id);delete o.g;delete o._vc;delete o._fc;}resident-=e.tri;residentBytes-=e.bytes;slots.delete(i);}}
 return {accept,acceptBinary,decode,fromNested,setGeometry,nestedV,nestedF,isCompact,
  async metadata(){const start=performance.now();data=await decode(window.ATLAS_METADATA_GZIP);delete window.ATLAS_METADATA_GZIP;
  for(const o of data.objects){if(data.metadataLayout==='R24_lazy_passports_v1'&&o.role==='album_world'){const record=data.albumIndex[o.albumIndex];if(!record)throw Error('Несогласованный индекс альбома: нет записи albumIndex '+o.albumIndex);o.albumRecord=record;for(const [field,source]of Object.entries(data.albumObjectAliases))o[field]=record[source];}if(o._passportChunk!==undefined)Object.defineProperty(o,'originalProperties',{configurable:true,get(){return AtlasPassports.peek(o);}});accessors(o);}
  data.byId=new Map(data.objects.map(o=>[o.renderId,o]));if(data.albumIndexToRenderDerived&&!data.albumIndexToRender){const m={};for(const o of data.objects)if(o.role==='album_world'&&Number.isInteger(o.albumIndex))m[o.albumIndex]=o.renderId;data.albumIndexToRender=m;}window.AtlasPassports?.configure(data);metadataDecodeMs=performance.now()-start;metaResolve();return data;},
  accessors,
  /* Порядок загрузки: сначала блоки, где больше объектов из priority (оболочка), затем остальные. onReady(i) — блок готов. */
  async ensure(objects,onProgress=()=>{},priority=null,onReady=null){const ids=[...new Set(objects.map(o=>o._chunk))];pin=new Set(ids);
   if(priority){const w=new Map();for(const o of objects)if(priority(o))w.set(o._chunk,(w.get(o._chunk)||0)+1);ids.sort((a,b)=>(w.get(b)||0)-(w.get(a)||0));}
   let n=0;await Promise.all(ids.map(i=>get(i).then(()=>{onProgress(++n,ids.length);onReady?.(i);})));evict();},
  loaded:i=>slots.get(i)?.state==='ready',
  prefetch(ids,high=[]){const h=new Set(high);for(const i of ids)get(i,h.has(i)).catch(()=>{});},
  stats:()=>({metadataDecodeMs,passports:window.AtlasPassports?.stats(),chunksResident:[...slots.values()].filter(e=>e.state==='ready').length,residentTriangles:resident,residentGeometryBytes:residentBytes,budgetBytes:byteBudget,pinnedBlocks:pin.size,binaryBlocks,legacyBlocks,activeRequests:active,pendingRequests:queue.length})};
 /* V11: ранняя загрузка блоков оболочки «Всего здания» — параллельно с метаданными; остальные — после метаданных.
    Список — data/geometry-index.js; только при старте без другого раздела в адресе. */
})();
(function(){try{const h=new URLSearchParams(location.hash.slice(1)),sc=h.get('scope')||h.get('layer');if(sc&&sc!=='BUILDING')return;
 const s=document.createElement('script');s.src='data/geometry-index.js';s.async=true;s.fetchPriority='high';s.onload=()=>{const x=window.ATLAS_GEOMETRY_INDEX;if(x&&Array.isArray(x.shell))AtlasChunks.prefetch(x.shell,x.shell);};document.head.append(s);}catch(e){}})();
