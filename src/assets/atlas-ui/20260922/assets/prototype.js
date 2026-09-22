/* Atlas working UI prototype. Original model/data and original controls are retained. */
'use strict';
(()=>{
 const $=id=>document.getElementById(id), one=s=>document.querySelector(s);
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;};
 const icon=name=>{const i=make('img','ui-icon');i.src=window.AtlasUIIcons[name];i.alt='';i.setAttribute('aria-hidden','true');return i;};
 const label=(el,name,text)=>{el.replaceChildren(icon(name),make('span','',text));};
 const btn=(id,text,name,fn)=>{const b=make('button','ui-button');b.type='button';b.id=id;label(b,name,text);b.onclick=fn;return b;};
 const header=one('header'),stage=one('.stage'),left=$('left'),right=$('right'),tools=one('.tools'),V=window.AtlasViewSettings;
 document.body.classList.add('atlas-prototype');
 // Keep the native controls and event handlers; reorganize their containing surfaces.
 const brand=one('.brand');brand.className='atlas-brand';brand.replaceChildren();
 const mark=make('img','atlas-mark');mark.src='assets/atlas-mark-v3.png';mark.alt='';brand.append(mark,make('strong','','3D Атлас'));
 const project=make('div','atlas-project');project.append(make('strong','','Троицк · Б24'),make('small','','Данные V8 · интерфейс 22.09.2026'));
 const oldRelease=one('.release');oldRelease.replaceWith(project);
 const searchBox=make('div','global-search');searchBox.append(icon('magnifying-glass'));
 const search=$('search');search.placeholder='Найти элемент по названию или марке';search.setAttribute('aria-label','Найти элемент');search.setAttribute('autocomplete','off');search.setAttribute('aria-controls','searchPopover');searchBox.append(search);
 const key=make('kbd','','⌘ K');searchBox.append(key);header.insertBefore(searchBox,one('.header-links'));
 const searchPopover=make('section','search-popover');searchPopover.id='searchPopover';searchPopover.hidden=true;searchPopover.setAttribute('aria-label','Поиск по модели');
 const scopeLabel=$('r23SearchScope').parentElement;searchPopover.append(scopeLabel,$('r23SearchCount'),$('viewSearchResults'));searchBox.append(searchPopover);
 $('r23SearchScope').value='building';
 for(const e of [...$('viewSettings').children])if(e.tagName==='H3'&&e.textContent==='Поиск'||e.tagName==='P'&&e.textContent.includes('Ctrl/'))e.remove();
 const showSearch=()=>{searchPopover.hidden=false;search.setAttribute('aria-expanded','true');if(!search.value)$('r23SearchCount').textContent='Введите название, марку или ID. Можно искать по всему зданию.';};
 const closeSearch=()=>{searchPopover.hidden=true;search.setAttribute('aria-expanded','false');};
 search.addEventListener('focus',showSearch);search.addEventListener('input',showSearch);
 document.addEventListener('atlas:search',()=>{search.focus();showSearch();});
 search.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();$('viewSearchResults').querySelector('button')?.focus();}if(e.key==='Escape'){closeSearch();search.blur();}});
 searchPopover.addEventListener('keydown',e=>{const rows=[...$('viewSearchResults').querySelectorAll('button')],i=rows.indexOf(document.activeElement);if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();rows[Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowDown'?1:-1)))]?.focus();}});
 searchPopover.addEventListener('click',e=>{if(e.target.closest('.r23-result')){closeSearch();left.classList.remove('open');}});
 document.addEventListener('pointerdown',e=>{if(!searchBox.contains(e.target))closeSearch();});
 // Project resources: every former header destination remains available.
 const links=one('.header-links');links.className='project-resources';links.id='projectResources';links.setAttribute('aria-label','Разделы проекта');links.hidden=true;
 const resourceHead=make('div','popover-title');resourceHead.append(make('strong','','Разделы проекта'));links.prepend(resourceHead);
 const resourceNames={'index.html':['cube','Модель здания'],'auxiliary.html':['stack','Типы и варианты'],'library.html':['file-text','Чертежи и реестр'],'catalogue.html':['book-open','Каталог моделей'],'DOCUMENTS.html':['file-text','Документы']};
 for(const a of links.querySelectorAll('a')){const info=resourceNames[a.getAttribute('href')];if(info)label(a,info[0],info[1]);}
 const extra=make('a');extra.href='UNPLACED.html';label(extra,'link-break','Без привязки · 47');links.append(extra);
 const history=make('a');history.href='HISTORY_MATERIALS.html';label(history,'clock-counter-clockwise','Исторические материалы');links.append(history);
 const register=one('body > a[href="R25_UPDATE_LOG.html"]');if(register){register.removeAttribute('style');label(register,'clock-counter-clockwise','История обновлений');links.append(register);}
 const headerActions=make('div','header-actions');header.append(headerActions);headerActions.append(links);
 const resources=btn('projectMenu','Проект','squares-four',()=>{links.hidden=!links.hidden;resources.setAttribute('aria-expanded',String(!links.hidden));});resources.setAttribute('aria-label','Разделы проекта');resources.setAttribute('aria-expanded','false');resources.setAttribute('aria-controls',links.id);headerActions.prepend(resources);
 const help=btn('helpToggle','Помощь','question',()=>helpDialog.showModal());headerActions.append(help);const mobileHelp=btn('projectHelp','Как работать с атласом','question',()=>{links.hidden=true;resources.setAttribute('aria-expanded','false');helpDialog.showModal();});links.append(mobileHelp);help.title='Как работать с атласом';
 const theme=btn('themeToggle','Тема','moon',()=>V.set('background',V.state().background==='dark'?'light':'dark'));theme.title='Светлый или тёмный интерфейс';headerActions.append(theme);
 document.addEventListener('pointerdown',e=>{if(!headerActions.contains(e.target)){links.hidden=true;resources.setAttribute('aria-expanded','false');}});
 // Compact navigation keeps scope, hierarchy, level, study and every variant control.
 const navTitle=make('div','navigation-heading');navTitle.append($('sectionTitle'));left.prepend(navTitle);
 const closeLeft=left.querySelector('[data-close="left"]');closeLeft.textContent='Закрыть';navTitle.append(closeLeft);
 const studies=$('studyNavigation');left.append(studies);
 const navLinks=one('.nav-links');left.append(navLinks);
 const note=one('#left > p.sub');if(note){note.className='navigation-footnote';note.textContent='Тип в каталоге и элемент в здании — разные записи. Неподтверждённые размещения показаны отдельно.';left.append(note);}
 const elementDetails=make('details','element-list');elementDetails.id='elementListDetails';elementDetails.append(make('summary','','Элементы раздела'));$('listCount').before(elementDetails);elementDetails.append($('listCount'),$('list'));
 const tree=$('albumTree');tree.querySelectorAll('button').forEach(b=>{if(b.id==='albumRoot')b.textContent='Всё здание';if(b.id==='albumUp')b.textContent='На уровень выше';});
 // Main controls are always within reach; specialised controls remain in grouped tools.
 label($('menu'),'sidebar-simple','Состав');label($('fit'),'arrows-out','Вписать');label($('card'),'info','Элемент');
 label($('quickAxes'),'crosshair','Оси');label($('quickLabels'),'tag','Подписи');label($('viewSettingsToggle'),'sliders-horizontal','Инструменты');
 $('viewSettings').setAttribute('aria-label','Инструменты модели');one('.r23-menu-head b').textContent='Инструменты модели';
 $('closeViewSettings').textContent='Закрыть';
 const topControls=make('div','stage-actions');stage.prepend(topControls);topControls.append($('menu'),$('fit'),$('card'));
 const bottomControls=make('div','view-controls');tools.prepend(bottomControls);
 for(const view of ['iso','plan']){const el=tools.querySelector('[data-view="'+view+'"]');label(el,view==='iso'?'cube':'stack',view==='iso'?'3D':'План');el.setAttribute('aria-pressed',String(view==='iso'));bottomControls.append(el);el.addEventListener('click',()=>{for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b===el));});}
 const quickGroup=one('.r23-quality-group');tools.append(quickGroup);quickGroup.prepend($('quickAxes'),$('quickLabels'));quickGroup.append($('viewSettingsToggle'));
 const zoom=make('div','zoom-controls');stage.append(zoom);zoom.append($('zoomIn'),$('zoomOut'));label($('zoomIn'),'plus','');label($('zoomOut'),'minus','');
 const graphics=[...$('viewSettings').querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent==='Графика и чёткость');
 const q=make('label','','Качество графики');q.append($('quality'));graphics.querySelector('summary').after(q);graphics.open=false;
 const quickRestore=btn('quickRestore','Показать всё','arrow-counter-clockwise',()=>$('restore').click());topControls.append(quickRestore);quickRestore.title='Вернуть скрытые элементы и окружение';
 const toolIntro=make('p','tool-intro','Настройки меняют только отображение. Геометрия и проектные данные сохраняются.');one('.r23-menu-head').after(toolIntro);
 // Inspector: human context first, full original properties remain available.
 const context=make('div','element-context');context.id='elementContext';$('selectedName').after(context);
 const tech=make('details','technical-details');tech.append(make('summary','','Технические сведения'));right.append(tech);tech.append($('selectedId'),$('props'));
 const warning=make('details','element-notes');warning.append(make('summary','','Сведения и ограничения'));$('objectWarning').before(warning);warning.append($('objectWarning'));warning.open=true;
 context.after($('drawing'));$('drawing').after(one('#right .actions')); // source is available before secondary technical details
 const fitElement=btn('fitElement','К элементу','crosshair',()=>$('focusSelected').click());one('#right .actions').append(fitElement);
 const sources=make('details','element-sources');sources.append(make('summary','','Связанные чертежи'));sources.open=true;$('pairHeading').before(sources);sources.append($('pairHeading'),$('pairs'));
 const helpDialog=make('dialog','atlas-dialog');helpDialog.id='atlasHelp';helpDialog.innerHTML='<form method="dialog"><button class="dialog-close">Закрыть</button></form><p class="eyebrow">3D АТЛАС</p><h2>От элемента — к чертежу</h2><ol><li><b>Найдите.</b> Введите название или марку сверху. Либо откройте раздел и уровень в «Составе».</li><li><b>Рассмотрите.</b> Выберите тело в модели. «К элементу» приблизит его, «Изолировать» уберёт окружение.</li><li><b>Сверьте.</b> Откройте связанный чертёж в карточке. Отсутствующий источник указан прямо.</li></ol><h3>Управление моделью</h3><p>Перетаскивание — вращение; Shift + перетаскивание — сдвиг; колесо или два пальца — масштаб. На телефоне два пальца также перемещают модель.</p><p>Сечения, прозрачность, размеры, ракурсы и экспорт находятся в «Инструментах». Кнопка «Показать всё» возвращает скрытые тела.</p><h3>Что означают данные</h3><p>10 412 действующих тел — состав исходной модели. 2 760 типов каталога учитываются отдельно. Для 47 размещений и 4 исторических профилей нет полного подтверждения. Наличие модели или чертежа само по себе не означает инженерную приёмку.</p><p class="help-keyboard">⌘ / Ctrl K — поиск · Esc — закрыть панель · Home — вписать модель</p>';document.body.append(helpDialog);
 helpDialog.addEventListener('click',e=>{if(e.target===helpDialog)helpDialog.close();});
 const themeSync=()=>{const dark=V.state().background==='dark';document.body.classList.toggle('ui-dark',dark);theme.setAttribute('aria-pressed',String(dark));label(theme,dark?'sun':'moon',dark?'Светлая':'Тёмная');};
 // Mutation observers update only independent UI regions, avoiding render loops.
 let scheduled=false;
 const sync=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;
  sources.querySelector('summary').textContent=$('pairHeading').textContent==='Исходные связи с чертежами'?'Связанные чертежи':$('pairHeading').textContent;
  const rows=[...$('props').children].filter(e=>e.tagName==='DIV');
  const field=name=>rows.find(d=>d.querySelector('span')?.textContent===name)?.querySelector('b')?.textContent;
  const level=field('Уровень'),status=field('Пространство / статус');context.replaceChildren();
  if(level){context.append(make('small','','ПОЛОЖЕНИЕ'),make('strong','',level));}
  if(status)context.append(make('span','element-state',status==='world / active'?'В действующей модели':status.includes('history')?'Историческое тело':status));
  const n=$('r23SearchCount');if(search.value&&!$('viewSearchResults').children.length&&!n.textContent.startsWith('Введите'))n.textContent='Ничего не найдено. Измените запрос или область поиска.';
  quickRestore.classList.toggle('is-needed',Number(window.__R23?.summary().hidden)>0||!!window.__R23?.summary().isolated);
 });};
 new MutationObserver(sync).observe($('props'),{childList:true,subtree:true});
 new MutationObserver(sync).observe($('viewSearchResults'),{childList:true});
 new MutationObserver(sync).observe($('pairHeading'),{childList:true});
 // Avoid observing classes altered by themeSync recursively.
 let oldBackground=V.state().background;const themeObserver=new MutationObserver(()=>{if(oldBackground!==V.state().background){oldBackground=V.state().background;themeSync();}});themeObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('click',e=>{if(e.target.closest('#list .row')||e.target.closest('#albumTreeItems .album-node')){if(e.target.closest('#list .row'))right.classList.add('open');}const view=e.target.closest('[data-view]');if(view)document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===view)));if(innerWidth<=850&&e.target.closest('#navBuilding'))left.classList.remove('open');if(e.target.closest('button'))sync();});
 document.addEventListener('atlas:selection',()=>right.classList.add('open'));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSearch();links.hidden=true;}});
 document.addEventListener('atlas:ready',()=>{themeSync();sync();});themeSync();sync();
 // Fresh visits start with the model unobstructed on small screens.
 if(innerWidth<=850)right.classList.remove('open');
})();
