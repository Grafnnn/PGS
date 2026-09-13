import atlasIconData from "./project-atlas-icons.json";
import sourceLinks from "@/assets/project-models/troitsk-b24-atlas-3-2.source-links.json";
import { atlasNavigationLogic } from "./project-atlas-navigation-logic";

const icons = atlasIconData.icons;
const confirmed = Object.fromEntries(sourceLinks.groups.flatMap(group => [
  ...group.ids.flatMap(id => [[id, group.sourceKeys], ["entity:" + id, group.sourceKeys]]),
  ...group.ownBodyNodes.map(id => [id, group.sourceKeys])
]));
confirmed["section:roof"] = ["R02_AR9"];
export const atlasConfirmedContextLinks = confirmed;

export const atlasAlbumTransactions = String.raw`
let atlasScenePending=null;
function atlasSaveAlbum(){if(atlasScenePending==null&&S.page)atlasAlbumStates.set(atlasAlbum,snapshot());}
async function atlasNavigate(options,load){
 const navToken=beginNavigation(options);if(!navigationCurrent(navToken))return false;
 atlasSaveAlbum();atlasScenePending=navToken;
 const ok=await load({...options,navToken});if(!navigationCurrent(navToken))return false;
 // Failed/cancelled loads never become the owner of a remembered album state.
 if(ok!==false){atlasScenePending=null;atlasSaveAlbum();atlasSyncContext();}
 return ok;
}
async function openNode(id,opts={}){return atlasNavigate(opts,options=>atlasLoadNode(id,options));}
async function restore(state,opts={}){return atlasNavigate(opts,options=>atlasRestore(state,options));}
async function openSavedPage(mod,id,opts={}){return atlasNavigate(opts,options=>atlasLoadSavedPage(mod,id,options));}
async function atlasOpenAlbum(id,{fresh=false,node}={}){
 if(!atlasLogic.albums.some(a=>a.id===id))return false;
 const saved=atlasAlbumStates.get(id),opts={atlasAlbum:id};
 return saved&&!fresh&&!node?restore(saved,opts):openNode(node||(id==='building'?'building':'album:'+id),opts);
}
`;

export const atlasEscapeHandler = String.raw`
window.PGS_ATLAS_CONSUME_ESCAPE=function(event){
 if(event.key!=='Escape'||event.defaultPrevented)return false;
 const modal=[...document.querySelectorAll('dialog[open]')].at(-1);
 if(modal){modal.dispatchEvent(new Event('cancel',{cancelable:true}));if(modal.open)modal.close();}
 else if(!$('drawingPanel').hidden){backDrawing().catch(error);}
 else if(!$('pgs-camera-menu').hidden){closePanels();$('pgs-camera').focus();}
 else if(!$('clipPanel').hidden||!$('morePanel').hidden){closePanels();$('moreToggle').focus();}
 else if(UI.props){closeProps();}
 else if(narrow()&&UI.navOpen){setNav(false);$('navToggle').focus();}
 else if(atlasHighlight!=null){atlasClearHighlight();}
 else return false;
 event.preventDefault();event.stopImmediatePropagation();return true;
};
`;

function once(source: string, anchor: string, replacement: string) {
  if (source.split(anchor).length !== 2) throw new Error("Atlas navigation adapter source mismatch: " + anchor.slice(0, 80));
  return source.replace(anchor, replacement);
}
function section(source: string, start: string, end: string, replacement: string) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  if (a < 0 || b < 0 || source.split(start).length !== 2) throw new Error("Atlas navigation function mismatch: " + start);
  return source.slice(0, a) + replacement + "\n" + source.slice(b);
}

