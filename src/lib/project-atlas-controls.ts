// Kept as dependency-free browser source for the frozen/offline Atlas runtime.
export const atlasGestureController = String.raw`
function createAtlasGestureController({camera, viewport, changed, settled, select, capture, release}) {
  const pointers=new Map();
  let moved=false,multi=false,suspended=false,kind=null,pair=null;
  const copy=()=>({...camera(),target:camera().target.slice(),pan:camera().pan.slice()});
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  function bounds(){const c=camera(),v=viewport(),fit=Math.max(.0001,Math.min(v.width,v.height)*.78/Math.max(.25,c.size));return[fit/20,fit*100];}
  function zoom(scale,from,to,start=copy()){
    if(!Number.isFinite(scale)||scale<=0)return false;
    const v=viewport();if(v.width<1||v.height<1)return false;
    const [min,max]=bounds(),c=camera(),next=clamp(scale,min,max),ratio=next/start.scale;
    c.scale=next;c.pan=[to.x-v.width/2-ratio*(from.x-v.width/2-start.pan[0]),to.y-v.height/2-ratio*(from.y-v.height/2-start.pan[1])];
    return true;
  }
  function rebase(){
    pair=null;
    if(pointers.size===2){const [a,b]=[...pointers.values()];pair={camera:copy(),distance:Math.hypot(a.x-b.x,a.y-b.y),mid:{x:(a.x+b.x)/2,y:(a.y+b.y)/2}};}
    for(const p of pointers.values()){p.px=p.x;p.py=p.y;}
  }
  function down(e){
    if(e.pointerType!=='touch'&&e.button!==0&&e.button!==2)return false;
    if(pointers.size&&kind!==e.pointerType)return false;
    if(!pointers.size){moved=false;multi=false;suspended=false;kind=e.pointerType;}
    pointers.set(e.pointerId,{x:e.x,y:e.y,px:e.x,py:e.y,sx:e.x,sy:e.y,travel:0,pan:e.shiftKey||e.button===2});
    if(pointers.size>1)multi=true;
    if(pointers.size>2)suspended=true;
    rebase();capture(e.pointerId);return true;
  }
  function move(e){
    const p=pointers.get(e.pointerId);if(!p||suspended)return false;
    const dx=e.x-p.x,dy=e.y-p.y;p.x=e.x;p.y=e.y;p.travel+=Math.abs(dx)+Math.abs(dy);
    if(pointers.size===2){
      const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y);
      if(!pair||pair.distance<4||distance<4){rebase();return false;}
      moved=true;
      if(zoom(pair.camera.scale*distance/pair.distance,pair.mid,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},pair.camera))changed();
      return true;
    }
    if(!moved&&p.travel<(kind==='touch'?8:4))return false;
    moved=true;const c=camera();
    if(p.pan){c.pan[0]+=dx;c.pan[1]+=dy;}else{c.yaw-=dx*.008;c.pitch=clamp(c.pitch+dy*.008,-1.56,1.5705);}
    changed();return true;
  }
  function up(e,cancelled=false){
    const p=pointers.get(e.pointerId);if(!p)return false;
    const click=!cancelled&&!moved&&!multi&&!suspended&&!p.pan&&pointers.size===1&&Math.hypot(e.x-p.sx,e.y-p.sy)<(kind==='touch'?8:4);
    pointers.delete(e.pointerId);if(cancelled){moved=true;multi=true;}
    release(e.pointerId);rebase();
    if(!pointers.size){kind=null;if(click)select(e);else settled();}
    return true;
  }
  function cancel(){const ids=[...pointers.keys()];pointers.clear();kind=null;pair=null;moved=true;multi=true;suspended=false;for(const id of ids)release(id);if(ids.length)settled();}
  function wheel(e){const v=viewport(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?v.height:1);if(!Number.isFinite(delta))return;const center={x:e.x,y:e.y};if(zoom(camera().scale*Math.exp(clamp(-delta*.0012,-2,2)),center,center))changed();}
  function zoomBy(factor){const v=viewport(),center={x:v.width/2,y:v.height/2};if(zoom(camera().scale*factor,center,center)){changed();settled();}}
  return {down,move,up,cancel,wheel,zoomBy,active:()=>pointers.size>0};
}
`;

