import sourceLinks from "@/assets/project-models/troitsk-b24-atlas-3-2.source-links.json";
import drawingPages from "@/assets/project-models/troitsk-b24-atlas-3-2.drawings.json";

// Delivery-only fixes for the frozen Atlas 3.2. Never rewrite its source package.
export const atlasDrawingRenderer = String.raw`
const pgsDrawingPages=${JSON.stringify(Object.fromEntries(Object.entries(drawingPages.sources).filter(([, source]) => "pageFile" in source).map(([key, source]) => [key, "pageFile" in source ? source.pageFile : null])))};
function openDrawingSheet(file,title,detail,trigger){
 const originSession=drawingSession,originTicket=drawingTicket;
 const dialog=document.createElement('dialog');dialog.id='pgs-drawing-sheet';dialog.setAttribute('aria-label',title);
 const header=document.createElement('header'),heading=document.createElement('div'),name=document.createElement('strong'),caption=document.createElement('span');
 name.textContent=title;caption.textContent=detail;heading.append(name,caption);
 const controls=document.createElement('div');controls.className='pgs-sheet-controls';
 const button=(label,text,action)=>{const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.textContent=text;b.onclick=action;controls.append(b);return b;};
 const stage=document.createElement('div');stage.className='pgs-sheet-stage';stage.tabIndex=0;stage.setAttribute('aria-label','Чертёж');
 const image=document.createElement('img');image.alt=title;
 const status=document.createElement('span');status.className='pgs-sheet-status';status.textContent='Загрузка…';status.setAttribute('role','status');
 let scale=1,fitMode=true;
 const zoom=value=>{if(!image.naturalWidth)return;scale=Math.max(.05,Math.min(4,value));image.style.width=Math.round(image.naturalWidth*scale)+'px';status.textContent=Math.round(scale*100)+'%';};
 const fit=()=>{if(!image.naturalWidth||!image.naturalHeight)return;fitMode=true;zoom(Math.min(file.toLowerCase().endsWith('.svg')?4:1,(stage.clientWidth-32)/image.naturalWidth,(stage.clientHeight-32)/image.naturalHeight));stage.scrollLeft=0;stage.scrollTop=0;};
 button('Уменьшить','−',()=>{fitMode=false;zoom(scale/1.4);});controls.append(status);
 button('Увеличить','+',()=>{fitMode=false;zoom(scale*1.4);});button('Вписать лист','Вписать',fit);
 let restoreFocus=true;
 const close=()=>dialog.close();button('Закрыть лист','×',close);
 const navigated=()=>{restoreFocus=false;close();};
 const observer=new MutationObserver(()=>{if(drawingSession!==originSession||drawingTicket!==originTicket||$('drawingPanel').hidden)navigated();});
 const resize=()=>{if(fitMode)fit();};
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
 dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();close();});
 dialog.addEventListener('close',()=>{window.removeEventListener('resize',resize);window.removeEventListener('hashchange',navigated);observer.disconnect();dialog.remove();if(restoreFocus&&drawingSession===originSession&&drawingTicket===originTicket&&trigger.isConnected&&trigger.getClientRects().length)trigger.focus();},{once:true});
 image.onload=fit;image.onerror=()=>{status.textContent='Не удалось загрузить лист';};
 header.append(heading,controls);stage.append(image);dialog.append(header,stage);document.body.append(dialog);dialog.showModal();window.addEventListener('resize',resize);window.addEventListener('hashchange',navigated);observer.observe($('drawingPanel'),{attributes:true,attributeFilter:['hidden']});observer.observe($('drawingResource'),{childList:true});image.src=file;
}
async function openSource(key,mode='Источник элемента',session=drawingSession){
 const ticket=++drawingTicket,{sources:ss}=await sources();
 if(session!==drawingSession||ticket!==drawingTicket)return;
 const s=ss[key];if(!s)return;
 const title=friendlySource(s),body=$('drawingResource');
 $('drawingTitle').textContent=title;
 $('drawingInfo').textContent=sourceMode(mode)+' · Лист '+(s.printed_sheet??'не указан')+(s.pdf_page?' · Страница PDF '+s.pdf_page:' · Точная страница PDF не установлена');
 body.innerHTML='<p class="note">Открываем чертёж…</p>';
 const pk=await ensurePack(s.file);
 if(ticket!==drawingTicket||session!==drawingSession)return;
 body.replaceChildren();
 const note=text=>{const p=document.createElement('p');p.className='note warning';p.textContent=text;body.append(p);};
 if(!pk.ok){note(pk.message);return;}
 const actions=document.createElement('div');actions.className='pgs-drawing-actions';
 const link=(label,url,download=false)=>{
  const a=document.createElement('a');a.textContent=label;a.href=url;
  if(download)a.setAttribute('download','');else{a.target='_blank';a.rel='noopener noreferrer';}
  actions.append(a);return a;
 };
 const inPage=(anchor,file,detail)=>{anchor.onclick=event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();openDrawingSheet(file,title,detail,anchor);};};
 const view='drawing.html?source='+encodeURIComponent(key);
 inPage(link('Открыть чертёж',view),s.file,'Исходный чертёж · лист '+(s.printed_sheet??'не указан'));
 const viewport=document.createElement('div');viewport.className='pgs-drawing-viewport';
 const imageLink=document.createElement('a');imageLink.href=view;imageLink.target='_blank';imageLink.rel='noopener noreferrer';imageLink.title='Открыть чертёж';
 inPage(imageLink,s.file,'Исходный чертёж · лист '+(s.printed_sheet??'не указан'));
 const img=document.createElement('img');img.alt=title;img.src=s.file;
 img.onerror=()=>{if(ticket===drawingTicket&&session===drawingSession)note('Не удалось загрузить чертёж. Откройте исходный файл по ссылке выше или повторно выберите источник.');};
 imageLink.append(img);viewport.append(imageLink);
 const zoom=document.createElement('button');zoom.type='button';zoom.textContent='Крупно';zoom.setAttribute('aria-pressed','false');
 let enlarged=false;
 zoom.onclick=()=>{enlarged=!enlarged;img.style.width=enlarged?Math.max(img.naturalWidth,viewport.clientWidth*2)+'px':'';img.style.maxWidth=enlarged?'none':'';zoom.textContent=enlarged?'Вписать':'Крупно';zoom.setAttribute('aria-pressed',String(enlarged));if(!enlarged){viewport.scrollLeft=0;viewport.scrollTop=0;}};
 actions.append(zoom);body.append(actions,viewport);
 if(s.pdf&&Number.isSafeInteger(s.pdf_page)&&s.pdf_page>0){
  const pdf=await ensurePack(s.pdf);
  if(ticket!==drawingTicket||session!==drawingSession)return;
  if(pdf.ok){
   if(pgsDrawingPages[key])inPage(link('Открыть лист · PDF '+s.pdf_page,view+'&view=page'),pgsDrawingPages[key],'Страница PDF '+s.pdf_page+' · Лист '+(s.printed_sheet??'не указан'));
   link('Скачать полный PDF',s.pdf,true);
  }else note(pdf.message);
 }else note('Показан исходный чертёж. Точная страница полного PDF не подтверждена.');
}
`;