export const atlasNavigationRuntime = String.raw`
${atlasNavigationLogic}
const atlasLogic=createAtlasNavigationLogic(),atlasIcons=${JSON.stringify(icons)},atlasExactLinks=${JSON.stringify(confirmed)};
let atlasHighlight=null,atlasAlbum='building';const atlasAlbumStates=new Map();
${atlasAlbumTransactions}
${atlasEscapeHandler}
function atlasScopedPath(id){return atlasLogic.path(atlasAlbum,H,id);}
function atlasParent(id){return atlasScopedPath(id).at(-2);}
function atlasClearHighlight(){atlasHighlight=null;atlasSyncContext();render();}
function atlasSyncContext(){
 canvas.dataset.highlight=atlasHighlight||'';canvas.dataset.context=JSON.stringify(effectiveContext());canvas.dataset.album=atlasAlbum;
 const c=$('pgs-clear');if(c)c.hidden=atlasHighlight==null;
 $('pgs-properties')?.setAttribute('aria-expanded',String(UI.props));
 $('modelArea').classList.toggle('pgs-props-open',UI.props);
 $('pgs-camera-menu')?.setAttribute('aria-label','Ракурс модели');
 const b=$('pgs-album-open');if(b){const label=atlasLogic.albums.find(a=>a.id===atlasAlbum)?.label||'Всё здание';b.innerHTML=esc(label)+atlasIcons.down;b.setAttribute('aria-label','Альбом: '+label);}
}
function atlasPrepareAlbums(h){
 for(const a of atlasLogic.albums){if(a.id==='building')continue;const id='album:'+a.id,ids=atlasLogic.scope(a,h,rows);
  const roots=a.roots.filter(id=>h.nodes[id]),children=[...new Set(roots.flatMap(root=>h.nodes[root].kind==='section'?h.nodes[root].children:[root]))];
  const sourceKeys=[...new Set(roots.flatMap(root=>[...(h.nodes[root].sources||[]).filter(s=>s.method!=='navigation_evidence').map(s=>s.key),...(atlasExactLinks[root]||[])]))];
  h.nodes[id]={id,parent:'building',kind:'album',label:a.label,children,self:[],physical_count:ids.length,record_count:ids.length,sources:sourceKeys.map(key=>({key})),evidence:{},albumIndices:ids};
 }
 return h;
}
function atlasAlbumMenu(){
 dialog('Альбомы конструкций','<div id="pgs-album-list"></div>');
 for(const a of atlasLogic.albums){const b=document.createElement('button');b.setAttribute('aria-current',String(atlasAlbum===a.id));b.innerHTML=atlasIcons[a.id==='building'?'albums':'layers']+'<span>'+esc(a.label)+'</span><small>'+fmt(atlasLogic.scope(a,H,rows).length)+'</small>';b.onclick=()=>{$('dialog').close();atlasOpenAlbum(a.id).catch(error);};$('pgs-album-list').append(b);}
}
function atlasPath(){
 const n=hnode(),p=n?atlasScopedPath(n.id):[H?.nodes[atlasAlbum==='building'?'building':'album:'+atlasAlbum]].filter(Boolean),bar=$('pgs-path');if(!bar)return;
 bar.replaceChildren();const parent=p.at(-2),link=document.createElement('button');link.textContent=parent?.label||atlasLogic.albums.find(a=>a.id===atlasAlbum)?.label||'Всё здание';link.title=p.map(n=>n.label).join(' → ');link.onclick=()=>parent?openNode(parent.id):atlasAlbumMenu();bar.append(link);
 const full=document.createElement('button');full.className='pgs-path-open';full.innerHTML=atlasIcons.down;full.title='Полный путь';full.setAttribute('aria-label','Полный путь');full.onclick=()=>{dialog('Путь в составе',p.map(n=>'<button class="source-link" data-path="'+esc(n.id)+'">'+esc(n.label)+'</button>').join(''));for(const b of $('dialogBody').querySelectorAll('[data-path]'))b.onclick=()=>{$('dialog').close();openNode(b.dataset.path);};};bar.append(full);
 const clear=document.createElement('button');clear.id='pgs-clear';clear.innerHTML=atlasIcons.clear;clear.title='Снять выделение';clear.setAttribute('aria-label','Снять выделение');clear.onclick=atlasClearHighlight;bar.append(clear);atlasSyncContext();
}
function atlasShowProperties(){
 closePanels();const context=effectiveContext();
 if(context.kind==='element'&&keyMap.has(context.key))elementCard(keyMap.get(context.key));
 else if(context.kind==='node'&&H.nodes[context.nodeId]){const i=keyMap.get(H.nodes[context.nodeId].model_key);if(i!=null)elementCard(i);else nodeCard(context.nodeId);}
 else $('properties').innerHTML='<h2>'+esc(S.page?.name||'Текущий вид')+'</h2>'+field('Объектов',S.visible.length);
 showProps();atlasSyncContext();
}
function atlasLayoutPanels(){
 const area=$('modelArea'),box=area.getBoundingClientRect(),caption=document.querySelector('.scene-caption').getBoundingClientRect(),panel=$('propertyPanel'),props=panel.hidden?null:panel.getBoundingClientRect();
 const values={'--pgs-caption-offset':Math.max(8,box.bottom-caption.top+8)+'px','--pgs-props-reserved':(props?Math.max(0,box.bottom-props.top+8):0)+'px'};
 for(const [key,value]of Object.entries(values))if(area.style.getPropertyValue(key)!==value)area.style.setProperty(key,value);
 atlasPlaceZoom();
}
async function atlasDocuments(query='',owner=S.module){
 const {sources:ss}=await sources();dialog('Документы альбома','<input class="pgs-doc-search" aria-label="Поиск документов" placeholder="Название или номер листа"><div id="pgs-doc-results"></div>');
 const input=$('dialogBody').querySelector('input'),list=$('pgs-doc-results');input.value=query;
 const scopes={stair:['documents/L1_sheets47_69.pdf','documents/Stair_Nodes_R04.pdf','documents/L1_nodes_extract.pdf'],roof:['documents/AR_roof_last.pdf','documents/AS2_roof_selection.pdf']};const preferred=new Set(scopes[owner]||['documents/R05_source_extract.pdf','documents/AS2_last_full.pdf']);
 const paint=()=>{const q=input.value.trim().toLocaleLowerCase('ru');list.replaceChildren();const docs=PUB.publicDocuments.filter(d=>!q||d.name.toLocaleLowerCase('ru').includes(q)).sort((a,b)=>Number(preferred.has(b.file))-Number(preferred.has(a.file)));
  for(const d of docs){const a=document.createElement('a');a.className='source-link';a.href=d.file;a.setAttribute('download',d.file.split('/').at(-1));a.textContent='Скачать · '+d.name;list.append(a);}
  const sheets=Object.entries(ss).filter(([key,s])=>s.file&&s.method!=='navigation_evidence'&&!/^(NAV_|R05I_)/.test(key)&&(!q||(friendlySource(s)+' '+s.printed_sheet).toLocaleLowerCase('ru').includes(q))).slice(0,60);
  for(const[key,s]of sheets){const a=document.createElement('a');a.className='source-link';a.href='drawing.html?source='+encodeURIComponent(key);a.target='_blank';a.rel='noopener noreferrer';a.textContent=friendlySource(s);a.onclick=event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();openDrawingSheet(s.file,friendlySource(s),'Документ альбома',a);};list.append(a);}if(!list.children.length)list.textContent='Документы не найдены';};input.oninput=paint;paint();input.focus();
}
function atlasInstallNavigation(){
 const label=(id,icon,text)=>{const b=$(id);b.innerHTML=atlasIcons[icon]+(text?'<span>'+esc(text)+'</span>':'');b.classList.add('pgs-label-button');b.title=text||b.getAttribute('aria-label')||'';};
 const button=(id,icon,text,action)=>{const b=document.createElement('button');b.id=id;b.type='button';b.setAttribute('aria-label',text);b.title=text;b.innerHTML=atlasIcons[icon]+'<span>'+esc(text)+'</span>';b.className='pgs-label-button';b.onclick=action;return b;};
 const toolbar=document.querySelector('.toolbar');label('navToggle','menu','Состав');label('drawing','albums','Чертёж');label('moreToggle','more','');$('moreToggle').setAttribute('aria-label','Инструменты осмотра');$('moreToggle').title='Инструменты осмотра';
 const camera=button('pgs-camera','camera','Ракурс',()=>{const open=$('pgs-camera-menu').hidden;closePanels();$('pgs-camera-menu').hidden=!open;camera.setAttribute('aria-expanded',String(open));});camera.setAttribute('aria-expanded','false');camera.setAttribute('aria-controls','pgs-camera-menu');toolbar.querySelector('.toolside').append(camera);
 const cameras=document.createElement('div');cameras.id='pgs-camera-menu';cameras.hidden=true;for(const b of [...toolbar.querySelectorAll('.camera-tools button')])cameras.append(b);$('modelArea').append(cameras);
 const secondary=document.createElement('div');secondary.id='pgs-view-tools';for(const b of [...toolbar.querySelectorAll('.view-tools button')])secondary.append(b);$('morePanel').querySelector('h3').after(secondary);
 $('drawing').after(button('pgs-properties','info','Свойства',()=>UI.props?closeProps():atlasShowProperties()));
 document.querySelector('.top-actions').prepend(button('pgs-albums','albums','Альбомы',atlasAlbumMenu));
 const album=button('pgs-album-open','albums','Всё здание',atlasAlbumMenu);document.querySelector('.section-head').prepend(album);
 const path=document.createElement('div');path.id='pgs-path';$('breadcrumb').after(path);
 $('contents').textContent='Альбомы';$('contents').onclick=atlasAlbumMenu;
 $('home').onclick=()=>atlasOpenAlbum('building',{fresh:true});$('inBuilding').onclick=()=>atlasOpenAlbum('building',{fresh:true});$('showPage').onclick=()=>atlasOpenAlbum(atlasAlbum,{fresh:true});$('showPage').textContent='Весь альбом';
 $('documents').onclick=()=>atlasDocuments();$('documentsMobile').onclick=()=>atlasDocuments();
 $('sectionSelect').onchange=()=>atlasOpenAlbum($('sectionSelect').value);
 document.addEventListener('pointerdown',event=>{if(!$('pgs-camera-menu').hidden&&!$('pgs-camera-menu').contains(event.target)&&!camera.contains(event.target)){$('pgs-camera-menu').hidden=true;camera.setAttribute('aria-expanded','false');}});
 new MutationObserver(()=>{atlasSyncContext();atlasPlaceZoom();}).observe($('propertyPanel'),{attributes:true,attributeFilter:['hidden']});atlasZoomLayout.observe($('propertyPanel'));
 const panelsLayout=new ResizeObserver(atlasLayoutPanels);for(const target of [$('propertyPanel'),$('modelArea'),document.querySelector('.scene-caption')])panelsLayout.observe(target);
}
atlasInstallNavigation();
`;

