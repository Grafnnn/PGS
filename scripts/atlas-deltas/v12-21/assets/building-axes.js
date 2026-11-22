/* Drawing coordination axes in the existing Z-up model coordinates. Visual overlay only. */
'use strict';
window.AtlasBuildingAxes=(()=>{
 /* Ядро 1.0 К1: оси объекта — только из window.ATLAS_PROJECT.axes {x:[{label,pos_m}],y:[…],extent_m}; нет — осей нет (ядро универсальное).
    Положение — только число или числовая строка; ось без положения не рисуется (not_confirmed). Без extent_m запас линий — половина медианного шага
    осей того же направления (подписи — за крайними осями на полпролёта), без шага — 0; радиус подписей — по медиане шагов, без шага — средний. */
 const cfg=(()=>{const A=window.ATLAS_PROJECT&&window.ATLAS_PROJECT.axes,list=[],bad=[];
  const num=v=>typeof v==='number'?(Number.isFinite(v)?v:null):(typeof v==='string'&&/^\s*[-+]?\d+(?:[.,]\d+)?\s*$/.test(v)?+v.replace(',','.'):null);
  if(A)for(const [d,arr] of [['X',A.x],['Y',A.y]])for(const it of (Array.isArray(arr)?arr:[])){if(!it)continue;const m=num(it.pos_m),label=String(it.label??'');if(m===null)bad.push({direction:d,label,pos_m:it.pos_m??null});else list.push({label,direction:d,metres:m});}
  const pos=d=>list.filter(a=>a.direction===d).map(a=>a.metres).sort((p,q)=>p-q),px=pos('X'),py=pos('Y');
  const steps=arr=>{const r=[];for(let i=1;i<arr.length;i++){const s=arr[i]-arr[i-1];if(s>1e-6)r.push(s);}return r;},med=r=>{if(!r.length)return null;const q=r.slice().sort((x,y)=>x-y),k=q.length>>1;return q.length%2?q[k]:(q[k-1]+q[k])/2;};
  const sx=med(steps(px)),sy=med(steps(py)),sAll=med(steps(px).concat(steps(py)));
  const ext=(d,own,st)=>{const E=A&&A.extent_m;if(Array.isArray(E)&&E.length===2&&num(E[0])!==null&&num(E[1])!==null)return [num(E[0]),num(E[1])];if(E&&Array.isArray(E[d])&&E[d].length===2&&num(E[d][0])!==null&&num(E[d][1])!==null)return [num(E[d][0]),num(E[d][1])];const m=st?st/2:0;return own.length?[own[0]-m,own[own.length-1]+m]:[0,0];};
  /* линии осей X идут вдоль Y (протяжённость — по осям Y), осей Y — вдоль X */
  return {list,bad,lineX:ext('y',py,sy),lineY:ext('x',px,sx),step:sAll};})();
 const axes=cfg.list;
 /* V12.2 E18: прямоугольник значка осей координат X/Y/Z (#axisCanvas) в координатах оверлея — кружки подписей на него не ставятся */
 let avC=null,avT=-1e9;   /* кэш: пересчёт не чаще 4 раз в секунду (размер и место значка меняют resize и открытие панелей) */
 function autoAvoid(){const t=performance.now();if(avC&&t-avT<250)return avC;avT=t;avC=[];try{const a=document.getElementById('axisCanvas'),c=document.getElementById('canvas');if(!a||!c||a.hidden)return avC;const cs=getComputedStyle(a);if(cs.display==='none'||cs.visibility==='hidden')return avC;const ra=a.getBoundingClientRect(),rc=c.getBoundingClientRect();if(!ra.width||!ra.height)return avC;avC=[[ra.left-rc.left,ra.top-rc.top,ra.right-rc.left,ra.bottom-rc.top]];}catch(e){}return avC;}
 function drawLines(ctx,project,{width,height,dark}){
  if(!axes.length)return () => 0;
  const origin=project([0,0,0]),px=project([cfg.step||1,0,0]),py=project([0,cfg.step||1,0]);
  const spacing=Math.min(Math.hypot(px[0]-origin[0],px[1]-origin[1]),Math.hypot(py[0]-origin[0],py[1]-origin[1]));
  const radius=cfg.step?Math.max(8,Math.min(12,spacing/2-2)):10;
  ctx.save();ctx.strokeStyle=dark?'#c3b491':'#897747';ctx.fillStyle=dark?'#172f3b':'#fffdf6';
  ctx.lineWidth=1;ctx.setLineDash([10,4,2,4]);ctx.globalAlpha=.65;ctx.beginPath();
  const ends=[],thin=width<700,last={X:-1,Y:-1},idx={X:0,Y:0};for(const axis of axes)last[axis.direction]++;
  for(const axis of axes){const i=idx[axis.direction]++;
   const a=axis.direction==='X'?[axis.metres,cfg.lineX[0],0]:[cfg.lineY[0],axis.metres,0];
   const b=axis.direction==='X'?[axis.metres,cfg.lineX[1],0]:[cfg.lineY[1],axis.metres,0];
   const pa=project(a),pb=project(b);ctx.moveTo(...pa);ctx.lineTo(...pb);
   /* V12.2 А7: на узком экране подписывается каждая вторая ось и крайние (1, 3, 5, 7, 9 / А, В, Д, Ж, К), линии — все */
   if(!thin||i%2===0||i===last[axis.direction])ends.push({label:axis.label,p:pa},{label:axis.label,p:pb});
  }
  ctx.stroke();ctx.restore();
  return (avoid, reserve) => {
   ctx.save();ctx.strokeStyle=dark?'#c3b491':'#897747';ctx.lineWidth=1;ctx.setLineDash([]);ctx.globalAlpha=1;
   ctx.font='600 12px "Golos Text",system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
   const placed=[],av=Array.isArray(avoid)?avoid:autoAvoid();
   for(const {label,p:[x,y]} of ends){
    if(x<radius+2||x>width-radius-2||y<radius+2||y>height-35||placed.some(q=>Math.hypot(x-q[0],y-q[1])<radius*2+2)||av.some(r=>x+radius+2>r[0]&&x-radius-2<r[2]&&y+radius+2>r[1]&&y-radius-2<r[3]))continue;
    if(reserve&&!reserve(x-radius,y-radius,radius*2,radius*2,'axis'))continue;
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=dark?'#172f3b':'#fffdf6';ctx.fill();ctx.stroke();
    ctx.fillStyle=dark?'#f6e4bd':'#665320';ctx.fillText(label,x,y+.5,radius*2-4);placed.push([x,y]);
   }
   ctx.restore();return placed.length;
  };
 }
 /* 1.1.1 K-C: options.defer — линии сейчас, подписи — функцией (движок ставит их в общую область подписей); без defer — как в 1.1.0 */
 function draw(ctx,project,options){const f=drawLines(ctx,project,options);return options&&options.defer?f:f(options&&options.avoid);}
 return {axes,draw,drawLines,avoid:autoAvoid,not_confirmed:cfg.bad};
})();
