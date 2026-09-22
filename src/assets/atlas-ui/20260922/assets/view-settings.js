/* R23 UI preferences are visual only. No project approval/geometry writes. */
'use strict';
window.AtlasViewSettings=(()=>{
 const $=id=>document.getElementById(id),storageKey='ATLAS_PROTOTYPE_VIEW_20260922';
 const defaults={quality:'auto',axes:true,xyz:true,grid:false,labels:'selected',bounds:false,hud:true,opacity:100,transparent:false,pickThrough:false,background:'light',lighting:'studio',mode:'solid',adaptive:true,blur:true,cardOpacity:83,showRebar:true,showFacade:true,showConcrete:true};
 const enums={quality:['auto','precise','fast','ultra'],labels:['off','selected','scene'],background:['light','white','dark'],lighting:['studio','flat'],mode:['solid','technical','outline']};
 function validate(raw){const s={...defaults};if(!raw||typeof raw!=='object')return s;for(const k of Object.keys(s)){if(enums[k]){if(enums[k].includes(raw[k]))s[k]=raw[k];}else if(typeof s[k]==='boolean'){if(typeof raw[k]==='boolean')s[k]=raw[k];}else if(Number.isFinite(raw[k]))s[k]=Math.max(k==='cardOpacity'?65:5,Math.min(100,raw[k]));}return s;}
 // R24.1: per-object display overrides live in the view, never in project records.
 const transparentObjects=new Set();
 let state;try{state=validate(JSON.parse(localStorage.getItem(storageKey)));}catch{state={...defaults};}
 const classes=new WeakMap();let api=null,toastTimer=0,searchTimer=0,diagTime=0,bookmark=null;
 function classify(o){let c=classes.get(o);if(c)return c;const t=[o.kind,o.albumRecord?.category,(o._classificationProperties||o.originalProperties)?.material,(o._classificationProperties||o.originalProperties)?.category,o.name].filter(Boolean).join(' ').toLowerCase();
  c=/rebar|reinforc|hoops|стерж|арматур|хомут/.test(t)?'rebar':(o.albumRecord?.module==='facade'||/facade/.test(t))?'facade':/concrete|бетон|panel|панел|shell|grout|подлив|slab|плита/.test(t)?'concrete':'other';classes.set(o,c);return c;}
 function visible(o){const c=classify(o);return !(c==='rebar'&&!state.showRebar||c==='facade'&&!state.showFacade||c==='concrete'&&!state.showConcrete);}
 function alpha(o,base,selected){if(transparentObjects.has(o.renderId))return Math.min(selected?1:base,.22)*state.opacity/100;if(selected)return 1;let a=base;if(o.soft||o.role==='panel_option')a=state.transparent?Math.min(a,.22):1;else if(classify(o)==='concrete'&&state.transparent)a=Math.min(a,.22);return a*state.opacity/100;}
 function resolution(w,h,dpr,moving,backend,maxDimension=8192){const mobile=matchMedia('(max-width:850px)').matches;let ratio=state.quality==='ultra'?Math.min(3,Math.max(2,dpr*1.25)):Math.min(dpr,state.quality==='fast'?1:state.quality==='precise'?2:1.5);if(moving&&state.adaptive)ratio=Math.min(ratio,mobile?.85:1);const budget=(mobile?3:6)*1e6;ratio=Math.min(ratio,Math.sqrt(budget/Math.max(1,w*h)),maxDimension/Math.max(w,h));return {width:Math.max(1,Math.floor(w*ratio)),height:Math.max(1,Math.floor(h*ratio)),ratio,budget};}
 function persist(){try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}}
 function appearance(){document.body.classList.toggle('r23-no-blur',!state.blur);document.body.classList.toggle('r23-no-hud',!state.hud);document.body.classList.toggle('r23-background-dark',state.background==='dark');document.documentElement.style.setProperty('--r23-card',`rgba(${state.background==='dark'?'32,42,55':'255,255,255'},${state.cardOpacity/100})`);$('axisCanvas').hidden=!state.xyz;}
 function toast(text){$('r23Toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('r23Toast').textContent='',3800);}
 function add(tag,attrs={},text){const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;return e;}
 function section(title,parent){const d=add('details');d.append(add('summary',{},title));parent.append(d);return d;}
 function checkbox(key,label,parent){const l=add('label'),i=add('input',{type:'checkbox',id:'r23_'+key});i.checked=state[key];l.append(i,document.createTextNode(label));parent.append(l);i.onchange=()=>change(key,i.checked);return i;}
 function select(key,label,options,parent){const l=add('label',{},label),s=add('select',{id:'r23_'+key});for(const [v,t]of options)s.append(new Option(t,v));s.value=state[key];l.append(s);parent.append(l);s.onchange=()=>change(key,s.value);return s;}
 function slider(key,label,min,max,parent){const l=add('label',{},label),i=add('input',{id:'r23_'+key,type:'range',min,max,step:1}),o=add('output',{for:i.id,id:i.id+'_out'});i.value=state[key];o.textContent=i.value+'%';l.append(i,o);parent.append(l);i.oninput=()=>{o.textContent=i.value+'%';change(key,+i.value);};}
 function button(id,text,parent,fn){const b=add('button',{id,type:'button'},text);parent.append(b);if(fn)b.onclick=fn;return b;}
 function change(key,value){state=validate({...state,[key]:value});appearance();persist();syncControls();api?.change(key);sync();}
 function replaceTransparency(ids){transparentObjects.clear();for(const id of ids)if(typeof id==='string'&&id)transparentObjects.add(id);api?.request();sync();}
 function toggleTransparency(id){if(typeof id!=='string'||!id)return false;const enabled=!transparentObjects.has(id);if(enabled)transparentObjects.add(id);else transparentObjects.delete(id);api?.request();sync();return enabled;}
 let quickSignature='';
 function quickSync(){
  const currentId=api?.selectedId?.()||'',signature=[currentId,state.axes,state.labels,transparentObjects.size,transparentObjects.has(currentId)].join('|');
  if(signature===quickSignature)return;quickSignature=signature;
  $('quickAxes').setAttribute('aria-pressed',String(state.axes));
  $('quickLabels').setAttribute('aria-pressed',String(state.labels==='scene'));
  $('quickLabels').title=state.labels==='scene'?'Выключить обозначения элементов':'Показать названия элементов из карточек (до 24 без наложений)';
  const id=api?.selectedId?.(),selected=!!id,on=selected&&transparentObjects.has(id),b=$('objectTransparency');
  b.disabled=!selected;b.setAttribute('aria-pressed',String(!!on));b.title=!selected?'Сначала выберите элемент':on?'Вернуть обычную непрозрачность выбранного элемента':'Сделать только выбранный элемент прозрачным (22% непрозрачности)';
  $('clearObjectTransparency').disabled=transparentObjects.size===0;
  $('objectTransparencyCount').textContent=transparentObjects.size?'Прозрачных элементов: '+transparentObjects.size+'. Остальные элементы не изменяются.':'Прозрачность отдельного элемента включается в его карточке.';
 }
 function exportHQ(){
  // A command, not a quality preset: restore immediately and retain the user gesture.
  $('quality').value=state.quality;
  if(!api){toast('Дождитесь загрузки модели');return;}
  if(!panel.hidden){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}
  api.saveHiRes();
 }

 function move(id,parent,label){const e=$(id);if(!e)return;if(label){const l=add('label',{},label);l.append(e);parent.append(l);}else parent.append(e);}
 const stage=document.querySelector('.stage'),tools=document.querySelector('.tools'),panel=add('section',{id:'viewSettings',hidden:'',role:'dialog','aria-label':'Настройки вида и поиск'});stage.append(panel);
 const group=add('div',{class:'r23-quality-group'});$('quality').after(group);group.append($('quality'));$('quality').append(new Option('Ультра','ultra'));$('quality').value=state.quality;
 const toggle=button('viewSettingsToggle','Вид ▾',group,()=>open(panel.hidden));toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','viewSettings');toggle.setAttribute('aria-haspopup','dialog');
 const quickAxes=button('quickAxes','Оси',group,()=>change('axes',!state.axes));quickAxes.title='Оси привязки здания: 1–9 и А–К';quickAxes.setAttribute('aria-controls','r23Overlay');quickAxes.setAttribute('aria-pressed',String(state.axes));
 const quickLabels=button('quickLabels','Обозначения',group,()=>change('labels',state.labels==='scene'?'off':'scene'));quickLabels.setAttribute('aria-controls','r23Overlay');quickLabels.setAttribute('aria-pressed',String(state.labels==='scene'));
 const exportGroup=add('optgroup',{label:'Сохранить изображение'}),hqOption=new Option('PNG · HQ — до 4K','export-hq');hqOption.id='qualityExportHQ';exportGroup.append(hqOption);$('quality').append(exportGroup);$('quality').setAttribute('aria-label','Качество графики и снимок PNG HQ');$('quality').title='Быстро, Авто, Точно, Ультра; ниже — PNG · HQ — до 4K';
 const head=add('div',{class:'r23-menu-head'});head.append(add('b',{},'Вид и инструменты'));button('closeViewSettings','×',head,()=>open(false));panel.append(head);
 panel.append(add('h3',{},'Поиск'));move('search',panel);$('search').placeholder='ID, марка или название';
 const loc=add('label',{},'Область поиска'),searchScope=add('select',{id:'r23SearchScope'});searchScope.append(new Option('Текущий раздел','current'),new Option('Действующее здание','building'));loc.append(searchScope);panel.append(loc,add('div',{id:'r23SearchCount','aria-live':'polite'}),add('div',{id:'viewSearchResults'}));
 panel.append(add('p',{class:'r23-note'},'Ctrl/⌘ K — поиск. Выбор результата открывает его карточку.'));
 const graphics=section('Графика и чёткость',panel);graphics.open=true;
 select('mode','Отображение',[['solid','Поверхности'],['technical','Поверхности + контуры'],['outline','Только контуры']],graphics);
 move('edges',graphics,'Контуры рёбер');
 select('lighting','Освещение',[['studio','Объёмное'],['flat','Без затенения']],graphics);
 select('background','Фон',[['light','Светлый'],['white','Белый'],['dark','Тёмный']],graphics);
 checkbox('adaptive','Облегчать отрисовку при движении',graphics);
 graphics.append(add('p',{class:'r23-note'},'Ультра: повышенное разрешение кадра, до 6 Мп на компьютере / 3 Мп на узком экране. Точность исходной геометрии не меняется.'));
 const visibility=section('Видимость и прозрачность',panel);
 move('transparent',visibility,'Прозрачные бетон / панели');$('transparent').checked=state.transparent;
 slider('opacity','Непрозрачность модели',5,100,visibility);checkbox('pickThrough','Выбирать сквозь прозрачные тела',visibility);
 checkbox('showRebar','Арматура и хомуты',visibility);checkbox('showFacade','Фасады',visibility);checkbox('showConcrete','Бетон и панели',visibility);
 visibility.append(add('p',{class:'r23-note'},'Группы определяются по исходным категориям / названиям. Это фильтр вида, не изменение состава здания.'));
 button('clearObjectTransparency','Убрать прозрачность отдельных элементов',visibility,()=>replaceTransparency([]));visibility.append(add('p',{id:'objectTransparencyCount',class:'r23-note'}));
 const actions=add('div',{class:'r23-grid'});visibility.append(actions);
 button('r23Hide','Скрыть деталь',actions,()=>$('hide').click());button('r23Isolate','Изолировать',actions,()=>$('isolate').click());move('restore',actions);button('r23UndoHide','Отменить скрытие',actions,()=>api?.undoHide());visibility.append(add('div',{id:'r23HiddenCount'}));
 const helper=section('Оси, подписи и размеры',panel);checkbox('axes','Оси здания · 1–9 / А–К',helper);checkbox('xyz','Индикатор направлений XYZ',helper);checkbox('grid','Координатная сетка XY',helper);
 select('labels','Подписи',[['off','Выключены'],['selected','Выбранная деталь'],['scene','До 24 элементов без наложений']],helper);checkbox('bounds','Габариты выбранной детали',helper);checkbox('hud','Информация о текущем виде',helper);
 helper.append(add('p',{class:'r23-note'},'Оси 1–9 / А–К: шаг 6 м, АР л.6; в координатах исходной модели, на отметке 0. Это проектные ориентиры, не геодезическая съёмка. В локальных каталогах оси здания скрыты. Сетка XY — отдельная координатная сетка. Размеры — габариты по XYZ, не изготовительные длины. Подписи не проверяют перекрытие поверхностями.'));
 const slice=section('Сечение модели',panel);move('sliceAxis',slice,'Плоскость');move('sliceValue',slice,'Положение');checkboxRaw('r23SliceFlip','Обратная сторона',slice,()=>api?.request());slice.append(add('div',{id:'r23SliceReadout',class:'r23-note'}));button('r23ResetSlice','Убрать сечение',slice,()=>{$('sliceAxis').value='none';$('r23SliceFlip').checked=false;api?.request();sync();});slice.append(add('p',{class:'r23-note'},'Визуальное отсечение без формирования торцевых поверхностей.'));
 const camera=section('Камера и сохранение вида',panel),views=add('div',{class:'r23-grid'});camera.append(views);for(const v of ['front','side']){const e=tools.querySelector('[data-view="'+v+'"]');if(e)views.append(e);}for(const [v,t]of [['back','Сзади'],['left','Слева'],['bottom','Снизу']])button('r23View_'+v,t,views,()=>api?.camera(v));move('focusSelected',views);
 const book=add('div',{class:'r23-grid'});camera.append(book);button('r23SaveView','Запомнить вид',book,()=>{bookmark=api?.capture();try{localStorage.setItem(storageKey+'_camera',JSON.stringify(bookmark));}catch{}toast('Вид сохранён в этом браузере');sync();});button('r23LoadView','Вернуть вид',book,()=>{if(bookmark){try{api?.restoreView(bookmark);toast('Вид восстановлен');}catch(e){toast('Не удалось восстановить: '+e.message);}}else toast('Сначала сохраните вид');});
 button('r23ExportView','Экспорт вида JSON',book,()=>download('Troitsk_B24_view.json',JSON.stringify(api?.capture(),null,2),'application/json'));
 const input=add('input',{type:'file',id:'r23ImportInput',accept:'.json',hidden:''});camera.append(input);button('r23ImportView','Импорт вида JSON',book,()=>input.click());input.onchange=async()=>{try{const f=input.files[0];if(!f)return;if(f.size>1e6)throw Error('Файл вида больше 1 МБ');await api.restoreView(JSON.parse(await f.text()));toast('Вид импортирован');}catch(e){toast('Не удалось импортировать: '+e.message);}input.value='';};
 move('saveImage',book);button('r24SaveHiRes','PNG · HQ — до 4K',book,exportHQ);camera.append(add('p',{class:'r23-note'},'Снимок: до 3840 × 2160 с сохранением пропорций; на узком экране — до 3 Мп. Интерактивное разрешение восстанавливается после экспорта.'));button('r23FullScreen','Полный экран',book,async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else toast('Полный экран недоступен в этом браузере');}catch{toast('Браузер не разрешил полный экран');}});
 const ui=section('Карточка и интерфейс',panel);checkbox('blur','Размытие фона карточки',ui);slider('cardOpacity','Непрозрачность карточки',65,100,ui);button('r23Reset','Сбросить настройки вида',ui,()=>{state={...defaults};transparentObjects.clear();syncControls();appearance();persist();api?.change('reset');sync();toast('Настройки вида сброшены');});
 const diagnostic=section('Диагностика',panel);diagnostic.id='r23DiagDetails';diagnostic.append(add('pre',{id:'r23Diagnostics'}));button('r23RetryWorker','Повторить подготовку в Worker',diagnostic,()=>api?.retry());button('r23ExportDiag','Сохранить диагностику',diagnostic,()=>download('Troitsk_B24_R24_diagnostics.json',JSON.stringify(api?.diagnostics(),null,2),'application/json'));
 const oldfilter=document.querySelector('.filterBox');const oldcontext=$('context');if(oldcontext)move('context',visibility,'Окружение проверочных разделов R20');
 // The remaining legacy variant controls stay in the left scope filter: engineering choices != graphics.
 for(const el of document.querySelectorAll('#left label'))if(!el.querySelector('input,select')&&/Прозрачные бетон и панели|Исходное окружение/.test(el.textContent))el.remove();const oldLabel=document.querySelector('.tools .inline');if(oldLabel&&!oldLabel.querySelector('input'))oldLabel.remove();
 stage.append(panel,add('canvas',{id:'r23Overlay','aria-hidden':'true'}),add('div',{id:'r23Toast',role:'status','aria-live':'polite'}));
 const card=$('right');card.classList.add('open');$('card').setAttribute('aria-expanded','true');$('card').setAttribute('aria-controls','right');$('card').setAttribute('aria-pressed','true');card.querySelector('[data-close]').textContent='×';card.querySelector('[data-close]').setAttribute('aria-label','Закрыть карточку');
 const trans=$('objectTransparency');trans.onclick=()=>{const id=api?.selectedId?.();if(!id)return;const on=toggleTransparency(id);toast(on?'Выбранный элемент: 22% непрозрачности. Остальные элементы не изменены.':'Обычная непрозрачность элемента восстановлена');};
 const quick=card.querySelector('.actions');$('selectedId').after(quick);quick.after($('drawing'));
 const links=card.querySelector('.links');if(links){const d=add('details',{class:'r23-archive-links'});d.append(add('summary',{},'Архивные инженерные документы'),links);card.append(d);}
 const stale=document.querySelector('#left > p.sub');if(stale)stale.textContent='R25 FINAL V8 · действующая модель Album-2. Типы, история и варианты R20 учитываются отдельно.';
 function checkboxRaw(id,text,parent,fn){const l=add('label'),i=add('input',{type:'checkbox',id});l.append(i,document.createTextNode(text));parent.append(l);i.onchange=fn;}
 function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=add('a',{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function layout(){const sr=stage.getBoundingClientRect(),tr=tools.getBoundingClientRect(),bt=toggle.getBoundingClientRect();document.documentElement.style.setProperty('--r23-tool-bottom',Math.ceil(tr.bottom-sr.top)+'px');panel.style.top=Math.ceil(tr.bottom-sr.top+7)+'px';panel.style.left=Math.max(8,Math.min(bt.right-sr.left-350,sr.width-Math.min(350,sr.width-16)-8))+'px';}
 function open(yes){panel.hidden=!yes;toggle.setAttribute('aria-expanded',String(yes));if(yes){layout();sync();$('closeViewSettings').focus();}else toggle.focus();}
 document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!group.contains(e.target)){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}},true);
 document.addEventListener('keydown',e=>{const typing=/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||e.target.isContentEditable;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'||e.key==='/'&&!typing){e.preventDefault();document.dispatchEvent(new Event('atlas:search'));return;}if(e.key==='Escape'&&!panel.hidden){e.preventDefault();e.stopImmediatePropagation();open(false);}},true);
 $('search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(search,90);});searchScope.onchange=search;
 function search(){if(!api)return;const q=$('search').value.trim(),host=$('viewSearchResults');host.replaceChildren();if(!q){$('r23SearchCount').textContent='';return;}const results=api.search(q,searchScope.value);$('r23SearchCount').textContent=results.length+' результатов'+(results.length>60?' · первые 60':'');for(const o of results.slice(0,60)){const b=button('',o.name,host,()=>{api.jump(o.renderId);card.classList.add('open');open(false);sync();});b.removeAttribute('id');b.className='r23-result';b.append(add('small',{},o.id));}}
 function syncControls(){for(const[k,v]of Object.entries(state)){const el=$(k==='quality'?'quality':k==='transparent'?'transparent':'r23_'+k);if(!el)continue;if(el.type==='checkbox')el.checked=v;else el.value=v;const out=$('r23_'+k+'_out');if(out)out.textContent=v+'%';}}
 function sync(){quickSync();if(!api)return;$('card').setAttribute('aria-expanded',String(card.classList.contains('open')));$('card').setAttribute('aria-pressed',String(card.classList.contains('open')));if(panel.hidden)return;const s=api.summary();$('r23HiddenCount').textContent='Скрыто вручную: '+s.hidden+' · отображается: '+s.visible;$('r23Isolate').textContent=s.isolated?'Вернуть окружение':'Изолировать';$('r23SliceReadout').textContent=s.slice;$('r23UndoHide').disabled=!s.canUndo;if(performance.now()-diagTime>400){diagTime=performance.now();$('r23Diagnostics').textContent=api.diagnosticText();}}
 new ResizeObserver(layout).observe(tools);new ResizeObserver(layout).observe(stage);appearance();
 return {transparentIds:()=>[...transparentObjects],hasTransparency:id=>transparentObjects.has(id),replaceTransparency,toggleTransparency,state:()=>state,defaults,validate,classify,visible,alpha,resolution,open,toast,sync,download,attach(a){api=a;$('r23RetryWorker').disabled=api.diagnostics().backend!=='WebGL';$('r23RetryWorker').title='Подготовка GPU-буферов: используется в WebGL-режиме';try{bookmark=JSON.parse(localStorage.getItem(storageKey+'_camera'));}catch{}syncControls();$('transparent').onchange=()=>change('transparent',$('transparent').checked);$('quality').onchange=()=>{const value=$('quality').value;if(value==='export-hq')exportHQ();else change('quality',value);};$('card').onclick=()=>{card.classList.toggle('open');if(innerWidth<=850)$('left').classList.remove('open');api.request();sync();};card.querySelector('[data-close]').onclick=()=>{card.classList.remove('open');$('card').focus();api.request();sync();};new MutationObserver(()=>{api.request();sync();}).observe(card,{attributes:true,attributeFilter:['class']});sync();},replace(raw){state=validate(raw);syncControls();appearance();persist();api?.change('preferences');},set(key,value){change(key,value);syncControls();},moving(yes){document.body.classList.toggle('r23-moving',yes);}};
})();