export const atlasDrawingContextFlow = String.raw`
async function showDrawing(){
 reconcileVisibility('drawing',{invalidate:false});const session=++drawingSession,nav=navigationSerial;
 await prepareHierarchy();if(session!==drawingSession||nav!==navigationSerial)return false;
 beforeDrawing=snapshot();drawingFocus=document.activeElement;
 const context=structuredClone(effectiveContext()),page={...structuredClone(S.page),isType:!!pageMeta(S.page)?.isType},nid=context.kind==='element'?H.byKey[context.key]:context.nodeId;
 const title=context.kind==='view'?page?.name:H.nodes[nid]?.label;
 closePanels();$('drawingPanel').hidden=false;$('drawingContext').textContent=title||'Текущий вид';$('backModel').focus();$('drawingTitle').textContent='';$('drawingInfo').textContent='';$('drawingResource').replaceChildren();$('drawingList').textContent='Открываем документы…';
 const {sources:ss,extras}=await sources();if(session!==drawingSession||nav!==navigationSerial)return false;
 const owner=context.kind==='element'?rows[keyMap.get(context.key)]?.module:S.module;
 const prepared=owner&&modules.has(owner)?await pages(owner):[];if(session!==drawingSession||nav!==navigationSerial)return false;
 const links=S.visible.length?atlasLogic.drawing({context,page,h:H,rows,registry:ss,extras,confirmed:atlasExactLinks,prepared:prepared.filter(p=>PUB.pages[p.key]?.public)}):[];
 const list=$('drawingList');list.innerHTML='<input class="pgs-drawing-search" aria-label="Найти связанный чертёж" placeholder="Найти лист"><div id="pgs-source-results"></div><button class="pgs-documents-search">Все документы и поиск</button>';
 list.querySelector('.pgs-documents-search').onclick=()=>atlasDocuments('',owner);
 const results=$('pgs-source-results'),search=list.querySelector('input');
 const paint=()=>{results.replaceChildren();for(const l of links.filter(l=>(friendlySource(ss[l.key])+' '+l.via).toLocaleLowerCase('ru').includes(search.value.toLocaleLowerCase('ru')))){
  const b=document.createElement('button');b.className='source-link';b.dataset.source=l.key;b.innerHTML=esc(friendlySource(ss[l.key]))+'<span class="pgs-source-role">'+esc(l.role)+'</span>';b.title=l.via||'';b.onclick=()=>{for(const a of results.querySelectorAll('button'))a.setAttribute('aria-current',String(a===b));openSource(l.key,l.role,session);};results.append(b);
 }};search.oninput=paint;paint();
 if(links.length){results.querySelector('button')?.setAttribute('aria-current','true');await openSource(links[0].key,links[0].role,session);}else{
  $('drawingTitle').textContent='Документы раздела';$('drawingInfo').textContent='Точный лист не привязан';$('drawingResource').innerHTML='<button id="pgs-find-docs">Найти в документах</button>';$('pgs-find-docs').onclick=()=>atlasDocuments('',owner);
 }
 return session===drawingSession;
}
`;

