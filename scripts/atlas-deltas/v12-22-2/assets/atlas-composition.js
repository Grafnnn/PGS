/* Состав модели и настройки вида. Фильтры, поиск и управление остаются у ядра. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const project = window.ATLAS_PROJECT || {};
  const phone = matchMedia('(max-width:850px)');
  const fmt = new Intl.NumberFormat('ru-RU');
  const outerNetwork = project.project_id === 'goluboe-vodovod';
  const nodeTreeId = 'nodeTree';

  const buildingGroups = [
    ['building', 'Архитектура и отделка', '#a3896c', ['AR','AI','AC','AS','AS2','KR','KJ','KM','ARH','FLOORS','CEILINGS','ROOF','DEM','ODI']],
    ['mechanical', 'Механические сети', '#3689a6', ['OV','VIK','VK','VPT','AUGPT','NVK','OVITP','UUTE','MEP','HVAC','PLUMBING']],
    ['electric', 'Электрика и слаботочные', '#a27927', ['EOM','EM','EO','SS','SCS','APS','SOUE','SOT','SKUD','SSN']],
    ['other', 'Прочее', '#7f8b99', []],
  ];
  const networkGroups = [
    ['design', 'Проектный водовод', '#2e76ab', ['NET','WEL']],
    ['existing', 'Существующие сети', '#90715b', ['CTX']],
    ['site', 'Строительная площадка', '#9a7953', ['EXC']],
    ['context', 'Рельеф и отметки', '#68856a', ['TER','REF']],
  ];
  const networkColors = { NET:'#2e76ab', WEL:'#51848d', CTX:'#90715b', EXC:'#9a7953', TER:'#68856a', REF:'#666ea0' };

  function el(tag, props = {}, text) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    return window.AtlasIcons?.el?.(name, null, 'icon--16') || el('span', { 'aria-hidden':'true' }, name === 'show' ? '◉' : '⊘');
  }

  function textReplace(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function ready() {
    const left = $('left');
    const tabs = left?.querySelector('.left-tabs');
    const sections = $('panelSections');
    const list = $('panelElements');
    const stage = document.querySelector('.stage');
    if (!tabs || !sections || !list || !stage || document.body.classList.contains('ac-mounted')) return;
    document.body.classList.add('ac-mounted');

    const sectionTab = $('tabSections'), listTab = $('tabElements');
    const locationTab = el('button', { id:'tabLocations', type:'button', class:'left-tab', role:'tab',
      'aria-controls':'panelLocations', 'aria-selected':'false', tabindex:'-1' }, outerNetwork ? 'Участки' : 'Этажи');
    const locations = el('div', { id:'panelLocations', class:'left-panel ac-locations', role:'tabpanel', 'aria-labelledby':locationTab.id, hidden:'' });
    listTab.before(locationTab);
    sections.after(locations);
    const locationStatus = el('p', { class:'ac-note', role:'status' });
    const locationList = el('div', { class:'ac-location-list' });
    const floorSearch = el('input', { type:'search', class:'ac-floor-search', 'aria-label':'Найти этаж', placeholder:'Найти этаж', hidden:'' });
    locations.append(floorSearch, locationList, locationStatus);
    if (!outerNetwork && window.AtlasShell?.siteFeature?.('levels') === false) locationTab.hidden = true;

    function show(which) {
      if (which === locationTab) {
        window.AtlasElements?.showSections?.();
        sections.hidden = list.hidden = true;
        locations.hidden = false;
      } else {
        locations.hidden = true;
        if (which === listTab) window.AtlasElements?.showElements?.();
        else window.AtlasElements?.showSections?.();
      }
      for (const tab of [sectionTab,locationTab,listTab]) {
        const selected = tab === which;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
    }
    locationTab.addEventListener('click', () => { show(locationTab); left.scrollTop = 0; });
    for (const tab of [sectionTab,listTab]) tab.addEventListener('click', () => {
      locations.hidden = true;
      locationTab.setAttribute('aria-selected','false');
      locationTab.tabIndex = -1;
      left.scrollTop = 0;
    });
    tabs.addEventListener('keydown', event => {
      const keys = ['ArrowRight','ArrowLeft','Home','End'];
      if (!keys.includes(event.key)) return;
      const candidates = [sectionTab,locationTab,listTab].filter(button => !button.hidden);
      const current = candidates.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? candidates.length-1 : (current+offset+candidates.length)%candidates.length;
      show(candidates[next]);
      candidates[next].focus();
    }, true);
    addEventListener('hashchange', () => {
      if (locationTab.getAttribute('aria-selected') === 'true') show(sectionTab);
    });
    const heading = el('div', { class:'ac-panel-title' });
    const title = el('h2', {}, 'Состав модели');
    const countSummary = el('p', { class:'ac-panel-count' });
    const digits = el('strong');
    const countNoun = el('span', {}, 'элементов');
    const number = new Intl.PluralRules('ru-RU');
    countSummary.append(digits, countNoun);
    heading.append(title, countSummary);
    const dismiss = left.querySelector('[data-close="left"]');
    if (dismiss) {
      dismiss.replaceChildren(icon('close'));
      dismiss.title = 'Закрыть состав модели';
      heading.append(dismiss);
    }
    tabs.before(heading);
    const listLabel = () => {
      const reported = listTab.textContent.match(/\(([\d\s]+)\)/)?.[1];
      const raw = reported || $('nCandidate')?.textContent.match(/\d[\d\s]*/)?.[0];
      const count = raw == null ? null : Number(raw.replace(/\s/g, ''));
      countSummary.hidden = count == null;
      if (count != null) {
        textReplace(digits, fmt.format(count));
        textReplace(countNoun, { one:'элемент', few:'элемента' }[number.select(count)] || 'элементов');
      }
      textReplace(listTab, 'Элементы');
    };
    new MutationObserver(() => {
      if (listTab.textContent !== 'Элементы') listLabel();
    }).observe(listTab, { childList:true, characterData:true, subtree:true });
    const engineCount = $('nCandidate');
    if (engineCount) new MutationObserver(() => {
      const node = window.AtlasNodes?.caption?.();
      if (!node || node.mode !== 'overlay' && !node.rebar) listLabel();
    }).observe(engineCount, { childList:true, characterData:true, subtree:true });
    listLabel();

    const viewSubmenu = sections.querySelector('.nav-views');
    const viewLabels = { nodes: ['layers','Узлы'], placed: ['discipline','По РД'], rebar: ['rebar','Армирование'] };
    viewSubmenu?.setAttribute('aria-label','Слои и узлы');
    for (const tab of viewSubmenu?.querySelectorAll('[data-col]') || []) {
      const labels = viewLabels[tab.dataset.col];
      if (labels) tab.replaceChildren(icon(labels[0]), el('span', {}, labels[1]));
    }

    const holder = $('navViewNodes');
    const nativeTree = $(nodeTreeId);
    const composition = el('section', { class:'ac-composition', 'aria-label':'Разделы модели' });
    const branch = el('div', { class:'ac-branch', hidden:'' });
    const switchBack = el('button', { type:'button', class:'ac-back ac-branch-back' });
    switchBack.append(icon('chevron-left'), el('span', {}, 'Все разделы'));
    const branchTitle = el('h3', { class:'ac-branch-title' });
    branch.append(switchBack, branchTitle);
    const rows = el('div', { class:'ac-groups' });
    const reset = el('button', { type:'button', class:'ac-back ac-reset', hidden:'' }, 'Показать все разделы');
    const filterStatus = el('p', { class:'ac-note', role:'status' });
    composition.append(branch, reset, rows, filterStatus);
    const find = $('navFind');
    const finder = () => left.classList.toggle('ac-searching', Boolean(find?.value.trim()));
    find?.addEventListener('input', finder);
    document.addEventListener('atlas:node', finder);
    if (holder && nativeTree) holder.prepend(composition);

    const rowMap = new Map();
    let ids = [];
    let activeSection = null;
    function visualMode() {
      const tree = window.__FULL_ATLAS?.tree?.()?.nodes || {};
      const scope = window.__ATLAS?.scope?.() || '';
      const id = scope.startsWith('TREE:') ? scope.slice(5) : null;
      let section = id;
      const visited = new Set();
      while (section && !rowMap.has(section) && !visited.has(section)) {
        visited.add(section);
        section = tree[section]?.parent;
      }
      const previous = activeSection;
      activeSection = rowMap.has(section) ? section : null;
      if (holder && holder.firstElementChild !== composition) holder.prepend(composition);
      if (previous !== activeSection) {
        left.scrollTop = 0;
        if (holder) holder.scrollTop = 0;
      }
      composition.classList.toggle('ac-section-open', Boolean(activeSection));
      branch.hidden = !activeSection;
      textReplace(branchTitle, activeSection ? rowMap.get(activeSection).title : '');
      if (nativeTree) nativeTree.classList.toggle('ac-native-hidden', !activeSection && rowMap.size > 0);
      window.AtlasNodes?.browseComposition?.(activeSection, id);
      requestAnimationFrame(() => window.AtlasNodes?._fit?.());
    }
    switchBack.addEventListener('click', () => {
      const row = rowMap.get(activeSection);
      $('navBuilding')?.click();
      visualMode();
      row?.go.focus({ preventScroll:true });
      left.scrollTop = 0;
    });

    const scopeMembers = id => window.__ATLAS?.scopeMembers?.('TREE:' + id) || [];
    const groupFor = owner => (outerNetwork ? networkGroups : buildingGroups).find(group => group[3].includes(owner)) ||
      (outerNetwork ? networkGroups[3] : buildingGroups[3]);
    const sectionInfo = () => window.AtlasNodes?.sections?.() || {};
    const rowKey = id => id.replace(/^section:/, '');
    const sceneKeys = () => {
      const info = sectionInfo();
      return new Set(info.on ? info.keys : ids.map(rowKey));
    };
    const adjacent = () => $('pdAdjacentNetworkToggle');
    const adjacentOn = () => adjacent()?.checked !== false;
    const visibility = info => {
      const keys = info || sceneKeys();
      reset.hidden = keys.size === ids.length && adjacentOn();
      for (const [id,row] of rowMap) {
        const isAdjacent = outerNetwork && row.owner === 'CTX';
        const count = scopeMembers(id).length;
        const on = keys.has(rowKey(id)) && (!isAdjacent || adjacentOn());
        textReplace(row.count, fmt.format(count));
        row.eye.setAttribute('aria-pressed', String(on));
        row.eye.setAttribute('aria-label', (on ? 'Скрыть ' : 'Показать ') + row.title);
        row.eye.title = row.eye.getAttribute('aria-label');
        row.eye.disabled = !count || typeof window.AtlasNodes?.setSections !== 'function';
        if (row.eye.dataset.on !== String(on)) {
          row.eye.replaceChildren(icon(on ? 'show' : 'hide'));
          row.eye.dataset.on = String(on);
        }
      }
    };

    reset.addEventListener('click', () => {
      window.AtlasNodes?.setSections?.([]);
      if (!adjacentOn()) adjacent()?.click();
      textReplace(filterStatus, '');
      visibility();
    });

    function toggle(id, row) {
      const nodes = window.AtlasNodes;
      if (!nodes?.setSections) return;
      const key = rowKey(id), keys = sceneKeys();
      if (outerNetwork && row.owner === 'CTX' && adjacent()) {
        if (keys.has(key) && adjacentOn()) adjacent().click();
        else {
          if (!adjacentOn()) adjacent().click();
          if (!keys.has(key)) { keys.add(key); nodes.setSections([...keys]); }
        }
      } else {
        if (keys.has(key)) {
          if (keys.size === 1) { textReplace(filterStatus, 'На модели остаётся один раздел. Включите другой, чтобы скрыть этот.'); return; }
          keys.delete(key);
        } else keys.add(key);
        nodes.setSections(keys.size === ids.length ? [] : [...keys]);
      }
      textReplace(filterStatus, '');
      visibility();
    }

    function buildSections() {
      const tree = window.__FULL_ATLAS?.tree?.();
      if (!tree?.nodes || !holder || !nativeTree || rowMap.size) return;
      const fromTree = tree.nodes.construction?.children || tree.nodes.building?.children || [];
      ids = fromTree.filter(id => tree.nodes[id]?.kind === 'section' && (tree.nodes[id].physical_count > 0 || scopeMembers(id).length));
      if (!ids.length) return;
      const groups = new Map();
      const owners = new Map((project.owners || []).map(owner => [owner.code,owner]));
      for (const id of ids) {
        const record = tree.nodes[id];
        const owner = String(record.owner || rowKey(id));
        const title = owners.get(owner)?.label || record.label;
        const group = groupFor(owner.toUpperCase());
        if (!groups.has(group[0])) {
          const wrapper = el('details', { class:'ac-group', open:'' });
          const heading = el('summary');
          heading.append(icon('chevron-right'), el('span', {}, group[1]));
          const content = el('div', { class:'ac-group-content' });
          wrapper.append(heading, content);
          groups.set(group[0], { wrapper,content });
        }
        const line = el('div', { class:'ac-row' });
        const color = el('span', { class:'ac-color', 'aria-hidden':'true' });
        color.style.backgroundColor = networkColors[owner] && outerNetwork ? networkColors[owner] : group[2];
        const go = el('button', { type:'button', class:'ac-section', title, 'aria-label':'Открыть раздел: '+title });
        const name = el('span', { class:'ac-name' }, title);
        const count = el('span', { class:'ac-count', 'aria-label':'Число элементов' });
        go.append(color,name,count);
        const eye = el('button', { type:'button', class:'ac-eye', 'data-section-id':id, 'aria-pressed':'false' });
        const row = { title, owner, eye, count, go };
        rowMap.set(id,row);
        go.addEventListener('click', () => {
          const node = nativeTree.querySelector('[data-key="'+CSS.escape('T:'+id)+'"]');
          if (node) node.click();
          else window.__ATLAS?.setScope?.('TREE:'+id);
          visualMode();
          if (!phone.matches) switchBack.focus({ preventScroll:true });
        });
        eye.addEventListener('click', () => toggle(id,row));
        line.append(go,eye);
        groups.get(group[0]).content.append(line);
      }
      for (const group of outerNetwork ? networkGroups : buildingGroups) {
        const item = groups.get(group[0]);
        if (item) rows.append(item.wrapper);
      }
      visualMode();
      visibility();
    }

    document.addEventListener('change', event => {
      if (event.target.id === 'pdAdjacentNetworkToggle') visibility();
    });
    for (const type of ['atlas:sections','atlas:visibility','atlas:scope','atlas:sceneready']) document.addEventListener(type, () => {
      if (type === 'atlas:scope' || type === 'atlas:sceneready') visualMode();
      visibility();
    });

    const path = stage.querySelector('.stage-path');
    const routeState = el('span', { class:'ac-picket', hidden:'' });
    if (path && outerNetwork) stage.append(routeState);
    function picketLabel(metres) {
      const pk = Math.floor(metres / 100);
      const rest = new Intl.NumberFormat('ru-RU',{minimumIntegerDigits:2,maximumFractionDigits:3,useGrouping:false}).format(metres - pk*100);
      return 'ПК'+pk+'+'+rest;
    }

    function updatePicket() {
      const profile = $('pdWorldProfileToggle');
      const form = $('pdWorldProfileRange')?.querySelector('form');
      const start = form?.elements.namedItem('from');
      const end = form?.elements.namedItem('to');
      const isOn = profile?.getAttribute('aria-pressed') === 'true';
      const status = $('pdWorldProfileStatus');
      const selectedLabel = isOn && !status?.parentElement?.dataset.invalid && start?.value && end?.value ?
        picketLabel(Number(start.value.replace(',','.'))) + ' – ' + picketLabel(Number(end.value.replace(',','.'))) : '';
      routeState.hidden = !selectedLabel;
      textReplace(routeState, selectedLabel);
      for (const b of locationList.querySelectorAll('[data-range]')) b.setAttribute('aria-pressed', String(b.dataset.range === selectedLabel));
    }

    function setRange(start, end) {
      const form = $('pdWorldProfileRange')?.querySelector('form');
      if (!form) { textReplace(locationStatus,'Профиль трассы доступен после перехода в общий вид.'); return; }
      form.elements.namedItem('from').value = String(start);
      form.elements.namedItem('to').value = String(end);
      form.requestSubmit();
      updatePicket();
      if (phone.matches && left.classList.contains('open')) left.querySelector('[data-close="left"]')?.click();
    }

    const floorChoices = $('levelChoices');
    function buildLocations() {
      locationList.replaceChildren();
      if (outerNetwork) {
        const segments = window.ATLAS_PROFILE_WORLD?.construction || [];
        const available = Boolean($('pdWorldProfileRange')?.querySelector('form'));
        if (!segments.length || !available) {
          textReplace(locationStatus, 'Вернитесь к общему виду трассы, чтобы выбрать участок.');
          return;
        }
        const route = el('button', { type:'button', class:'ac-location', 'aria-pressed':'false' }, 'Вся трасса');
        const start = segments[0].startM, end = segments[segments.length-1].endM;
        route.dataset.range = picketLabel(start)+' – '+picketLabel(end);
        route.addEventListener('click', () => setRange(start,end));
        locationList.append(route);
        for (const segment of segments) {
          const key = picketLabel(segment.startM)+' – '+picketLabel(segment.endM);
          const button = el('button', { type:'button', class:'ac-location', 'data-range':key, 'aria-pressed':'false' });
          button.append(el('span',{},key),el('small',{},segment.method==='hdd' ? 'ГНБ' : 'Открытая прокладка'));
          button.addEventListener('click', () => setRange(segment.startM,segment.endM));
          locationList.append(button);
        }
        textReplace(locationStatus,'');
        updatePicket();
        return;
      }
      const floors = [...(floorChoices?.querySelectorAll('button') || [])];
      floorSearch.hidden = floors.length <= 9;
      const query = floorSearch.hidden ? '' : floorSearch.value.toLocaleLowerCase('ru-RU').trim();
      for (const button of floors) {
        const title = [...button.childNodes].filter(x => x.nodeName !== 'SMALL').map(x => x.textContent).join('');
        if (query && !title.toLocaleLowerCase('ru-RU').includes(query)) continue;
        const b = el('button', { type:'button', class:'ac-location', 'aria-pressed':button.getAttribute('aria-pressed') || 'false' });
        b.append(el('span',{},title.trim()),el('small',{},button.querySelector('small')?.textContent || ''));
        b.addEventListener('click', () => button.click());
        locationList.append(b);
      }
      textReplace(locationStatus, locationList.childElementCount ? '' : floors.length ? 'Этаж не найден.' : 'В модели пока нет данных об этажах.');
    }
    if (floorChoices && !outerNetwork) new MutationObserver(buildLocations).observe(floorChoices,{childList:true,subtree:true});
    floorSearch.addEventListener('input',buildLocations);
    let routeSetup = false;
    function initRoute() {
      const trigger = $('pdWorldProfileToggle');
      const form = $('pdWorldProfileRange')?.querySelector('form');
      if (routeSetup || !trigger || !form) return;
      routeSetup = true;
      buildLocations();
      new MutationObserver(updatePicket).observe(trigger, { attributes:true,attributeFilter:['aria-pressed'] });
      form.addEventListener('submit',updatePicket);
      form.querySelector('[data-reset]')?.addEventListener('click',updatePicket);
    }
    if (outerNetwork) {
      new MutationObserver(initRoute).observe(stage,{childList:true});
      initRoute();
    }
    locationTab.addEventListener('click', buildLocations);
    document.addEventListener('atlas:ready', () => { buildSections(); buildLocations(); initRoute(); }, { once:true });
    document.addEventListener('atlas:nodes', () => { buildSections(); visualMode(); visibility(); });
    buildSections(); buildLocations();
    arrangeSettings();
    mobileLabels();

    function mobileLabels() {
      const menu = $('menu');
      const close = left.querySelector('[data-close="left"]');
      menu?.setAttribute('aria-label','Состав модели и слои');
      if (close) close.setAttribute('aria-label','Закрыть состав и вернуться к модели');
      const update = () => {
        if (!path) return;
        const title = [...path.querySelectorAll('.crumb')].map(crumb => crumb.getAttribute('aria-label') || crumb.textContent.trim()).filter(Boolean);
        path.setAttribute('aria-label', title.length ? 'Путь: '+title.join(' › ') : 'Путь к элементу');
      };
      if (path) new MutationObserver(update).observe(path,{childList:true,subtree:true});
      update();
    }

    function arrangeSettings() {
      const panel = $('viewSettings');
      const toggle = $('viewSettingsToggle');
      const top = stage.querySelector('.stage-actions .atb-tr');
      const nativeGroup = stage.querySelector('.atb-g--view');
      if (!panel || !toggle || !top || !nativeGroup) return;
      panel.setAttribute('aria-label','Настройки вида');
      textReplace(panel.querySelector('.r23-menu-head b'),'Настройки вида');
      const groups = new Map([...panel.querySelectorAll(':scope > details')].map(group => [group.querySelector('summary')?.textContent,group]));
      const graphics = groups.get('Графика и чёткость');
      const helper = groups.get('Оси, подписи и размеры');
      const camera = groups.get('Камера и сохранение вида');
      const visibility = groups.get('Видимость и прозрачность');
      const slice = groups.get('Сечение модели');
      const card = groups.get('Карточка и интерфейс');
      function rename(group, title) {
        if (group) textReplace(group.querySelector('summary'),title);
      }
      rename(graphics,'Графика');
      rename(helper,'Сетка и ориентиры');
      rename(camera,'Текущий вид');
      rename(card,'Карточка');
      if (helper) {
        for (const id of ['r23_axes','r23_labels']) $(id)?.closest('label')?.classList.add('ac-duplicate');
        textReplace(helper.querySelector('.r23-note'),'Координатная сетка XY отдельно от проектных осей.');
      }
      if (camera && visibility) camera.append(visibility);
      if (camera && slice) camera.append(slice);
      if (camera) {
        const adoptRuler = () => {
          const ruler = [...panel.querySelectorAll(':scope > details')].find(group => group.querySelector('summary')?.textContent === 'Линейка');
          if (ruler) { rename(ruler,'Настройки линейки'); camera.append(ruler); }
        };
        new MutationObserver(adoptRuler).observe(panel,{ childList:true });
        adoptRuler();
      }
      $('r23_pickThrough')?.closest('label')?.classList.add('ac-duplicate');
      $('r23Isolate')?.classList.add('ac-duplicate');
      $('r23Hide')?.classList.add('ac-duplicate');
      $('r23View_back')?.parentElement?.classList.add('ac-secondary-angles');
      const layout = () => {
        const parent = phone.matches ? nativeGroup : top;
        if (toggle.parentElement !== parent) parent.append(toggle);
        toggle.classList.add('ac-settings-toggle');
        toggle.setAttribute('aria-label','Настройки вида');
        toggle.title = 'Настройки вида';
        textReplace(toggle.querySelector('.atb-t'),'Настройки вида');
      };
      let scheduled = false;
      const syncSettings = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => { scheduled = false; layout(); });
      };
      new MutationObserver(syncSettings).observe(nativeGroup,{childList:true});
      phone.addEventListener('change',syncSettings);
      document.addEventListener('atlas:ready',syncSettings,{once:true});
      const cardPanel = $('right');
      if (cardPanel) {
        let wasOpen = cardPanel.classList.contains('open');
        new MutationObserver(() => {
          const open = cardPanel.classList.contains('open');
          if (phone.matches && open && !wasOpen && !panel.hidden) window.AtlasViewSettings?.open?.(false);
          wasOpen = open;
        }).observe(cardPanel,{attributes:true,attributeFilter:['class']});
      }
      layout();
    }
  }

  if (document.readyState === 'complete') ready();
  else document.addEventListener('DOMContentLoaded',ready,{once:true});
})();