export const atlasPointerBindings = String.raw`
const atlasGestures=createAtlasGestureController({
  camera:()=>S.camera,viewport:()=>canvas.getBoundingClientRect(),
  changed:()=>{atlasInputAt=performance.now();atlasInteracting=true;render();},
  settled:()=>{atlasInteracting=false;clearTimeout(atlasWheelTimer);render();},
  capture:id=>{try{canvas.setPointerCapture(id);}catch(_){}},
  release:id=>{try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch(_){}},
  select:e=>{
    if(!pick||pickGeneration!==generation||workerBusy||pendingRender||!lastFrame?.exact)return;
    const r=canvas.getBoundingClientRect(),x=Math.floor(e.x*canvas.width/r.width),y=Math.floor(e.y*canvas.height/r.height);
    if(x<0||y<0||x>=canvas.width||y>=canvas.height)return;
    const i=pick[y*canvas.width+x];if(i>=0&&S.visible.includes(i))select(i,false);
  }
});
function atlasPointer(e){const r=canvas.getBoundingClientRect();return{pointerId:e.pointerId,pointerType:e.pointerType,button:e.button,shiftKey:e.shiftKey,x:e.clientX-r.left,y:e.clientY-r.top};}
canvas.addEventListener('pointerdown',e=>{if(atlasGestures.down(atlasPointer(e))&&e.cancelable)e.preventDefault();},{passive:false});
canvas.addEventListener('pointermove',e=>{if(atlasGestures.move(atlasPointer(e))&&e.cancelable)e.preventDefault();},{passive:false});
canvas.addEventListener('pointerup',e=>atlasGestures.up(atlasPointer(e)));
canvas.addEventListener('pointercancel',e=>atlasGestures.up(atlasPointer(e),true));
canvas.addEventListener('lostpointercapture',e=>atlasGestures.up(atlasPointer(e),true));
canvas.addEventListener('wheel',e=>{e.preventDefault();atlasGestures.wheel({...atlasPointer(e),deltaY:e.deltaY,deltaMode:e.deltaMode});clearTimeout(atlasWheelTimer);atlasWheelTimer=setTimeout(()=>{atlasInteracting=false;render();},140);},{passive:false});
canvas.oncontextmenu=e=>e.preventDefault();
window.addEventListener('blur',()=>atlasGestures.cancel());
document.addEventListener('visibilitychange',()=>{if(document.hidden)atlasGestures.cancel();});
window.addEventListener('hashchange',()=>atlasGestures.cancel());
new ResizeObserver(()=>{atlasGestures.cancel();render();}).observe($('stage'));
const atlasZoom=document.createElement('div');atlasZoom.id='pgs-atlas-zoom';atlasZoom.setAttribute('role','group');atlasZoom.setAttribute('aria-label','Масштаб модели');
for(const [id,label,symbol,factor] of [['pgs-atlas-zoom-in','Приблизить модель','+',1.25],['pgs-atlas-zoom-out','Отдалить модель','−',.8]]){
  const button=document.createElement('button');button.id=id;button.type='button';button.title=label;button.setAttribute('aria-label',label);button.textContent=symbol;button.onclick=()=>atlasGestures.zoomBy(factor);atlasZoom.append(button);
}
$('stage').append(atlasZoom);
function atlasPlaceZoom(){const stage=$('stage').getBoundingClientRect(),caption=document.querySelector('.scene-caption')?.getBoundingClientRect();atlasZoom.style.bottom=Math.max(14,caption?stage.bottom-caption.top+10:14)+'px';}
const atlasZoomLayout=new ResizeObserver(atlasPlaceZoom);atlasZoomLayout.observe($('stage'));
const atlasCaption=document.querySelector('.scene-caption');if(atlasCaption)atlasZoomLayout.observe(atlasCaption);atlasPlaceZoom();
`;

export const atlasControlsStyles = `
#canvas{touch-action:none;user-select:none;-webkit-user-select:none}
#pgs-atlas-zoom{position:absolute;right:14px;bottom:14px;display:flex;flex-direction:column;gap:4px;z-index:3}
#pgs-atlas-zoom button{width:40px;height:40px;padding:0;background:rgba(255,255,255,.94);color:#203239;border:1px solid #c5cccd;border-radius:6px;font:400 25px Arial;box-shadow:0 2px 6px #0000000d;cursor:pointer}
#pgs-atlas-zoom button:hover{background:#e6eef0}
#pgs-atlas-zoom button:focus-visible{outline:2px solid #206b85;outline-offset:2px}
@media(max-width:800px){#pgs-atlas-zoom button{width:44px;height:44px}}
`;
