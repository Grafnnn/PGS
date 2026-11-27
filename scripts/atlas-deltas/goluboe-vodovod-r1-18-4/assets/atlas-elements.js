/* 3D Атлас · вкладки левой панели «Разделы | Элементы (N)» (V11.1, п. 5; V11.5 — «Разделы» по умолчанию и после выбора раздела).
   «Элементы» — список текущего раздела из сцены движка (__ATLAS.sceneObjects), с понятными названиями как в карточке,
   одинаковые названия сгруппированы («×4»), поле «Найти в разделе», одна точка табуляции на список (↑↓, Home/End, Enter).
   Выбор — через __ATLAS.select (как щелчок по модели). Движок не меняется; его список #list остаётся в DOM скрытым. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = window.AtlasShell, make = S.make;
  const left = $('left'), tree = $('albumTree'), engineDetails = $('elementListDetails');
  if (!left || !tree || !engineDetails) return;
  const PAGE = 200;
  // Вкладки
  const tabs = make('div', { class: 'left-tabs', role: 'tablist', 'aria-label': 'Состав модели' });
  const tabSec = make('button', { type: 'button', role: 'tab', id: 'tabSections', 'aria-controls': 'panelSections', 'aria-selected': 'true', class: 'left-tab' }, 'Разделы');
  const tabEl = make('button', { type: 'button', role: 'tab', id: 'tabElements', 'aria-controls': 'panelElements', 'aria-selected': 'false', class: 'left-tab', tabindex: '-1' }, 'Элементы');
  tabs.append(tabSec, tabEl);
  const panelSec = make('div', { role: 'tabpanel', id: 'panelSections', 'aria-labelledby': 'tabSections', class: 'left-panel' });
  const panelEl = make('div', { role: 'tabpanel', id: 'panelElements', 'aria-labelledby': 'tabElements', class: 'left-panel', hidden: true });
  tree.before(tabs);
  tabs.after(panelSec, panelEl);
  // V12.1 · T0: поле «Найти узел или марку», вид колонки «Узлы | По РД | Армирование» и контейнеры (B2).
  // #navViewNodes — дерево узлов (atlas-nodes.js; до него — дерево движка #albumTree); #navViewPlaced — #placedBlock; #navViewRebar — разделы армирования (atlas-rebar.js, B3).
  const navFind = make('input', { type: 'search', class: 'in-section nav-find', id: 'navFind', placeholder: 'Найти узел или марку', 'aria-label': 'Найти узел или марку', autocomplete: 'off', hidden: true });
  const views = make('div', { class: 'nav-views', role: 'group', 'aria-label': 'Вид списка' });
  const box = {};
  // К1: вкладка вида — только при данных объекта: «По РД» — слой placedLayer набора ревизий, «Армирование» — набор mu_rebar; места остаются (скрыты)
  // К1 (скан сводной): армирование — __ATLAS.rebarData() движка (имя глобала данных — в конфиге объекта); проверка — при сборке и по atlas:ready
  const HAS = { nodes: () => true, placed: () => !!(window.AtlasWorldRevisionData && window.AtlasWorldRevisionData.placedLayer), rebar: () => { try { const A = window.__ATLAS; return !!(A && typeof A.rebarData === 'function' && A.rebarData()); } catch (e) { return false; } } };   /* __ATLAS — в момент проверки: движок создаёт его после загрузки скрипта */
  for (const [k, t, id] of [['nodes', 'Состав', 'navViewNodes'], ['placed', 'По РД', 'navViewPlaced'], ['rebar', 'Армирование', 'navViewRebar']]) {
    const b = make('button', { type: 'button', class: 'nav-view', 'data-col': k, 'aria-controls': id, 'aria-pressed': String(k === 'nodes') }, t);
    b.onclick = () => colView(k);
    views.append(b);
    box[k] = make('div', { class: 'nav-view-box', id, 'data-col': k, hidden: k !== 'nodes' });
  }
  function colView(k) {
    for (const b of views.children) b.setAttribute('aria-pressed', String(b.dataset.col === k));
    for (const x in box) box[x].hidden = x !== k;
    document.dispatchEvent(new CustomEvent('atlas:navview', { detail: { view: k } }));
  }
  window.AtlasNavView = { set: colView, get: () => (views.querySelector('[aria-pressed="true"]') || {}).dataset?.col || 'nodes' };
  const syncViews = () => { let n = 0; for (const b of views.children) { const on = HAS[b.dataset.col](); b.style.display = on ? '' : 'none'; n += on; if (!on && b.getAttribute('aria-pressed') === 'true') colView('nodes'); } views.hidden = n < 2; };   // К1: одна вкладка — переключатель не нужен
  syncViews(); document.addEventListener('atlas:ready', syncViews);
  panelSec.append(navFind, views, box.nodes, box.placed, box.rebar);
  // V121-R1-02: порядок §2.1 — вкладки → поиск → вид → «Уровень» → дерево («Всё здание» — первой строкой дерева)
  { const lv = $('levelNavigation'); if (lv) views.after(lv); document.body.classList.add('nav-v121'); }
  box.nodes.append(tree);
  // V12.1h · п. 4: до atlas-nodes.js дерево движка скрыто (nt-on), в #nodeTree — «Загрузка узлов…» (модуль берёт этот же #nodeTree)
  { const nt = make('div', { class: 'nt', id: 'nodeTree', 'aria-label': 'Состав модели' });   /* 1.0.19a к2 (A-11): «Узлы» → «Состав» */ const row = make('div', { class: 'nt-row nt-load', 'data-key': '', role: 'status', style: '--d:0' }); row.append(make('span', { class: 'nt-l' }, 'Загрузка узлов…')); nt.append(row); box.nodes.prepend(nt); document.body.classList.add('nt-on'); }
  const findBox = make('input', { type: 'search', class: 'in-section', id: 'elFind', placeholder: 'Найти в разделе', 'aria-label': 'Найти в разделе', autocomplete: 'off' });
  const count = make('p', { class: 'el-count', 'aria-live': 'polite' });
  const list = make('div', { class: 'el-list', role: 'listbox', 'aria-label': 'Элементы раздела', tabindex: '-1' });
  const more = make('button', { type: 'button', class: 'el-more', hidden: true }, 'Показать ещё');
  panelEl.append(findBox, count, list, more);
  // Прежний блок «Элементы раздела» (движок) — скрыт, но в DOM: на него опирается снятие выбора.
  engineDetails.hidden = true;
  const oldFind = engineDetails.querySelector('.in-section'); if (oldFind) oldFind.remove();
  function select(tab) {
    const el = tab === tabEl;
    tabSec.setAttribute('aria-selected', String(!el)); tabEl.setAttribute('aria-selected', String(el));
    tabSec.tabIndex = el ? -1 : 0; tabEl.tabIndex = el ? 0 : -1;
    panelSec.hidden = el; panelEl.hidden = !el;
    if (el) { if (dirty) refresh(true); else render(); }
  }
  tabSec.onclick = () => select(tabSec); tabEl.onclick = () => select(tabEl);
  tabs.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const t = document.activeElement === tabSec ? tabEl : tabSec; select(t); t.focus(); } });
  // Блок «По РД» — в виде «По РД». Разделы армирования (atlas-rebar.js, B3), пока они ставятся в #panelSections, — в вид «Армирование».
  const adopt = () => {
    const pb = $('placedBlock'); if (pb && pb.parentElement !== box.placed) box.placed.append(pb);
    for (const id of ['rebarOdBlock', 'rebarBlock']) { const x = $(id); if (x && x.parentElement === panelSec) box.rebar.append(x); }
  };
  new MutationObserver(adopt).observe(left, { childList: true, subtree: false });
  new MutationObserver(adopt).observe(panelSec, { childList: true, subtree: false });

  /* ---------- данные списка ---------- */
  let objIndex = null;
  const world = () => { if (!objIndex) { objIndex = new Map(); for (const o of (window.__FULL_ATLAS && window.__FULL_ATLAS.allWorld()) || []) objIndex.set(o.renderId, o); } return objIndex; };
  function meta(o, withLevel) {
    const parts = [];
    if (withLevel && o.albumRecord && o.albumRecord.level) parts.push(o.albumRecord.level);
    const b = o.bounds;
    if (window.AtlasCard && Array.isArray(b) && b.length === 2) { try { parts.push('оси ' + window.AtlasCard.axesOf(b).split(', ')[0]); } catch (e) { /* нет осей */ } }
    return parts.join(' · ');
  }
  const fold = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[‐-―−‑-]/g, '-');
  let groups = [], shown = PAGE, sig = '';
  function build(scene) {
    const W = world(), map = new Map();
    // Уровень в строке элемента — только если в разделе их несколько (у одного уровня он повторял бы заголовок).
    const lv = new Set(scene.map(s => { const o = W.get(s.renderId); return o && o.albumRecord ? o.albumRecord.level : ''; }));
    const withLevel = S.siteFeature('levels') && lv.size > 1;
    // V12.1 · п. 5: открыт узел — тела по ролям (Бетон · Профлист · Б1 · Уголки · Армирование), армирование одной свёрнутой группой
    const NS = window.AtlasNodes && window.AtlasNodes.state && window.AtlasNodes.state(), nd = NS && NS.k ? window.AtlasNodes.get(NS.k) : null;
    const roleOf = new Map(), roleOrder = nd ? Object.keys(nd.roles) : [];
    if (nd) for (const [r, ids] of Object.entries(nd.roles)) for (const id of ids) roleOf.set(id, r);
    for (const s of scene) {
      const o = W.get(s.renderId);
      const name = o ? o.name : s.id;
      let title = name;
      if (o && window.AtlasCard) { try { title = window.AtlasCard.human(o).title || name; } catch (e) { title = name; } }
      const role = nd ? (roleOf.get(s.renderId) || 'Прочее') : null;
      if (role === 'Армирование') title = 'Армирование';
      const key = nd ? role + '|' + title : title;
      if (!map.has(key)) { const k = nd ? { key: role, label: role, order: roleOrder.indexOf(role) < 0 ? 99 : roleOrder.indexOf(role) } : (window.AtlasRebar && window.AtlasRebar.kindOf ? window.AtlasRebar.kindOf(s.renderId) : null); map.set(key, { title, items: [], kind: k }); }
      map.get(key).items.push({ renderId: s.renderId, name, meta: o ? meta(o, withLevel) : (role === 'Армирование' ? String(s.id || s.renderId).split('::').pop() : ''), hay: fold(title + ' ' + name + ' ' + s.id + ' ' + ((o && o.albumRecord && o.albumRecord.mark) || '')) });   /* 1.0.16 B3-6 (A3): и марка тела */
    }
    // Виды тел (раздел «Армирование и узлы МУ»): сначала по виду, внутри — по названию.
    const ko = g => (g.kind ? g.kind.order : -1);
    groups = [...map.values()].sort((a, b) => ko(a) - ko(b) || a.title.localeCompare(b.title, 'ru', { numeric: true }));
  }
  function currentSel() { const o = window.__FULL_ATLAS && window.__FULL_ATLAS.selected(); return o ? o.renderId : null; }
  function render() {
    const q = fold(findBox.value.trim());
    const gs = q ? groups.map(g => ({ ...g, items: g.items.filter(i => i.hay.includes(q) || fold(g.title).includes(q)) })).filter(g => g.items.length) : groups;
    const n = gs.reduce((k, g) => k + g.items.length, 0);
    const total = groups.reduce((k, g) => k + g.items.length, 0);
    tabEl.textContent = 'Элементы (' + S.fmt(total) + ')';
    // V12.2 · S1: до готовности модели — «Загрузка…», а не «0 элементов»
    if (!total && !q && !(window.__ATLAS && (typeof window.__ATLAS.ready === 'function' ? window.__ATLAS.ready() : window.__ATLAS.state && window.__ATLAS.state().ready))) { tabEl.textContent = 'Элементы'; count.textContent = 'Загрузка…'; list.replaceChildren(); return; }
    count.textContent = q ? 'Найдено ' + S.fmt(n) + ' из ' + S.fmt(total) : S.fmt(total) + ' ' + S.plural(total, 'элемент', 'элемента', 'элементов') + (gs.length !== total ? ' · ' + S.fmt(gs.length) + ' ' + S.plural(gs.length, 'название', 'названия', 'названий') : '');
    list.replaceChildren();
    const sel = currentSel();
    if (!gs.length) {
      // 1.0.19a A-04 (М-8): «в этом разделе» — вне «Всего здания» или на уровне; «Искать во всём здании» — поиск шапки (1 нажатие)
      const q = findBox.value.trim(), part = (() => { try { const A = window.__ATLAS; return (A.scope() || 'BUILDING') !== 'BUILDING' || !!(A.level && A.level()); } catch (e) { return false; } })();
      const p = make('p', { class: 'rempty' }, 'Ничего не найдено по «' + q + '»' + (part ? ' в этом разделе' : '') + '. ');
      const all = make('button', { type: 'button', class: 'el-reset el-all' }, 'Искать во всём здании'); all.onclick = () => document.dispatchEvent(new CustomEvent('atlas:searchall', { detail: { q } }));
      const r = make('button', { type: 'button', class: 'el-reset' }, 'Сбросить'); r.onclick = () => { findBox.value = ''; render(); findBox.focus(); };
      p.append(all, document.createTextNode(' '), r); list.append(p); more.hidden = true; return;
    }
    const frag = document.createDocumentFragment();
    let first = null, kindKey = null;
    const kindCount = new Map();
    for (const g of gs) if (g.kind) kindCount.set(g.kind.key, (kindCount.get(g.kind.key) || 0) + g.items.length);
    for (const g of gs.slice(0, shown)) {
      if (g.kind && g.kind.key !== kindKey) { kindKey = g.kind.key; frag.append(make('div', { class: 'el-kind', role: 'presentation' }, g.kind.label + ' · ' + S.fmt(kindCount.get(kindKey)))); }
      if (g.items.length === 1) {
        const it = g.items[0];
        const b = make('button', { type: 'button', role: 'option', class: 'el-row', 'data-id': it.renderId, tabindex: '-1', 'aria-selected': String(it.renderId === sel), title: it.name });
        b.append(make('span', { class: 'el-title' }, g.title));
        if (it.meta) b.append(make('span', { class: 'el-meta' }, it.meta));
        frag.append(b); first = first || b;
      } else {
        const open = g.items.some(i => i.renderId === sel) || (q && gs.length < 20);
        const h = make('button', { type: 'button', role: 'option', class: 'el-row el-group', 'aria-expanded': String(!!open), tabindex: '-1' });
        h.append(make('span', { class: 'el-title' }, g.title), make('span', { class: 'el-mult' }, '×' + g.items.length));
        frag.append(h); first = first || h;
        const sub = make('div', { class: 'el-sub', hidden: !open });
        for (const it of g.items) {
          const b = make('button', { type: 'button', role: 'option', class: 'el-row el-child', 'data-id': it.renderId, tabindex: '-1', 'aria-selected': String(it.renderId === sel), title: it.name });
          b.append(make('span', { class: 'el-title' }, it.meta || it.name));
          sub.append(b);
        }
        h.onclick = () => { const o = sub.hidden; sub.hidden = !o; h.setAttribute('aria-expanded', String(o)); };
        frag.append(sub);
      }
    }
    list.append(frag);
    const cur = list.querySelector('[aria-selected="true"]') || first;
    if (cur) cur.tabIndex = 0;
    more.hidden = gs.length <= shown;
    more.textContent = 'Показать ещё · ' + S.fmt(Math.min(PAGE, gs.length - shown));
  }
  more.onclick = () => { shown += PAGE; render(); };
  let fTimer = 0;
  findBox.addEventListener('input', () => { clearTimeout(fTimer); fTimer = setTimeout(() => { shown = PAGE; render(); }, 120); });
  list.addEventListener('click', e => {
    const b = e.target.closest('.el-row[data-id]');
    if (!b) return;
    try { window.__ATLAS.select(b.dataset.id); } catch (err) { return; }
    for (const x of list.querySelectorAll('[aria-selected="true"]')) x.setAttribute('aria-selected', 'false');
    b.setAttribute('aria-selected', 'true');
    if (innerWidth <= 850) left.classList.remove('open');
  });
  // Одна точка табуляции, стрелки ↑↓, Home/End.
  list.addEventListener('keydown', e => {
    const rows = [...list.querySelectorAll('.el-row')].filter(x => x.offsetParent);
    const i = rows.indexOf(document.activeElement);
    let j = null;
    if (e.key === 'ArrowDown') j = Math.min(rows.length - 1, i + 1);
    if (e.key === 'ArrowUp') j = Math.max(0, i - 1);
    if (e.key === 'Home') j = 0;
    if (e.key === 'End') j = rows.length - 1;
    if (j === null || i < 0) return;
    e.preventDefault();
    for (const r of rows) r.tabIndex = -1;
    rows[j].tabIndex = 0; rows[j].focus();
  });
  // Пересборка при смене раздела; после выбора раздела — вкладка «Элементы».
  let dirty = true;
  function countFromEngine() { const nc = window.AtlasNodes && window.AtlasNodes.caption && window.AtlasNodes.caption(); if (nc && (nc.mode === 'overlay' || nc.rebar)) { tabEl.textContent = 'Элементы (' + S.fmt(nc.count) + ')'; return; } const m = /(\d[\d\s\u00a0\u202f]*)/.exec(($('nCandidate') || {}).textContent || ''); if (m) tabEl.textContent = 'Элементы (' + S.fmt(Number(m[1].replace(/\D/g, ''))) + ')'; }
  function refresh(force) {
    if (panelEl.hidden && !force) { dirty = true; countFromEngine(); return false; }
    dirty = false;
    const atlas = window.__ATLAS;
    const composition = atlas?.scope?.() === 'BUILDING' ? window.AtlasNodes?.compositionSections?.() : null;
    let scene = atlas?.sceneObjects?.() || [];
    const chosen = composition?.on ? atlas.visibleSetState?.() : null;
    if (chosen) {
      const ids = new Set(chosen.ids);
      scene = scene.filter(item => ids.has(item.renderId));
    }
    const s = scene.length + ':' + (scene[0] && scene[0].renderId) + ':' + (scene[scene.length - 1] && scene[scene.length - 1].renderId) +
      (chosen ? ':' + JSON.stringify([composition.sections, composition.placed]) : '');
    if (s === sig) return false;
    sig = s; shown = PAGE; findBox.value = '';
    build(scene);
    render();
    return true;
  }
  let rTimer = 0;
  const schedule = () => { clearTimeout(rTimer); rTimer = setTimeout(refresh, 80); };
  // V12.2 · E2: раздел и готовность сцены — события движка atlas:scope / atlas:sceneready; без E2 — наблюдатели #sectionTitle, #listCount, #nCandidate
  const E2 = () => !!(window.__ATLAS && window.__ATLAS.features && window.__ATLAS.features.sceneReady);
  for (const ev of ['atlas:scope', 'atlas:sceneready', 'atlas:sections']) document.addEventListener(ev, () => { schedule(); countFromEngine(); });   // шлёт только движок с E2
  document.addEventListener('atlas:ready', () => { if (E2()) return;
    new MutationObserver(schedule).observe($('sectionTitle'), { childList: true, characterData: true, subtree: true });
    new MutationObserver(schedule).observe($('listCount'), { childList: true, characterData: true, subtree: true });
    new MutationObserver(countFromEngine).observe($('nCandidate'), { childList: true, characterData: true, subtree: true });
  }, { once: true });
  document.addEventListener('atlas:ready', () => setTimeout(() => { dirty = true; if (!panelEl.hidden) refresh(true); countFromEngine(); }, 0));   // V12.2 · S1: список, собранный при загрузке, — пересобрать
  // V12.1: узел открыт / армирование — список и число по сцене узла
  document.addEventListener('atlas:node', () => setTimeout(() => { dirty = true; countFromEngine(); if (!panelEl.hidden) refresh(true); }, 0));
  document.addEventListener('atlas:selection', () => { if (!panelEl.hidden) { const sel = currentSel(); for (const x of list.querySelectorAll('[data-id]')) x.setAttribute('aria-selected', String(x.dataset.id === sel)); } });
  // Вкладка «Разделы» остаётся открытой и после выбора раздела (замечание владельца 28.09, задача K):
  // на «Элементы» — только по щелчку пользователя, число элементов — на ярлыке вкладки.
  document.addEventListener('click', e => {
    if (!E2() && e.target.closest('.placed-node, #levelChoices button, #navBuilding')) setTimeout(() => { dirty = true; countFromEngine(); }, 150);   // с E2 — по atlas:scope
  }, true);
  // Переход по адресу с другим разделом (#scope=…) — тоже на «Разделы».
  let lastScope = new URLSearchParams(location.hash.slice(1)).get('scope');
  window.addEventListener('hashchange', () => { const sc = new URLSearchParams(location.hash.slice(1)).get('scope'); if (sc && sc !== lastScope) { dirty = true; select(tabSec); } lastScope = sc || lastScope; });
  window.AtlasElements = { refresh, groups: () => groups, showSections: () => select(tabSec), showElements: () => select(tabEl) };
})();
