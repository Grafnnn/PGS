/* R24 deterministic software depth renderer.
 * The source geometry is never reduced. This is the Canvas fallback, not GPU/WebGL.
 * Opaque surfaces have a per-pixel Z buffer. Transparency retains back-to-front
 * object ordering and therefore is NOT order-independent transparency (OIT).
 */
'use strict';
class AtlasCanvasRasterizer {
 constructor(){this.width=0;this.height=0;this.image=null;this.depth=null;this.ids=null;this.pickDepth=null;this.normalCache=new WeakMap();this.edgeCache=new WeakMap();this.projected=new Float64Array(0);this.frames=0;this.triangles=0;this.culled=0;this.lastMs=0;this.usedTransparent=false;}
 resize(ctx,w,h){if(this.width===w&&this.height===h&&this.image)return;this.image=ctx.createImageData(w,h);this.depth=new Float32Array(w*h);this.ids=new Uint32Array(w*h);this.pickDepth=null;this.width=w;this.height=h;}
 begin(ctx,w,h,bg){this.resize(ctx,w,h);const out=this.image.data;for(let i=0;i<out.length;i+=4){out[i]=bg[0];out[i+1]=bg[1];out[i+2]=bg[2];out[i+3]=255;}this.depth.fill(-Infinity);this.ids.fill(0);this.triangles=0;this.culled=0;this.usedTransparent=false;}
 triangle(p0,p1,p2,r,g,b,alpha,id,writeDepth,writeColor=true,pickThrough=false){
  let x0=p0[0],y0=p0[1],z0=p0[2],x1=p1[0],y1=p1[1],z1=p1[2],x2=p2[0],y2=p2[1],z2=p2[2];
  let area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);if(!Number.isFinite(area)||Math.abs(area)<1e-10)return;
  if(area<0){[x1,x2]=[x2,x1];[y1,y2]=[y2,y1];[z1,z2]=[z2,z1];area=-area;}
  const minX=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5)),maxX=Math.min(this.width-1,Math.floor(Math.max(x0,x1,x2)-.5));
  const minY=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)),maxY=Math.min(this.height-1,Math.floor(Math.max(y0,y1,y2)-.5));if(maxX<minX||maxY<minY)return;
  const dx0=x2-x1,dy0=y2-y1,dx1=x0-x2,dy1=y0-y2,dx2=x1-x0,dy2=y1-y0;
  const top0=dy0<0||(dy0===0&&dx0>0),top1=dy1<0||(dy1===0&&dx1>0),top2=dy2<0||(dy2===0&&dx2>0);
  const px=minX+.5,py=minY+.5;let row0=dx0*(py-y1)-dy0*(px-x1),row1=dx1*(py-y2)-dy1*(px-x2),row2=dx2*(py-y0)-dy2*(px-x0);
  const data=this.image.data,depth=this.depth,ids=this.ids,pd=this.pickDepth,inv=1/area,ia=1-alpha,W=this.width;
  for(let y=minY;y<=maxY;y++){
   let e0=row0,e1=row1,e2=row2;let pixel=y*W+minX;
   for(let x=minX;x<=maxX;x++,pixel++,e0-=dy0,e1-=dy1,e2-=dy2){
    if((e0>0||e0===0&&top0)&&(e1>0||e1===0&&top1)&&(e2>0||e2===0&&top2)){
     const z=Math.fround((e0*z0+e1*z1+e2*z2)*inv);if(z<depth[pixel])continue;
     if(writeDepth){depth[pixel]=z;ids[pixel]=id;if(writeColor){const k=pixel*4;data[k]=r;data[k+1]=g;data[k+2]=b;}}
     else{if(writeColor){const k=pixel*4;data[k]=r*alpha+data[k]*ia;data[k+1]=g*alpha+data[k+1]*ia;data[k+2]=b*alpha+data[k+2]*ia;}
      if(!pickThrough&&pd&&z>=pd[pixel]){pd[pixel]=z;ids[pixel]=id;}}
    }
   }
   row0+=dx0;row1+=dx1;row2+=dx2;
  }
  this.triangles++;
 }
 /* 1.1 G: тот же растр и те же правила покрытия, яркость — по вершинам (s0…s2, 0…255), цвет c* — 0…1. */
 triangleG(p0,p1,p2,cr,cg,cb,s0,s1,s2,alpha,id,writeDepth,writeColor=true,pickThrough=false){
  let x0=p0[0],y0=p0[1],z0=p0[2],x1=p1[0],y1=p1[1],z1=p1[2],x2=p2[0],y2=p2[1],z2=p2[2];
  let area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);if(!Number.isFinite(area)||Math.abs(area)<1e-10)return;
  if(area<0){[x1,x2]=[x2,x1];[y1,y2]=[y2,y1];[z1,z2]=[z2,z1];[s1,s2]=[s2,s1];area=-area;}
  const minX=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5)),maxX=Math.min(this.width-1,Math.floor(Math.max(x0,x1,x2)-.5));
  const minY=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)),maxY=Math.min(this.height-1,Math.floor(Math.max(y0,y1,y2)-.5));if(maxX<minX||maxY<minY)return;
  const dx0=x2-x1,dy0=y2-y1,dx1=x0-x2,dy1=y0-y2,dx2=x1-x0,dy2=y1-y0;
  const top0=dy0<0||(dy0===0&&dx0>0),top1=dy1<0||(dy1===0&&dx1>0),top2=dy2<0||(dy2===0&&dx2>0);
  const px=minX+.5,py=minY+.5;let row0=dx0*(py-y1)-dy0*(px-x1),row1=dx1*(py-y2)-dy1*(px-x2),row2=dx2*(py-y0)-dy2*(px-x0);
  const data=this.image.data,depth=this.depth,ids=this.ids,pd=this.pickDepth,inv=1/area,ia=1-alpha,W=this.width;
  for(let y=minY;y<=maxY;y++){
   let e0=row0,e1=row1,e2=row2;let pixel=y*W+minX;
   for(let x=minX;x<=maxX;x++,pixel++,e0-=dy0,e1-=dy1,e2-=dy2){
    if((e0>0||e0===0&&top0)&&(e1>0||e1===0&&top1)&&(e2>0||e2===0&&top2)){
     const z=Math.fround((e0*z0+e1*z1+e2*z2)*inv);if(z<depth[pixel])continue;
     const sh=(e0*s0+e1*s1+e2*s2)*inv;
     if(writeDepth){depth[pixel]=z;ids[pixel]=id;if(writeColor){const k=pixel*4;data[k]=cr*sh;data[k+1]=cg*sh;data[k+2]=cb*sh;}}
     else{if(writeColor){const k=pixel*4;data[k]=cr*sh*alpha+data[k]*ia;data[k+1]=cg*sh*alpha+data[k+1]*ia;data[k+2]=cb*sh*alpha+data[k+2]*ia;}
      if(!pickThrough&&pd&&z>=pd[pixel]){pd[pixel]=z;ids[pixel]=id;}}
    }
   }
   row0+=dx0;row1+=dx1;row2+=dx2;
  }
  this.triangles++;
 }
 clipPolygon(poly,box){for(let axis=0;axis<3;axis++)for(const side of [0,1]){
  const bound=box[side][axis],inside=p=>side===0?p[axis]>=bound:p[axis]<=bound,output=[];if(poly.length<3)return[];
  for(let j=0;j<poly.length;j++){const a=poly[j],b=poly[(j+1)%poly.length],ai=inside(a),bi=inside(b);if(ai)output.push(a);if(ai!==bi){const t=(bound-a[axis])/(b[axis]-a[axis]);output.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}}
  poly=output;
 }return poly;}
 clipLine(a,b,box){let lo=0,hi=1;for(let k=0;k<3;k++){const d=b[k]-a[k];if(Math.abs(d)<1e-20){if(a[k]<box[0][k]||a[k]>box[1][k])return null;continue;}let t0=(box[0][k]-a[k])/d,t1=(box[1][k]-a[k])/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return null;}return [a.map((x,k)=>x+(b[k]-x)*lo),a.map((x,k)=>x+(b[k]-x)*hi)];}
 geometry(o,light){const smooth=window.AtlasSmoothByRenderId?.(o.renderId)===true;let g=this.normalCache.get(o.v);if(g&&g.faces===o.f&&g.smooth===smooth)return g;
  const normals=new Float32Array(o.f.length*3),shades=new Uint8Array(o.f.length);
  for(let j=0;j<o.f.length;j++){const f=o.f[j],a=o.v[f[0]],b=o.v[f[1]],c=o.v[f[2]],ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;normals[j*3]=nx;normals[j*3+1]=ny;normals[j*3+2]=nz;shades[j]=Math.round((.42+.58*Math.abs(nx*light[0]+ny*light[1]+nz*light[2]))*255);}
  /* 1.1 G: яркость углов по гладким нормалям (то же правило, что в WebGL: AtlasSmoothNormals, worker-source.js); null — плоско, как прежде. */
  let cs=null;if(smooth&&typeof window.AtlasSmoothNormalsVF==='function'&&o.f.length){const CN=window.AtlasSmoothNormalsVF(o.v,o.f);cs=new Uint8Array(o.f.length*3);for(let q=0;q<o.f.length*3;q++){const x=CN[q*3],y=CN[q*3+1],z=CN[q*3+2];cs[q]=x||y||z?Math.round((.42+.58*Math.abs(x*light[0]+y*light[1]+z*light[2]))*255):shades[(q/3)|0];}}
  g={faces:o.f,smooth,normals,shades,cs};this.normalCache.set(o.v,g);return g;
 }
 featureEdges(o,g){let e=this.edgeCache.get(o.v);if(e&&e.faces===o.f)return e.edges;
  const edges=new Uint32Array(window.AtlasCreaseEdgesVF(o.v,o.f));   /* V12.2 E5: общее правило рёбер (worker-source.js) */this.edgeCache.set(o.v,{faces:o.f,edges});return edges;
 }
 line(a,b,color,width,bias,depthTest){
  // Clip before walking pixels: zoomed or offscreen edges must cost no more
  // than the viewport size. Visit each covered pixel once per source edge.
  const radius=Math.max(.5,width*.5),pad=radius+1,W=this.width,H=this.height;
  const clipped=this.clipLine(a,b,[[-pad,-pad,-Infinity],[W+pad,H+pad,Infinity]]);if(!clipped)return;[a,b]=clipped;
  const dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy,len=Math.sqrt(len2);if(!Number.isFinite(len)||len<.01)return;
  const major=Math.abs(dx)>=Math.abs(dy)?0:1,minor=1-major,d=major===0?dx:dy;
  const from=Math.max(0,Math.floor(Math.min(a[major],b[major])-pad)),to=Math.min((major===0?W:H)-1,Math.ceil(Math.max(a[major],b[major])+pad));
  const out=this.image.data,zbuf=this.depth;
  for(let u=from;u<=to;u++){
   const t=Math.max(0,Math.min(1,(u+.5-a[major])/d)),v=a[minor]+(b[minor]-a[minor])*t;
   const v0=Math.max(0,Math.floor(v-pad*1.42)),v1=Math.min((minor===0?W:H)-1,Math.ceil(v+pad*1.42));
   for(let j=v0;j<=v1;j++){
    const x=major===0?u:j,y=major===0?j:u;
    const k=y*W+x,tt=Math.max(0,Math.min(1,((x+.5-a[0])*dx+(y+.5-a[1])*dy)/len2));
    const ex=x+.5-a[0]-dx*tt,ey=y+.5-a[1]-dy*tt,coverage=Math.max(0,Math.min(1,radius+.5-Math.hypot(ex,ey)));
    if(!coverage||depthTest&&a[2]+(b[2]-a[2])*tt+bias<zbuf[k])continue;
    const aa=color[3]*coverage,ia=1-aa,off=k*4;out[off]=color[0]*aa+out[off]*ia;out[off+1]=color[1]*aa+out[off+1]*ia;out[off+2]=color[2]*aa+out[off+2]*ia;
   }
  }
 }
 /* V12.6 R1: отсечение по глубине взгляда (−Z ≤ z ≤ Z), как ближняя/дальняя плоскости WebGL. */
 clipZ(pts,lo,hi){let a=pts;for(const [lim,s] of [[hi,1],[lo,-1]]){const out=[];for(let i=0;i<a.length;i++){const p=a[i],q=a[(i+1)%a.length],ip=(p[2]-lim)*s<=0,iq=(q[2]-lim)*s<=0;if(ip)out.push(p);if(ip!==iq){const t=(lim-p[2])/(q[2]-p[2]);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,lim]);}}a=out;if(a.length<3)return a;}return a;}
 clipSegZ(a,b,lo,hi){let t0=0,t1=1;const dz=b[2]-a[2];for(const [lim,s] of [[hi,1],[lo,-1]]){const fa=(a[2]-lim)*s,fb=(b[2]-lim)*s;if(fa>0&&fb>0)return null;if(fa>0)t0=Math.max(t0,fa/(fa-fb));else if(fb>0)t1=Math.min(t1,fa/(fa-fb));}if(t0>t1)return null;const P=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+dz*t];return [P(t0),P(t1)];}
 render(ctx,options){this._zc=(this._zc||0)+1;/* V12.8 U9: кадр кэша zNeed — в начале render */const start=performance.now(),{w,h,objects,matrix,culler,box,project,light,colour,alpha,selected,settings,interacting,bias}=options;
  const P=options.pal||{},u=c=>c&&c.map((v,i)=>i<3?Math.round(v*255):v);this.begin(ctx,w,h,u(P.bg)||(settings.background==='dark'?[21,39,51]:settings.background==='white'?[255,255,255]:[241,247,249]));
  const solid=[],glass=[];
  for(const o of objects){if(!o.v||!o.f||!culler.isVisible(o.bounds,matrix)||[0,1,2].some(k=>o.bounds[1][k]<box[0][k]||o.bounds[0][k]>box[1][k])){this.culled++;continue;}const col=colour(o),a=alpha(o,col[3],o.renderId===selected),item={o,col,a};if(a>=.999)solid.push(item);else glass.push(item);}
  const MZ=options.matrix,ZL=MZ?Math.hypot(MZ[2],MZ[6],MZ[10]):0,ZD=ZL>0?1/ZL:Infinity;
  /* V12.6b: срез ±Z как в WebGL (Z из матрицы; после наведения fit уменьшает radius — ±5·radius режет и без focusDepth);
     диапазон глубины тела — один раз на кадр (общий для граней и рёбер), по линейной глубине, без массивов. */
  const zOn=ZD<Infinity,zF=this._zc,z0=zOn?project([0,0,0])[2]:0,zx=zOn?project([1,0,0])[2]-z0:0,zy=zOn?project([0,1,0])[2]-z0:0,zz=zOn?project([0,0,1])[2]-z0:0;
  /* V12.7 S8: без Map и литералов — кэш на объекте (_zf кадр, _zv результат), оси развёрнуты. */
  const zNeed=o=>{if(!zOn)return false;if(o._zf===zF)return o._zv;const b0=o.bounds[0],b1=o.bounds[1];let lo=z0,hi=z0,a,e;
   a=zx*b0[0];e=zx*b1[0];if(a<e){lo+=a;hi+=e;}else{lo+=e;hi+=a;}
   a=zy*b0[1];e=zy*b1[1];if(a<e){lo+=a;hi+=e;}else{lo+=e;hi+=a;}
   a=zz*b0[2];e=zz*b1[2];if(a<e){lo+=a;hi+=e;}else{lo+=e;hi+=a;}
   const v=hi>ZD||lo<-ZD;o._zf=zF;o._zv=v;return v;};
  const drawObject=({o,col,a},opaque)=>{
   const geo=this.geometry(o,light),N=o.v.length,PT=options.part&&options.part.id===o.renderId?options.part:null,PN=options.partTint&&options.partTint.get(o.renderId)||null;   /* 1.0.17 Е-4: окраска частей */   /* 1.0.16 E1-1 (A1): часть — грани t0…t1 цветом части */if(this.projected.length<N*3)this.projected=new Float64Array(N*3);const ps=this.projected,rk=options.zRank&&options.zStep?(o.renderId===selected?15:options.zRank(o))*options.zStep:0,pj=rk?v=>{const p=project(v);return [p[0],p[1],p[2]+rk];}:project;
   for(let i=0;i<N;i++){const p=pj(o.v[i]);ps[i*3]=p[0];ps[i*3+1]=p[1];ps[i*3+2]=p[2];}
   const clipped=[0,1,2].some(k=>o.bounds[0][k]<box[0][k]||o.bounds[1][k]>box[1][k]),zc=zNeed(o);const p0=[0,0,0],p1=[0,0,0],p2=[0,0,0];
   const CS=settings.lighting==='flat'?null:geo.cs;
   for(let j=0;j<o.f.length;j++){const f=o.f[j],g0=CS?CS[j*3]:0,g1=CS?CS[j*3+1]:0,g2=CS?CS[j*3+2]:0,shade=settings.lighting==='flat'?255:CS?Math.round((g0+g1+g2)/3):geo.shades[j],cc=PT&&j>=PT.t0&&j<PT.t1?PT.col:PN&&PN.fc[j]?PN.cols[PN.fc[j]-1]:col,r=Math.round(cc[0]*shade),g=Math.round(cc[1]*shade),b=Math.round(cc[2]*shade);
    if(clipped||zc){const poly=clipped?this.clipPolygon([o.v[f[0]],o.v[f[1]],o.v[f[2]]],box):[o.v[f[0]],o.v[f[1]],o.v[f[2]]];if(poly.length<3)continue;let points=poly.map(pj);if(zc){points=this.clipZ(points,-ZD,ZD);if(points.length<3)continue;}for(let k=1;k<points.length-1;k++)this.triangle(points[0],points[k],points[k+1],r,g,b,a,o.pickId,opaque,settings.mode!=='outline',settings.pickThrough||!!(options.pickThroughObject&&options.pickThroughObject(o)));}
    else{for(let k=0;k<3;k++){p0[k]=ps[f[0]*3+k];p1[k]=ps[f[1]*3+k];p2[k]=ps[f[2]*3+k];}if(CS&&!(g0===g1&&g1===g2))this.triangleG(p0,p1,p2,cc[0],cc[1],cc[2],g0,g1,g2,a,o.pickId,opaque,settings.mode!=='outline',settings.pickThrough||!!(options.pickThroughObject&&options.pickThroughObject(o)));else if(CS){const r0=Math.round(cc[0]*g0),g_=Math.round(cc[1]*g0),b0=Math.round(cc[2]*g0);this.triangle(p0,p1,p2,r0,g_,b0,a,o.pickId,opaque,settings.mode!=='outline',settings.pickThrough||!!(options.pickThroughObject&&options.pickThroughObject(o)));}else this.triangle(p0,p1,p2,r,g,b,a,o.pickId,opaque,settings.mode!=='outline',settings.pickThrough||!!(options.pickThroughObject&&options.pickThroughObject(o)));}
   }
  };
  for(const o of solid)drawObject(o,true);
  if(glass.length){this.usedTransparent=true;if(!settings.pickThrough){if(!this.pickDepth||this.pickDepth.length!==this.depth.length)this.pickDepth=new Float32Array(this.depth.length);this.pickDepth.set(this.depth);}else this.pickDepth=null;
   glass.sort((a,b)=>project(a.o.bounds[0])[2]+project(a.o.bounds[1])[2]-project(b.o.bounds[0])[2]-project(b.o.bounds[1])[2]);for(const o of glass)drawObject(o,false);
  }else this.pickDepth=null;
  if(!interacting||!settings.adaptive||settings.mode==='outline')for(const {o}of [...solid,...glass]){if(o.renderId!==selected&&!options.edges&&settings.mode==='solid')continue;const geo=this.geometry(o,light),edges=this.featureEdges(o,geo),ezc=zNeed(o),erk=options.zRank&&options.zStep?(o.renderId===selected?15:options.zRank(o))*options.zStep:0,color=o.renderId===selected?u(P['select-edge'])||[194,112,24,.90]:u(P.edge)||(settings.background==='dark'?[147,177,192,.5]:[44,76,95,.38]);
   for(let ei=0;ei<edges.length;ei+=2){const ab=this.clipLine(o.v[edges[ei]],o.v[edges[ei+1]],box);if(ab){let sa=project(ab[0]),sb=project(ab[1]);if(ezc){const c=this.clipSegZ(sa,sb,-ZD,ZD);if(!c)continue;[sa,sb]=c;}this.line(sa,sb,color,Math.max(.6,options.pixelRatio*.7),bias+erk,settings.mode!=='outline');}}
  }
  ctx.putImageData(this.image,0,0);this.frames++;this.lastMs=performance.now()-start;return this.stats();
 }
 pick(x,y){x=Math.floor(x);y=Math.floor(y);return this.ids&&x>=0&&y>=0&&x<this.width&&y<this.height?this.ids[y*this.width+x]:0;}
 stats(){return {width:this.width,height:this.height,frames:this.frames,triangles:this.triangles,culled:this.culled,cpuMs:this.lastMs,depthBuffered:true,transparentObjectSorted:this.usedTransparent,frameArrayBytes:(this.image?.data.byteLength||0)+(this.depth?.byteLength||0)+(this.ids?.byteLength||0)+(this.pickDepth?.byteLength||0),scratchBytes:this.projected.byteLength};}
 destroy(){this.image=null;this.depth=null;this.ids=null;this.pickDepth=null;this.projected=new Float64Array(0);this.normalCache=new WeakMap();this.edgeCache=new WeakMap();this.width=0;this.height=0;}
}
window.AtlasCanvasRasterizer=AtlasCanvasRasterizer;
