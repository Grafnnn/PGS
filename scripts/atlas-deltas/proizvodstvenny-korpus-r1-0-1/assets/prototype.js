/* 3D Атлас · слой интерфейса главной (V10). Движок, исходные данные и элементы управления сохранены;
   здесь только раскладка, понятные тексты и связи с общей шапкой (assets/atlas-shell.js). */
'use strict';
/* V12.1 · T0: заглушка window.AtlasNodes до загрузки assets/atlas-nodes.js (после atlas:ready); модуль дописывает этот же объект. Договор B2 ↔ B3 — спецификация V12.1 §3.5. */
(()=>{if(window.AtlasNodes)return;const st=()=>({k:null,mode:null,rebar:false,loading:false,count:{scene:0,rebar:0}});
 window.AtlasNodes={stub:true,ready:()=>false,whenReady:()=>new Promise(r=>document.addEventListener('atlas:nodes',()=>r(),{once:true})),list:()=>[],get:()=>null,of:()=>null,
  open:()=>Promise.resolve(st()),close:()=>Promise.resolve(st()),state:st,rebarInfo:()=>({available:false,count:0,reason:null,loading:true,scope:null}),rebar:()=>Promise.resolve(st()),roof:()=>Promise.resolve(st()),check:()=>null};})();
(()=>{
 const $=id=>document.getElementById(id), one=s=>document.querySelector(s);
 const S=window.AtlasShell,V=window.AtlasViewSettings;
 if(typeof V?.searchControls!=='function'){
  window.AtlasBoot?.retry();
  return;
 }
 S.mount();
 const whole=S.siteText('whole','Всё здание'),atSite=S.siteText('at_site','в здании'),inModel=S.siteText('in_model','в модели здания'),levels=S.siteFeature('levels');
 if(!levels&&$('levelNavigation'))$('levelNavigation').style.display='none';
 const R=S.release(), fmt=S.fmt;
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=text;return e;};
 // V12.0 · 0.10: значки — общий спрайт AtlasIcons (icons-sprite.js); старые имена Phosphor — через псевдонимы спрайта.
 const ICON_ALIAS={crosshair:'focus-element'};
 const icon=name=>{const I=window.AtlasIcons;return I?I.el(ICON_ALIAS[name]||name,null,'ui-icon'):make('span','ui-icon');};
 const label=(el,name,text)=>{el.replaceChildren(icon(name),make('span','',text));};
 const btn=(id,text,name,fn)=>{const b=make('button','ui-button');b.type='button';b.id=id;label(b,name,text);b.onclick=fn;return b;};
 const stage=one('.stage'),left=$('left'),right=$('right'),tools=one('.tools');
 document.body.classList.add('atlas-prototype');
 const hashParams=()=>new URLSearchParams(location.hash.slice(1));
 /* V12.2 · E2: «после готовности сцены» — __ATLAS.whenReady(); без E2 — прежняя задержка */
 const E2=()=>!!(window.__ATLAS&&window.__ATLAS.features&&window.__ATLAS.features.sceneReady);
 const afterReady=(fn,ms,n=0)=>{if(E2()&&typeof window.__ATLAS.whenReady==='function')window.__ATLAS.whenReady().then(r=>{if(r&&r.cancelled&&n<4&&!window.__ATLAS.features.whenReadyLatest)afterReady(fn,ms,n+1);else fn();});   /* V12.2 · E2b: whenReady ждёт последнюю сцену */else setTimeout(fn,ms);};   /* смена поколения загрузки (cancelled) — ждать новую сцену */

 /* ---------- шапка: поиск, справка, тема ---------- */
 const slot=S.searchSlot(),search=$('search');
 search.placeholder='Поиск по модели';search.setAttribute('aria-label','Поиск по модели');search.setAttribute('autocomplete','off');search.removeAttribute('aria-expanded');search.setAttribute('enterkeyhint','search');search.setAttribute('inputmode','search');   /* 1.0.19a A-07, A-10 */search.setAttribute('aria-controls','searchPopover');search.type='search';
 slot.querySelector('#asSearch').replaceWith(search);S.syncSearchPh?.();   /* 1.0.19a A-01: «Найти» на узкой шапке при ключе progress */
 const searchPopover=make('section','search-popover');searchPopover.id='searchPopover';searchPopover.hidden=true;searchPopover.setAttribute('aria-label','Результаты поиска по модели');
 const {label:scopeLabel,scope:searchScope,count:searchCount,results:searchResults}=V.searchControls();
 scopeLabel.append(searchScope);
 // V12.1 · п. 5: первой — группа «Узлы» (AtlasNodes.search: нормализация §2.4, точный регистр выше), потом «Элементы» (до 20)
 const nodesHost=make('section','sg search-nodes');nodesHost.id='searchNodes';nodesHost.hidden=true;
 searchPopover.append(nodesHost,scopeLabel,searchCount,searchResults);slot.append(searchPopover);
 searchScope.value='building';
 for(const e of [...$('viewSettings').children])if(e.tagName==='H3'&&e.textContent==='Поиск'||e.tagName==='P'&&(e.classList.contains('r23-kbd')||e.textContent.includes('Ctrl/')))e.remove();
 const showSearch=()=>{searchPopover.hidden=false;   /* 1.0.19a A-07: поле поиска не combobox — без aria-expanded */if(!search.value.trim()){V.resetSearch();$('r23SearchCount').textContent='Введите название, марку или ID. Поиск идёт '+S.siteText('search_extent','по всему зданию')+'.';}};
 /* V12.3 · E17: Esc, закрывший поиск, — только его: движок не закрывает панели (atlas:escape отменяемо), карточка не снимает выбор (defaultPrevented) */
 let escTaken=null;const escTake=e=>{escTaken=e;if(window.__ATLAS?.features?.cancelableClose)e.preventDefault();};
 document.addEventListener('atlas:escape',e=>{if(escTaken&&e.detail&&e.detail.original===escTaken)e.preventDefault();escTaken=null;});
 const closeSearch=()=>{gGen++;clearTimeout(gTimer);searchPopover.hidden=true;one('.atlas-shell').classList.remove('as-search-open');};   /* 1.1.1 B3: закрытие отменяет отложенный поиск групп */
 search.addEventListener('focus',showSearch);search.addEventListener('input',showSearch);search.addEventListener('focus',()=>{const q=search.value.trim();if(q&&groupsQ!==q&&!gTimer)groupsRun(0);});   /* 1.1.1 B3: снова открыт — группы этого запроса */
 document.addEventListener('atlas:search',()=>{one('.atlas-shell').classList.add('as-search-open');search.focus();showSearch();});
 /* 1.0.19a A-04 (М-8): «Искать во всём здании» из «Состава» и «Элементов» — тот же запрос в поиске шапки, область «Всё здание» (1 нажатие) */
 document.addEventListener('atlas:searchall',e=>{const q=String((e.detail&&e.detail.q)||'').trim();if(!q)return;$('r23SearchScope').value='building';search.value=q;one('.atlas-shell').classList.add('as-search-open');if(innerWidth<=850)left.classList.remove('open');search.focus();showSearch();search.dispatchEvent(new Event('input',{bubbles:true}));});
 /* 1.1.1 B3: один список под клавиатуру — «Состав», «Элементы», «Замечания / Типы / Листы» (ссылки и кнопки «Показать ещё», «Повторить») в порядке на экране */
 const rowsAll=()=>[...searchPopover.querySelectorAll('#searchNodes button,#viewSearchResults button,#searchGroups a[href],#searchGroups button')].filter(e=>!e.disabled&&e.offsetParent!==null);
 search.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();rowsAll()[0]?.focus();}if(e.key==='Escape'){escTake(e);closeSearch();search.blur();}});
 let nTimer=0;const nodesSync=()=>{const N=window.AtlasNodes,q=search.value.trim();nodesHost.replaceChildren();const res=q&&N?.ready?.()?N.search(q,8):[];nodesHost.hidden=!res.length;if(!res.length)return;
  nodesHost.append(make('h3','sg-h','Состав · '+fmt(res.length)));   /* 1.0.19a A-11: «Узлы» → «Состав» (как вкладка слева) */
  for(const n of res){const b=make('button','r23-result r23-node');b.type='button';b.append(document.createTextNode(n.ls||n.l));const sub=[...new Set([n.sec,levels?n.lev:null].filter(Boolean))].join(' › ');if(sub)b.append(make('small','r23-meta',sub));b.onclick=()=>{N.open(n.k);closeSearch();left.classList.remove('open');};nodesHost.append(b);}};
 search.addEventListener('input',()=>{clearTimeout(nTimer);nTimer=setTimeout(()=>{nodesSync();emptySync();},90);});document.addEventListener('atlas:nodes',nodesSync);
 searchPopover.addEventListener('keydown',e=>{const rows=rowsAll(),i=rows.indexOf(document.activeElement);if((e.key==='ArrowDown'||e.key==='ArrowUp')&&e.target.tagName!=='SELECT'){e.preventDefault();if(e.key==='ArrowUp'&&i<=0){search.focus();return;}rows[Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.focus();}if(e.key==='Escape'){escTake(e);closeSearch();search.focus();}});
 searchPopover.addEventListener('click',e=>{if(e.target.closest('.r23-result')){searchSave(e.target.closest('.r23-result'));closeSearch();left.classList.remove('open');}const a=e.target.closest('#searchGroups a[href]');if(a&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey)searchSave(a);});
 document.addEventListener('pointerdown',e=>{if(!slot.contains(e.target)&&!e.target.closest('.as-search-toggle'))closeSearch();});
 // Группы «Замечания / Типы / Листы» под результатами модели; прямые переходы по Enter.
 const groupsHost=make('div','search-groups');groupsHost.id='searchGroups';searchPopover.append(groupsHost);
 /* 1.1.1 B3: поколение запроса растёт сразу при вводе, очистке, Esc и закрытии — отложенный ответ старого запроса в выдачу не попадает (проверка до и после ожидания индекса).
    Индекс не загрузился — группа с ошибкой и «Повторить» (повтор — только этот индекс, тот же запрос). groupsShown — сколько строк групп показать сразу (возврат к позиции). */
 let gTimer=0,gGen=0,groupsShown=null;
 function groupsRun(delay){clearTimeout(gTimer);const my=++gGen,q=search.value.trim();groupsQ=null;groupsHost.replaceChildren();if(!q){gTimer=0;return;}gTimer=setTimeout(async()=>{gTimer=0;if(my!==gGen)return;let gs=[];try{gs=window.AtlasSearch?await window.AtlasSearch.groups(q,4):[];}catch(e){gs=[];}if(my!==gGen||search.value.trim()!==q)return;window.AtlasSearch?.renderGroups(groupsHost,gs,{step:20,shown:groupsShown||undefined,onRetry:()=>{search.focus({preventScroll:true});groupsRun(0);}});groupsShown=null;groupsQ=q;emptySync();document.dispatchEvent(new CustomEvent('atlas:searchgroups',{detail:{q}}));},delay);}
 search.addEventListener('input',()=>groupsRun(250));   /* 1.0.19a A-04: groupsQ — группы этого запроса пришли */
 search.addEventListener('keydown',e=>{if(e.key!=='Enter')return;const d=window.AtlasSearch?.direct(search.value);if(d){e.preventDefault();location.href=d.href;return;}clearTimeout(nTimer);nodesSync();const first=nodesHost.querySelector('button')||$('viewSearchResults').querySelector('button.r23-result')||groupsHost.querySelector('a.sg-item[href]');if(first){e.preventDefault();first.click();}});   /* 1.1.1 B3: нет узлов и элементов — первая строка групп (лист, тип, замечание) */
 /* 1.1.1 B3: возврат к позиции. Перед переходом по строке групп (другая страница) — {q, строка, прокрутка, порции} в history.state.atlasSearch (поля шага B2 сохраняются);
    при возврате (загрузка или bfcache) — тот же запрос, порции, фокус на той же строке и прокрутка. Строка элемента — та же выдача на этой странице, позиция остаётся в DOM. */
 function searchSave(row){try{const sh={};for(const g of groupsHost.querySelectorAll('[data-search-group]'))sh[g.dataset.searchGroup]=+g.dataset.shown||0;const pos={q:search.value.trim(),href:row.getAttribute('href')||null,rid:row.dataset.rid||null,scroll:searchPopover.scrollTop,el:+$('viewSearchResults').dataset.shown||0,sh};history.replaceState(Object.assign({},history.state||{},{atlasSearch:pos}),'');}catch(e){}}
 async function searchRestore(pos){if(!pos||!pos.q)return;try{history.replaceState(Object.assign({},history.state||{},{atlasSearch:undefined}),'');}catch(e){}
  search.value=pos.q;groupsShown=pos.sh||null;one('.atlas-shell').classList.add('as-search-open');showSearch();if(typeof search.oninput==='function')search.oninput();search.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(r=>{let n=0;const t=setInterval(()=>{if(groupsQ===pos.q||++n>150){clearInterval(t);r();}},60);});
  const vr=$('viewSearchResults');for(let k=0;k<200&&(+vr.dataset.shown||0)<pos.el;k++){const m=vr.querySelector('.r23-more:not([hidden])');if(!m)break;m.click();}
  const row=pos.href?[...groupsHost.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===pos.href):pos.rid?vr.querySelector('[data-rid="'+CSS.escape(pos.rid)+'"]'):null;
  searchPopover.hidden=false;(row||search).focus({preventScroll:true});searchPopover.scrollTop=pos.scroll||0;}
 window.addEventListener('pageshow',e=>{if(e.persisted&&history.state&&history.state.atlasSearch)searchRestore(history.state.atlasSearch);});
 document.addEventListener('atlas:ready',()=>{const pos=history.state&&history.state.atlasSearch;if(pos)afterReady(()=>searchRestore(pos),0);},{once:true});
 // Список закрывается, когда фокус уходит за пределы поля и списка.
 slot.addEventListener('focusout',e=>{setTimeout(()=>{if(!slot.contains(document.activeElement))closeSearch();},0);});
 function applyQuery(){const q=hashParams().get('q');if(!q)return;search.value=q;search.dispatchEvent(new Event('input',{bubbles:true}));one('.atlas-shell').classList.add('as-search-open');search.focus();showSearch();}
 // Тема — только на главной, как прежде.
 const theme=make('button','as-icon');theme.type='button';theme.id='themeToggle';theme.onclick=()=>V.set('background',V.state().background==='dark'?'light':'dark');
 one('.as-theme-slot').append(theme);
 // V12.0 · 0.2б: на телефоне кнопки темы в шапке нет — строка «Тёмная тема» в «Ещё», только на главной.
 const themeRow=S.addMenuItem?.({title:'Тёмная тема',desc:'',pageOnly:'model',phoneOnly:true,id:'themeMenuItem',onClick:()=>theme.click()})||null;
 // V12.0 · 0.2: html[data-theme="dark"] (токены tokens_v2_dark.css) + body.ui-dark (движок) + событие atlas:theme; хранится background в AtlasViewSettings.
 let themeWas=null;
 const themeSync=()=>{const dark=V.state().background==='dark',I=window.AtlasIcons;if(dark)document.documentElement.dataset.theme='dark';else delete document.documentElement.dataset.theme;document.body.classList.toggle('ui-dark',dark);theme.setAttribute('aria-pressed',String(dark));theme.setAttribute('aria-label','Тёмная тема');theme.title=dark?'Тёмная тема включена':'Тёмная тема';theme.innerHTML=I?I.use(dark?'theme-light':'theme-dark'):'';const row=themeRow||$('themeMenuItem');if(row){row.setAttribute('aria-pressed',String(dark));const d=row.querySelector('.as-mi-desc');if(d)d.textContent=dark?'Включена':'Выключена';}if(themeWas!==null&&themeWas!==dark)document.dispatchEvent(new Event('atlas:theme'));themeWas=dark;};
 // Справка
 const helpDialog=make('dialog','atlas-dialog');helpDialog.id='atlasHelp';helpDialog.setAttribute('aria-label','Как работать с атласом');
 /* 1.0.19a A-14 (О-8): строка клавиш — в начале справки (видна без прокрутки); A-05: клавиша поиска — по платформе, «/» и L — только в сцене; A-11: «Показать только это» */
 /* 1.1.1 A2: «Управление моделью» — по обработчикам движка (pointerdown/pointermove, wheel, keydown на холсте, «Вращать» и «Вокруг выбранного» — installOrbitToggle) */
 helpDialog.innerHTML='<form method="dialog"><button class="dialog-close">Закрыть</button></form><p class="eyebrow">3D Атлас</p><p class="help-keyboard" id="helpKeys"></p><h2>От элемента — к чертежу</h2><ol><li><b>Найдите.</b> Введите название или марку в поиске сверху. Либо выберите '+(levels?'раздел и уровень':'раздел')+' слева.</li><li><b>Рассмотрите.</b> Выберите элемент на модели. «К элементу» приблизит его, «Показать только это» уберёт окружение.</li><li><b>Сверьте.</b> Откройте чертёж из карточки элемента. Если источника нет, это указано прямо. Замечания к РД по элементу — в той же карточке.</li></ol><h3>Управление моделью</h3><ul class="help-controls"><li><b>Мышь.</b> Левая кнопка — вращение: вокруг выбранного элемента, если он виден, иначе вокруг точки под курсором. Правая или средняя кнопка, Shift + левая — сдвиг. Shift + средняя — вращение вокруг точки под курсором. Колесо мыши, прокрутка или щипок на тачпаде — масштаб.</li><li><b>Кнопки над моделью.</b> «Вращать» — вращение вокруг точки под курсором или пальцем. «Вокруг выбранного» — вращение вокруг выбранного элемента. В «Плане» вращения нет: перетаскивание сдвигает вид.</li><li><b>Телефон и планшет.</b> Один палец — сдвиг, при включённом «Вращать» — вращение. Два пальца — сдвиг и масштаб.</li><li><b>Клавиши</b> (модель в фокусе). Стрелки — вращение, Shift + стрелки — сдвиг, + и − — масштаб, Home — вписать модель.</li></ul><p>Сечения, прозрачность, размеры, ракурсы и экспорт находятся в «Инструментах». Кнопка «Показать всё» возвращает скрытые элементы, «Как при открытии» — вид, с которым атлас открылся.</p><h3>Что означают данные</h3><p id="helpNumbers"></p>';
 helpDialog.querySelector('#helpKeys').textContent=(S.kbdK?S.kbdK():'Ctrl K')+' — поиск с любого места · Esc — закрыть панель · Home — вписать модель · в сцене: / — поиск, L — линейка';
 document.body.append(helpDialog);
 helpDialog.querySelector('#helpNumbers').textContent=fmt(R.elements)+' '+S.plural(R.elements,'элемент','элемента','элементов')+' '+inModel+'. '+fmt(R.catalogue_types)+' '+S.plural(R.catalogue_types,'тип','типа','типов')+' каталога учитываются отдельно.'+(Number.isFinite(R.unplaced)&&R.unplaced>0?' Для '+fmt(R.unplaced)+' моделей место '+atSite+' не подтверждено.':'')+' Наличие модели или чертежа само по себе не означает инженерную приёмку.';
 helpDialog.addEventListener('click',e=>{if(e.target===helpDialog)helpDialog.close();});
 /* 1.1.1 A4: Esc / «Закрыть» — фокус на кнопку, которой справку открыли; пункт «Ещё» к этому времени скрыт — тогда на видимую «Ещё» */
 let helpOpener=null;const helpBack=()=>{const vis=x=>x&&x.isConnected&&x.getClientRects().length&&!x.closest('[hidden]');let t=helpOpener;if(!vis(t))t=[...document.querySelectorAll('.atlas-shell .as-more-btn,.as-tabbar [aria-controls="asMoreMenu"],.atlas-shell .as-help')].find(vis)||null;helpOpener=null;if(t)setTimeout(()=>{if(!helpDialog.open)t.focus();},0);};
 helpDialog.addEventListener('close',helpBack);
 S.onHelp=()=>{if(!helpDialog.open){const a=document.activeElement;helpOpener=a&&a!==document.body&&!helpDialog.contains(a)?a:null;helpDialog.showModal();}};
 /* 1.0.19a A-06 (О-4): Esc в справке закрывает только справку — правая и левая панели остаются (atlas:escape отменяемо, движок не меняется) */
 document.addEventListener('atlas:escape',e=>{if(helpDialog.open)e.preventDefault();});
 if(hashParams().has('help'))S.onHelp();

 /* ---------- левая панель: состав модели ---------- */
 const navTitle=make('div','navigation-heading');navTitle.append($('sectionTitle'));left.prepend(navTitle);
 const closeLeft=left.querySelector('[data-close="left"]');closeLeft.textContent='Закрыть';navTitle.append(closeLeft);
 const leftCount=make('p','left-count');leftCount.id='leftCount';navTitle.after(leftCount);
 const navBox=one('.atlas-navigation');leftCount.after(navBox);
 const studies=$('studyNavigation'),filterBox=one('.filterBox'),overlayLabel=$('r12OverlayLabel');
 one('#left > .eyebrow')?.remove();
 const kpis=one('#left .kpis');kpis.classList.add('review-only');navBox.after(kpis);
 const treeLabel=make('div','section-label','Разделы');const tree=$('albumTree');navBox.after(tree);tree.prepend(treeLabel);
 const elementDetails=make('details','element-list');elementDetails.id='elementListDetails';elementDetails.append(make('summary','','Элементы раздела'));tree.after(elementDetails);elementDetails.append($('listCount'),$('list'));
 // Поле «Найти в разделе» над списком элементов: фильтрует тот же список (обработчик движка на #search).
 const inSection=make('input','in-section');inSection.type='search';inSection.id='inSection';inSection.placeholder='Найти в разделе';inSection.setAttribute('aria-label','Найти в разделе');inSection.autocomplete='off';
 elementDetails.querySelector('summary').after(inSection);
 inSection.addEventListener('input',()=>{search.value=inSection.value;if(typeof search.oninput==='function')search.oninput();});
 const notesAll=[...left.querySelectorAll('details.engineering-note')];for(const d of notesAll)left.append(d);
 notesAll[0]?.querySelector('summary')&&(notesAll[0].querySelector('summary').textContent='О разделе');
 // Режим проверки: проверочные сцены, варианты элементов и мировые редакции — только здесь.
 const review=make('section','review-block review-only');review.id='reviewBlock';review.setAttribute('aria-label','Режим проверки');
 review.append(make('div','review-title','Режим проверки включён'));
 if(studies)studies.querySelector('summary').textContent='Проверочные сцены · '+studies.querySelectorAll('.study-items [data-scope]:not([data-scope="HISTORY"]):not([data-scope="HELPERS"])').length;   // К1: нет набора разделов проверки — блока нет
 // Движок вставляет блок мировых редакций перед #studyNavigation в #left асинхронно: переносим после atlas:ready.
 if(studies){left.append(studies);studies.classList.add('review-only');}
 {const nv=filterBox.querySelectorAll('select').length;filterBox.querySelector('summary').textContent='Варианты элементов'+(nv?' · '+nv:'');}if(overlayLabel)filterBox.append(overlayLabel);   // К1: число списков — из разметки (было зашито 18)
 const variantsNote=make('p','review-hint','Списки действуют в проверочных сценах. Значения '+inModel+' сохраняются.');filterBox.querySelector('summary').after(variantsNote);
 review.append(filterBox);
 const worldBox=make('details','world-review');worldBox.append(make('summary','','Мировые редакции · проверка 3D'));worldBox.hidden=true;review.append(worldBox);
 review.append(make('p','review-hint','По умолчанию скрыто: заказчик видит только модель.'));
 left.append(review);
 function syncReview(){/* К1: пустые части режима проверки не показываются */const off=(el,v)=>{if(el){el.hidden=v;el.style.display=v?'none':'';}};const ns=studies?studies.querySelectorAll('.study-items [data-scope]:not([data-scope="HISTORY"]):not([data-scope="HELPERS"])').length:0;off(studies,!ns);const nv=filterBox.querySelectorAll('select').length;off(filterBox,!nv);let rv=null;try{rv=window.__ATLAS&&typeof __ATLAS.revisions==='function'?__ATLAS.revisions():null;}catch(e){rv=null;}const w=!!rv&&!worldBox.hidden&&!!worldBox.querySelector('#rev04WorldControls');off(worldBox,!w);off(review,!(ns||nv||w));off(kpis,!(ns||nv||w));}
 function adoptReview(){if(studies){filterBox.before(studies);studies.classList.remove('review-only');}const world=$('rev04WorldControls');if(world&&world.parentElement!==worldBox){world.removeAttribute('style');worldBox.append(world);worldBox.hidden=false;}syncReview();}
 document.addEventListener('atlas:ready',adoptReview);if(window.__ATLAS)adoptReview();
 const note=one('#left > p.sub');if(note){note.className='navigation-footnote';note.textContent='Тип в каталоге и элемент '+atSite+' — разные записи.'+(typeof (window.ATLAS_RELEASE||{}).unplaced==='number'?' Модели без подтверждённого места — '+((window.AtlasShell&&AtlasShell.unplacedWhere)?AtlasShell.unplacedWhere():'в разделе «Требует решения»')+'.':'');/* К1: вторая фраза — только при ключе unplaced; 1.0.19a к2: имя раздела — как у пункта меню (AtlasShell.unplacedWhere) */left.append(note);}
 {const nav=$('navBuilding'),n=nav.querySelector('[data-release="elements"]');n.textContent=fmt(R.elements);nav.replaceChildren(document.createTextNode(whole+' '),n);$('albumRoot').textContent=whole;}
 /* ---------- слой «По РД · 2839–2955» (данные задачи A) — для всех ---------- */
 const PL=window.AtlasWorldRevisionData?.placedLayer||null;
 /* К1: подписи слоя — набор объекта revisions_meta.layers[0].texts ({n}, {types}, {label}, {ranges:<ключ placedLayer>}); нет подписи — строки нет; короткая подпись — texts.short_label */
 const PLT=(((window.ATLAS_REVISIONS_META||{}).layers||[])[0]||{}).texts||{},SL=PLT.short_label||'По РД';
 const LT=(k,v)=>String(PLT[k]||'').replace(/\{(n|types|elements|label|ranges:([A-Za-z_]+))\}/g,(m,a,key)=>a==='n'?fmt(v.n):a==='types'?S.plural(v.n,'тип','типа','типов'):a==='elements'?S.plural(v.n,'элемент','элемента','элементов'):a==='label'?(v.label||''):ranges((PL&&PL[key])||[]));   /* 1.0.16 B3-12 (A9): и {elements} */
 // К1 § 2: модуль ревизий — __ATLAS.revisions() (state().reviewPackage, setPackage(n)); нет набора ревизий — null, обращения молчат; раздел — __ATLAS.scope()
 const REV=()=>{const A=window.__ATLAS;try{return A&&typeof A.revisions==='function'?A.revisions():null;}catch(e){return null;}};
 const SCOPE=()=>{const A=window.__ATLAS;try{return A&&typeof A.scope==='function'?A.scope():null;}catch(e){return null;}};
 const PKS=()=>ranges([].concat(...(((PL&&PL.groups)||[]).map(g=>g.packages||[]))));
 const ranges=list=>{const out=[];let a=null,b=null;for(const n of [...list].sort((x,y)=>x-y)){if(a!==null&&n===b+1){b=n;continue;}if(a!==null)out.push(a===b?String(a):a+'–'+b);a=b=n;}if(a!==null)out.push(a===b?String(a):a+'–'+b);return out.join(', ');};
 const layerBtn=make('button','nav-layer');layerBtn.type='button';layerBtn.id='placedLayerBtn';layerBtn.setAttribute('aria-pressed','false');
 const layerLegend=make('div','layer-legend');layerLegend.hidden=true;
 const inLayer=st=>{if(!PL)return false;st=st||REV()?.state();return !!st&&st.scope==='WORLD_REVIEW'&&st.reviewPackage===PL.package_no;};
 if(PL){
  layerBtn.append(make('span','',SL),make('small','',fmt((PL.placed_render_ids||[]).length)));
  {const n=(PL.placed_render_ids||[]).length;layerBtn.title=LT('button_title',{n});layerBtn.setAttribute('aria-label',LT('button_aria',{n}));}
  layerBtn.onclick=()=>{if(inLayer())$('navBuilding').click();else REV()?.setPackage(PL.package_no);layerSync();};
  {const n=(PL.placed_render_ids||[]).length;layerLegend.append(make('strong','',LT('legend_title',{n})));for(const k of ['legend_count','legend_hidden','legend_context'])if(PLT[k])layerLegend.append(make('p','',LT(k,{n})));}
  if(PLT.legend_conditional){const cond=make('p','layer-cond');cond.append(make('span','layer-dot'),document.createTextNode(LT('legend_conditional',{})));layerLegend.append(cond);}
  $('navBuilding').after(layerBtn);layerBtn.after(layerLegend);
 }
 /* ---------- V11.1 · E: разделы «По РД · N типов» под «Разделами» (API A: __ATLAS.placedGroups()) ---------- */
 const placedBox=make('section','placed-block');placedBox.id='placedBlock';placedBox.setAttribute('aria-labelledby','placedBlockH');placedBox.hidden=true;
 const curScope=()=>SCOPE()||hashParams().get('scope')||'BUILDING';
 let placedGroups=null;
 function buildPlaced(){
  if(placedGroups||typeof window.__ATLAS?.placedGroups!=='function')return;
  let gs;try{gs=window.__ATLAS.placedGroups()||[];}catch(e){return;}
  if(!gs.length)return;placedGroups=gs;
  const main=gs.filter(g=>!g.context),ctx=gs.find(g=>g.context);
  const total=gs.reduce((n,g)=>n+(g.count||0),0);
  const h=make('div','section-label');h.id='placedBlockH';h.append(document.createTextNode(LT('block_title',{n:total})));h.title=LT('button_title',{n:total});
  const list=make('div','placed-items');
  for(const g of main){const b=make('button','album-node placed-node');b.type='button';b.dataset.placed=g.id;b.title=g.label+' · '+fmt(g.count);
   const t=make('span','placed-label',g.label);b.append(t);const sm=make('small','',fmt(g.count));b.append(sm);
   if(g.conditionalElevations){const c=make('span','placed-cond');c.append(make('span','layer-dot'),document.createTextNode(LT('group_conditional',{})));t.append(c);}
   b.onclick=()=>{window.__ATLAS.setScope('PLACED:'+g.id);if(innerWidth<=850)left.classList.remove('open');setTimeout(placedSync,0);};
   /* 1.0.15 B3-15: флажок — группа вместе со зданием и набором разделов «Узлов» (AtlasNodes.placedToggle); название — по-прежнему переход в группу */
   const row=make('div','placed-row');const ck=make('label','nt-ck');ck.title='Показать вместе со зданием';const ci=document.createElement('input');ci.type='checkbox';ci.dataset.placedCk=g.id;ci.setAttribute('aria-label',g.label+' — показать вместе со зданием');
   ci.addEventListener('click',e=>{e.stopPropagation();plToggle(g.id);});ck.addEventListener('click',e=>e.stopPropagation());ck.append(ci);row.append(b,ck);list.append(row);}
  plRow.hidden=true;placedBox.append(h,plRow,list);   // 1.0.15 B3-15: строка набора — под заголовком
  if(ctx){const row=make('div','placed-ctx');const sw=make('button','placed-switch');sw.type='button';sw.setAttribute('role','switch');sw.setAttribute('aria-checked','false');sw.dataset.placed=ctx.id;sw.id='placedCtx';
   const lab=make('label','placed-ctx-label');lab.htmlFor='placedCtx';lab.append(make('span','',ctx.label.replace(/\s*\(.*\)\s*$/,'')||ctx.label),make('small','',fmt(ctx.count)));lab.title=ctx.label;
   sw.setAttribute('aria-label',ctx.label);sw.append(make('span','as-knob'));
   sw.onclick=()=>{if(curScope()==='PLACED:'+ctx.id)$('navBuilding').click();else window.__ATLAS.setScope('PLACED:'+ctx.id);setTimeout(placedSync,0);};
   row.append(lab,sw);placedBox.append(row);}
  if(PL){layerBtn.classList.add('placed-all');layerBtn.replaceChildren(make('span','','Все '+fmt(total)+' вместе'),make('small','','слой'));layerBtn.setAttribute('aria-label','Все '+total+' вместе · прежний слой «'+SL+'»');placedBox.append(layerBtn,layerLegend);}
  const legend=make('p','placed-legend');legend.hidden=true;legend.append(make('span','layer-dot'),document.createTextNode(LT('section_conditional',{})));placedBox.append(legend);
  const pv=$('navViewPlaced');if(pv)pv.append(placedBox);else tree.after(placedBox);placedBox.hidden=false;placedSync(); // V12.1: вид «По РД»
 }
 /* 1.0.15 B3-15: набор «По РД» — флажки и строка «Набор: …» (тот же набор, что во «Узлах») */
 const plRow=make('div','nt-set placed-set');plRow.setAttribute('role','status');
 const plToggle=id=>{const N=window.AtlasNodes;if(N&&N.placedToggle){N.placedToggle(id);return;}if(N&&N.whenReady)N.whenReady().then(()=>{const M=window.AtlasNodes;if(M&&M.placedToggle)M.placedToggle(id);});};
 function placedSetSync(){if(!placedGroups)return;let si=null;try{si=window.AtlasNodes&&window.AtlasNodes.sections?window.AtlasNodes.sections():null;}catch(e){si=null;}const pl=(si&&si.placed)||{on:false,ids:[]};
  for(const i of placedBox.querySelectorAll('input[data-placed-ck]'))i.checked=pl.ids.includes(i.dataset.placedCk);
  const ln=si&&si.line;plRow.hidden=!(ln&&pl.on);if(plRow.hidden)return;const x=make('button','nt-set-x','Сбросить');x.type='button';x.onclick=()=>$('navBuilding').click();plRow.replaceChildren(make('b','',ln.b),make('span','',ln.s),x);}
 document.addEventListener('atlas:sections',()=>placedSetSync());
 function placedSync(){
  if(!placedGroups)return;const sc=curScope();placedSetSync();
  for(const b of placedBox.querySelectorAll('.placed-node')){const on=sc==='PLACED:'+b.dataset.placed;b.classList.toggle('is-current',on);if(on)b.setAttribute('aria-current','true');else b.removeAttribute('aria-current');}
  const ctx=placedBox.querySelector('.placed-switch');if(ctx)ctx.setAttribute('aria-checked',String(sc==='PLACED:'+ctx.dataset.placed));
  const g=placedGroups.find(x=>sc==='PLACED:'+x.id);placedBox.querySelector('.placed-legend').hidden=!(g&&g.conditionalElevations);
  currentSync();
 }
 // V12.0 · 0.15а: выделен текущий раздел, а не «Всё здание»: вне корня «Всё здание» гаснет, текущий раздел дерева — последний пункт пути.
 let csQ=false;function currentSync(){if(csQ)return;csQ=true;requestAnimationFrame(()=>{csQ=false;currentSyncNow();});}
 function currentSyncNow(){const st=REV()?.state(),sc=SCOPE()||hashParams().get('scope')||'BUILDING',root=sc==='BUILDING'&&!inLayer(st),nb=$('navBuilding');nb.classList.toggle('is-off',!root);if(root)nb.setAttribute('aria-current','true');else nb.removeAttribute('aria-current');
}
 /* V12.4 · P7: подсветка пути скрытого дерева движка убрана (#albumTree не виден с V12.1h; при __ATLAS_OPTIONS.albumTree=false путь не строится); «Всё здание» — по atlas:scope (V12.5b: наблюдатель пути скрытого дерева убран) */
 {document.addEventListener('atlas:scope',currentSync);addEventListener('hashchange',currentSync);document.addEventListener('atlas:ready',()=>setTimeout(currentSync,0));}
 document.addEventListener('atlas:ready',()=>setTimeout(buildPlaced,0));
 function layerSync(){placedSync();if(!PL)return;const on=inLayer();layerBtn.setAttribute('aria-pressed',String(on));layerLegend.hidden=!on;document.body.classList.toggle('placed-layer',on);currentSync();
  const opt=$('rev04ReviewPackage')?.querySelector('option[value="'+PL.package_no+'"]');if(opt)opt.textContent=SL+' · '+PKS();}
 // V12.2 · M1: id тела слоя N без layer= (каталог «Размещено по РД», 117 типов: scope=BUILDING&id=тела слоя N) — через слой «По РД»
 function openLayerTarget(){const h=hashParams();let layer=h.get('layer');const pid=h.get('id');if(!layer&&PL&&pid&&(((window.ATLAS_REVISIONS_META||{}).layers||[])[0]||{}).record_prefix&&pid.startsWith(((window.ATLAS_REVISIONS_META||{}).layers||[])[0].record_prefix)&&window.__FULL_ATLAS?.selected()?.renderId!==pid)layer=String(PL.package_no);if(!layer||!PL||!REV())return;if(!inLayer())REV().setPackage(Number(layer));const id=h.get('id');if(id){try{window.__ATLAS.select(id);right.classList.add('open');noSelection=false;}catch(e){}}layerSync();}

 /* ---------- сцена ---------- */
 // V12.0: узлы панели инструментов создаются здесь, как раньше; значки и раскладку по группам ведёт B3 (atlas-toolbar.js).
 // Здесь узлы получают только текст. Если после всех defer-скриптов window.AtlasToolbar нет (панель B3 не подключена или заглушка) —
 // прежнее оформление V11.5: значки и группы (tbFallback, на DOMContentLoaded).
 const tbFallback=[];
 const tl=(el,name,text)=>{if(text)el.textContent=text;tbFallback.push(()=>label(el,name,text));};
 const tbtn=(id,text,name,fn)=>{const b=make('button','ui-button',text);b.type='button';b.id=id;b.onclick=fn;tbFallback.push(()=>label(b,name,text));return b;};
 document.addEventListener('DOMContentLoaded',()=>{if(!window.AtlasToolbar)for(const f of tbFallback)f();},{once:true});
 tl($('menu'),'sidebar-simple','Состав');tl($('card'),'info','Элемент');
 tl($('quickAxes'),'axes','Оси');tl($('quickLabels'),'tag','Подписи');tl($('viewSettingsToggle'),'sliders-horizontal','Инструменты');
 $('viewSettings').setAttribute('aria-label','Инструменты модели');one('.r23-menu-head b').textContent='Инструменты модели';$('closeViewSettings').textContent='Закрыть';
 const topControls=make('div','stage-actions');stage.prepend(topControls);
 const crumbs=make('nav','stage-path');crumbs.setAttribute('aria-label','Путь');
 topControls.append($('menu'),crumbs,$('card'));
 const quickRestore=tbtn('quickRestore','Показать всё','arrow-counter-clockwise',()=>$('restore').click());topControls.append(quickRestore);quickRestore.title='Вернуть скрытые элементы и окружение';
 /* 1.0.19a A-02: ↺ «Как при открытии» — рядом с «Показать всё», виден, только когда вид изменён (goHome — ниже, «синхронизация») */
 const quickHome=tbtn('quickHome','Как при открытии','arrow-counter-clockwise',()=>goHome());topControls.append(quickHome);quickHome.title='Вернуть вид как при открытии: раздел, '+(levels?'уровень, ':'')+'сечение, набор, изоляция; ракурс — изометрия';
 const bottomControls=make('div','view-controls');tools.prepend(bottomControls);
 for(const view of ['iso','plan']){const el=tools.querySelector('[data-view="'+view+'"]');tl(el,view==='iso'?'cube':'stack',view==='iso'?'3D':'План');el.setAttribute('aria-pressed',String(view==='iso'));bottomControls.append(el);}
 tbFallback.push(()=>{const quickGroup=one('.r23-quality-group');tools.append(quickGroup);quickGroup.prepend($('quickAxes'),$('quickLabels'));quickGroup.append($('viewSettingsToggle'));});
 const shot=tbtn('quickShot','Снимок','download-simple',()=>$('saveImage').click());shot.title='Сохранить снимок вида (PNG)';tools.append(shot);tbFallback.push(()=>{const shotGroup=make('div','shot-group');shot.before(shotGroup);shotGroup.append(shot);});
 const zoom=make('div','zoom-controls');stage.append(zoom);zoom.append($('zoomIn'),$('zoomOut'),$('fit'));tl($('zoomIn'),'plus','');tl($('zoomOut'),'minus','');tl($('fit'),'arrows-out','');$('fit').setAttribute('aria-label','Вписать в окно');$('fit').title='Вписать в окно';
 const graphics=[...$('viewSettings').querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Графика и чёткость');
 const fitElement=btn('fitElement','К элементу','crosshair',()=>$('focusSelected').click());one('#right .actions').append(fitElement);
 const q=make('label','','Качество графики');q.append($('quality'));graphics.querySelector('summary').after(q);graphics.open=false;
 const diag=$('r23DiagDetails');if(diag)diag.classList.add('review-only');
 one('.hud')?.classList.add('review-only');one('.status')?.classList.add('review-only');
 const toolIntro=make('p','tool-intro','Настройки меняют только отображение. Геометрия и проектные данные сохраняются.');one('.r23-menu-head').after(toolIntro);
 // V12.0 · 0.9: отметки (+3,500, ±0,000) — моно: в списке уровней, выбранном уровне и «крошках». Текст и обработчики движка не меняются.
 const ELEV=/([+±−-]\d+,\d{3})/;
 const monoElev=root=>{const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),list=[];while(w.nextNode())if(ELEV.test(w.currentNode.data)&&!w.currentNode.parentElement.closest('.mono-num'))list.push(w.currentNode);for(const t of list){const f=document.createDocumentFragment();t.data.split(ELEV).forEach((x,i)=>{if(x)f.append(i%2?make('span','mono-num',x):x);});t.replaceWith(f);}};
 for(const el of [$('levelChoices'),$('levelName'),crumbs])if(el){monoElev(el);new MutationObserver(()=>monoElev(el)).observe(el,{childList:true,subtree:true,characterData:true});}
 // Телефон: крошка занимает только место слева от панели «3D / План / …» (её ширина зависит от числа кнопок).
 const crumbFit=()=>{if(innerWidth>850){crumbs.style.maxWidth='';return;}const t=tools.getBoundingClientRect(),c=crumbs.getBoundingClientRect();if(t.width&&c.left)crumbs.style.maxWidth=Math.max(60,Math.floor(t.left-c.left-8))+'px';};
 new ResizeObserver(crumbFit).observe(tools);addEventListener('resize',crumbFit);document.addEventListener('atlas:ready',()=>setTimeout(crumbFit,50));
 // Путь «Всё здание › раздел › элемент»
 function crumbsSync(){
  const H=window.__FULL_ATLAS?.tree();crumbs.replaceChildren();if(!H)return;
  const h=hashParams(),sc=SCOPE()||h.get('scope')||'BUILDING';const o=window.__FULL_ATLAS.selected();
  const add = (text, action) => {
    if (crumbs.children.length) crumbs.append(make('span', 'crumb-sep', '›'));
    const item = action ? make('button', 'crumb', text) : make('span', 'crumb crumb--here', text);
    if (action) {
      item.type = 'button';
      item.onclick = action;
    }
    crumbs.append(item);
    return item;
  };
  const SI=window.AtlasNodes?.sections?.(),PI=(SI&&SI.placed)||{on:false,labels:[],n:0};const setOn=!!(SI&&(SI.on||PI.on));   /* 1.0.15 B3-15: и группы «По РД» */   /* V12.2 · M15: набор разделов; V12.3 · U1 — в любом разделе (на уровне, в узле); V123-R2-01 — число тел набора во всех режимах, «на уровне» — подпись уровня */
  const setCrumb = () => {
    let scopeLabel = whole.toLocaleLowerCase('ru');
    if (SI.on) {
      scopeLabel = SI.count > 2
        ? fmt(SI.count) + ' ' + S.plural(SI.count, 'раздел', 'раздела', 'разделов')
        : SI.labels.join(' + ');
    }
    const drawn = PI.labels.length;
    const drawnLabel = PI.on ? ' + ' + (drawn > 2
      ? '«По РД» · ' + fmt(drawn) + ' ' + S.plural(drawn, 'группа', 'группы', 'групп')
      : PI.labels.join(' + ')) : '';
    const n = (SI.on ? SI.n : 0) + (PI.on ? PI.n : 0);
    const countLabel = SI.on ? fmt(n) + ' ' + S.plural(n, 'элемент', 'элемента', 'элементов') : '+' + fmt(PI.n) + ' «По РД»';
    const label = 'Показано: ' + scopeLabel + drawnLabel + ' · ' + countLabel + (SI.level ? ' · ' + SI.level : '');
    const action = sc !== 'BUILDING' || window.AtlasNodes?.state?.()?.k
      ? () => window.AtlasNodes.setSections(SI.keys)
      : (o ? () => deselect() : null);
    const crumb = add(label, action);
    crumb.classList.add('crumb--visibility');
    crumb.title = label;
  };
  const LV=(()=>{try{return window.__ATLAS&&typeof window.__ATLAS.level==='function'?window.__ATLAS.level()||'':'';}catch(e){return '';}})();   /* 1.0.19a A-03: уровень — в пути («Всё здание › 2 этаж») */
  add(whole,o||sc!=='BUILDING'||setOn||LV?()=>$('navBuilding').click():null);
  // V12.1: открыт узел — путь из меню узлов: раздел › уровень › группа типа › узел (› тело, если выбран не якорь)
  const NS=window.AtlasNodes?.state?.();if(NS&&NS.k){const P=window.AtlasNodes.path(NS.k),nd=window.AtlasNodes.get(NS.k);if(P.length){
   const home0=crumbs.firstElementChild;if(home0&&home0.tagName!=='BUTTON'){const b=make('button','crumb',whole);b.type='button';b.onclick=()=>$('navBuilding').click();home0.replaceWith(b);}
   if(setOn)setCrumb();
   const selNode=o&&!(nd.anchors||[]).includes(o.renderId);
   P.forEach((x,i)=>{const last=i===P.length-1;add(x.label,x.scope?()=>window.__ATLAS.setScope(x.scope):(last&&selNode?()=>window.AtlasNodes.open(x.k):null));});
   if(selNode){const t=$('cardTitle')?.textContent||o.name;add(t,null);}
   const hb=crumbs.firstElementChild;if(hb&&hb.tagName==='BUTTON'){hb.setAttribute('aria-label',whole);hb.title=whole;hb.replaceChildren(make('span','crumb-full',whole));hb.insertAdjacentHTML('beforeend',window.AtlasIcons?window.AtlasIcons.use('home-view',null,'crumb-home'):'');}
   crumbs.classList.toggle('has-section',true);{const kids=[...crumbs.children],last=kids.length-1;kids.forEach((k,i)=>k.classList.toggle('crumb--mid',i>0&&i<last-1));}{const l=crumbs.lastElementChild;if(l)l.title=l.textContent.trim();}return;}}
  const home=crumbs.firstElementChild;if(home&&home.tagName==='BUTTON'){home.setAttribute('aria-label',whole);home.title=whole;home.replaceChildren(make('span','crumb-full',whole));home.insertAdjacentHTML('beforeend',window.AtlasIcons?window.AtlasIcons.use('home-view',null,'crumb-home'):'');}
  if(setOn)setCrumb();
  if(sc.startsWith('TREE:')){let chain=[],n=H.nodes[sc.slice(5)];while(n&&n.id!=='construction'&&n.id!=='building'){chain.unshift(n);n=H.nodes[n.parent];}chain.forEach((n,i)=>add(n.label,(o||i<chain.length-1)?()=>window.__ATLAS.setScope('TREE:'+n.id):null));}
  else if(sc.startsWith('PLACED:')&&placedGroups){const g=placedGroups.find(x=>'PLACED:'+x.id===sc);add(SL,null);if(g)add(g.label,o?()=>window.__ATLAS.setScope(sc):null);}
  else if(window.AtlasRebar&&sc===window.AtlasRebar.scope&&window.AtlasRebar.active()){add(window.AtlasRebar.crumb(),o?()=>window.__ATLAS.setScope(sc):null);}
  else if(sc==='WORLD_REVIEW'&&inLayer()){add(SL,null);add('Все вместе',o?()=>REV()?.setPackage(PL.package_no):null);}
  else if(sc!=='BUILDING'&&!sc.startsWith('TREE:'))add($('sectionTitle').textContent,null);
  if(LV&&(sc==='BUILDING'||sc.startsWith('TREE:'))&&!(setOn&&SI&&SI.on&&SI.level))add(LV,o?()=>deselect():null);   /* 1.0.19a A-03: на уровне набора подпись уровня уже в строке набора */
  if(o){const PS=window.__ATLAS&&window.__ATLAS.partSelection?window.__ATLAS.partSelection():null;if(PS&&PS.id===o.renderId){const pn=(window.AtlasStatus&&AtlasStatus.displayTitle&&AtlasStatus.displayTitle(o.renderId))||(window.atlasDisplayName&&atlasDisplayName(o))||o.name;add(pn,()=>{try{window.__ATLAS.selectPart(o.renderId,null);}catch(e){}});}const t=PS&&PS.id===o.renderId?(PS.title||PS.part):($('cardTitle')?.textContent||o.name);add(t,null);   /* 1.0.16 B3-2 (A1): часть — уровнем ниже сети; сеть — ссылка (часть снимается) */if(crumbs.children.length>3){crumbs.lastElementChild.classList.add('crumb--el');crumbs.lastElementChild.previousElementSibling.classList.add('crumb-sep--el');}}
  // V12.0 · 0.17б: на телефоне — домик и только последний уровень (средние уровни — .crumb--mid, скрыты в prototype.css при ≤ 850 px)
  {const kids=[...crumbs.children].filter(k=>!k.classList.contains('crumb--el')&&!k.classList.contains('crumb-sep--el')),last=kids.length-1;kids.forEach((k,i)=>k.classList.toggle('crumb--mid',i>0&&i<last-1));}
  crumbs.classList.toggle('has-section',crumbs.children.length>1);
  {const l=crumbs.lastElementChild;if(l&&!l.title)l.title=l.textContent.trim();}
 }

 /* ---------- понятные слова вместо жаргона сборки ---------- */
 const N=fmt(R.elements),NE=N+' '+S.plural(R.elements,'элемент','элемента','элементов');
 const RULES={
  scopeWarning:[[/^\d[\d\s  ]* действующих тел во всём здании\..*$/,NE+' во всём здании. Геометрия и свойства — по исходной модели; это не инженерная приёмка.'],[/^Исторические тела сохранены отдельно и не входят в \d[\d\s  ]* действующих\.$/,'Исторические элементы сохранены отдельно и не входят в '+NE+' модели. Геометрия и свойства — по исходной модели; это не инженерная приёмка.'],['Вспомогательные тела в мировой системе координат; не прибавляются к действующему зданию.','Вспомогательные элементы в координатах здания; не прибавляются к модели здания. Геометрия и свойства — по исходной модели; это не инженерная приёмка.'],[/действующих тел здания/,'элементов здания']],
  objectWarning:[[/^Действующее тело исходной модели\.\s*/,'Элемент '+S.siteText('model_genitive','модели здания')+'. '],[/^Историческая геометрия\. Не входит в действующий подсчёт\.\s*/,'Исторический элемент. Не входит в подсчёт. '],[/^Вспомогательная мировая геометрия\. Не входит в действующий подсчёт\.\s*/,'Вспомогательный элемент. Не входит в подсчёт. ']],
  sectionSub:[['Исходная геометрия сохранена.','Геометрия по исходной '+S.siteText('model_genitive','модели здания')+'.']],
  viewTitle:[[/ · ([\d\s  ]+) тел$/,(m,n)=>' · '+n+' '+S.plural(Number(n.replace(/\D/g,'')),'элемент','элемента','элементов')]],
  selectedName:[['Нет тел в выбранном разделе','Выберите элемент на модели или в списке']],
  sectionTitle:[]
 };
 // К1: правила объекта — из текстов объекта ATLAS_TEXTS.rewrite { id: [{ pattern, flags, replace } | { match, replace }] } — после общих; общий хвост (Ø, «по щелчку», «Не входят…») — последним.
 // В замене: {$N} — группа N, {NE} — число элементов здания с единицей, {plural:$N:один|два|пять} — склонение по группе N.
 const tpl=r=>{const t=String(r==null?'':r);return (...m)=>t.replace(/\{(\$\d+|NE|plural:\$(\d+):([^}]*))\}/g,(x,k,g,forms)=>{if(k==='NE')return NE;if(g){const f=forms.split('|'),n=Number(String(m[+g]||'').replace(/\D/g,''));return S.plural(n,f[0],f[1],f[2]);}return m[+k.slice(1)]==null?'':m[+k.slice(1)];});};
 {const RW=(window.ATLAS_TEXTS||{}).rewrite||{};for(const k of Object.keys(RW))for(const r of RW[k]||[]){if(!r)continue;let a=null;if(typeof r.match==='string')a=r.match;else if(r.pattern){try{a=new RegExp(r.pattern,r.flags||'');}catch(e){a=null;}}if(a!==null)(RULES[k]=RULES[k]||[]).push([a,tpl(r.replace)]);}}
 // коды сборки объекта, которые убираются из предупреждения элемента — ATLAS_TEXTS.strip_codes { pattern, flags }; нет — не убираются
 const CODES=(()=>{const c=(window.ATLAS_TEXTS||{}).strip_codes;if(!c||!c.pattern)return null;try{const f=String(c.flags||'');return new RegExp(c.pattern,f.includes('g')?f:f+'g');}catch(e){return null;}})();
 RULES.scopeWarning.push([/[\u2300\u2205](?=\d)/g,'Ø'],[/^Армирование, загружаемое по щелчку \(скорость запуска\): в «Всё здание» не входит; то же — кнопкой/,'Армирование загружается по щелчку, чтобы модель открывалась быстрее. В «Всё здание» не входит. То же — кнопкой'],[/«Показать армирование здесь»/,'«Показать здесь»'],[/Не входят в \d[\d\s\u00a0\u202f]* действующих тел\./,'Не входят в '+NE+' модели здания.']);
 function humanize(id){const el=$(id);if(!el)return;const run=()=>{let t=el.textContent,n=t;for(const [a,b] of RULES[id])n=n.replace(a,b);if(id==='objectWarning')n=(CODES?n.replace(CODES,''):n).replace(/\s+([;,.])/g,'$1').replace(/\s{2,}/g,' ').trim();if(n!==t)el.textContent=n;};new MutationObserver(run).observe(el,{childList:true,characterData:true,subtree:true});run();}
 for(const id of Object.keys(RULES))humanize(id);
 const QL={'ДЕЙСТВУЮЩИХ ТЕЛ':['элемент в модели','элемента в модели','элементов в модели'],'ТЕЛ В МОДЕЛИ':['элемент в модели','элемента в модели','элементов в модели']/* 1.0.6 п. 4: подпись KPI у выпуска с counts_definitions — счётчик слева тот же */,'ИСТОРИЧЕСКИХ ТЕЛ':['исторический элемент','исторических элемента','исторических элементов'],'ВСПОМОГАТЕЛЬНЫХ ТЕЛ':['вспомогательный элемент','вспомогательных элемента','вспомогательных элементов']};
 const countSync=()=>{const nc=window.AtlasNodes?.caption?.();if(nc&&(nc.mode==='overlay'||nc.rebar)){leftCount.textContent=nc.text;return;}const t=$('quantityLabel').textContent.trim();if(PL&&/НЕ ФИЗИЧЕСКИЕ СУММЫ/.test(t)&&(()=>{try{const st=window.__ATLAS.revisions().state();return st.scope==='WORLD_REVIEW'&&st.reviewPackage===PL.package_no;}catch(e){return false;}})()/* К1: слой «По РД» — состояние ревизий, не текст заголовка */){const n=(PL.placed_render_ids||[]).length;leftCount.textContent=PLT.count_line?LT('count_line',{n}):fmt(n)+' '+S.plural(n,'тип','типа','типов')+' по РД · не входят в подсчёт';return;}   /* 1.0.16 B3-12 (A9): строка из данных (count_line), иначе прежняя */const nn=Number(($('nCandidate').textContent||'').replace(/\D/g,''));if(t==='ТЕЛ АРМИРОВАНИЯ И УЗЛОВ'&&nn){leftCount.textContent=fmt(nn)+' '+S.plural(nn,'элемент','элемента','элементов')+' · армирование и узлы';return;}if(t==='ТЕЛ АРМИРОВАНИЯ'&&nn){leftCount.textContent=fmt(nn)+' '+S.plural(nn,'элемент','элемента','элементов')+' армирования';return;}if(/РАЗМЕЩ[ЁЕ]ННЫХ ПАКЕТОВ/.test(t)&&nn){leftCount.textContent=fmt(nn)+' '+S.plural(nn,'размещённый тип','размещённых типа','размещённых типов');return;}leftCount.textContent=$('nCandidate').textContent+' '+(QL[t]?S.plural(nn,...QL[t]):t.toLowerCase());};
 /* V12.2 · E2: раздел и готовность сцены — события движка atlas:scope / atlas:sceneready; без E2 — наблюдатели #sectionTitle, #nCandidate, #quantityLabel */
 document.addEventListener('atlas:scope',()=>{countSync();layerSync();queueMicrotask(staleFrom);queueMicrotask(crumbsSync);});   /* 1.0.19a A-03: путь — и по смене уровня */document.addEventListener('atlas:sceneready',countSync);
 document.addEventListener('atlas:ready',()=>{if(E2())return;new MutationObserver(()=>{countSync();layerSync();}).observe($('sectionTitle'),{childList:true,characterData:true,subtree:true});
  new MutationObserver(countSync).observe($('nCandidate'),{childList:true,characterData:true,subtree:true});new MutationObserver(countSync).observe($('quantityLabel'),{childList:true,characterData:true,subtree:true});},{once:true});countSync();
 /* V12.4 · P7: treeExtras (подписи «образец узла» и ссылка Фп-1 Л-1 в скрытом дереве движка #albumTreeItems) убран — дерево не видно с V12.1h, при albumTree=false не строится */

 /* ---------- старт без выбора ---------- */
 // Движок при запуске выбирает первый элемент сцены. Выбор снимается снаружи, через тот же список #list:
 // select('') оставляет selection пустым, и кнопки «Скрыть»/«Изолировать» не срабатывают.
 let noSelection=!hashParams().get('id'),hashNav=false,userPick=false;
 const E8=()=>!!(window.__ATLAS&&window.__ATLAS.features&&window.__ATLAS.features.deselect&&window.__ATLAS.features.selectionChange);
 /* V12.2 · E8: снятие выбора — __ATLAS.deselect(); без E8 — скрытая кнопка в #list */
 function deselect(){const had=!!window.__FULL_ATLAS?.selected();if(E8())window.__ATLAS.deselect();else{const list=$('list'),b=document.createElement('button');b.type='button';b.dataset.id='';b.hidden=true;list.append(b);b.click();b.remove();}window.__R23?.request();noSelection=true;
  try{const h=hashParams();if(h.has('id')){h.delete('id');history.replaceState(null,'','#'+h);}}catch(e){}
  if(innerWidth<=850)right.classList.remove('open');if(!E8())document.dispatchEvent(new Event('atlas:deselect'));V.sync();if(!(E8()&&had))crumbsSync();}   /* V12.4 · P6: atlas:deselect — только без E8 (B3 подтвердила: при E8 слушает atlas:selectionchange) */   /* V12.3 · U1: при E8 крошки обновит atlas:selectionchange — без второго вызова */
 // V12.0 · R3-01: снятие выбора — наружу для B3 («×» и Esc на ПК возвращают «Сводку»)
 window.AtlasPrototype=Object.assign(window.AtlasPrototype||{},{deselect,setLevel,level:()=>{try{return window.__ATLAS.level()||'';}catch(e){return '';}}});
 /* 1.0.19a A-03: уровень — API оболочки, без щелчка по кнопке левой панели (на телефоне «Состав» не открывается).
    Путь — __ATLAS.restoreView(текущий вид с level и разделом «Всё здание», как у кнопки уровня), адрес — setHashParams; скрытые вне уровня возвращаются.
    Нет API — null (вызывающий идёт прежним путём). */
 function setLevel(lev){const A=window.__ATLAS;lev=typeof lev==='string'?lev:'';if(!A||typeof A.capture!=='function'||typeof A.restoreView!=='function')return Promise.resolve(null);
  let v,hid=[];try{v=A.capture();hid=(A.hiddenState&&A.hiddenState().ids)||[];}catch(e){return Promise.resolve(null);}
  v=Object.assign({},v,{scope:'BUILDING',level:lev});
  let pr;try{pr=Promise.resolve(A.restoreView(v));}catch(e){return Promise.resolve(null);}
  return pr.then(r=>{try{const now=new Set((A.hiddenState&&A.hiddenState().ids)||[]),miss=hid.filter(id=>!now.has(id));if(miss.length&&A.hide)A.hide(miss);}catch(e){}
   try{if(A.setHashParams)A.setHashParams({scope:'BUILDING',level:lev||null});}catch(e){}crumbsSync();return r||true;},()=>null);}
 // V12.0b · 10: #scope=REBAR_OD:*&id=<тело по щелчку> — тела догружаются (rebar_ondemand.js) после проверки адреса движком; повторить выбор после atlas:rebarod
 document.addEventListener('atlas:rebarod',()=>setTimeout(()=>{if((window.__ATLAS&&window.__ATLAS.features&&window.__ATLAS.features.hashKeep))return;   /* V12.2 · E4: выбор из адреса в REBAR_OD движок делает сам */
  const h=hashParams(),sc=h.get('scope')||'',id=h.get('id');if(!id||!sc.startsWith('REBAR_OD:')||window.__FULL_ATLAS?.selected()?.renderId===id)return;
  try{if(curScope()!==sc)window.__ATLAS.setScope(sc);setTimeout(()=>{try{window.__ATLAS.select(id);noSelection=false;right.classList.add('open');crumbsSync();}catch(e){}},0);}catch(e){}},0));
 window.addEventListener('hashchange',()=>{hashNav=true;setTimeout(()=>{hashNav=false;},0);},true);
 document.addEventListener('atlas:selection',()=>{userPick=true;noSelection=false;});
 /* V12.2 · E8: смена выбора — atlas:selectionchange (старт без выбора — __ATLAS_OPTIONS.autoSelect=false); без E8 — наблюдатель #selectedName и снятие автоматического выбора */
 document.addEventListener('atlas:selectionchange',e=>{if(e.detail&&e.detail.id)noSelection=false;else document.title=(window.AtlasShell&&AtlasShell.pageTitle?AtlasShell.pageTitle():'3D Атлас');queueMicrotask(crumbsSync);});
 document.addEventListener('atlas:ready',()=>{if(E8())return;new MutationObserver(()=>{queueMicrotask(()=>{
  if(hashNav){hashNav=false;if(hashParams().get('id'))noSelection=false;}
  if(userPick){userPick=false;}else if(noSelection&&window.__FULL_ATLAS?.selected())deselect();
  crumbsSync();
 });}).observe($('selectedName'),{childList:true,characterData:true,subtree:true});},{once:true});

 /* ---------- подписи для экранного диктора, компактная панель сцены (п. 6, 8) ---------- */
 $('menu').setAttribute('aria-label','Разделы модели');$('menu').setAttribute('aria-controls','left');
 // Запись — только при смене значения: класс body движок меняет часто, лишний setAttribute дёргает пересчёт стилей (замер A, L · В2).
 const menuBtn=$('menu');let menuLast=null;const menuSync=()=>{const v=String(matchMedia('(max-width: 850px)').matches?left.classList.contains('open'):!document.body.classList.contains('nav-collapsed'));if(v!==menuLast){menuLast=v;menuBtn.setAttribute('aria-expanded',v);}};
 new MutationObserver(menuSync).observe(left,{attributes:true,attributeFilter:['class']});new MutationObserver(menuSync).observe(document.body,{attributes:true,attributeFilter:['class']});menuSync();
 for(const b of [...tools.querySelectorAll('button'),$('quickRestore'),$('card')]){const t=(b.textContent||'').trim();if(t&&!b.getAttribute('aria-label'))b.setAttribute('aria-label',t);if(t&&!b.title)b.title=t;}
 $('viewSettingsToggle').setAttribute('aria-label','Инструменты');
 // Название вкладки — по выбранному элементу.
 document.addEventListener('atlas:part',()=>crumbsSync());   /* 1.0.16 B3-2 */
 document.addEventListener('atlas:card',()=>{const t=$('cardTitle')?.textContent;if(t)document.title=t+' · Модель · 3D Атлас';});
 document.addEventListener('atlas:deselect',()=>{if(!E8())document.title=(window.AtlasShell&&AtlasShell.pageTitle?AtlasShell.pageTitle():'3D Атлас');});   /* E8: заголовок — по atlas:selectionchange */

 /* ---------- переход «В здании» из замечания или каталога: плашка над сценой (п. 7) ---------- */
 const fromBar=make('div','from-banner');fromBar.hidden=true;fromBar.setAttribute('role','region');fromBar.setAttribute('aria-label','Откуда открыт элемент');stage.append(fromBar);
 let fromId=null,fromTransparent=false;
 // V12.2 · M1: from= запоминается при загрузке и на hashchange (до openLayerTarget/setReviewPackage, которые переписывают адрес без from) — вместе с id
 let fromPending=null;const keepFrom=h=>{const q=new URLSearchParams(String(h||'').slice(1)),f=q.get('from');if(f)fromPending={from:f,id:q.get('id'),t:Date.now()};};
 keepFrom((window.__ATLAS&&window.__ATLAS.features&&window.__ATLAS.features.hashKeep)?location.hash:window.__ATLAS_START_HASH);   /* V12.2 · E4: from= движок сохраняет в адресе */addEventListener('hashchange',()=>keepFrom(location.hash),true);
 function setThrough(on){fromTransparent=on;const sel=window.__FULL_ATLAS?.selected()?.renderId;V.through('from',on?[sel]:null);   /* V12.2 · M4: через общую функцию — выход возвращает прозрачность как до входа */
 const b=fromBar.querySelector('.from-through');if(b){b.setAttribute('aria-pressed',String(on));b.textContent=on?'Вернуть окружение':'Показать сквозь окружение';}}
 function staleFrom(){const o=window.__FULL_ATLAS?.selected();if(fromId&&(!o||o.renderId!==fromId)){fromBar.hidden=true;if(fromTransparent)setThrough(false);fromId=null;}}
 function showFrom(force){let from=hashParams().get('from');const o=window.__FULL_ATLAS?.selected();
  /* V12.2 · M1 (316/316): выбор ещё не перешёл на тело из адреса (смена адреса в той же вкладке) — не строить плашку для прежнего тела и не убирать from; запасной повтор через 1,5 с (id-псевдонимы) */
  {const hid=hashParams().get('id');if(!force&&from&&o&&hid&&o.renderId!==hid){setTimeout(()=>showFrom(true),1500);return;}}if(fromPending&&Date.now()-fromPending.t>10000)fromPending=null;if(!from&&o&&fromPending&&(!fromPending.id||fromPending.id===o.renderId)){from=fromPending.from;fromPending=null;}if(!from||!o){staleFrom();return;}fromId=o.renderId;fromBar.replaceChildren();
  const isType=/^Тип № /.test(from);const back=isType?'catalogue-model.html#package/'+encodeURIComponent(from.replace(/\D/g,'')):'RD_REMARKS.html#id='+encodeURIComponent(from);
  fromBar.append(make('span','',isType?'Элемент типа ':'Элемент из замечания '),make('b','',isType?from.replace('Тип ',''):from));
  const t=make('button','from-through','Показать сквозь окружение');t.type='button';t.setAttribute('aria-pressed','false');t.onclick=()=>setThrough(!fromTransparent);
  const iso=make('button','','Показать только это');iso.type='button';iso.onclick=()=>$('isolate').click();   /* 1.0.19a A-11: словарь */
  const a=make('a','',isType?'← К типу':'← К замечанию');a.href=back;
  const x=make('button','from-close','×');x.type='button';x.setAttribute('aria-label','Скрыть плашку');x.onclick=()=>{fromBar.hidden=true;if(fromTransparent)setThrough(false);};
  fromBar.append(t,iso,a,x);fromBar.hidden=false;try{const A=window.__ATLAS;if(A&&A.features&&A.features.hashKeep&&A.setHashParams&&hashParams().has('from'))A.setHashParams({from:null});}catch(e){}   /* V12.2 · E4: from= показан — из адреса убрать, иначе плашка встанет на следующий выбор */
  afterReady(()=>$('focusSelected').click(),300);}
 /* V12.2 · M1 после E2/E4: выбор из адреса приходит позже whenReady — пока from= в адресе (E4 хранит его до показа) и плашка не для выбранного тела, показать её на выборе */
 const fromOnSel=()=>{const o=window.__FULL_ATLAS?.selected();if(o&&o.renderId!==fromId&&(hashParams().has('from')||(fromPending&&fromPending.id===o.renderId)))setTimeout(showFrom,0);};document.addEventListener('atlas:selectionchange',fromOnSel);
 document.addEventListener('atlas:selection',()=>{const o=window.__FULL_ATLAS?.selected();if(fromPending&&o&&fromPending.id===o.renderId)setTimeout(showFrom,0);else fromOnSel();if(fromId&&(!o||o.renderId!==fromId)){fromBar.hidden=true;if(fromTransparent)setThrough(false);fromId=null;}});

 /* ---------- клавиатура (п. 5 отчёта дизайнера) ---------- */
 $('sectionTitle').setAttribute('tabindex','-1');
 // После смены раздела — фокус на заголовок раздела (кнопка раздела пересоздаётся движком).
 document.addEventListener('click',e=>{if(e.target.closest('.placed-node,.placed-switch,#navBuilding,.stage-path .crumb,#levelChoices button,#placedLayerBtn')&&!e.target.closest('#list'))setTimeout(()=>{if(!document.activeElement||document.activeElement===document.body||!document.activeElement.isConnected||e.target.closest('#levelChoices,.stage-path'))$('sectionTitle').focus({preventScroll:false});},60);},true);
 // «Элементы раздела»: виртуальный список пересоздаёт строки — вернуть фокус на строку с тем же data-id (временная защита до правки движка).
 let listFocusId=null;const list=$('list');
 list.addEventListener('focusin',e=>{const b=e.target.closest('button[data-id]');if(b&&b.dataset.id)listFocusId=b.dataset.id;});
 list.addEventListener('focusout',e=>{if(e.relatedTarget&&!list.contains(e.relatedTarget))listFocusId=null;});
 new MutationObserver(()=>{if(!listFocusId)return;const a=document.activeElement;if(a&&a!==document.body&&a.isConnected)return;const row=list.querySelector('button[data-id="'+CSS.escape(listFocusId)+'"]');if(row)row.focus({preventScroll:true});}).observe(list,{childList:true,subtree:true});
 $('closeDrawing').textContent='Закрыть чертёж';
 // Подпись «АС.2 · лист 56 · стр. PDF 66»; служебный текст — только в режиме проверки.
 const cap=$('drawingCaption');let capBusy=false;
 new MutationObserver(()=>{if(capBusy)return;const t=cap.textContent;if(!t||cap.querySelector('.review-only'))return;const hit=window.__atlasDrawingHint||null;const album=(t.split(' · ')[0]||'').replace(/\s+л\..*$/,'').trim();const sheet=hit?.sheet||(/печатный лист (\S+)/.exec(t)||[])[1];const pdf=hit?.pdf||(/страница PDF (\d+)/.exec(t)||[])[1];if(!sheet&&!pdf)return;capBusy=true;cap.replaceChildren(document.createTextNode(album+(sheet?' · лист '+sheet:'')+(pdf?' · стр. PDF '+pdf:'')),make('span','review-only',' · '+t));capBusy=false;window.__atlasDrawingHint=null;}).observe(cap,{childList:true,characterData:true,subtree:true});
 // Единый просмотрщик чертежей (assets/atlas-viewer.js): тот же вид и порядок кнопок, что в «Чертежах».
 const modal=$('modal');
 window.AtlasViewer?.enhance({root:modal,bar:modal.querySelector('.modalbar'),close:$('closeDrawing'),minus:$('drawingZoomOut'),plus:$('drawingZoomIn'),fit:$('drawingReset'),pdf:$('fullDrawing'),caption:$('drawingCaption'),img:$('drawingImg'),isOpen:()=>modal.classList.contains('open'),closeLabel:'Закрыть чертёж',returnTo:o=>(o&&o.isConnected&&o.offsetParent)?o:([$('cardDrawing'),document.querySelector('#right .card-mobile-actions .card-primary')].find(x=>x&&x.offsetParent)||null)});

 /* ---------- синхронизация ---------- */
 let scheduled=false;
 const sync=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;
  emptySync();
  quickRestore.classList.toggle('is-needed',Number(window.__R23?.summary().hidden)>0||!!window.__R23?.summary().isolated);
  homeSync();
 });};
 /* 1.0.19a A-04: сообщение «Ничего не найдено» пишет search() (view-settings.js); здесь — только прятать его, пока группы узлов и «Замечания / Типы / Листы» не пришли
    для этого запроса, и если хоть одна группа найдена («не найдено» при найденной группе не пишется) */
 let groupsQ=null;
 function emptySync(){const m=$('r23SearchCount')?.querySelector('.search-empty');if(!m)return;const q=search.value.trim(),found=!nodesHost.hidden||!!groupsHost.querySelector('.sg-item,.sg-error');   /* 1.1.1 B3: сбой индекса — не «ничего не найдено» */const hide=found||groupsQ!==q;if(m.hidden!==hide)m.hidden=hide;}
 document.addEventListener('atlas:searchmsg',()=>emptySync());
 /* ---------- 1.0.19a A-02: ↺ «Как при открытии» ----------
    Начальный вид — после atlas:ready и готовности сцены (с #view= — после его применения): __R24.capture() + набор разделов и группы «По РД» (AtlasNodes), без выбора.
    Возврат — AtlasViewLink.apply (раздел, уровень, сечение, скрытые, изоляция, набор; без перезагрузки, atlas-viewlink.js не меняется); затем «3D» и изометрия.
    Кнопка видна, пока отличается раздел, уровень, сечение, изоляция, скрытые, набор, группы «По РД» или включён «План». */
 let homeView=null,homeBase=null,homeBusy=false;
 function homeNow(){let c=null;try{c=window.__R24&&window.__R24.capture?window.__R24.capture():null;}catch(e){c=null;}if(!c)return null;let si=null,pi=null;try{si=window.AtlasNodes?.sections?.()||null;}catch(e){si=null;}try{pi=window.AtlasNodes?.placed?.()||null;}catch(e){pi=null;}
  const pv=document.querySelector('[data-view="plan"]'),sl=c.slice&&c.slice.axis&&c.slice.axis!=='none'?[c.slice.axis,c.slice.value,!!c.slice.flip]:null;
  return {c,si,pi,k:JSON.stringify([c.scope,c.level||'',c.section||null,sl,!!c.isolated,(c.hidden||[]).length,si&&si.on?si.keys:null,si&&si.on?si.level||null:null,pi&&pi.on?pi.ids:null,!!(pv&&pv.getAttribute('aria-pressed')==='true')])};}
 function homeCapture(){const L=window.AtlasViewLink,n=homeNow();if(!n||!L||typeof L.encode!=='function'||typeof L.decode!=='function'||typeof L.apply!=='function')return;const v=n.c;
  if(n.si&&n.si.on){v.sections=n.si.keys.slice();if(n.si.level){v.setLevel=n.si.level;if(n.si.levelNode)v.setNode=n.si.levelNode;}}if(n.pi&&n.pi.on)v.placed=n.pi.ids.slice();
  delete v.selection;try{homeView=L.decode(L.encode(v));}catch(e){homeView=null;}homeBase=homeView?n.k:null;homeSync();}
 function homeSync(){if(!homeView||homeBusy){quickHome.classList.remove('is-needed');return;}const n=homeNow();quickHome.classList.toggle('is-needed',!!n&&n.k!==homeBase);}
 async function goHome(){const L=window.AtlasViewLink;if(!homeView||!L||homeBusy)return;homeBusy=true;quickHome.classList.remove('is-needed');
  try{const N=window.AtlasNodes;if(N&&N.state&&N.state().k&&N.close)await N.close();}catch(e){}
  try{await L.apply(JSON.parse(JSON.stringify(homeView)));}catch(e){}
  try{const iv=document.querySelector('[data-view="iso"]'),c=window.__R24.capture().camera,t=2*Math.PI,nz=a=>((a%t)+t)%t,isIso=!!c&&Math.abs(c.el-0.43)<0.01&&Math.abs(nz(c.az)-1.1)<0.01;
   if(iv){if(!isIso&&typeof iv.onclick==='function')iv.onclick();document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===iv)));}}catch(e){}
  try{if(window.__ATLAS.setHashParams)window.__ATLAS.setHashParams({level:homeView.level||null});}catch(e){}
  homeBusy=false;crumbsSync();sync();(quickRestore.offsetParent?quickRestore:$('canvas'))?.focus?.({preventScroll:true});}
 window.AtlasPrototype.home=()=>goHome();window.AtlasPrototype.homeChanged=()=>quickHome.classList.contains('is-needed');
 document.addEventListener('atlas:ready',()=>{const hv=hashParams().has('view');let done=false;const go=()=>{if(done)return;done=true;setTimeout(homeCapture,300);};
  if(hv)document.addEventListener('atlas:viewlink',()=>afterReady(go,0),{once:true});afterReady(()=>setTimeout(go,hv?15000:200),300);},{once:true});
 for(const ev of ['atlas:scope','atlas:section','atlas:sections','atlas:isolate','atlas:node','atlas:viewlink','atlas:selectionchange'])document.addEventListener(ev,()=>sync());
 new MutationObserver(sync).observe($('viewSearchResults'),{childList:true});
 let oldBackground=V.state().background;new MutationObserver(()=>{if(oldBackground!==V.state().background){oldBackground=V.state().background;themeSync();}}).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('click',e=>{if(e.target.closest('#list .row'))right.classList.add('open');const view=e.target.closest('[data-view]');if(view)document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===view)));if(innerWidth<=850&&e.target.closest('#navBuilding'))left.classList.remove('open');if(e.target.closest('button'))sync();});
 document.addEventListener('atlas:selection',()=>right.classList.add('open'));
 document.addEventListener('atlas:card',crumbsSync);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!searchPopover.hidden)escTake(e);closeSearch();}});
 window.addEventListener('hashchange',()=>{applyQuery();openLayerTarget();afterReady(showFrom,200);afterReady(staleFrom,1500);if(hashParams().has('help'))S.onHelp();setTimeout(crumbsSync,0);});
 // V12.1: узел открыт / закрыт / армирование — подписи раздела и «крошки» по AtlasNodes
 document.addEventListener('atlas:node',()=>setTimeout(()=>{countSync();crumbsSync();},0));
 document.addEventListener('atlas:sections',()=>setTimeout(crumbsSync,0));   /* V12.2 · M15 */
 document.addEventListener('atlas:ready',()=>{themeSync();sync();setTimeout(()=>{if(noSelection&&!hashParams().get('id')){if(window.__FULL_ATLAS?.selected())deselect();}else{noSelection=false;if(window.__FULL_ATLAS?.selected())right.classList.add('open');}applyQuery();openLayerTarget();layerSync();crumbsSync();afterReady(showFrom,200);},0);});
 themeSync();sync();
 if(innerWidth<=850)right.classList.remove('open');
 window.AtlasBoot?.ready();
})();