const records = Object.fromEntries(sourceLinks.groups.flatMap(group => group.ids.map(id => [id, group.sourceKeys])));
const nodes = Object.fromEntries(sourceLinks.groups.flatMap(group => [
  ...group.ids.map(id => ["entity:" + id, group.sourceKeys]),
  ...group.ownBodyNodes.map(id => [id, group.sourceKeys])
]));
// Exact allowlist only, never inferred by title, adjacent sheet, or ancestor.
export const atlasConfirmedDrawingLinks = String.raw`
 const confirmed=context.kind==='node'?${JSON.stringify({ ...nodes, "section:roof": ["R02_AR9"] })}[nid]:context.kind==='element'?${JSON.stringify(records)}[context.key]:null;
 if(!links.length&&Array.isArray(confirmed)&&confirmed.every(key=>ss[key])){
  links=confirmed.map(key=>({key}));mode=context.kind==='node'&&nid==='section:roof'?'Общий план кровли · не чертёж отдельной детали':'Подтверждённая ссылка из проектных данных';
 }
`;

export const atlasDrawingStyles = `
.pgs-drawing-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
.pgs-drawing-actions>a{display:inline-flex;align-items:center;min-height:44px;padding:10px 12px;background:var(--white);border:1px solid var(--line);border-radius:3px;font:inherit;line-height:1.25}
.pgs-drawing-actions>a:first-child{background:var(--accent);color:white;border-color:var(--accent)}
.pgs-drawing-viewport{max-width:100%;max-height:calc(100dvh - 290px);overflow:auto;overscroll-behavior:contain;background:white;border:1px solid var(--line)}
#drawingResource .pgs-drawing-viewport img{border:0;cursor:zoom-in}
.pgs-drawing-viewport>a{display:block;width:fit-content;max-width:100%}
#pgs-drawing-sheet{box-sizing:border-box;position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;border-radius:0;background:#f2f3f2;color:#242928;overflow:hidden}
#pgs-drawing-sheet[open]{display:grid;grid-template-rows:auto minmax(0,1fr)}
#pgs-drawing-sheet::backdrop{background:#20272599}
#pgs-drawing-sheet header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 16px;background:white;border-bottom:1px solid #d9dddb}
#pgs-drawing-sheet header>div:first-child{min-width:0;flex:1 1 220px}
#pgs-drawing-sheet strong,#pgs-drawing-sheet header span{display:block;overflow-wrap:anywhere}
#pgs-drawing-sheet strong{font-size:15px;font-weight:600;line-height:1.35}
#pgs-drawing-sheet header span{font-size:12px;line-height:1.4;color:#58625e}
#pgs-drawing-sheet .pgs-sheet-controls{display:flex;align-items:center;gap:6px}
#pgs-drawing-sheet button{min-width:44px;min-height:44px;padding:8px 12px;border:1px solid #d9dddb;border-radius:4px;background:white;color:#242928;font:inherit;cursor:pointer}
#pgs-drawing-sheet button:hover{background:#e8efed}
#pgs-drawing-sheet :focus-visible{outline:2px solid #14705c;outline-offset:2px}
#pgs-drawing-sheet .pgs-sheet-status{min-width:48px;text-align:center}
#pgs-drawing-sheet .pgs-sheet-stage{min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain;padding:16px;box-sizing:border-box;text-align:center}
#pgs-drawing-sheet .pgs-sheet-stage img{display:block;max-width:none;max-height:none;height:auto;margin:0 auto;background:white}
@media(max-width:520px){.pgs-drawing-actions{gap:6px}.pgs-drawing-actions>a,.pgs-drawing-actions>button{font-size:12px}.pgs-drawing-viewport{max-height:55dvh}}
`;

export function adaptProjectAtlasDrawings(source: string) {
  const begin = "async function openSource(";
  const end = "let drawingFocus=null;";
  const fallback = " if(!links.length&&context.kind!=='view'&&nid){";
  const start = source.indexOf(begin), finish = source.indexOf(end, start);
  if (start < 0 || finish < 0 || source.includes(atlasConfirmedDrawingLinks) || source.split(begin).length !== 2 || source.split(fallback).length !== 2) {
    throw new Error("Frozen Atlas drawing adapter does not match its source");
  }
  return (source.slice(0, start) + atlasDrawingRenderer + source.slice(finish)).replace(fallback, atlasConfirmedDrawingLinks + fallback);
}