export function adaptProjectAtlasNavigation(source: string) {
  let result = source;
  result = once(result, "async function openNode(id,opts={}){", "async function atlasLoadNode(id,opts={}){");
  result = once(result, "async function restore(s,opts={}){", "async function atlasRestore(s,opts={}){");
  result = once(result, "async function openSavedPage(mod,id,options={}){", "async function atlasLoadSavedPage(mod,id,options={}){");
  result = once(result, "const token=++generation,visibilityAtStart=visibilityRevision;", "atlasAlbum=atlasLogic.owner(H,id,opts.atlasAlbum||atlasAlbum);const token=++generation,visibilityAtStart=visibilityRevision;");
  result = once(result, "S.module=mod;S.page=p;S.opened=", "atlasAlbum=options.atlasAlbum||(['master','facade'].includes(mod)?'building':atlasLogic.albums.find(a=>a.roots.includes('section:'+mod))?.id||'building');S.module=mod;S.page=p;S.opened=");
  result = once(result, "window.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if(!$('drawingPanel').hidden){ev.preventDefault();backDrawing();}else if($('dialog').open){$('dialog').close();}else if(!$('morePanel').hidden||!$('clipPanel').hidden){closePanels();$('moreToggle').focus();}else if(UI.props){closeProps();}else if(narrow()&&UI.navOpen){setNav(false);$('navToggle').focus();}}});", "// Escape is arbitrated by the integration before any outer close message.");
  result = once(result, "workerBytes:activeBlocks.reduce((n,id)=>n+blockMap.get(id).geometry_bytes,0)", "workerBytes:Number(canvas.dataset.geometry?JSON.parse(canvas.dataset.geometry).bytes:0),decodedBlockBytes:activeBlocks.reduce((n,id)=>n+blockMap.get(id).geometry_bytes,0)");
  result = once(result, "workerReady=false;if(worker){worker.terminate();worker=null;}", "workerReady=false;delete canvas.dataset.geometry;if(worker){worker.terminate();worker=null;}");
  result = once(result, "const sel=S.selection!=null?keyMap.get(S.selection):-1;", "const sel=atlasHighlight!=null?keyMap.get(atlasHighlight):-1;");
  result = once(result, "selectedIndices:S.selection?[]:(currentTreeId()&&currentTreeId()!=='building'?S.cardIds:[])", "selectedIndices:[]");
  result = once(result, "const i=pick[y*canvas.width+x];if(i>=0&&S.visible.includes(i))select(i,false);", "const i=pick[y*canvas.width+x];if(i>=0&&S.visible.includes(i))select(i,false);else if(i<0)atlasClearHighlight();");
  result = once(result, "new ResizeObserver(()=>{atlasGestures.cancel();render();}).observe($('stage'));", "let atlasStageSize=$('stage').getBoundingClientRect();new ResizeObserver(()=>{const next=$('stage').getBoundingClientRect(),factor=Math.min(next.width,next.height)/Math.max(1,Math.min(atlasStageSize.width,atlasStageSize.height));if(S.page&&Number.isFinite(factor)){S.camera.scale*=factor;S.camera.pan=S.camera.pan.map(n=>n*factor);}atlasStageSize=next;atlasGestures.cancel();render();}).observe($('stage'));");
  result = section(result, "function atlasPlaceZoom(){", "const atlasZoomLayout=", String.raw`function atlasPlaceZoom(){const stage=$('stage').getBoundingClientRect(),caption=document.querySelector('.scene-caption')?.getBoundingClientRect(),panel=$('propertyPanel'),props=panel&&!panel.hidden?panel.getBoundingClientRect():null;let bottom=Math.max(14,caption?stage.bottom-caption.top+10:14),right=10;if(props){if(props.width>stage.width*.7)bottom=Math.max(bottom,stage.bottom-props.top+10);else right=stage.right-props.left+10;}atlasZoom.style.bottom=bottom+'px';atlasZoom.style.right=right+'px';}`);
  result = once(result, "if(id==='building'||visibilityAtStart!==visibilityRevision)pageCard();else if(n.self.length===1&&!n.children.length)select(n.self[0],false,{navToken});else nodeCard(id);", "atlasHighlight=null;pageCard();");
  result = once(result, "S.selection=rows[i].key;S.context={kind:'element',key:S.selection};", "S.selection=rows[i].key;atlasHighlight=S.selection;S.context={kind:'element',key:S.selection};");
  // Card generation does not open the panel. The explicit Properties action owns visibility.
  result = result.replaceAll("$('properties').innerHTML=html;showProps();", "$('properties').innerHTML=html;atlasSyncContext();");
  result = once(result, "function pageCard(){", "function pageCard(){atlasHighlight=null;");
  result = once(result, "function closeProps(focus=true){", "function closeProps(focus=true){atlasHighlight=null;render();");
  result = once(result, "function closePanels(){", "function closePanels(){$('pgs-camera-menu')?.setAttribute('hidden','');$('pgs-camera')?.setAttribute('aria-expanded','false');");
  result = once(result, "return h;});return hierarchyPromise;", "atlasPrepareAlbums(h);return h;});return hierarchyPromise;");
  result = once(result, "function treeIndices(id,includeTypes=false){", "function treeIndices(id,includeTypes=false){if(id.startsWith('album:'))return H?.nodes[id]?.albumIndices?.slice()||[];");
  result = section(result, "function flatTree(){", "function treeFocus(", String.raw`function flatTree(){const out=[];if(!H)return out;const children=id=>id==='building'?atlasLogic.albums.filter(a=>a.id!=='building').map(a=>'album:'+a.id):H.nodes[id]?.children||[];const root=atlasAlbum==='building'?'building':'album:'+atlasAlbum;
if(narrow()){const selected=currentTreeId(),path=atlasScopedPath(selected),current=path.length?(children(selected).length?selected:path.at(-2)?.id||root):root;return [{id:current,depth:0},...children(current).map(id=>({id,depth:0}))];}
function walk(id,depth,seen=new Set()){const n=H.nodes[id];if(!n||seen.has(id))return;const path=new Set(seen);path.add(id);out.push({id,depth});if(UI.treeExpanded?.[id])for(const c of children(id))walk(c,depth+1,path);}walk(root,0);return out;}`);
  result = once(result, "function toggleTree(id){", "function toggleTree(id){if(narrow())return openNode(id,{keepMenu:true});");
  result = once(result, "const parent=H?.nodes[id]?.parent;", "const parent=atlasParent(id)?.id;");
  result = once(result, "const p=H.nodes[n.parent];if(p){", "const p=atlasParent(id);if(p){");
  result = once(result, "pb.onclick=()=>openNode(H.nodes[nid].parent)", "pb.onclick=()=>atlasParent(nid)?openNode(atlasParent(nid).id):atlasAlbumMenu()");
  result = result.replaceAll("p=H.nodes[n?.parent]", "p=atlasParent(n?.id)");
  result = once(result, "const sib=n.parent?H.nodes[n.parent].children:[]", "const sib=atlasParent(n.id)?.children||[]");
  result = once(result, "const path=nodePath(n.id);$('breadcrumb')", "const path=atlasScopedPath(n.id);$('breadcrumb')");
  result = once(result, "for(const n of nodePath(id).slice(0,-1))UI.treeExpanded[n.id]=true;", "for(const n of nodePath(id).slice(0,-1))UI.treeExpanded[n.id]=true;for(const a of atlasLogic.albums)if(a.roots.some(root=>nodePath(id).some(n=>n.id===root)))UI.treeExpanded['album:'+a.id]=true;");
  result = once(result, "UI.treeSelected=id;const ownSection=nodePath(id).find(x=>x.kind==='section')?.id?.split(':')[1]||'master';", "UI.treeSelected=id;const ownSection=(id.startsWith('album:')?atlasLogic.albums.find(a=>a.id===id.slice(6))?.roots[0]?.split(':')[1]:nodePath(id).find(x=>x.kind==='section')?.id?.split(':')[1])||'master';");
  result = once(result, "function hierarchyBar(){const n=hnode();", "function hierarchyBar(){atlasPath();const n=hnode();");
  result = once(result, "b.onclick=()=>openNode(id,{focus:true});", "b.onclick=()=>id.startsWith('album:')?atlasOpenAlbum(id.slice(6)):openNode(id,{focus:true});");
  result = once(result, "function updatePageBar(){syncUpButton();", "function updatePageBar(){atlasPath();syncUpButton();");
  result = once(result, "function snapshot(){return{...structuredClone(S),", "function snapshot(){return{...structuredClone(S),atlasAlbum,");
  result = once(result, "UI={...UI,...structuredClone(s.ui||{}),...panels};S=structuredClone(s);", "atlasAlbum=opts.atlasAlbum||s.atlasAlbum||'building';atlasHighlight=null;UI={...UI,...structuredClone(s.ui||{}),...panels};S=structuredClone(s);");
  result = section(result, "async function showDrawing(){", "function drawSearch(){", atlasDrawingContextFlow);
  result = once(result, "$('drawingInfo').textContent=sourceMode(mode)+' · Лист '+(s.printed_sheet??'не указан')+(s.pdf_page?' · Страница PDF '+s.pdf_page:' · Точная страница PDF не установлена');", "$('drawingInfo').textContent=sourceMode(mode);const sourceMeta=document.createElement('details'),sourceSummary=document.createElement('summary'),sourceText=document.createElement('p');sourceMeta.className='pgs-source-meta';sourceSummary.textContent='Об источнике';sourceText.textContent='Лист '+(s.printed_sheet??'не указан')+(s.pdf_page?' · Страница PDF '+s.pdf_page:' · Точная страница PDF не установлена');sourceMeta.append(sourceSummary,sourceText);");
  result = once(result, "actions.append(zoom);body.append(actions,viewport);", "actions.append(zoom);body.append(actions,viewport,sourceMeta);");
  result = once(result, "}else note('Показан исходный чертёж. Точная страница полного PDF не подтверждена.');", "}else sourceText.textContent+=' · Показан исходный чертёж; точная страница полного PDF не подтверждена.';");
  result = once(result, "function friendlySource(s){return safeText(s?.title||'Чертёж')", "function friendlySource(s){return safeText((!s?.pdf_page?s?.title?.replace(/S08\\s*\\/\\s*PDF\\s*49/,'МУ55 · исходный лист').replace(/S08\\s*·\\s*/,'').replace(/\\s*·\\s*PDF\\s*\\d+/g,''):s?.title)||'Чертёж')");
  result = once(result, "querySelectorAll('button,a[href],iframe')", "querySelectorAll('button,a[href],iframe,input')");
  result = once(result, "function route(){const n=", "function route(){const album=location.hash.match(/^#album\\/([^/]+)(?:\\/(.+))?$/);if(album)return atlasOpenAlbum(decodeURIComponent(album[1]),{fresh:true,node:album[2]?decodeURIComponent(album[2]):undefined});const n=");
  result = once(result, "if(!opts.noHash)history.replaceState(null,'','#node/'+encodeURIComponent(id));", "if(!opts.noHash)history.replaceState(null,'',atlasAlbum==='building'?'#node/'+encodeURIComponent(id):'#album/'+encodeURIComponent(atlasAlbum)+'/'+encodeURIComponent(id));");
  result = once(result, "istree?'#node/'+encodeURIComponent(s.pageKey.slice(6)):'#page/'", "istree?(atlasAlbum==='building'?'#node/':'#album/'+encodeURIComponent(atlasAlbum)+'/')+encodeURIComponent(s.pageKey.slice(6)):'#page/'");
  result = section(result, "function trimCache(needed){", "function bnds(", "function trimCache(needed){const result=atlasLogic.prune(blockCache,needed);canvas.dataset.cache=JSON.stringify(result);}");
  const geometryStart = "activeBlocks=need;trimCache(need);fullRecords=new Map();";
  const geometryEnd = "const url=URL.createObjectURL(new Blob([window.ALBUM_WORKER_SOURCE]";
  result = section(result, geometryStart, geometryEnd, "activeBlocks=need;trimCache(need);fullRecords=new Map();const wanted=new Set(ids);for(const b of bs)for(const e of b.records)if(wanted.has(e.global_index))fullRecords.set(e.global_index,e);const compact=atlasLogic.geometry(bs,ids,rows),{buffer,info,meta}=compact,nv=compact.vertices,nf=compact.faces;canvas.dataset.geometry=JSON.stringify({objects:ids.length,blocks:need.length,vertices:nv,triangles:nf,bytes:buffer.byteLength});");
  result = once(result, "syncPanelState();window.ALBUM_READY=true;", atlasNavigationRuntime + "\nsyncPanelState();window.ALBUM_READY=true;");
  return result;
}