/* Read-only presentation of explicit passport fields; never infer fabrication data. */
(function (root) {
  'use strict';
  const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
  const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  const format = value => value.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
  function fields(passport, object) {
    const p = passport || {}, dimensions = [], position = [], specification = [];
    const addText = (rows, label, key) => { const value = text(p[key]); if (value) rows.push({ label, value, field: key }); };
    const addNumber = (rows, label, key, unit) => {
      const value = number(p[key]); if (value !== null) rows.push({ label, value: `${format(value)} ${unit}`, field: key });
    };
    const materials = [];
    addText(materials, 'Материал', 'material');
    addText(materials, 'Марка стали', 'steel_grade');
    addText(materials, 'Класс арматуры', 'reinforcement_grade');
    addNumber(dimensions, 'Длина по источнику', 'source_length_mm', 'мм');
    // 1.0.19a A-11 (словарь): «по паспорту» → «по исходным данным» (подписи интерфейса; поля и значения данных не меняются)
    addNumber(dimensions, 'Длина стержня по исходным данным', 'bar_length_mm', 'мм');
    addNumber(dimensions, 'Диаметр стержня', 'bar_diameter_mm', 'мм');
    addNumber(dimensions, 'Толщина по исходным данным', 'thickness_mm', 'мм');
    addNumber(dimensions, 'Длина по исходным данным (length_mm)', 'length_mm', 'мм');
    addNumber(dimensions, 'Длина по исходным данным (length_m)', 'length_m', 'м');
    // Verified own concrete body; the same field on rebar can describe its parent.
    if ((((window.ATLAS_PROJECT || {}).card || {}).nominal_body_ids || []).includes(p.id) && p.position === 'Бетон' && /^Бетон(?:\s|$)/u.test(p.material || '') && Array.isArray(p.nominal_body_size_mm) && p.nominal_body_size_mm.length === 3 && p.nominal_body_size_mm.every(v => number(v) !== null)) {
      dimensions.push({label:String((((window.ATLAS_TEXTS||{}).card||{}).nominal_body_label)||'Номинальный размер элемента по исходным данным').replace('{assembly_mark}',p.assembly_mark||'').replace(/\s+/g,' '),value:p.nominal_body_size_mm.map(format).join(' × ')+' мм',field:'nominal_body_size_mm'});
    }
    if (Array.isArray(p.dimensions_mm) && p.dimensions_mm.length === 3 && p.dimensions_mm.every(v => number(v) !== null)) {
      dimensions.push({label:'Размеры по исходным данным (порядок источника)',value:p.dimensions_mm.map(format).join(' × ')+' мм',field:'dimensions_mm'});
    }
    const bounds = object?.bounds;
    let modelBounds = null;
    if (Array.isArray(bounds) && bounds.length === 2 && bounds.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) {
      const sizes = bounds[1].map((value, i) => value - bounds[0][i]);
      if (sizes.every(value => value >= 0)) modelBounds = sizes.map(format).join(' × ') + ' м';
    }
    if(window.AtlasShell?.siteFeature?.('levels')!==false)addText(position, 'Уровень по исходным данным', 'floor');
    addText(position, 'Положение по исходным данным', 'location_label');
    addText(position, 'Родитель / узел', 'parent_id');
    addText(position, 'Направление по исходным данным', 'direction');
    const axis = text(object?.albumRecord?.axis);
    if (axis) position.push({label:'Оси по реестру',value:axis,field:'albumRecord.axis'});
    addText(position, 'Ориентация по исходным данным', 'nominal_orientation');
    for (const [key, label] of [['top_level_m','Отметка верха по исходным данным'],['bottom_level_m','Отметка низа по исходным данным']]) {
      if (typeof p[key] === 'number' && Number.isFinite(p[key])) position.push({label,value:format(p[key])+' м',field:key});
    }
    addText(specification, 'Марка сборки', 'assembly_mark');
    addText(specification, 'Марка', 'mark');
    addText(specification, 'Позиция', 'position');
    addNumber(specification, 'Количество сборки по исходным данным', 'assembly_count', 'шт.');
    addNumber(specification, 'Количество стержней по исходным данным', 'bar_count', 'шт.');
    addNumber(specification, 'Масса единицы по источнику', 'source_unit_mass_kg', 'кг');
    addText(specification, 'Источник', 'source');
    // V12.6 · R3 (решение координатора, вариант б): «Редакция добавления» — только V12_2 / V12_3 как «Добавлено в выпуске · V12.2 / V12.3» (33 и 1 599 тел); служебные метки сборки (R10 local, L_V3, R08…) не показываются, данные не трогаются
    { const rv = text(p.revision_added), m = rv && /^V12_([23])$/.exec(rv); if (m) specification.push({ label: 'Добавлено в выпуске', value: 'V12.' + m[1], field: 'revision_added' }); }
    addText(specification, 'Обоснование размеров и привязки', 'source_dimension_basis');
    return {
      materials, dimensions, position, specification, modelBounds,
      notes: [...new Set([text(p.note), text(p.confidence), p.anchor_hole_not_modeled === true ? 'Отверстия анкеров не моделировались.' : null].filter(Boolean))],
      fabricationIncomplete: p.fabrication_geometry_complete === false || p.partial_geometry === true || p.geometry_complete === false,
      modelBoundsLabel: 'Габарит модели по X/Y/Z · не для изготовления',
      missingMaterial: 'Нет данных в источнике'
    };
  }
  // A changing selection invalidates both success and failure from older requests.
  function selectionLoader(load, publish) {
    let generation = 0;
    return async object => {
      const current = ++generation;
      publish({ state: object ? 'loading' : 'empty', object });
      if (!object) return;
      try {
        const passport = await load(object);
        if (current === generation) publish({ state: 'ready', object, data: fields(passport, object) });
      } catch {
        if (current === generation) publish({ state: 'error', object });
      }
    };
  }
  root.AtlasEngineeringFields = { fields, selectionLoader };
})(typeof window === 'undefined' ? globalThis : window);

