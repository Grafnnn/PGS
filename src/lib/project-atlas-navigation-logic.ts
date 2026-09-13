// Shared by the delivery adapter and isolated, deterministic tests. No model data is rewritten.
export const atlasNavigationLogic = String.raw`
function createAtlasNavigationLogic(){
 const albums=[
  {id:'building',label:'Всё здание',roots:['building']},
  {id:'foundations',label:'Основания и фундаменты',roots:['section:foundations','entity:L1_Фп-1','entity:R10L_E1_FOUND0','entity:R10L_E1_FOUND1',...[['E1',4],['E2',3],['E3',4],['E6',4],['E8',4]].flatMap(([entry,count])=>Array.from({length:count},(_,i)=>'entity:'+entry+'_PILE'+(i+1))),...Array.from({length:10},(_,i)=>'entity:R09L_E4_PILE_'+String(i+1).padStart(2,'0'))]},
  {id:'ground',label:'Полы и приямки',roots:['section:ground']},
  {id:'floors',label:'Перекрытия',roots:['section:floors']},
  {id:'stair',label:'Лестница Л-1',roots:['section:stair']},
  {id:'lifts',label:'Лифты',roots:['section:lifts']},
  {id:'entrances',label:'Входы и навесы',roots:['section:entrances']},
  {id:'chamber',label:'Венткамера',roots:['section:chamber','entity:VC_W','entity:VC_ROOF']},
  {id:'roof',label:'Кровля',roots:['section:roof']},
  {id:'walls',label:'Стены и фасады',roots:['section:master','section:facade']},
  {id:'openings',label:'Проёмы и усиление',roots:['section:openings','section:placed_frames']},
  {id:'equipment',label:'Рамы оборудования',roots:['section:equipment']}
 ];
 const paths=new WeakMap();
 function path(albumId,h,id){
  if(!h)return[];let cache=paths.get(h);if(!cache){cache=new Map();paths.set(h,cache);}const key=albumId+'|'+id;if(cache.has(key))return cache.get(key);
  const album=albums.find(a=>a.id===albumId);if(!album||!h.nodes[id])return[];
  const root=albumId==='building'?'building':'album:'+albumId,stack=[[root]],seen=new Set();let result=[];
  while(stack.length){const p=stack.pop(),last=p.at(-1);if(seen.has(last))continue;seen.add(last);if(last===id){result=p.map(k=>h.nodes[k]);break;}
   const children=last==='building'?albums.slice(1).map(a=>'album:'+a.id):h.nodes[last]?.children||[];
   for(let j=children.length-1;j>=0;j--)stack.push([...p,children[j]]);
  }
  // A flattened section root has the same boundary as its single-root album.
  if(!result.length&&album.roots.length===1&&album.roots[0]===id)result=[h.nodes[root]];
  cache.set(key,result);return result;
 }
 function owner(h,id,preferred='building'){
  if(id==='building'||id==='construction')return'building';if(id?.startsWith('album:'))return id.slice(6);
  if(path(preferred,h,id).length)return preferred;
  return albums.slice(1).find(a=>path(a.id,h,id).length)?.id||'building';
 }
 function scope(album,h,rows){
  if(album.id==='building')return h.activeIndices.slice();
  return [...new Set(album.roots.flatMap(id=>{const n=h.nodes[id];return n?h.order.slice(...n.span):[];}))].filter(i=>rows[i]?.physical&&rows[i]?.bucket==='active');
 }
 function prune(cache,needed,budget=8*1024*1024){
  const active=new Set(needed);let spare=0;
  const old=[...cache.entries()].filter(([id])=>!active.has(id)).sort((a,b)=>b[1].lastUsed-a[1].lastUsed);
  for(const [id,b]of old){if(spare+b.binary.byteLength<=budget)spare+=b.binary.byteLength;else cache.delete(id);}
  return {blocks:cache.size,bytes:[...cache.values()].reduce((n,b)=>n+b.binary.byteLength,0),spareBytes:spare};
 }
 function geometry(blocks,ids,rows){
  const wanted=new Set(ids),seen=new Set(),ranges=[];let vertices=0,faces=0;
  for(const b of blocks)for(const [id,vo,vc,fo,fc]of b.info)if(wanted.has(id)){
   if(seen.has(id))throw new Error('Duplicate geometry ID');
   seen.add(id);ranges.push({b,id,vo,vc,fo,fc});vertices+=vc;faces+=fc;
  }
  if(ranges.length!==wanted.size)throw new Error('Incomplete scope geometry');
  const buffer=new ArrayBuffer(vertices*12+faces*15),v=new Float32Array(buffer,0,vertices*3),f=new Uint32Array(buffer,vertices*12,faces*3),n=new Int8Array(buffer,vertices*12+faces*12,faces*3),info=new Array(rows.length),meta=new Array(rows.length);
  let vo=0,fo=0;
  for(const r of ranges){const b=r.b;
   v.set(new Float32Array(b.binary,r.vo*12,r.vc*3),vo*3);
   const source=new Uint32Array(b.binary,b.vertices*12+r.fo*12,r.fc*3);
   for(let j=0;j<source.length;j++){if(source[j]<r.vo||source[j]>=r.vo+r.vc)throw new Error('Cross-object vertex reference');f[fo*3+j]=source[j]-r.vo+vo;}
   n.set(new Int8Array(b.binary,b.vertices*12+b.faces*12+r.fo*3,r.fc*3),fo*3);
   info[r.id]=[vo,r.vc,fo,r.fc];const e=rows[r.id];meta[r.id]={bounds:e.bounds,rgb:[1,3,5].map(k=>parseInt((e.color||'#999999').slice(k,k+2),16))};vo+=r.vc;fo+=r.fc;
  }
  return {buffer,vertices,faces,info,meta};
 }
 function drawing({context,page,h,rows,registry,extras={},confirmed={},prepared=[]}){
  const links=[],seen=new Set(),keys=new Map(rows.map((r,i)=>[r.key,i]));
  const add=(items,role,via)=>{for(const value of items||[]){const s=typeof value==='string'?{key:value}:value;if(!s||s.method==='navigation_evidence'||!registry[s.key]||seen.has(s.key))continue;seen.add(s.key);links.push({key:s.key,role,via});}};
  let node=context.kind==='element'?h.byKey[context.key]:context.kind==='node'?context.nodeId:null;
  let index=context.kind==='element'?keys.get(context.key):h.nodes[node]?.model_key?keys.get(h.nodes[node].model_key):null;
  if(index!=null&&rows[index]?.key==='DETAIL_S'){
   const sample=prepared.find(p=>p.key==='roof::sample'&&p.indices?.includes(index));if(sample)add(Array.isArray(sample.source)?sample.source:[sample.source],'Схема типа',sample.name);
  }
  if(context.kind==='view'){
   add(Array.isArray(page?.source)?page.source:[page?.source],page?.isType?'Схема типа':'План раздела',page?.name);
   // Canonical block views have no page.source; derive only from their actual member IDs.
   if(!links.length)for(const i of page?.indices||[]){add(rows[i]?.sources,'Чертёж элемента',rows[i]?.name);add(confirmed[rows[i]?.key],'Чертёж элемента',rows[i]?.name);add(extras[rows[i]?.key],'Размещение',rows[i]?.name);}
  }else{
   if(index!=null){add(rows[index]?.sources,'Чертёж элемента',rows[index]?.name);add(confirmed[rows[index]?.key],'Чертёж элемента',rows[index]?.name);add(extras[rows[index]?.key],'Размещение',rows[index]?.name);}
   const visited=new Set();while(node&&!visited.has(node)){
    visited.add(node);const n=h.nodes[node];if(!n)break;
    add(n.sources,n.kind==='section'||n.kind==='album'?'План раздела':'Узел сборки',n.label);add(confirmed[node],n.kind==='section'?'План раздела':'Узел сборки',n.label);node=n.parent;
   }
  }
  const members=context.kind==='view'?page?.indices||[]:index!=null?[index]:h.nodes[context.nodeId]?.span?h.order.slice(...h.nodes[context.nodeId].span):[];
  // Audited context crosswalk. Membership alone (even the smallest view) is not source evidence.
  const crosswalk={L1_R04_FLOOR_IN:['stair::nodeA'],L1_R04_PLATE_т:['stair::nodeA'],L1_МБ1_F1_01:['stair::nodeOP'],DETAIL_S:['roof::sample']};
  for(const i of members)for(const key of crosswalk[rows[i]?.key]||[]){const p=prepared.find(p=>p.key===key&&p.indices?.includes(i));if(p)add(Array.isArray(p.source)?p.source:[p.source],key==='roof::sample'?'Схема типа':'Узел сборки',p.name);}
  if(context.kind==='node'&&context.nodeId==='g:0c7213c3c24b54b277b5'){
   const p=prepared.find(p=>p.key==='lifts::lift1');if(p&&members.some(i=>p.indices?.includes(i)))add([p.source],'План раздела','Общий вид лифта №1');
  }
  return links;
 }
 return {albums,scope,path,owner,prune,geometry,drawing};
}
`;
