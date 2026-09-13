import { atlasGestureController, atlasPointerBindings } from "./project-atlas-controls";

function replaceOnce(source: string, anchor: string, replacement: string) {
  if (source.split(anchor).length !== 2) throw new Error("Atlas performance adapter source mismatch");
  return source.replace(anchor, replacement);
}

export const atlasRenderController = String.raw`
let atlasRaf=0,atlasRevision=0,atlasRequest=null,atlasInteracting=false,atlasWheelTimer=0,atlasInputAt=0;
let atlasRecyclePixels=null,atlasRecycleOwner=null,atlasWorkerMs=0,atlasInFlight=0;
const atlasTimings={submitted:0,completed:0,presented:0,dropped:0,maxInFlight:0,frames:[]};
function atlasInvalidatePick(){if(pick?.buffer?.byteLength)atlasRecycleOwner=pick.buffer;pick=null;pickGeneration=-1;}
function render(){atlasInvalidatePick();atlasRevision++;pendingRender=true;atlasSchedule();}
function atlasSchedule(){if(!atlasRaf)atlasRaf=requestAnimationFrame(()=>{atlasRaf=0;atlasSubmit();});}
function atlasSubmit(){
  if(!pendingRender||!workerReady||!worker||workerBusy)return;
  const r=$('stage').getBoundingClientRect(),width=Math.round(r.width),height=Math.round(r.height);if(width<20||height<20)return;
  const ratio=atlasInteracting&&atlasWorkerMs>28?.65:1;
  const camera={...S.camera,target:S.camera.target.slice(),pan:S.camera.pan.slice()};
  const workCamera={...camera,scale:camera.scale*ratio,pan:camera.pan.map(n=>n*ratio)};
  const sel=S.selection!=null?keyMap.get(S.selection):-1;
  atlasRequest={seq:++seq,revision:atlasRevision,camera,width,height,ratio,inputAt:atlasInputAt,submittedAt:performance.now()};
  const transfer=[];if(atlasRecyclePixels?.byteLength)transfer.push(atlasRecyclePixels);if(atlasRecycleOwner?.byteLength)transfer.push(atlasRecycleOwner);
  workerBusy=true;pendingRender=false;atlasTimings.submitted++;atlasInFlight++;atlasTimings.maxInFlight=Math.max(atlasTimings.maxInFlight,atlasInFlight);
  worker.postMessage({type:'render',seq,width:Math.round(width*ratio),height:Math.round(height*ratio),camera:workCamera,visible:S.visible,selected:sel??-1,selectedIndices:S.selection?[]:(currentTreeId()&&currentTreeId()!=='building'?S.cardIds:[]),opacity:S.opacity,clip:S.clip,offsets:offsets(),recyclePixels:atlasRecyclePixels,recycleOwner:atlasRecycleOwner},transfer);
  atlasRecyclePixels=null;atlasRecycleOwner=null;
}
function atlasPresent(m,token,nv,nf){
  const request=atlasRequest,receivedAt=performance.now();atlasTimings.completed++;atlasInFlight=Math.max(0,atlasInFlight-1);
  requestAnimationFrame(()=>{
    if(token!==generation)return;
    workerBusy=false;
    const r=$('stage').getBoundingClientRect();
    if(!request||request.seq!==m.seq||Math.round(r.width)!==request.width||Math.round(r.height)!==request.height||(lastFrame?.generation===token&&m.seq<=lastFrame.seq)){
      atlasRecyclePixels=m.pixels;atlasRecycleOwner=m.owner;atlasTimings.dropped++;pendingRender=true;atlasSchedule();return;
    }
    const start=performance.now();
    if(canvas.width!==m.width)canvas.width=m.width;if(canvas.height!==m.height)canvas.height=m.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(m.pixels),m.width,m.height),0,0);
    const exact=request.ratio===1&&!pendingRender&&!atlasInteracting&&request.revision===atlasRevision;
    lastFrame={generation:token,seq:m.seq,ms:m.ms,width:m.width,height:m.height,triangles:m.triangles_tested,camera:request.camera,exact};
    atlasRecyclePixels=m.pixels;
    if(exact){pick=new Int32Array(m.owner);pickGeneration=token;}else atlasRecycleOwner=m.owner;
    atlasWorkerMs=request.ratio===1?m.ms:Math.max(atlasWorkerMs,m.ms);
    $('sceneLoading').hidden=true;window.ALBUM_RENDERED=true;drawOverlay();
    const now=performance.now();atlasTimings.presented++;
    const timing={seq:m.seq,revision:request.revision,workerMs:m.ms,framebufferMs:m.framebufferMs,geometryMs:m.geometryMs,submitToPresentMs:now-request.submittedAt,inputToPresentMs:request.inputAt?now-request.inputAt:null,receiptToPresentMs:now-receivedAt,presentMs:now-start,width:m.width,height:m.height,ratio:request.ratio,exact,triangles:m.triangles_tested,at:now};
    atlasTimings.frames.push(timing);if(atlasTimings.frames.length>180)atlasTimings.frames.shift();
    canvas.dataset.frame=String(m.seq);canvas.dataset.quality=exact?'exact':'interactive';
    if(new URLSearchParams(location.search).has('perf'))canvas.dataset.performance=JSON.stringify(atlasTimings);
    $('renderStats').textContent=fmt(S.visible.length)+' видимых · '+fmt(m.triangles_tested)+' треуг. · '+Math.round(m.ms)+' мс';
    $('resident').textContent=activeBlocks.length+' блоков / '+fmt(nv*12+nf*15)+' байт Worker';
    if(pendingRender)atlasSchedule();
  });
}
`;

