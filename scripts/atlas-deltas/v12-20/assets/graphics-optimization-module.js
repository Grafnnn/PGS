/* R21 adaptation of GRAPHICS_OPTIMIZATION for the R20 native WebGL renderer.
 * Original world geometry is never simplified, moved or disposed by LOD.
 * Pick IDs survive all batching; culling never mutates application visibility.
 */
'use strict';
class FrustumCuller{
 isVisible(bounds,m){for(let row=0;row<3;row++){let mid=m[12+row],r=0;for(let k=0;k<3;k++){mid+=m[k*4+row]*(bounds[0][k]+bounds[1][k])*.5;r+=Math.abs(m[k*4+row])*(bounds[1][k]-bounds[0][k])*.5;}if(mid+r< -1.02||mid-r>1.02)return false;}return true;}
}
class MeshBatcher{
 constructor(indexed=false){this.indexed=indexed;this.mode='classic';this.epoch=0;this.worker=null;this.active=null;this.pending=null;this.fallback=false;this.builds=0;this.workerErrors=0;}
 spawn(){if(this.worker||this.fallback)return;try{const url=URL.createObjectURL(new Blob([window.ATLAS_BATCH_WORKER_SOURCE],{type:'text/javascript'}));this.worker=new Worker(url);URL.revokeObjectURL(url);const instance=this.worker;instance.onmessage=e=>{if(instance!==this.worker)return;if(e.data.smooth||e.data.smoothError){this.lastSmooth=e.data;if(typeof this.onsmooth==='function')this.onsmooth(e.data);return;}if(e.data.edges||e.data.edgesError){this.lastEdges=e.data;if(typeof this.onedges==='function')this.onedges(e.data);return;}if(!this.active||e.data.epoch!==this.active.epoch)return;const a=this.active;this.active=null;if(e.data.error)a.reject(Error(e.data.error));else{e.data.result.epoch=e.data.epoch;a.resolve(e.data.result);}this.flush();};instance.onerror=e=>{e.preventDefault();if(instance!==this.worker)return;this.workerErrors++;this.worker.terminate();this.worker=null;this.fallback=true;const a=this.active;this.active=null;if(a){try{a.resolve(this.buildHere(a.items));}catch(err){a.reject(err);}}this.flush();};}catch{this.fallback=true;}}
 buildHere(items){return this.mode==='deriv'?window.AtlasBuildDerivBatch(items):(this.indexed?window.AtlasBuildIndexedBatch:window.AtlasBuildBatch)(items);}
 build(items){this.builds++;return new Promise((resolve,reject)=>{const job={items,resolve,reject,epoch:++this.epoch};if(this.pending)this.pending.reject(Object.assign(Error('Superseded render batch'),{obsolete:true}));this.pending=job;this.flush();});}
 flush(){if(this.active||!this.pending)return;const a=this.pending;this.pending=null;this.active=a;this.spawn();if(this.fallback){setTimeout(()=>{if(this.active!==a)return;try{a.resolve(this.buildHere(a.items));}catch(err){a.reject(err);}this.active=null;this.flush();},0);return;}try{if(this.mode==='deriv'){const packed=window.AtlasPackDeriv(a.items);this.worker.postMessage({epoch:a.epoch,packed,mode:'deriv'},[packed.q.buffer,packed.pf.buffer,packed.idx.buffer]);}else{const packed=window.AtlasPackBatch(a.items);this.worker.postMessage({epoch:a.epoch,packed,indexed:this.indexed},[packed.positions.buffer,packed.indices.buffer]);}}catch(err){this.active=null;a.reject(err);this.flush();}}
 /* 1.1 G: гладкие нормали — по запросу, когда новых сборок нет (промежуточная сборка «оболочки» их не ждёт и не задерживает полную). */
 requestSmooth(epoch){if(!this.worker||this.pending||this.active)return false;try{this.worker.postMessage({mode:'smooth',epoch});return true;}catch(e){return false;}}
 destroy(){if(this.worker)this.worker.terminate();this.worker=null;for(const a of [this.active,this.pending])if(a)a.reject(Object.assign(Error('Renderer disposed'),{obsolete:true}));this.active=null;this.pending=null;this.epoch++;}
}
class GraphicsOptimizer{
 constructor(gl){this.gl=gl;this.culler=new FrustumCuller();this.indexingCapable=!!gl.getExtension('OES_element_index_uint');this.derivCapable=this.indexingCapable&&!!gl.getExtension('OES_standard_derivatives')&&!/[?&]renderer=classic\b/.test(location.search);this.batcher=new MeshBatcher(this.indexingCapable);this.batcher.mode=this.derivCapable?'deriv':'classic';this.mode=this.batcher.mode;this.resources=[];this.ranges=[];this.gpuBytes=0;this.drawCalls=0;this.culled=0;this.generation=0;this.pick=null;this.ready=false;this.rangeSignatures=new Map();this.reused=0;this.indexed=false;this.preparationMs=0;this.vertexBytes=0;this.indexBytes=0;this.edgeEpoch=0;this.edgesPending=false;this.edgesMs=0;this.edgesT0=0;this.bufBytes={};this.smoothPending=false;this.smoothEpoch=0;this.smoothMs=0;this.smoothT0=0;}
 async prepare(items,opt){const started=performance.now();const wantSmooth=!(opt&&opt.partial);const generation=++this.generation;const geo=o=>o.g||o.v,signature=o=>(o.g?o.g.nv+':'+o.g.nf:o.v?o.v.length+':'+o.f.length:'-')+':'+o.pickId+':'+o.color.join(',')+':'+o.bounds.flat().join(',');if(this.ready&&items.length&&items.every(o=>{const k=this.rangeSignatures.get(o.renderId);return k&&k.signature===signature(o)&&k.geometry.deref()===geo(o);})){if(wantSmooth&&this.smoothDeferred){this.smoothDeferred=false;this.scheduleSmooth(this.smoothEpoch);}this.reused++;return true;}/* V11: прежние буферы остаются в силе, пока собираются новые (прогрессивная отрисовка). */this.batcher.onedges=d=>this.applyEdges(d);this.batcher.onsmooth=d=>this.applySmooth(d);const result=await this.batcher.build(items);if(generation!==this.generation&&this.ready)return false;this.clearBuffers();const gl=this.gl;this.bufBytes={};this.smoothError='';this.extraVertices=result.extraVertices|0;this.baseVertices=result.baseVertices|0;this.indexed=!!result.indexed;this.mode=result.mode||'classic';this.vertexBytes=0;this.indexBytes=0;try{
 for(const key of this.mode==='deriv'?['vertices','tri','edges']:['solid','glass','edges',...(this.indexed?['solidIndices','glassIndices','edgeIndices']:[])]){
  const b=gl.createBuffer();if(!b)throw Error('Не удалось выделить графический буфер: '+key);
  this.resources.push(b);this[key]=b;const target=(this.mode==='deriv'?key!=='vertices':key.endsWith('Indices'))?gl.ELEMENT_ARRAY_BUFFER:gl.ARRAY_BUFFER;this[this.mode==='deriv'?{vertices:'vbo',tri:'ibo',edges:'ebo'}[key]:key]=b;
  gl.bindBuffer(target,b);gl.bufferData(target,result[key],gl.STATIC_DRAW);
  this.gpuBytes+=result[key].byteLength;this.bufBytes[key]=result[key].byteLength;if(target===gl.ARRAY_BUFFER)this.vertexBytes+=result[key].byteLength;else this.indexBytes+=result[key].byteLength;
 }
 // Check once after allocation, never in the render loop.
 if(typeof gl.getError==='function'){const error=gl.getError();if(error)throw Error('Ошибка выделения графики WebGL: '+error);}
 }catch(error){this.clearBuffers();this.ranges=[];this.rangeSignatures.clear();throw error;}
 this.preparationMs=performance.now()-started;this.ranges=result.ranges;this.rangeSignatures=typeof WeakRef==='function'?new Map(items.filter(o=>geo(o)).map(o=>[o.renderId,{signature:signature(o),geometry:new WeakRef(geo(o))}])):new Map();this.stride=result.stride||44;this.ready=true;this.edgesPending=!!result.edgesLater;this.edgeEpoch=this.edgesPending?result.epoch:0;this.edgesT0=performance.now();if(this.edgesPending&&this.batcher.lastEdges&&this.batcher.lastEdges.epoch===this.edgeEpoch)this.applyEdges(this.batcher.lastEdges);this.smoothEpoch=result.smoothLater?result.epoch:0;this.smoothDeferred=!!result.smoothLater&&!wantSmooth;if(result.smoothLater&&wantSmooth)this.scheduleSmooth(this.smoothEpoch);return true;}
 scheduleSmooth(epoch){
  this.smoothPending=true;this.smoothT0=performance.now();
  const go=()=>{
   if(this.smoothPending&&this.smoothEpoch===epoch&&!this.batcher.requestSmooth(epoch))this.smoothPending=false;
  };
  /* 1.1 G: запрос — после двух кадров готовой сцены, чтобы загрузка и проверка буферов сглаживания не задерживали первый кадр */
  const raf=window.requestAnimationFrame;
  if(typeof raf==='function')raf(()=>raf(()=>setTimeout(go,0)));else setTimeout(go,0);
 }
 /* 1.1 G: гладкие нормали приходят из Worker после граней и рёбер — вершины (исходные + копии на изломах) и треугольники заменяются целиком;
    диапазоны, порядок треугольников и рёбра прежние (рёбра ссылаются на исходные вершины, они в начале буфера). */
 applySmooth(d){
  if(!this.smoothPending||!d||d.epoch!==this.smoothEpoch||!this.vbo||!this.ibo)return;
  this.batcher.lastSmooth=null;this.smoothPending=false;
  if(!d.smooth){this.smoothError=d.smoothError||'';return;}
  const gl=this.gl,{vertices,tri,base,extra,ms}=d.smooth;
  const oldVbo=this.vbo,oldIbo=this.ibo,oldVertexBytes=this.bufBytes.vertices,oldIndexBytes=this.bufBytes.tri;
  if(base!==this.baseVertices||!Number.isInteger(extra)||extra<0||
     vertices?.byteLength!==(base+extra)*this.stride||tri?.byteLength!==oldIndexBytes){
   this.smoothError='Неверные размеры буферов сглаживания';return;
  }
  const boundVbo=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
  const boundIbo=gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
  let nextVbo=null,nextIbo=null;
  const checkUpload=()=>{const error=gl.getError();if(error)throw Error('Ошибка загрузки сглаживания WebGL: '+error);};
  try{
   checkUpload();
   nextVbo=gl.createBuffer();
   if(!nextVbo)throw Error('Не удалось выделить VBO сглаживания');
   gl.bindBuffer(gl.ARRAY_BUFFER,nextVbo);
   gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STATIC_DRAW);
   checkUpload();
   nextIbo=gl.createBuffer();
   if(!nextIbo)throw Error('Не удалось выделить IBO сглаживания');
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,nextIbo);
   gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,tri,gl.STATIC_DRAW);
   checkUpload();
  }catch(error){
   gl.bindBuffer(gl.ARRAY_BUFFER,boundVbo);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,boundIbo);
   if(nextVbo)gl.deleteBuffer(nextVbo);
   if(nextIbo)gl.deleteBuffer(nextIbo);
   this.smoothError=error.message;return;
  }
  this.vbo=this.vertices=nextVbo;this.ibo=this.tri=nextIbo;
  this.resources=this.resources.map(buffer=>buffer===oldVbo?nextVbo:buffer===oldIbo?nextIbo:buffer);
  gl.bindBuffer(gl.ARRAY_BUFFER,boundVbo===oldVbo?nextVbo:boundVbo);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,boundIbo===oldIbo?nextIbo:boundIbo);
  gl.deleteBuffer(oldVbo);gl.deleteBuffer(oldIbo);
  const vertexDelta=vertices.byteLength-oldVertexBytes;
  this.bufBytes.vertices=vertices.byteLength;
  this.gpuBytes+=vertexDelta;this.vertexBytes+=vertexDelta;
  this.extraVertices=extra;this.smoothWorkerMs=ms|0;this.smoothMs=performance.now()-this.smoothT0;
  this.smoothError='';
  requestAnimationFrame(()=>{const a=window.__R24;if(a&&typeof a.draw==='function')a.draw();});
 }
 /* V12.2 E6: рёбра приходят из Worker отдельным сообщением после граней; цикл рёбер в atlas-engine читает ranges и ebo в каждом кадре. */
 applyEdges(d){if(!this.edgesPending||!d||d.epoch!==this.edgeEpoch||!this.ebo)return;this.batcher.lastEdges=null;this.edgesPending=false;if(!d.edges)return;const gl=this.gl;gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.ebo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.edges,gl.STATIC_DRAW);this.gpuBytes+=d.edges.byteLength;this.indexBytes+=d.edges.byteLength;const er=d.er,n=Math.min(this.ranges.length,er.length>>1);for(let i=0;i<n;i++){this.ranges[i].edgeStart=er[2*i];this.ranges[i].edgeCount=er[2*i+1];}this.edgesMs=performance.now()-this.edgesT0;requestAnimationFrame(()=>{const a=window.__R24;if(a&&typeof a.draw==='function')a.draw();});}
 clearBuffers(){this.edgesPending=false;this.smoothPending=false;this.smoothDeferred=false;for(const b of this.resources)this.gl.deleteBuffer(b);this.resources=[];this.gpuBytes=0;this.vertexBytes=0;this.indexBytes=0;this.ready=false;}
 clearPick(){if(!this.pick)return;const gl=this.gl;gl.deleteFramebuffer(this.pick.fbo);gl.deleteTexture(this.pick.texture);gl.deleteRenderbuffer(this.pick.depth);this.pick=null;}
 pickTarget(w,h){const gl=this.gl;if(this.pick?.w===w&&this.pick?.h===h)return this.pick;this.clearPick();const fbo=gl.createFramebuffer(),texture=gl.createTexture(),depth=gl.createRenderbuffer();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_STENCIL,w,h);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,depth);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(fbo);gl.deleteTexture(texture);gl.deleteRenderbuffer(depth);throw Error('Не удалось создать буфер выбора');}gl.bindFramebuffer(gl.FRAMEBUFFER,null);return this.pick={w,h,fbo,texture,depth};}
 stats(){return {mode:this.mode,derivCapable:this.derivCapable,indexed:this.indexed,indexingCapable:this.indexingCapable,preparationMs:this.preparationMs,vertexBytes:this.vertexBytes,indexBytes:this.indexBytes,pickPixels:this.pick?this.pick.w*this.pick.h:0,pickBytesNominal:this.pick?this.pick.w*this.pick.h*6:0,drawCalls:this.drawCalls,culled:this.culled,gpuBytes:this.gpuBytes,buffers:this.resources.length,workerCount:this.batcher.worker?1:0,workerBuilds:this.batcher.builds,workerErrors:this.batcher.workerErrors,edgesPending:this.edgesPending,edgesMs:this.edgesMs,smoothPending:!!this.smoothPending,smoothError:this.smoothError||'',smoothMs:this.smoothMs||0,smoothWorkerMs:this.smoothWorkerMs||0,extraVertices:this.extraVertices||0,baseVertices:this.baseVertices||0,stride:this.stride||0,reusedBatches:this.reused,ready:this.ready};}
 destroy(){this.generation++;this.batcher.destroy();this.clearBuffers();this.clearPick();}
}
Object.assign(window,{FrustumCuller,MeshBatcher,GraphicsOptimizer});
