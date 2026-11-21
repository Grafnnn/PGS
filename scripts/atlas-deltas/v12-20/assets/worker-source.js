'use strict';
/* V12.2 E5: контуры по изломам — одно правило рёбер для Worker, canvas и движка. Вершины тела свариваются по сетке
   (шаг не меньше шага квантования); вырожденные и встречные совпадающие грани не участвуют; ребро не рисуется, если по обе
   стороны в его плоскости лежат грани тела с той же нормалью; иначе — граница или излом (cos < 0,85), как раньше.
   P — координаты (локальная вершина i — P[po+i*3]), F — индексы треугольников с F[fo]; возвращает пары локальных индексов. */
function atlasCreaseEdges(P,po,F,fo,nf,N,mode){
 const out=[];if(!nf||!N)return out;
 const S=atlasCreaseEdges._s||(atlasCreaseEdges._s={n:0});
 const need=(k,T,n)=>{let a=S[k];if(!a||a.length<n){a=new T(Math.max(n,a?a.length*2:1024));S[k]=a;}return a;};
 let x0=Infinity,y0=Infinity,z0=Infinity,x1=-Infinity,y1=-Infinity,z1=-Infinity;
 for(let i=0;i<N;i++){const k=po+i*3,x=P[k],y=P[k+1],z=P[k+2];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z;}
 const eps=Math.max(1e-4,Math.max(x1-x0,y1-y0,z1-z0)/65535),inv=1/eps;
 // сварка: (ix,iy,iz) → номер представителя
 let cap=1;while(cap<N*2)cap<<=1;let mask=cap-1;
 const HA=need('HA',Int32Array,cap),HB=need('HB',Int32Array,cap),HC=need('HC',Int32Array,cap),HV=need('HV',Int32Array,cap);HV.fill(-1,0,cap);
 const W=need('W',Int32Array,N),rep=need('rep',Int32Array,N);let M=0;
 for(let i=0;i<N;i++){const k=po+i*3,a=Math.round((P[k]-x0)*inv),b=Math.round((P[k+1]-y0)*inv),c=Math.round((P[k+2]-z0)*inv);
  let h=(Math.imul(a,73856093)^Math.imul(b,19349663)^Math.imul(c,83492791))&mask,w;
  for(;;){const v=HV[h];if(v<0){w=M;rep[M++]=i;HA[h]=a;HB[h]=b;HC[h]=c;HV[h]=w;break;}if(HA[h]===a&&HB[h]===b&&HC[h]===c){w=v;break;}h=(h+1)&mask;}
  W[i]=w;}
 const NX=need('NX',Float64Array,nf*3),ok=need('ok',Uint8Array,nf),T=need('T',Int32Array,nf*3);ok.fill(0,0,nf);
 for(let j=0;j<nf;j++){const fi=fo+j*3,a=F[fi],b=F[fi+1],c=F[fi+2];if(a>=N||b>=N||c>=N){T[j*3]=0;T[j*3+1]=0;T[j*3+2]=0;continue;}
  const wa=W[a],wb=W[b],wc=W[c];T[j*3]=wa;T[j*3+1]=wb;T[j*3+2]=wc;if(wa===wb||wb===wc||wa===wc)continue;
  const ia=po+a*3,ib=po+b*3,ic=po+c*3,ux=P[ib]-P[ia],uy=P[ib+1]-P[ia+1],uz=P[ib+2]-P[ia+2],vx=P[ic]-P[ia],vy=P[ic+1]-P[ia+1],vz=P[ic+2]-P[ia+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,len=Math.hypot(nx,ny,nz);if(!(len>2e-10))continue;
  NX[j*3]=nx/len;NX[j*3+1]=ny/len;NX[j*3+2]=nz/len;ok[j]=1;}
 // встречные совпадающие грани: ключ (s0,s1) → список (s2, j) в порядке вставки
 cap=1;while(cap<nf*2)cap<<=1;mask=cap-1;
 const FA=need('FA',Int32Array,cap),FB=need('FB',Int32Array,cap),FH=need('FH',Int32Array,cap),FT=need('FT',Int32Array,cap);FH.fill(-1,0,cap);
 const LS=need('LS',Int32Array,nf),LJ=need('LJ',Int32Array,nf),LN=need('LN',Int32Array,nf);let nl=0;
 for(let j=0;j<nf;j++){if(!ok[j])continue;let s0=T[j*3],s1=T[j*3+1],s2=T[j*3+2],t;if(s0>s1){t=s0;s0=s1;s1=t;}if(s1>s2){t=s1;s1=s2;s2=t;}if(s0>s1){t=s0;s0=s1;s1=t;}
  let h=(Math.imul(s0,73856093)^Math.imul(s1,19349663))&mask;for(;;){if(FH[h]<0||(FA[h]===s0&&FB[h]===s1))break;h=(h+1)&mask;}
  if(FH[h]<0){FA[h]=s0;FB[h]=s1;LS[nl]=s2;LJ[nl]=j;LN[nl]=-1;FH[h]=nl;FT[h]=nl;nl++;continue;}
  for(let e=FH[h];e>=0;e=LN[e]){const m=LJ[e];if(LS[e]===s2&&ok[m]&&NX[m*3]*NX[j*3]+NX[m*3+1]*NX[j*3+1]+NX[m*3+2]*NX[j*3+2]<-.999){ok[m]=0;ok[j]=0;break;}}
  if(ok[j]){LS[nl]=s2;LJ[nl]=j;LN[nl]=-1;LN[FT[h]]=nl;FT[h]=nl;nl++;}}
 // рёбра по сваренным парам
 cap=1;while(cap<nf*6)cap<<=1;mask=cap-1;
 const EA=need('EA',Int32Array,cap),EB=need('EB',Int32Array,cap),EV=need('EV',Int32Array,cap);EV.fill(-1,0,cap);
 const eU=need('eU',Int32Array,nf*3),eF=need('eF',Int32Array,nf*3),eS=need('eS',Uint8Array,nf*3),eP=need('eP',Int32Array,nf*3),eQ=need('eQ',Int32Array,nf*3);let ne=0,multi=false;
 const find=(lo,hi)=>{let h=(Math.imul(lo,73856093)^Math.imul(hi,19349663))&mask;for(;;){const v=EV[h];if(v<0||(EA[h]===lo&&EB[h]===hi))return h;h=(h+1)&mask;}};
 for(let j=0;j<nf;j++){if(!ok[j])continue;for(let v=0;v<3;v++){const p=T[j*3+v],q=T[j*3+(v+1)%3],lo=p<q?p:q,hi=p<q?q:p,h=find(lo,hi),e=EV[h];
  if(e<0){EA[h]=lo;EB[h]=hi;EV[h]=ne;eU[ne]=1;eF[ne]=j;eS[ne]=0;eP[ne]=lo;eQ[ne]=hi;ne++;}
  else{if(++eU[e]===3)multi=true;const f=eF[e];if(NX[f*3]*NX[j*3]+NX[f*3+1]*NX[j*3+1]+NX[f*3+2]*NX[j*3+2]<.85)eS[e]=1;}}}
 const hide=new Uint8Array(ne);
 if(multi){const fl=new Map();
  for(let j=0;j<nf;j++){if(!ok[j])continue;for(let v=0;v<3;v++){const p=T[j*3+v],q=T[j*3+(v+1)%3],e=EV[find(p<q?p:q,p<q?q:p)];if(eU[e]<3)continue;let l=fl.get(e);if(!l)fl.set(e,l=[]);l.push(j,T[j*3+(v+2)%3]);}}
  for(const [e,l] of fl){const a=po+rep[eP[e]]*3,b=po+rep[eQ[e]]*3,dx=P[b]-P[a],dy=P[b+1]-P[a+1],dz=P[b+2]-P[a+2],sd=[];
   for(let k=0;k<l.length;k+=2){const j=l[k],c=po+rep[l[k+1]]*3,cx=P[c]-P[a],cy=P[c+1]-P[a+1],cz=P[c+2]-P[a+2];sd.push((dy*cz-dz*cy)*NX[j*3]+(dz*cx-dx*cz)*NX[j*3+1]+(dx*cy-dy*cx)*NX[j*3+2]);}
   find2:for(let k=0;k<l.length;k+=2)for(let m=k+2;m<l.length;m+=2){const j=l[k],i=l[m];if(NX[j*3]*NX[i*3]+NX[j*3+1]*NX[i*3+1]+NX[j*3+2]*NX[i*3+2]>.999&&sd[k/2]*sd[m/2]<0){hide[e]=1;break find2;}}}}
 for(let e=0;e<ne;e++)if(!hide[e]&&(mode?(mode===2?eU[e]===1:mode===3?eU[e]>=3:eU[e]===1||eU[e]>=3):eU[e]===1||eS[e]))out.push(rep[eP[e]],rep[eQ[e]]);
 return out;
}
function atlasCreaseEdgesVF(v,f){const N=v.length,nf=f.length,P=new Float64Array(N*3),F=new Uint32Array(nf*3);
 for(let i=0;i<N;i++){const p=v[i];P[i*3]=p[0];P[i*3+1]=p[1];P[i*3+2]=p[2];}for(let j=0;j<nf;j++){const t=f[j];F[j*3]=t[0];F[j*3+1]=t[1];F[j*3+2]=t[2];}
 return atlasCreaseEdges(P,0,F,0,nf,N,window.ATLAS_DEBUG_MESH?1:0);}
window.AtlasCreaseEdges=atlasCreaseEdges;window.AtlasCreaseEdgesVF=atlasCreaseEdgesVF;
/* 1.1 G: гладкие нормали вершин. Алгоритм — Codex, buildAtlasSurfaceNormals (ПОСТАВКИ_CODEX/20261121_ГРАФИКА_ATLAS_ПИЛОТ_01,
   atlas-pilot-surface-normals.js, sha256 a9a26da7…): нормаль угла = нормированная сумма нормалей граней (вес — площадь) его группы;
   углы объединяются только через общую кромку ровно двух граней с согласованным обходом и углом между гранями ≤ 30°. Сварки по
   положению нет: на двух рабочих объектах сварка дублей не сгладила ни одного тела, а у части убрала сглаживание (замер G, 21.11).
   Добавлено в G без изменения правил: шаг координат ps (буфер вершин движка), общие рабочие массивы и числовой ключ кромки вместо Map
   со строками (скорость); результат совпадает с функцией Codex (расхождение ≤ 5e-18 на всех телах обоих объектов).
   Возвращает нормали углов (nf×9, Float32; у вырожденной грани — нули). Массив — рабочий, читать до следующего вызова.
   Геометрия, порядок вершин и граней не меняются. */
function atlasSmoothNormals(P,po,ps,F,fo,nf,N,creaseDegrees){
 const S=atlasSmoothNormals._s||(atlasSmoothNormals._s={});
 const need=(k,T,n)=>{let a=S[k];if(!a||a.length<n){a=new T(Math.max(n,a?a.length*2:1024));S[k]=a;}return a;};
 const nc=nf*3,CN=need('CN',Float32Array,nc*3);CN.fill(0,0,nc*3);if(!nf||!N)return CN;
 const cosine=Math.cos((creaseDegrees==null?30:creaseDegrees)*Math.PI/180);
 const WT=need('WT',Float64Array,nf),FN=need('FN',Float64Array,nf*3),PA=need('PA',Int32Array,nc),RK=need('RK',Uint8Array,nc);
 const valid=i=>i>=0&&i<N,ix=c=>F[fo+c],next=c=>c%3===2?c-2:c+1;
 const root=c=>{while(PA[c]!==c){PA[c]=PA[PA[c]];c=PA[c];}return c;};
 const join=(l,r)=>{let a=root(l),b=root(r);if(a===b)return;if(RK[a]<RK[b]){const t=a;a=b;b=t;}PA[b]=a;if(RK[a]===RK[b])RK[a]++;};
 let cap=1;while(cap<nc*2)cap<<=1;const mask=cap-1,EA=need('EA',Int32Array,cap),EB=need('EB',Int32Array,cap),EF=need('EF',Int32Array,cap),EO=need('EO',Int32Array,cap),EC=need('EC',Int32Array,cap);EC.fill(0,0,cap);
 for(let c=0;c<nc;c++){PA[c]=c;RK[c]=0;}
 // нормали граней и кромки: (меньший, больший индекс) → первый угол, второй угол, число граней
 for(let j=0;j<nf;j++){const first=j*3,fi=fo+first,a=F[fi],b=F[fi+1],c=F[fi+2];WT[j]=0;
  if(!valid(a)||!valid(b)||!valid(c)||a===b||b===c||c===a)continue;
  const pa=po+a*ps,pb=po+b*ps,pc=po+c*ps,ux=P[pb]-P[pa],uy=P[pb+1]-P[pa+1],uz=P[pb+2]-P[pa+2],vx=P[pc]-P[pa],vy=P[pc+1]-P[pa+1],vz=P[pc+2]-P[pa+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,w=Math.sqrt(nx*nx+ny*ny+nz*nz);
  if(Number.isFinite(w)&&w>0){WT[j]=w;FN[j*3]=nx/w;FN[j*3+1]=ny/w;FN[j*3+2]=nz/w;}
  for(let k=first;k<first+3;k++){const f=ix(k),t=ix(next(k)),lo=f<t?f:t,hi=f<t?t:f;
   let h=(Math.imul(lo,73856093)^Math.imul(hi,19349663))&mask;for(;;){if(!EC[h]||(EA[h]===lo&&EB[h]===hi))break;h=(h+1)&mask;}
   if(!EC[h]){EA[h]=lo;EB[h]=hi;EF[h]=k;EO[h]=-1;EC[h]=1;}else if(++EC[h]===2)EO[h]=k;}}
 for(let h=0;h<cap;h++){if(EC[h]!==2)continue;const a=EF[h],b=EO[h],na=next(a),nb=next(b);
  if(ix(a)!==ix(nb)||ix(na)!==ix(b))continue;
  const fa=(a/3)|0,fb=(b/3)|0;if(!WT[fa]||!WT[fb])continue;
  const d=FN[fa*3]*FN[fb*3]+FN[fa*3+1]*FN[fb*3+1]+FN[fa*3+2]*FN[fb*3+2];if(d+1e-12<cosine)continue;
  join(a,nb);join(na,b);}
 const SU=need('SU',Float64Array,nc*3);SU.fill(0,0,nc*3);
 for(let c=0;c<nc;c++){const f=(c/3)|0,w=WT[f];if(!w)continue;const g=root(c)*3;SU[g]+=FN[f*3]*w;SU[g+1]+=FN[f*3+1]*w;SU[g+2]+=FN[f*3+2]*w;}
 for(let c=0;c<nc;c++){const f=(c/3)|0;if(!WT[f])continue;const g=root(c)*3,x=SU[g],y=SU[g+1],z=SU[g+2],l=Math.sqrt(x*x+y*y+z*z),o=c*3;
  if(Number.isFinite(l)&&l>0){CN[o]=x/l;CN[o+1]=y/l;CN[o+2]=z/l;}else{CN[o]=FN[f*3];CN[o+1]=FN[f*3+1];CN[o+2]=FN[f*3+2];}}
 return CN;
}
function atlasSmoothNormalsVF(v,f){const N=v.length,nf=f.length,P=new Float64Array(N*3),F=new Uint32Array(nf*3);
 for(let i=0;i<N;i++){const p=v[i];P[i*3]=p[0];P[i*3+1]=p[1];P[i*3+2]=p[2];}for(let j=0;j<nf;j++){const t=f[j];F[j*3]=t[0];F[j*3+1]=t[1];F[j*3+2]=t[2];}
 return atlasSmoothNormals(P,0,3,F,0,nf,N,30);}
window.AtlasSmoothNormals=atlasSmoothNormals;window.AtlasSmoothNormalsVF=atlasSmoothNormalsVF;
/* Smooth only the project bodies whose curved surfaces were checked. */
{
 const configured=window.ATLAS_PROJECT?.graphics?.smooth_render_ids;
 const supported=new Set(Array.isArray(configured)?configured.filter(id=>typeof id==='string'):[]);
 const enabled=supported.size>0&&!/[?&]smooth=0(?:&|$)/.test(location.search);
 window.ATLAS_SMOOTH=enabled;
 window.AtlasSmoothByRenderId=id=>enabled&&supported.has(id);
}
window.ATLAS_DEBUG_MESH=/[?&]debug=mesh(?:&|$)/.test(location.search);
/* V12.2 E19в: отчёт о дырах и неманифолдных рёбрах по телам сцены (по правилу E5). */
window.AtlasMeshReport=function(limit=50){const A=window.__ATLAS,G=window.__FULL_ATLAS;if(!A||!G||typeof A.sceneObjects!=='function'||typeof G.geometry!=='function')return null;
 const out=[];let bodies=0;for(const o of A.sceneObjects()){const g=G.geometry(o.renderId);if(!g||!g.v||!g.f||!g.f.length)continue;bodies++;
  const N=g.v.length,nf=g.f.length,P=new Float64Array(N*3),F=new Uint32Array(nf*3);for(let i=0;i<N;i++){const p=g.v[i];P[i*3]=p[0];P[i*3+1]=p[1];P[i*3+2]=p[2];}for(let j=0;j<nf;j++){const t=g.f[j];F[j*3]=t[0];F[j*3+1]=t[1];F[j*3+2]=t[2];}
  const b=atlasCreaseEdges(P,0,F,0,nf,N,2),m=atlasCreaseEdges(P,0,F,0,nf,N,3);if(!b.length&&!m.length)continue;let len=0;
  for(let k=0;k<b.length;k+=2){const a=b[k]*3,c=b[k+1]*3;len+=Math.hypot(P[c]-P[a],P[c+1]-P[a+1],P[c+2]-P[a+2]);}
  out.push({id:o.id,renderId:o.renderId,name:o.name||o.label||'',boundary:b.length/2,boundaryM:Math.round(len*1000)/1000,nonManifold:m.length/2});}
 out.sort((x,y)=>y.boundaryM-x.boundaryM||y.nonManifold-x.nonManifold);return {bodies,withDefects:out.length,list:out.slice(0,limit)};};
/* R23: transferable input, 32-byte vertices, numeric edge keys.
   Geometry source positions remain Float64 for normals; output uses the same Float32 projection as R22.
   Source arrays, IDs, object boundaries and engineering files are not modified. */
function packBatch(items){
 let nv=0,nf=0;for(const o of items){nv+=o.v.length;nf+=o.f.length;}
 const positions=new Float64Array(nv*3),indices=new Uint32Array(nf*3),records=[];let vo=0,fo=0;
 for(const o of items){for(let i=0;i<o.v.length;i++){const p=o.v[i],k=vo+i*3;positions[k]=p[0];positions[k+1]=p[1];positions[k+2]=p[2];}
  for(let i=0;i<o.f.length;i++){const f=o.f[i],k=fo+i*3;indices[k]=f[0];indices[k+1]=f[1];indices[k+2]=f[2];}
  records.push({vo,fo,nv:o.v.length,nf:o.f.length,renderId:o.renderId,pickId:o.pickId,bounds:o.bounds,color:o.color,smooth:window.AtlasSmoothByRenderId(o.renderId)});vo+=o.v.length*3;fo+=o.f.length*3;
 }return {positions,indices,records,debugMesh:window.ATLAS_DEBUG_MESH?1:0,smooth:records.some(r=>r.smooth&&r.nf)?1:0};
}
function buildPackedBatch(packed){
 const {positions:P,indices:F,records}=packed,ranges=[],edgeValues=[];
 function build(list,kind){let nv=0;for(const o of list)nv+=o.nf*3;const bytes=new Uint8Array(nv*32),floats=new Float32Array(bytes.buffer);let cur=0;
  for(const o of list){const start=cur,N=o.nv;
   const c=o.color.map(x=>Math.round(Math.min(1,Math.max(0,x))*255)),CN=o.smooth&&packed.smooth===1?atlasSmoothNormals(P,o.vo,3,F,o.fo,o.nf,N,30):null;   /* 1.1 G: гладкие нормали углов */
   for(let j=0;j<o.nf;j++){
    const fi=o.fo+j*3,a=F[fi],b=F[fi+1],cc=F[fi+2],ia=o.vo+a*3,ib=o.vo+b*3,ic=o.vo+cc*3;
    const ux=P[ib]-P[ia],uy=P[ib+1]-P[ia+1],uz=P[ib+2]-P[ia+2],vx=P[ic]-P[ia],vy=P[ic+1]-P[ia+1],vz=P[ic+2]-P[ia+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
    for(let v=0;v<3;v++){const idx=F[fi+v],k=o.vo+idx*3,off=cur*8,co=cur*32+24;let sx=nx,sy=ny,sz=nz;if(CN){const q=(j*3+v)*3;if(CN[q]||CN[q+1]||CN[q+2]){sx=CN[q];sy=CN[q+1];sz=CN[q+2];}}
     floats[off]=P[k];floats[off+1]=P[k+1];floats[off+2]=P[k+2];floats[off+3]=sx;floats[off+4]=sy;floats[off+5]=sz;
     bytes[co]=c[0];bytes[co+1]=c[1];bytes[co+2]=c[2];bytes[co+3]=c[3];floats[off+7]=o.pickId;cur++;
    }
   }
   const edgeStart=edgeValues.length/4;
   const ce=atlasCreaseEdges(P,o.vo,F,o.fo,o.nf,N,packed.debugMesh);for(let ei=0;ei<ce.length;ei+=2){let k=o.vo+ce[ei]*3;edgeValues.push(P[k],P[k+1],P[k+2],o.pickId);k=o.vo+ce[ei+1]*3;edgeValues.push(P[k],P[k+1],P[k+2],o.pickId);}
   ranges.push({id:o.renderId,pickId:o.pickId,start,count:o.nf*3,kind,bounds:o.bounds,alpha:o.color[3],edgeStart,edgeCount:edgeValues.length/4-edgeStart});
  }return bytes;
 }
 const solid=build(records.filter(o=>o.color[3]>=.999),'opaque'),glass=build(records.filter(o=>o.color[3]<.999),'transparent');
 return {solid,glass,edges:new Float32Array(edgeValues),ranges,stride:32};
}

window.AtlasPackBatch=packBatch;
window.AtlasBuildPackedBatch=buildPackedBatch;
window.AtlasBuildBatch=items=>buildPackedBatch(packBatch(items));
/* Attribute-exact indexing: only corners of the SAME source vertex and the SAME
 * Float32 normal are shared. Object identity, hard edges, colours and triangle order survive. */
function buildIndexedBatch(packed){
 const {positions:P,indices:F,records}=packed,ranges=[],edgeValues=[],edgeIndexValues=[];
 const nbuf=new ArrayBuffer(12),normal32=new Float32Array(nbuf),normalBits=new Uint32Array(nbuf);
 function build(list,kind){
  let corners=0;for(const o of list)corners+=o.nf*3;
  const bytes=new Uint8Array(corners*32),floats=new Float32Array(bytes.buffer),bits=new Uint32Array(bytes.buffer),indices=new Uint32Array(corners),next=new Int32Array(corners);
  let cur=0,ic=0;
  for(const o of list){
   const start=ic,N=o.nv,heads=new Int32Array(N);heads.fill(-1);
   const c=o.color.map(x=>Math.round(Math.min(1,Math.max(0,x))*255)),CN=o.smooth&&packed.smooth===1?atlasSmoothNormals(P,o.vo,3,F,o.fo,o.nf,N,30):null;   /* 1.1 G: гладкие нормали углов */
   for(let j=0;j<o.nf;j++){
    const fi=o.fo+j*3,a=F[fi],b=F[fi+1],cc=F[fi+2];
    if(a>=N||b>=N||cc>=N)throw Error('Invalid source vertex index: '+o.renderId);
    const ia=o.vo+a*3,ib=o.vo+b*3,iz=o.vo+cc*3;
    const ux=P[ib]-P[ia],uy=P[ib+1]-P[ia+1],uz=P[ib+2]-P[ia+2],vx=P[iz]-P[ia],vy=P[iz+1]-P[ia+1],vz=P[iz+2]-P[ia+2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const len=Math.hypot(nx,ny,nz)||1;nx/=len;ny/=len;nz/=len;
    for(let v=0;v<3;v++){
     {let sx=nx,sy=ny,sz=nz;if(CN){const q=(j*3+v)*3;if(CN[q]||CN[q+1]||CN[q+2]){sx=CN[q];sy=CN[q+1];sz=CN[q+2];}}normal32[0]=sx;normal32[1]=sy;normal32[2]=sz;}
     const idx=F[fi+v];let vertex=heads[idx];
     while(vertex!==-1){const k=vertex*8;if(bits[k+3]===normalBits[0]&&bits[k+4]===normalBits[1]&&bits[k+5]===normalBits[2])break;vertex=next[vertex];}
     if(vertex===-1){vertex=cur++;next[vertex]=heads[idx];heads[idx]=vertex;const k=o.vo+idx*3,off=vertex*8,co=vertex*32+24;
      floats[off]=P[k];floats[off+1]=P[k+1];floats[off+2]=P[k+2];bits[off+3]=normalBits[0];bits[off+4]=normalBits[1];bits[off+5]=normalBits[2];
      bytes[co]=c[0];bytes[co+1]=c[1];bytes[co+2]=c[2];bytes[co+3]=c[3];floats[off+7]=o.pickId;
     }
     indices[ic++]=vertex;
    }
   }
   const edgeStart=edgeIndexValues.length,edgeHeads=new Int32Array(N);edgeHeads.fill(-1);
   const ce=atlasCreaseEdges(P,o.vo,F,o.fo,o.nf,N,packed.debugMesh);for(let ei=0;ei<ce.length;ei+=2){for(const v of [ce[ei],ce[ei+1]]){let ix=edgeHeads[v];if(ix===-1){ix=edgeValues.length/4;edgeHeads[v]=ix;const k=o.vo+v*3;edgeValues.push(P[k],P[k+1],P[k+2],o.pickId);}edgeIndexValues.push(ix);}}
   ranges.push({id:o.renderId,pickId:o.pickId,start,count:o.nf*3,kind,bounds:o.bounds,alpha:o.color[3],edgeStart,edgeCount:edgeIndexValues.length-edgeStart});
  }
  return {vertices:cur===corners?bytes:bytes.slice(0,cur*32),indices};
 }
 const solid=build(records.filter(o=>o.color[3]>=.999),'opaque'),glass=build(records.filter(o=>o.color[3]<.999),'transparent');
 return {solid:solid.vertices,glass:glass.vertices,solidIndices:solid.indices,glassIndices:glass.indices,edges:new Float32Array(edgeValues),edgeIndices:new Uint32Array(edgeIndexValues),ranges,stride:32,indexed:true};
}

window.AtlasBuildIndexedBatch=items=>buildIndexedBatch(packBatch(items));
window.AtlasBuildPackedIndexedBatch=buildIndexedBatch;

/* V11 (задача D): режим «нормали в шейдере». Вершина — 20 байт: позиция Float32×3, цвет RGBA8, id выбора RGB8.
   Вершины объекта не дублируются по нормалям (плоская нормаль считается во фрагментном шейдере по производным),
   рёбра — индексы в тот же буфер вершин. Правило рёбер прежнее: граница или излом (cos < 0,85). */
function packDeriv(items){
 let nq=0,np=0,nf=0;for(const o of items){const g=o.g;if(!g)continue;if(g.pf)np+=g.nv;else nq+=g.nv;nf+=g.nf;}
 const q=new Uint16Array(nq*3),pf=new Float64Array(np*3),idx=new Uint32Array(nf*3),records=[];let qo=0,po=0,fo=0;
 for(const o of items){const g=o.g;if(!g){records.push({nv:0,nf:0,fo,renderId:o.renderId,pickId:o.pickId,bounds:o.bounds,color:o.color,quant:true,src:0,lo:[0,0,0],sc:[0,0,0]});continue;}
  const r={nv:g.nv,nf:g.nf,fo,renderId:o.renderId,pickId:o.pickId,bounds:o.bounds,color:o.color,rank:o.rank|0,smooth:window.AtlasSmoothByRenderId(o.renderId),quant:!g.pf,lo:g.lo||[0,0,0],sc:g.sc||[0,0,0]};
  if(g.pf){pf.set(g.pf,po*3);r.src=po;po+=g.nv;}else{q.set(g.q,qo*3);r.src=qo;qo+=g.nv;}
  idx.set(g.idx,fo*3);fo+=g.nf;records.push(r);}
 return {q,pf,idx,records,debugMesh:window.ATLAS_DEBUG_MESH?1:0,smooth:records.some(r=>r.smooth&&r.nf)?1:0};
}
/* 1.1 G: вершина — 24 байта (20, если в сборке нет тел из списка сглаживания — как до правки): позиция Float32×3, цвет RGBA8, id выбора RGB8 + ранг, нормаль угла Int8×3 (+1 пустой). Исходные вершины
   всех тел — первыми и в прежнем порядке (рёбра и buildDerivEdges ссылаются на них без изменений); угол, чья гладкая нормаль отличается
   от уже записанной в его вершину, получает копию вершины в конце буфера; у плоской грани (все три угла = нормаль грани) ключ (0,0,0). Треугольники и их порядок те же. Нулевая нормаль — «плоско»
   (шейдер берёт нормаль грани по производным): так строится первый кадр (noSmooth), гладкие нормали приходят следом. */
function buildDerivBatch(packed,noEdges,noSmooth){
 const {q,pf,idx,records}=packed,ST=packed.smooth===1?24:20,FS=ST/4,smooth=!noSmooth&&packed.smooth===1;let nv=0,nf=0;for(const r of records){nv+=r.nv;nf+=r.nf;}
 const bytes=new Uint8Array(nv*ST),f32=new Float32Array(bytes.buffer),i8=new Int8Array(bytes.buffer),tri=new Uint32Array(nf*3),ranges=[];let edgeCap=1024,edges=new Uint32Array(edgeCap),ne=0;
 const base=new Int32Array(records.length);let vo=0;
 for(let ri=0;ri<records.length;ri++){const r=records[ri];base[ri]=vo;const c=r.color.map(x=>Math.round(Math.min(1,Math.max(0,x))*255)),id=r.pickId,rk=(r.rank|0)&255;
  for(let i=0;i<r.nv;i++){const k=(vo+i)*FS,b=(vo+i)*ST;let x,y,z;if(r.quant){const s=(r.src+i)*3;x=r.lo[0]+q[s]*r.sc[0];y=r.lo[1]+q[s+1]*r.sc[1];z=r.lo[2]+q[s+2]*r.sc[2];}else{const s=(r.src+i)*3;x=pf[s];y=pf[s+1];z=pf[s+2];}
   f32[k]=x;f32[k+1]=y;f32[k+2]=z;bytes[b+12]=c[0];bytes[b+13]=c[1];bytes[b+14]=c[2];bytes[b+15]=c[3];bytes[b+16]=id&255;bytes[b+17]=(id>>8)&255;bytes[b+18]=(id>>16)&255;bytes[b+19]=rk;}
  vo+=r.nv;}
 let xcap=smooth?1024:0,xb=smooth?new Uint8Array(xcap*ST):null,xi8=smooth?new Int8Array(xb.buffer):null,xnext=smooth?new Int32Array(xcap):null,xn=0;
 const head=smooth?new Int32Array(nv).fill(-1):null,set=smooth?new Uint8Array(nv):null;
 let cur=0;
 function emit(ri,kind){const r=records[ri],v0=base[ri],start=cur,N=r.nv,edgeStart=ne,F0=r.fo*3;
  if(smooth&&r.smooth&&r.nf){const CN=atlasSmoothNormals(f32,v0*FS,FS,idx,F0,r.nf,N,30);
   for(let j=0;j<r.nf;j++){
    // грань, у которой все три угла смотрят как сама грань (коробки, плиты, торцы), — ключ «плоско» (0,0,0): углы коробок не дают копий
    let flat=true;{const a=idx[F0+j*3],b=idx[F0+j*3+1],c=idx[F0+j*3+2];if(a<N&&b<N&&c<N){const pa=(v0+a)*FS,pb=(v0+b)*FS,pc=(v0+c)*FS,ux=f32[pb]-f32[pa],uy=f32[pb+1]-f32[pa+1],uz=f32[pb+2]-f32[pa+2],vx=f32[pc]-f32[pa],vy=f32[pc+1]-f32[pa+1],vz=f32[pc+2]-f32[pa+2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const l=Math.sqrt(nx*nx+ny*ny+nz*nz);
     if(l>0){nx/=l;ny/=l;nz/=l;for(let v=0;v<3&&flat;v++){const o=(j*3+v)*3;if(CN[o]*nx+CN[o+1]*ny+CN[o+2]*nz<.99999)flat=false;}}}}
    for(let v=0;v<3;v++){const jj=j*3+v,L=idx[F0+jj];let t=v0+L;
     if(L<N){const o=jj*3,nx=flat?0:Math.round(CN[o]*127),ny=flat?0:Math.round(CN[o+1]*127),nz=flat?0:Math.round(CN[o+2]*127),b=t*ST+20;
      if(!set[t]){set[t]=1;i8[b]=nx;i8[b+1]=ny;i8[b+2]=nz;}
      else if(i8[b]!==nx||i8[b+1]!==ny||i8[b+2]!==nz){let e=head[t];while(e!==-1){const xo=e*ST+20;if(xi8[xo]===nx&&xi8[xo+1]===ny&&xi8[xo+2]===nz)break;e=xnext[e];}
       if(e===-1){if(xn===xcap){xcap*=2;const nb=new Uint8Array(xcap*ST);nb.set(xb);xb=nb;xi8=new Int8Array(xb.buffer);const nn=new Int32Array(xcap);nn.set(xnext);xnext=nn;}
        e=xn++;xb.set(bytes.subarray(t*ST,t*ST+20),e*ST);const xo=e*ST+20;xi8[xo]=nx;xi8[xo+1]=ny;xi8[xo+2]=nz;xnext[e]=head[t];head[t]=e;}
       t=nv+e;}}
     tri[cur+jj]=t;}}}
  else for(let j=0;j<r.nf*3;j++)tri[cur+j]=v0+idx[F0+j];
  cur+=r.nf*3;
  if(r.nf&&!noEdges){const P=new Float64Array(N*3);for(let i=0;i<N;i++){const k=(v0+i)*FS;P[i*3]=f32[k];P[i*3+1]=f32[k+1];P[i*3+2]=f32[k+2];}
   const ce=atlasCreaseEdges(P,0,idx,r.fo*3,r.nf,N,packed.debugMesh);
   for(let ei=0;ei<ce.length;ei+=2){if(ne+2>edgeCap){edgeCap*=2;const n2=new Uint32Array(edgeCap);n2.set(edges.subarray(0,ne));edges=n2;}edges[ne++]=v0+ce[ei];edges[ne++]=v0+ce[ei+1];}}
  ranges.push({id:r.renderId,pickId:r.pickId,start,count:r.nf*3,kind,bounds:r.bounds,alpha:r.color[3],edgeStart,edgeCount:ne-edgeStart});}
 for(let ri=0;ri<records.length;ri++)if(records[ri].color[3]>=.999)emit(ri,'opaque');
 for(let ri=0;ri<records.length;ri++)if(records[ri].color[3]<.999)emit(ri,'transparent');
 let vertices=bytes;if(xn){vertices=new Uint8Array((nv+xn)*ST);vertices.set(bytes);vertices.set(xb.subarray(0,xn*ST),nv*ST);}
 return {mode:'deriv',vertices,tri,edges:edges.slice(0,ne),ranges,stride:ST,indexed:true,edgesLater:!!noEdges,smoothLater:!!noSmooth&&packed.smooth===1,extraVertices:xn,baseVertices:nv};
}
function buildDerivEdges(packed){
 const {q,pf,idx,records}=packed;const er=new Uint32Array(records.length*2);let edgeCap=1024,edges=new Uint32Array(edgeCap),ne=0,vo=0,k=0;
 const base=new Int32Array(records.length);for(let ri=0;ri<records.length;ri++){base[ri]=vo;vo+=records[ri].nv;}
 function one(ri){const r=records[ri],v0=base[ri],N=r.nv,edgeStart=ne;
  if(r.nf){const P=new Float64Array(N*3),fr=Math.fround;for(let i=0;i<N;i++){const s=(r.src+i)*3;if(r.quant){P[i*3]=fr(r.lo[0]+q[s]*r.sc[0]);P[i*3+1]=fr(r.lo[1]+q[s+1]*r.sc[1]);P[i*3+2]=fr(r.lo[2]+q[s+2]*r.sc[2]);}else{P[i*3]=fr(pf[s]);P[i*3+1]=fr(pf[s+1]);P[i*3+2]=fr(pf[s+2]);}}
   const ce=atlasCreaseEdges(P,0,idx,r.fo*3,r.nf,N,packed.debugMesh);
   for(let ei=0;ei<ce.length;ei+=2){if(ne+2>edgeCap){edgeCap*=2;const n2=new Uint32Array(edgeCap);n2.set(edges.subarray(0,ne));edges=n2;}edges[ne++]=v0+ce[ei];edges[ne++]=v0+ce[ei+1];}}
  er[k++]=edgeStart;er[k++]=ne-edgeStart;}
 for(let ri=0;ri<records.length;ri++)if(records[ri].color[3]>=.999)one(ri);
 for(let ri=0;ri<records.length;ri++)if(records[ri].color[3]<.999)one(ri);
 return {edges:edges.slice(0,ne),er};
}
window.AtlasPackDeriv=packDeriv;
window.AtlasBuildDerivBatch=items=>buildDerivBatch(packDeriv(items));

/* 1.1 G: исходник Worker собирается из тех же функций, что работают в окне (прежде — строковая копия buildPackedBatch/buildIndexedBatch). */
window.ATLAS_BATCH_WORKER_SOURCE="'use strict';\n"+buildPackedBatch.toString()+"\n"+buildIndexedBatch.toString()+"\nlet atlasEdgeEpoch=0,atlasLastPacked=null;\nself.onmessage=e=>{try{if(e.data.mode==='smooth'){const ep=e.data.epoch,p=atlasLastPacked;if(ep!==atlasEdgeEpoch||!p)return;try{const t0=Date.now(),r=buildDerivBatch(p,true,false);self.postMessage({epoch:ep,smooth:{vertices:r.vertices,tri:r.tri,extra:r.extraVertices,base:r.baseVertices,ms:Date.now()-t0}},[r.vertices.buffer,r.tri.buffer]);}catch(err){self.postMessage({epoch:ep,smoothError:err.message});}return;}if(e.data.mode==='deriv'){const p=e.data.packed,ep=e.data.epoch,sm=p.smooth===1;atlasEdgeEpoch=ep;atlasLastPacked=sm?p:null;const result=buildDerivBatch(p,true,sm);self.postMessage({epoch:ep,result},[result.vertices.buffer,result.tri.buffer,result.edges.buffer]);setTimeout(()=>{if(ep!==atlasEdgeEpoch)return;try{const d=buildDerivEdges(p);self.postMessage({epoch:ep,edges:d.edges,er:d.er},[d.edges.buffer,d.er.buffer]);}catch(err){self.postMessage({epoch:ep,edgesError:err.message});}},0);return;}const result=e.data.indexed?buildIndexedBatch(e.data.packed):buildPackedBatch(e.data.packed);const transfer=[result.solid.buffer,result.glass.buffer,result.edges.buffer];if(result.indexed)transfer.push(result.solidIndices.buffer,result.glassIndices.buffer,result.edgeIndices.buffer);self.postMessage({epoch:e.data.epoch,result},transfer);}catch(err){self.postMessage({epoch:e.data.epoch,error:err.message});}};";
window.ATLAS_BATCH_WORKER_SOURCE=atlasCreaseEdges.toString()+'\n'+atlasSmoothNormals.toString()+'\n'+buildDerivBatch.toString()+'\n'+buildDerivEdges.toString()+'\n'+window.ATLAS_BATCH_WORKER_SOURCE;