export function adaptProjectAtlasPerformance(source: string) {
  const renderStart = source.indexOf("function render(){pick=null;");
  const renderEnd = source.indexOf("async function install(", renderStart);
  if (renderStart < 0 || renderEnd < 0) throw new Error("Atlas render source mismatch");
  let result = source.slice(0, renderStart) + atlasRenderController + source.slice(renderEnd);
  const frameStart = result.indexOf("workerBusy=false;canvas.width=m.width;");
  const frameEnd = result.indexOf("}else if(m.type==='error')", frameStart);
  if (frameStart < 0 || frameEnd < 0) throw new Error("Atlas frame source mismatch");
  result = result.slice(0, frameStart) + "atlasPresent(m,token,nv,nf);" + result.slice(frameEnd);
  const controlsStart = result.indexOf("let drag=null;canvas.addEventListener('pointerdown'");
  const controlsEnd = result.indexOf("\n\n// Presentation layer.", controlsStart);
  if (controlsStart < 0 || controlsEnd < 0) throw new Error("Atlas pointer source mismatch");
  result = result.slice(0, controlsStart) + atlasGestureController + atlasPointerBindings + result.slice(controlsEnd);
  result = replaceOnce(result, "o.width=canvas.width;o.height=canvas.height;const w=o.width,h=o.height,C=S.camera,", "const rect=canvas.getBoundingClientRect();if(o.width!==Math.round(rect.width))o.width=Math.round(rect.width);if(o.height!==Math.round(rect.height))o.height=Math.round(rect.height);const w=o.width,h=o.height,C=(lastFrame?.generation===generation?lastFrame.camera:null)||S.camera,");
  result = replaceOnce(result, "drawingSession++;drawingTicket++;selectTicket++;return ++navigationSerial;", "atlasGestures.cancel();drawingSession++;drawingTicket++;selectTicket++;return ++navigationSerial;");
  result = replaceOnce(result, "workerBusy=false;pendingRender=false;const need=", "workerBusy=false;pendingRender=false;atlasRequest=null;atlasInputAt=0;atlasInFlight=0;atlasWorkerMs=0;atlasRecyclePixels=null;atlasRecycleOwner=null;const need=");
  return result;
}

// The raster algorithm/order/precision stay intact. Only allocation and repeated lookup work changes.
export function adaptProjectAtlasWorker(source: string) {
  let result = replaceOnce(source, "'use strict';let V,F,N,info,meta;", "'use strict';let V,F,N,info,meta,depthScratch=new Float32Array(0),projectedScratch=new Float32Array(0);");
  result = replaceOnce(result, "const pixels=new Uint8ClampedArray(w*h*4),depth=new Float32Array(w*h),owner=new Int32Array(w*h);", "const pixels=m.recyclePixels?.byteLength===w*h*4?new Uint8ClampedArray(m.recyclePixels):new Uint8ClampedArray(w*h*4),owner=m.recycleOwner?.byteLength===w*h*4?new Int32Array(m.recycleOwner):new Int32Array(w*h);if(depthScratch.length<w*h)depthScratch=new Float32Array(w*h);const depth=depthScratch.subarray(0,w*h);");
  result = replaceOnce(result, "const projected=new Float32Array(V.length);let tested=0,rasterized=0,meshes=0;", "if(projectedScratch.length!==V.length)projectedScratch=new Float32Array(V.length);const projected=projectedScratch,pa=[0,0,0],pb=[0,0,0],pc=[0,0,0],rgb=[0,0,0];const framebufferMs=performance.now()-start;let tested=0,rasterized=0,meshes=0;");
  result = replaceOnce(result, "function triangle(a,b,c,rgb,alpha,id){let den=", "function triangle(a,b,c,rgb,alpha,id){const highlighted=selectedSet.has(id);let den=");
  result = replaceOnce(result, "(selectedSet.has(id)&&!selectedSet.has(owner[at]))", "(highlighted&&!selectedSet.has(owner[at]))");
  result = replaceOnce(result, "c=F[k+2]*3,pa=[projected[a],projected[a+1],projected[a+2]],pb=[projected[b],projected[b+1],projected[b+2]],pc=[projected[c],projected[c+1],projected[c+2]];", "c=F[k+2]*3;pa[0]=projected[a];pa[1]=projected[a+1];pa[2]=projected[a+2];pb[0]=projected[b];pb[1]=projected[b+1];pb[2]=projected[b+2];pc[0]=projected[c];pc[1]=projected[c+1];pc[2]=projected[c+2];");
  result = replaceOnce(result, ",rgb=color.map(v=>Math.round(v*shade));", ";rgb[0]=Math.round(color[0]*shade);rgb[1]=Math.round(color[1]*shade);rgb[2]=Math.round(color[2]*shade);");
  result = replaceOnce(result, "ms:performance.now()-start,triangles_tested:", "ms:performance.now()-start,framebufferMs,geometryMs:performance.now()-start-framebufferMs,triangles_tested:");
  return result;
}

export function adaptProjectAtlasWorkerBundle(bundle: string) {
  const match = /^window\.ALBUM_WORKER_SOURCE\s*=\s*("[\s\S]*");?\s*$/.exec(bundle);
  if (!match) throw new Error("Atlas worker bundle source mismatch");
  return "window.ALBUM_WORKER_SOURCE=" + JSON.stringify(adaptProjectAtlasWorker(JSON.parse(match[1]))) + ";\n";
}