// Selection changes only visible boundary pixels, never object materials, depth or owner IDs.
export function adaptProjectAtlasSelectionWorker(source: string) {
  let result = once(source, "(highlighted&&!selectedSet.has(owner[at]))||z>=depth[at]-1e-6", "z>=depth[at]-1e-6");
  result = once(result, "const highlighted=selectedSet.has(id);", "");
  result = once(result, "if(selectedSet.size){list=list.filter(i=>!selectedSet.has(i)).concat(list.filter(i=>selectedSet.has(i)));}", "");
  result = once(result, "let color=selectedSet.has(id)?[36,145,155]:meta[id].rgb,alpha=selectedSet.has(id)?1:opacity;", "let color=meta[id].rgb,alpha=opacity;");
  result = once(result, "pixels[p]=122;pixels[p+1]=63;pixels[p+2]=10;", "pixels[p]=24;pixels[p+1]=105;pixels[p+2]=119;");
  return result;
}

export function adaptProjectAtlasSelectionBundle(bundle: string) {
  const match = /^window\.ALBUM_WORKER_SOURCE\s*=\s*("[\s\S]*");?\s*$/.exec(bundle);
  if (!match) throw new Error("Atlas selection worker bundle mismatch");
  return "window.ALBUM_WORKER_SOURCE=" + JSON.stringify(adaptProjectAtlasSelectionWorker(JSON.parse(match[1]))) + ";\n";
}
