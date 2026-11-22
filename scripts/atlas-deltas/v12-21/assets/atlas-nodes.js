/* 3D Атлас · V12.1 «Узлы и навигация» — узлы и левое меню (B2). Подключается после atlas:ready (index.html), не до первого кадра.
   Реестр — data/nodes.js (A): window.ATLAS_NODES_GZIP (base64-gzip JSON), только <script>, без fetch/XHR.
   Дописывает объект-заглушку window.AtlasNodes из prototype.js. Договор B2 ↔ B3 — спецификация V12.1 §3.5.
   Меню: вид «Узлы» — дерево разделов из __FULL_ATLAS.tree(); после реестра узлы стоят там, где лежит их якорь, группы, целиком ушедшие в узлы, скрыты.
   Узел открывается в режиме «дерево» (поле tree задано — setScope('TREE:'+tree)) или «наложение» (раздел якоря + showOverlay для остальных частей).
   Единственная точка вызова __ATLAS.showOverlay / hideOverlay в V12.1 — этот файл. Числа — только из данных. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = window.AtlasShell, make = S.make, plural = S.plural;
  const fmtCache = new Map(), fmt = n => { let v = fmtCache.get(n); if (v === undefined) { v = S.fmt(n); if (fmtCache.size < 5000) fmtCache.set(n, v); } return v; };
  const A = () => window.__ATLAS, F = () => window.__FULL_ATLAS;
  const N = window.AtlasNodes || (window.AtlasNodes = {});
  if (!A() || !F() || !$('navViewNodes')) return;
  const phone = () => matchMedia('(max-width: 850px)').matches;
  const H = F().tree(), T = H.nodes;
  const NODES_SRC = 'data/nodes.js';
  const REBAR_MAX = { phone: 400, pc: 1500 };           // §3.3 «липкое» армирование
  const PAGE = 40;                                       // §2.2 длинные списки
  /* К1: особенности узлов объекта — ATLAS_PROJECT.nodes. rebar_role — имя роли армирования (нет — у узлов нет армирования); role_short / role_abbr — краткие имена ролей;
     paged_groups — длинные списки узлов типа type делятся на группы (поле field, иначе часть подписи между label_split, иначе fallback); cross_links — строка-переход к узлу из другого раздела */
  const NC = (window.ATLAS_PROJECT || {}).nodes || {}, RB = NC.rebar_role || null, RBL = RB || 'Армирование';
  const PAGED = Array.isArray(NC.paged_groups) ? NC.paged_groups : [], XLINKS = Array.isArray(NC.cross_links) ? NC.cross_links : [];
  // К1: виртуальные тела армирования (в данных узлов, не в сцене) — префиксы из config.rebar; нет ключа — виртуальных тел нет
  const RC = (window.ATLAS_PROJECT || {}).rebar || {}, VP = Array.isArray(RC.virtual_prefixes) ? RC.virtual_prefixes.filter(Boolean) : [];
  const RV = RC.virtual || { rebar: VP[0] || null, deck: VP[1] || null, angles: VP[2] || null }, LINKS_SRC = RC.links_source || null;
  const isVirt = id => VP.some(p => String(id).startsWith(p)), isVRebar = id => !!RV.rebar && String(id).startsWith(RV.rebar);
  const isDeckAng = id => [RV.deck, RV.angles].some(p => !!p && String(id).startsWith(p));   // К1: профлист и уголки — rebar.virtual конфига
  const MAX_ROWS = 200;                                  // §2.5 строк в DOM
  const idle = window.requestIdleCallback ? (f => requestIdleCallback(f, { timeout: 200 })) : (f => setTimeout(() => f({ timeRemaining: () => 8 }), 0));

  /* ---------- тела здания: позиция в order → renderId (только действующие физические тела, как счётчик движка) ---------- */
  let W = null;
  // Карта строится в простое кусками ≤ 8 мс (worldAsync); world() — синхронно, только если нужна раньше (достраивает сразу).
  function worldAsync() {
    return new Promise(res => {
      if (W) { res(W); return; }
      const objs = F().allWorld(), ord = H.order, w = { byAi: new Map(), byId: new Map(), prefix: null, pos: new Map() }, pre = new Uint32Array(ord.length + 1);
      let i = 0, j = 0;
      const step = () => {
        if (W) { res(W); return; }                                                  // уже построена синхронно
        const t0 = performance.now();
        while (performance.now() - t0 < 8) {
          if (i < objs.length) { const o = objs[i++], r = o.albumRecord; w.byId.set(o.renderId, o); if (o.albumIndex != null && r && r.bucket === 'active' && r.physical && r.ns === 'world') w.byAi.set(o.albumIndex, o.renderId); continue; }
          if (j < ord.length) { const id = w.byAi.get(ord[j]); pre[j + 1] = pre[j] + (id ? 1 : 0); if (id) w.pos.set(id, j); j++; continue; }
          w.prefix = pre; W = w; perf('world', t0); res(W); return;
        }
        idle(step);
      };
      idle(step);
    });
  }
  function world() {
    if (W) return W;
    W = { byAi: new Map(), byId: new Map(), prefix: null };
    for (const o of F().allWorld()) {
      W.byId.set(o.renderId, o);
      const r = o.albumRecord;
      if (o.albumIndex != null && r && r.bucket === 'active' && r.physical && r.ns === 'world') W.byAi.set(o.albumIndex, o.renderId);
    }
    const ord = H.order, pre = new Uint32Array(ord.length + 1);
    for (let i = 0; i < ord.length; i++) pre[i + 1] = pre[i] + (W.byAi.has(ord[i]) ? 1 : 0);
    W.prefix = pre;
    W.pos = new Map(); ord.forEach((ai, p) => { const id = W.byAi.get(ai); if (id) W.pos.set(id, p); });
    return W;
  }
  const countOf = id => { const n = T[id]; if (!n || !n.span) return 0; const p = world().prefix; return p[n.span[1]] - p[n.span[0]]; };
  const bodiesOf = id => { const n = T[id]; if (!n || !n.span) return []; const w = world(), out = []; for (let i = n.span[0]; i < n.span[1]; i++) { const r = w.byAi.get(H.order[i]); if (r) out.push(r); } return out; };
  const label = id => String((T[id] && T[id].label) || '').trim();
  const fold = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

  /* ---------- нормализация поиска §2.4 (одна для меню и ⌘K) ---------- */
  // 1.0.19a A-04: таблица латинских двойников — одна, в общей свёртке оболочки (AtlasShell.LAT); здесь — запасная копия той же таблицы
  const LAT = (window.AtlasShell && window.AtlasShell.LAT) || { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'у' };
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[a-z]/g, ch => LAT[ch] || ch).replace(/[\s.\-‐-―−‑_·,]+/g, '');
  const squash = s => String(s || '').replace(/[\s.\-‐-―−‑_·,]+/g, '');

  /* ---------- разделы: 13 корневых; одноимённые ветки (14-я «Полы и приямки») сводятся по подписи ---------- */
  // V12.1b · п. 13: отметка уровня («+3,500», «+3.500») в подписи, если она уже есть у уровня выше, — убирается
  const levMark = s => { const m = /[+±−-]\s?\d+[.,]\d{3}/.exec(String(s || '')); return m ? m[0].replace(/\s/g, '').replace('.', ',').replace('−', '-') : null; };
  function stripMark(lab, mark) {
    if (!mark) return lab; const m = /[+±−-]\s?\d+[.,]\d{3}/.exec(String(lab || '')); if (!m) return lab;
    if (m[0].replace(/\s/g, '').replace('.', ',').replace('−', '-') !== mark) return lab;
    const out = (lab.slice(0, m.index) + lab.slice(m.index + m[0].length)).replace(/\s*[·,]\s*$/, '').replace(/^\s*[·,]\s*/, '').replace(/\s{2,}/g, ' ').trim();
    return out || lab;
  }
  function mergeByLabel(ids) {
    const out = [], by = new Map();
    for (const id of ids) {
      const n = T[id]; if (!n) continue;
      const key = fold(n.label);
      if (by.has(key)) { by.get(key).ids.push(id); continue; }
      const v = { ids: [id] }; by.set(key, v); out.push(v);
    }
    return out;
  }
  const SECTIONS = mergeByLabel(T.construction.children);
  const secOf = {}; for (const v of SECTIONS) for (const id of v.ids) secOf[id] = v.ids[0];

  /* ---------- реестр узлов ---------- */
  // учёт длительности своих задач (мс): кусок разбора реестра, перерисовка дерева — для проверки «длинных задач > 50 мс от atlas-nodes.js — 0»
  const PERF = { step: 0, render: 0, world: 0 }, perf = (k, t0) => { const d = performance.now() - t0; if (d > PERF[k]) PERF[k] = d; };
  const R = { ready: false, loading: false, nodes: [], byK: new Map(), owner: new Map(), anchorOf: new Map(), types: new Map(), unassigned: [], conflicts: [], meta: null };
  let bsetCache = null;
  const buildingSet = () => bsetCache || (bsetCache = new Set(world().byAi.values()));
  const toId = x => typeof x === 'number' ? (world().byAi.get(x) || null) : x;
  function prep(raw) {
    const n = { ...raw };
    n.anchors = (raw.anchors || []).map(toId).filter(Boolean);
    const roles = {};
    for (const [role, list] of Object.entries(raw.roles || {})) { const ids = (list || []).map(toId).filter(Boolean); if (ids.length) roles[role] = ids; }
    n.roles = roles;
    n.all = [...new Set(Object.values(roles).flat().concat(n.anchors))];
    n.rebarIds = (RB && roles[RB]) || [];
    // V12.1b · п. 2: «Показать армирование» — все тела узла «по щелчку» (как rebarFor в V12.0c), в какой бы роли они ни были
    const bset = buildingSet(), rset = new Set(n.rebarIds);
    n.odIds = n.all.filter(id => !bset.has(id) && !isVirt(id) && !rset.has(id));
    const oset = new Set(n.odIds);
    n.memberIds = n.all.filter(id => !rset.has(id) && !oset.has(id));
    n.arm = n.rebarIds.length;
    n.qn = [n.l, n.k, ...(raw.q || [])].map(norm);
    // Подпись в меню без повтора уровня (макет D V12_1_меню): «МУ 10 (a) · перекрытие +7,100» → «МУ 10 (a)», если хвост совпадает с уровнем узла
    const m = /^(.*\S)\s*·\s*([^·]+)$/.exec(String(n.l || ''));
    n.ls = m && n.lev && fold(m[2]) === fold(n.lev) ? m[1] : n.l;
    return n;
  }
  function ingest(x) {
    R.meta = { v: x.v, built: x.built, source: x.source || null };
    for (const t of x.types || []) R.types.set(t.t, t);
    R.unassigned = x.unassigned || []; R.conflicts = x.conflicts || [];
    const raw = x.nodes || [];
    let i = 0;
    return new Promise(done => {
      const step = dl => {
        const t0 = performance.now();
        while (i < raw.length && performance.now() - t0 < 8) {
          const n = prep(raw[i++]);
          R.nodes.push(n); R.byK.set(n.k, n);
          for (const id of n.all) if (!R.owner.has(id)) R.owner.set(id, n.k);
          for (const id of n.anchors) R.anchorOf.set(id, n.k);
          armCount(n); rebarRoles(n);                                              // счёт армирования — здесь, в простое, а не при первой перерисовке
        }
        perf('step', t0);
        if (i < raw.length) idle(step); else done();
      };
      // карта тел здания — отдельной задачей до разбора (иначе первый кусок разбора включает её построение)
      idle(() => { buildingSet(); idle(step); });
    });
  }
  let loadPromise = null;
  function failed() { R.failed = true; document.dispatchEvent(new CustomEvent('atlas:nodesfailed')); }
  function loadRegistry() {
    if (loadPromise) return loadPromise;
    R.loading = true;
    loadPromise = new Promise(res => {
      const finish = async () => {
        try {
          const g = window.ATLAS_NODES_GZIP; delete window.ATLAS_NODES_GZIP;
          const x = g ? await window.AtlasChunks.decode(g) : (window.ATLAS_NODES || null);
          if (x) await ingest(x);
          R.ready = !!x;
        } catch (e) { console.warn('Реестр узлов не прочитан', e); }
        R.loading = false; res(R.ready);
        if (!R.ready) failed();   // V12.8c: реестр не прочитан — карточка покажет «недоступно» с причиной, а не вечную «Загрузку…»
        // V12.1j: запрос, введённый до готовности реестра, пересчитывается
        if (R.ready) { window.__ATLAS_NODES_FAILED = false;   /* V12.10 · Y6: модуль пришёл позже 30 с — признак сбоя снят, карточка смотрит на реестр */
          clearKids(); if (find && norm(find.value)) { filterLimit.q = ''; applyFilter(find.value); } render(); document.dispatchEvent(new CustomEvent('atlas:nodes', { detail: { count: R.nodes.length } })); startLink(); }
      };
      if (window.ATLAS_NODES_GZIP || window.ATLAS_NODES) { finish(); return; }
      // V12.10 · Y6: тег данных уже вставила карточка (модуль пришёл > 30 с) — второй не вставлять, ждать этот
      const own = document.querySelector('script[src$="' + NODES_SRC + '"]');
      if (own) { const st = own.dataset.state; if (st === 'error') { R.loading = false; res(false); failed(); return; } if (st === 'done') { finish(); return; } own.addEventListener('load', finish, { once: true }); own.addEventListener('error', () => { R.loading = false; res(false); failed(); }, { once: true }); return; }
      const s = document.createElement('script'); s.src = NODES_SRC; s.async = true;
      s.onload = finish; s.onerror = () => { R.loading = false; res(false); failed(); };
      document.head.append(s);
    });
    return loadPromise;
  }
  // Загрузка: после rebar_links (цепочкой); сразу — если ссылка просит узел (node=, TREE:).
  const REGISTRY_PRESENT = true;
  // V12.2 · E4: движок сохраняет чужие ключи адреса (features.hashKeep) — читаем location.hash; без E4 — исходный адрес до движка
  const HK = () => !!(window.__ATLAS&&window.__ATLAS.features&&window.__ATLAS.features.hashKeep);
  const START = new URLSearchParams(String((HK() ? location.hash : window.__ATLAS_START_HASH) || '').slice(1));
  function maybeLoad() {
    if (!REGISTRY_PRESENT) return;
    const now = START.has('node') || /^TREE:n:/.test(START.get('scope') || '') || (START.get('scope') || '').startsWith('TREE:');
    if (now) { loadRegistry(); return; }
    const st = A().rebarLinksState && A().rebarLinksState();
    if (st === 'ready' || st === 'missing' || st === 'error') loadRegistry();
    else document.addEventListener('atlas:rebarlinks', () => loadRegistry(), { once: true });
  }

  /* ---------- строки дерева ---------- */
  const kidsCache = new Map();
  const clearKids = () => kidsCache.clear();
  const typeLabel = n => (R.types.get(n.t) || {}).l || '';
  function nodeRow(k) { const n = R.byK.get(k); return { kind: 'node', key: 'N:' + k, k, label: rowLabel(n), full: n.ls || n.l, n }; }
  // V12.2 · M8: у лотков ВК различающая часть — оси — в начале строки; оси берутся только из name тела-якоря, без него — подпись как есть
  function rowLabel(n) {
    const base = n.ls || n.l; if (!/^Лоток ВК/.test(base)) return base;
    const o = world().byId.get(n.anchors[0]), m = o && /·\s*(оси [^·]+?)\s*(?:·|$)/.exec(o.name || ''); if (!m) return base;
    const rest = base.replace(/^Лоток ВК\s*·?\s*/, '').replace(/\s*·\s*оси [^·]+/, '').trim();
    return m[1].replace(/\s*\/\s*/g, '/') + (rest ? ' · ' + rest : '');           // строка стоит под «Лотки ВК»; полная подпись — в подсказке
  }
  // Вид ряда для ребёнка дерева c (по §2.3): узел, группа или элемент. null — ряд не показывается.
  function rowFor(c, parentSec) {
    const t = T[c]; if (!t) return null;
    if (t.kind === 'body' || /^Тело сборки/.test(t.label || '')) return null;
    const cnt = countOf(c); if (!cnt) return null;
    if (R.ready) {
      const B = bodiesOf(c), own = new Set(), homes = new Set(); let free = 0;
      for (const id of B) { const k = R.owner.get(id); if (k) own.add(k); else free++; const h = R.anchorOf.get(id); if (h) homes.add(h); }
      if (!free && !homes.size) return null;                                     // всё ушло в узлы, живущие в другом месте
      if (!free && homes.size === 1 && own.size === 1) return nodeRow([...homes][0]);
      if (t.kind === 'entity' && B.length === 1) { const h = R.anchorOf.get(B[0]); if (h) return nodeRow(h); if (R.owner.has(B[0])) return null; }
    }
    if (t.kind === 'entity' && cnt === 1) { const id = bodiesOf(c)[0]; return { kind: 'el', key: 'E:' + id, id, label: t.label }; }
    let lab = String(t.label || '').trim();
    if (/Элементы без привязки/i.test(lab)) lab = 'Прочее · ' + label(parentSec);
    return { kind: 'tree', key: 'T:' + c, ids: [c], label: lab, sec: parentSec };
  }
  // Дети ряда. Одноимённые группы-соседи сводятся в одну строку (двойники «МУn / МУ n» уходят в узлы).
  const subNote = r => r.note || null;
  function kids(row) {
    if (kidsCache.has(row.key)) return kidsCache.get(row.key);
    let out = [];
    if (row.kind === 'root') out = SECTIONS.map(v => ({ kind: 'tree', key: 'T:' + v.ids[0], ids: v.ids, label: label(v.ids[0]), sec: v.ids[0] }));
    else if (row.kind === 'tree') {
      const seen = new Map(), nodes = new Set();
      for (const id of row.ids) for (const c of (T[id].children || [])) {
        const r = rowFor(c, row.sec); if (!r) continue;
        if (r.kind !== 'node') { const pm = levMark(row.label); if (pm) r.label = stripMark(r.label, pm); }
        if (r.kind === 'node') { if (nodes.has(r.k)) continue; nodes.add(r.k); out.push(r); continue; }
        if (r.kind === 'tree') { const lk = fold(r.label); if (seen.has(lk)) { seen.get(lk).ids.push(...r.ids); continue; } seen.set(lk, r); }
        out.push(r);
      }
      // V12.1e · п. 3 (§2.3): узел с живым родителем (up) стоит только под родителем — в списки групп не выводится (сваи Пл-1 входов 4/5)
      out = out.filter(r => r.kind !== 'node' || !r.n.up || !R.byK.has(r.n.up));
      out = out.filter(r => r.kind !== 'tree' || !R.ready || kids(r).length);          // группа, где остались только такие узлы, — не показывается
      if (out.length && out.every(r => r.kind === 'node')) out.sort((a, b) => String(a.full).localeCompare(String(b.full), 'ru', { numeric: true }));
      // V12.1b · п. 3: длинный список окон — по фасадам (§2.2): поле group из nodes.js, без него — фасад из подписи (часть name)
      for (const pg of PAGED) {   // К1: config.nodes.paged_groups
      const wins = out.filter(r => r.kind === 'node' && r.n.t === pg.type), sp = pg.label_split || ' / ';
      if (wins.length > (pg.page || PAGE)) {
        const facade = n => (pg.field && n[pg.field]) || (String(n.l).split(sp).length >= 3 ? String(n.l).split(sp).slice(1).join(sp).replace(/\s*·\s*\d+$/, '') : (pg.fallback || ''));
        const by = new Map(); for (const r of wins) { const g = facade(r.n); if (!by.has(g)) by.set(g, []); by.get(g).push(r); }
        const grp = [...by].sort((a, b) => a[0].localeCompare(b[0], 'ru', { numeric: true })).map(([g, list]) => ({ kind: 'grp', key: 'G:' + row.key + '|' + g, label: g, list }));
        out = out.filter(r => !(r.kind === 'node' && r.n.t === pg.type)).concat(grp);
      }
      }
      // V12.5 · Q8 (F5-1-14): группы «Типовые узлы · без размещения» в этом меню не показываются — тел в здании у образцов нет (countOf = 0), подпись «образец узла» не нужна
      // V12.5 · Q8 (F5-1-17): в «Фундаментах» — и Фп-1 лестницы Л-1 (узел живёт в своём разделе; строка-переход открывает его там)
      for (const x of XLINKS) if (x && row.ids.includes(x.section) && R.ready && R.byK.has(x.node) && !out.some(r => r.k === x.node)) out.push({ kind: 'el', key: 'X:' + x.node, id: R.byK.get(x.node).anchors[0], link: x.node, label: x.label, note: x.note });   // К1: config.nodes.cross_links
    } else if (row.kind === 'grp') out = row.list;
    else if (row.kind === 'node') {
      const n = row.n;
      for (const [role, ids] of Object.entries(n.roles)) out.push({ kind: 'role', key: 'R:' + n.k + '|' + role, k: n.k, role, ids, label: roleLabel(role, ids) });
      for (const m of R.nodes) if (m.up === n.k) out.push(nodeRow(m.k));
    } else if (row.kind === 'role') out = row.ids.map(id => ({ kind: 'el', key: 'E:' + id, id, label: nameOf(id) }));
    kidsCache.set(row.key, out);
    return out;
  }
  function nameOf(id) { const o = world().byId.get(id); try { if (o && window.AtlasCard) return window.AtlasCard.human(o).title || o.name; } catch (e) { /* */ } return (o && o.name) || id.split('::').pop(); }
  function roleLabel(role, ids) {
    const names = new Set(ids.map(id => { const o = world().byId.get(id); return o ? o.name : null; }));
    const one = names.size === 1 ? [...names][0] : null;
    return one && one !== role ? role + ' · ' + one : role;
  }
  // Счётчик: раздел/уровень — тела здания; группа, где только узлы, — «N узлов»; узел — «n · арм. m».
  function counter(row) {
    // V12.1d · п. 1: в строке меню — короткий счёт («арм. 63», «обв. 137», «покр. 10», «анк. 42»); полная подпись — в подсказке (counterTitle)
    if (row.kind === 'node') { const arm = armCount(row.n); return fmt(row.n.n != null ? row.n.n : row.n.memberIds.length) + (arm ? ' · ' + shortRole(rebarRoles(row.n)) + ' ' + fmt(arm) : ''); }
    if (row.kind === 'role') { const n = R.byK.get(row.k), mr = isVRebar; return fmt(row.ids.filter(id => !mr(id)).length + (row.ids.some(mr) ? (n && n.bars != null ? +n.bars : bodies(row.ids.filter(mr))) : 0) + bodies(row.ids.filter(isDeckAng)) - row.ids.filter(isDeckAng).length); }
    if (row.kind === 'el') return '';
    if (row.kind === 'all') return fmt(world().byAi.size);
    if (filter && (row.kind === 'tree' || row.kind === 'grp')) return '';
    if (row.kind === 'grp') return fmt(row.list.length) + ' ' + plural(row.list.length, 'узел', 'узла', 'узлов');
    if (R.ready && row.kind === 'tree' && row.sec !== row.ids[0]) { const k = kids(row); if (k.length && k.every(r => r.kind === 'node')) return fmt(k.length) + ' ' + plural(k.length, 'узел', 'узла', 'узлов'); }
    const nb = row.ids.reduce((s, id) => s + countOf(id), 0);
    if (!nb && row.kind === 'tree') { const h = hnodes(row.ids), cat = h.reduce((s, x) => s + (+x.catalogue_count || 0), 0), reg = h.reduce((s, x) => s + (+x.registry_count || 0), 0);   // К1: раздел без тел — из иерархии данных
      if (cat) return 'на модели 0 · в каталоге ' + fmt(cat); if (reg) return 'на модели 0 · в реестре ' + fmt(reg); }
    return fmt(nb);
  }
  const noBodies = () => (window.ATLAS_RELEASE || {}).elements === 0;
  const secZero = r => { if (!noBodies() || secCount(r)) return ''; const h = hnodes(r.ids), cat = h.reduce((s, x) => s + (+x.catalogue_count || 0), 0), reg = h.reduce((s, x) => s + (+x.registry_count || 0), 0); return cat ? 'на модели 0 · в каталоге ' + fmt(cat) : reg ? 'на модели 0 · в реестре ' + fmt(reg) : ''; };   // К1: тел в здании нет по данным выпуска
  const hnodes = ids => { let h = null; try { h = F().tree(); } catch (e) { /* нет иерархии */ } const N = (h && h.nodes) || {}; return ids.map(id => N[id]).filter(Boolean); };
  const ROLE_SHORT = NC.role_short || {};   // К1: config.nodes.role_short
  function composition(n) {
    return Object.entries(n.roles).filter(([r]) => r !== RB).map(([r, ids]) => { const s = ROLE_SHORT[r] !== undefined ? ROLE_SHORT[r] : r.toLowerCase(); const c = bodies(ids); return s ? s + (c > 1 ? ' ×' + c : '') : null; }).filter(Boolean).join(' · ');
  }

  /* ---------- разметка ---------- */
  const host = $('navViewNodes');
  const box = $('nodeTree') || make('div', { class: 'nt', id: 'nodeTree', role: 'tree', 'aria-label': 'Состав модели' });   /* 1.0.19a к2 (A-11): «Узлы» → «Состав» */   // V12.1h · п. 4: заготовка из atlas-elements.js
  const note = make('p', { class: 'nt-note', 'aria-live': 'polite' });
  host.prepend(box, note);
  // V12.2 · M15: над деревом — подпись столбца галок и плашка набора «Набор: N из 13 · тел · Сбросить»
  const secHead = make('div', { class: 'nt-sethead', hidden: '' });
  host.insertBefore(secHead, box);
  // V12.1h · п. 4: дерево движка #albumTree скрыто сразу (nt-on); до готовности карты в #nodeTree — строка «Загрузка узлов…»
  let mapReady = false;
  const loadingRow = () => { const row = make('div', { class: 'nt-row nt-load', 'data-key': '', role: 'status', style: '--d:0' }); row.append(make('span', { class: 'nt-l' }, 'Загрузка узлов…')); return row; };
  box.replaceChildren(loadingRow()); box.removeAttribute('role');      // V12.2 · S1: строка загрузки — не внутри role=tree
  document.body.classList.add('nt-on');
  const find = $('navFind');
  const expanded = new Set();                                                        // раскрытые ряды (ключи)
  const pages = new Map();                                                       // ключ → сколько строк показано
  let focusKey = null, filter = null;

  // V12.2 · E2: раздел — __ATLAS.scope() (дёшево); без E2 — прежний модуль ревизий.state() (собирает всю сцену)
  const E2 = () => !!(window.__ATLAS && window.__ATLAS.features && window.__ATLAS.features.sceneReady);
  function curScope() { try { const a = window.__ATLAS; if (a && typeof a.scope === 'function') return a.scope(); return 'BUILDING'; } catch (e) { return 'BUILDING'; } }   /* К1 § 2: раздел — только __ATLAS.scope() */
  let renderSc = null;                                                           // раздел — один раз за перерисовку (state() движка тяжёлый)
  function isCurrent(row) {
    const sc = renderSc || curScope(), st = state;
    if (row.kind === 'node') return st.k === row.k;
    if (row.kind === 'tree') return !st.k && row.ids.some(id => sc === 'TREE:' + id);
    if (row.kind === 'all') return !st.k && sc === 'BUILDING';
    if (row.kind === 'el') { const o = F().selected(); return !!o && o.renderId === row.id && !!st.k; }
    return false;
  }
  // V12.1e: предел строк в DOM не съедает разделы дерева — строки первого уровня выводятся всегда, вложенные — из общего запаса MAX_ROWS;
  // длинная ветка показывается окном (не больше WINDOW строк): «ещё N» двигает окно до конца списка, «предыдущие N» — назад.
  const WINDOW = PAGE * 2;
  function flat() {
    const rootRow = { kind: 'root', key: 'root' };
    // V12.1h · п. 1: в фильтре строки — по лучшему рангу своих совпадений (стабильно: при равенстве — порядок разделов)
    const inF = row => { const l = kids(row).filter(r => filter.keep.has(r.key)), b = filter.best; return l.sort((x, y) => (b.has(x.key) ? b.get(x.key) : 1e9) - (b.has(y.key) ? b.get(y.key) : 1e9)); };
    const rootList = filter ? inF(rootRow) : kids(rootRow);
    // V12.1h · п. 3: ветка, где нажали «ещё» в фильтре, получает свой запас строк (filter.pages: ключ → {n, trail}), а не весь предел;
    // путь к ней выводится всегда, её строки вычитаются из общего запаса по факту
    const fp = filter ? filter.pages : null, onPath = new Set();
    if (fp) for (const [key, v] of fp) { v.trail.forEach(k => onPath.add(k)); onPath.add(key); }
    let out = [], used = 0;
    const walk = (row, depth, trail, pl) => {
      const list = depth === 0 ? rootList : filter ? inF(row) : kids(row);
      const own = !!fp && depth > 0 && fp.has(row.key), at = out.length;
      const lim = depth === 0 || filter ? list.length : Math.min(list.length, pages.get(row.key) || PAGE);
      const start = depth === 0 || filter ? 0 : Math.max(0, lim - WINDOW);
      if (own) pl = { n: fp.get(row.key).n, own: true };
      if (start > 0 && pl.n > 0) { out.push({ less: true, parent: row.key, start, depth }); pl.n--; }
      let cut = false; const sz = [];
      for (let i = start; i < lim; i++) {
        const r = list[i], late = depth > 0 && pl.n <= 0;
        if (late && !cut) {
          cut = true; const rest = list.slice(i).filter(x => !onPath.has(x.key)).length;
          if (rest) out.push({ more: true, cut: true, parent: row.key, rest, inBranch: out.length - at, before: sz.slice(), next: (list.slice(i).find(x => !onPath.has(x.key)) || {}).key, depth, trail });
        }
        if (late && !onPath.has(r.key)) continue;
        const expandable = r.kind === 'tree' || r.kind === 'grp' || r.kind === 'node' || (r.kind === 'role' && r.ids.length > 1);
        const isOpen = expandable && (filter ? filter.open.has(r.key) : expanded.has(r.key));
        const a0 = out.length;
        out.push({ r, depth, expandable, isOpen, parent: row.key });
        if (depth > 0) { pl.n--; if (pl.own || late) used++; }
        if (isOpen) walk(r, depth + 1, trail.concat(r.key), pl);
        if (isOpen && filter) sz.push([r.key, out.length - a0]);
      }
      if (list.length > lim) out.push({ more: true, parent: row.key, rest: list.length - lim, depth });
    };
    if (!filter) out.push({ r: { kind: 'all', key: 'all', label: S.siteText('whole', 'Всё здание') }, depth: 0, expandable: false, isOpen: false, parent: 'none' });
    if (fp && fp.size) {
      let u = 0, pass = 0, max = 0; for (const v of fp.values()) max += v.n + v.trail.length + 1;
      for (;;) { out = []; used = 0; walk(rootRow, 0, [], { n: MAX_ROWS - rootList.length - u }); if (used <= u) break; u = ++pass < 4 ? used : max; }
    }
    else walk(rootRow, 0, [], { n: MAX_ROWS - rootList.length - (filter ? 0 : 1) });
    return out;
  }
  /* ---------- 390 (§2.6): один уровень на экран, «‹ <родитель>», строки ≥ 44 px, «›» 44×44 — «Состав» без перехода ---------- */
  let pstack = [];                                                               // путь рядов от корня до показанного уровня
  const ROOT = { kind: 'root', key: 'root', label: 'Разделы' };
  /* 1.1.1 B4: в ветке на телефоне путь («‹ Назад», «Разделы › …») и текущая ветка (полное имя, счётчик) — над полем поиска и фильтрами (#left.nt-branch);
     поиск, вид и «Уровень» свёрнуты под «Поиск и фильтры» (развёрнуты, пока в поиске есть текст), строка «Всё здание» прячется — над деревом одна подпись.
     Прокрутка каждого уровня запоминается и возвращается «‹ Назад» (фокус — на строке, из которой вошли). Длинное имя строки — в две строки (касанием не нужно гадать). */
  const pbar = make('div', { class: 'nt-pbar', hidden: '' });
  if (find && find.parentElement) find.before(pbar); else host.parentElement.insertBefore(pbar, host);
  const pScroll = new Map(); let pShown = null, pFocus = null, fOpen = false;
  const pKey = () => pstack.map(r => r.key).join('|');
  function pGo(next, focus) { if (pShown !== null && host.offsetParent) pScroll.set(pShown, host.scrollTop); pstack = next; pFocus = focus || null; }
  function pBar() {
    const L = $('left'), on = phone() && pstack.length > 0 && !!host.offsetParent;
    const filt = !!(find && find.value.trim());
    if (L) { L.classList.toggle('nt-branch', on); L.classList.toggle('nt-filters-open', on && (fOpen || filt)); }
    pbar.hidden = !on; if (!on) { pbar.replaceChildren(); return; }
    const at = pstack[pstack.length - 1], up = pstack[pstack.length - 2] || ROOT;
    const back = make('button', { type: 'button', class: 'nt-back', 'aria-label': 'Назад: ' + up.label }, '‹ Назад');
    back.onclick = () => { const k = at.key; pGo(pstack.slice(0, -1), k); const t = pstack[pstack.length - 1]; if (t && t.kind === 'tree') { try { A().setScope('TREE:' + t.ids[0]); } catch (e) { /* */ } } renderNow(); };
    const path = make('span', { class: 'nt-path' }, [ROOT].concat(pstack.slice(0, -1)).map(r => r.full || r.label).join(' › ') + ' ›');
    const tools = make('button', { type: 'button', class: 'nt-ftoggle', 'aria-expanded': String(fOpen || filt) }, 'Поиск и фильтры');
    tools.onclick = () => { fOpen = !fOpen; pBar(); requestAnimationFrame(fitHost); };
    const row1 = make('div', { class: 'nt-prow' }); row1.append(back, path, tools);
    const head = make('div', { class: 'nt-head', 'aria-current': 'location' }); head.append(make('span', { class: 'nt-hl' }, at.full || at.label), make('span', { class: 'nt-n' }, counter(at)));
    pbar.replaceChildren(row1, head);
  }
  if (find) find.addEventListener('input', () => { if (phone() && pstack.length) pBar(); });
  function renderPhone() {
    secHeadSync();
    const at = pstack[pstack.length - 1] || ROOT, list = kids(at), frag = document.createDocumentFragment();
    const key = pKey(), changed = pShown !== key, active = document.activeElement, scroll = changed ? (pScroll.get(key) || 0) : host.scrollTop;
    const keepEl = box.contains(active) ? active.closest('.nt-row') : null, focusK = pFocus || (keepEl && keepEl.dataset.key) || null, onGo = !!(active && active.classList && active.classList.contains('nt-go')); pBar();
    const lim = Math.min(list.length, pages.get(at.key) || PAGE), start = Math.max(0, lim - PAGE * 2);
    if (start > 0) { const b = make('button', { type: 'button', class: 'nt-more', style: '--d:0' }, 'предыдущие ' + fmt(start)); b.onclick = () => keepAnchor(b, 'next', () => { pages.set(at.key, Math.max(PAGE, lim - PAGE)); renderNow(); }); frag.append(b); }
    for (const r of list.slice(start, lim)) {
      const el = make('div', { class: 'nt-row nt-' + r.kind, role: 'treeitem', 'aria-level': String(pstack.length + 1), 'data-key': r.key, tabindex: '-1', style: '--d:0' });
      if (!pstack.length && r.kind === 'tree') { el.title = r.label + ' · ' + fmt(secCount(r)) + ' ' + plural(secCount(r), 'элемент', 'элемента', 'элементов'); if (secSet.has(r.key)) el.classList.add('nt-on'); el.append(make('span', { class: 'nt-tw', 'aria-hidden': 'true' }), make('span', { class: 'nt-l' }, r.label), secBox(r), make('span', { class: 'nt-sub' }, secZero(r) || (fmt(secCount(r)) + ' ' + plural(secCount(r), 'элемент', 'элемента', 'элементов')))); }   // V12.2 · M15: галки — на первом уровне шторки; R2-03: число — второй строкой
      else { const t = counterTitle(r); el.append(make('span', { class: 'nt-tw', 'aria-hidden': 'true' }), make('span', { class: 'nt-l', title: t ? (r.full || r.label) + ' · ' + t : (r.full || r.label) }, r.label), make('span', { class: 'nt-n', title: t || null }, counter(r))); }
      if (r.kind === 'node' && state.k === r.k) { const c = composition(r.n); if (c) el.append(make('span', { class: 'nt-sub' }, c)); }
      else if (subNote(r)) el.append(make('span', { class: 'nt-sub' }, subNote(r)));
      const drill = r.kind === 'tree' || r.kind === 'grp' || r.kind === 'node' || (r.kind === 'role' && r.ids.length > 1);
      if (drill) { const go = make('button', { type: 'button', class: 'nt-go', 'aria-label': (r.kind === 'node' ? 'Состав: ' : 'Открыть: ') + r.label }); go.append(window.AtlasIcons ? window.AtlasIcons.el('chevron-right', null, 'icon--16') : document.createTextNode('›')); go.onclick = e => { e.stopPropagation(); pGo(pstack.concat(r)); render(); }; el.append(go); el.classList.add('has-go'); }
      if (isCurrent(r)) el.setAttribute('aria-current', 'true');
      el.onclick = () => {
        if (r.kind === 'tree') { pGo(pstack.concat(r)); try { if (state.k) closeQuiet(); A().setScope('TREE:' + r.ids[0]); } catch (e) { /* */ } render(); }
        else if (r.kind === 'grp') { pGo(pstack.concat(r)); render(); }
        else if (r.kind === 'node') { N.open(r.k); $('left').classList.remove('open'); }
        else if (r.kind === 'role') { selectBody(r.ids[0]); $('left').classList.remove('open'); }
        else if (r.kind === 'el') { if (r.link) N.open(r.link); else selectBody(r.id); $('left').classList.remove('open'); }
      };
      frag.append(el);
    }
    if (list.length > lim) { const b = make('button', { type: 'button', class: 'nt-more', style: '--d:0' }, 'ещё ' + fmt(list.length - lim)); b.onclick = () => keepAnchor(b, 'prev', () => { pages.set(at.key, lim + PAGE); renderNow(); }); frag.append(b); }
    host.style.scrollPaddingTop = '';   // 1.1.1 B4: путь и заголовок уровня — над деревом (.nt-pbar), не липкие внутри прокрутки
    box.replaceChildren(frag);
    const back = focusK ? box.querySelector('[data-key="' + CSS.escape(focusK) + '"]') : null;   // 1.1.1 B4: возврат — на строку, из которой вошли
    const f = back || box.querySelector('[aria-current]') || box.querySelector('.nt-row'); if (f) f.tabIndex = 0;
    if (back && (keepEl || pbar.contains(active) || active === document.body || !active)) ((onGo && back.querySelector('.nt-go')) || back).focus({ preventScroll: true });
    fitHost(); host.scrollTop = scroll; pShown = key; pFocus = null;
    note.textContent = '';
  }
  function phoneStackTo(k) {                                                     // уровень, на котором стоит узел
    const p = pathKeys(k); if (!p) return;
    const out = []; let row = ROOT;
    for (const key of p.slice(0, -1)) { const r = kids(row).find(x => x.key === key); if (!r) break; out.push(r); row = r; }
    pGo(out);
  }
  let wasPhone = phone();
  addEventListener('resize', () => { if (phone() !== wasPhone) { wasPhone = phone(); if (!wasPhone) pBar(); render(); } });
  // Перерисовка — не чаще раза за кадр (событие узла, смена раздела и выбор приходят подряд); клавиатура — сразу (renderNow).
  let rq = 0;
  function render() { if (rq) return; rq = setTimeout(() => { rq = 0; renderNow(); }, 0); }
  function renderNow() {
    const t0 = performance.now(), c0 = kidsCache.size; try { renderNowInner(); } finally { perf('render', t0); (PERF.log = PERF.log || []).push([Math.round(performance.now() - t0), kidsCache.size - c0, state.k || '-', phone() ? 'p' : 'd']); if (PERF.log.length > 30) PERF.log.shift(); }
  }
  function renderNowInner() {
    if (rq) { clearTimeout(rq); rq = 0; }
    if (!mapReady) { if (!box.querySelector('.nt-load')) box.replaceChildren(loadingRow()); return; }
    if (box.getAttribute('role') !== 'tree') box.setAttribute('role', 'tree');
    secHeadSync();
    renderSc = curScope();
    if (phone() && !filter) { renderPhone(); return; }
    const hadFocus = box.contains(document.activeElement);                    // перерисовка не сбрасывает фокус клавиатуры
    const rows = flat(), frag = document.createDocumentFragment();
    let cur = null;
    for (const x of rows) {
      if (x.less) {
        const b = make('button', { type: 'button', class: 'nt-more', style: '--d:' + x.depth }, 'предыдущие ' + fmt(x.start));
        b.onclick = () => keepAnchor(b, 'next', () => { pages.set(x.parent, Math.max(PAGE, (pages.get(x.parent) || PAGE) - PAGE)); renderNow(); });
        frag.append(b); continue;
      }
      if (x.more) {
        const b = make('button', { type: 'button', class: 'nt-more', style: '--d:' + x.depth }, 'ещё ' + fmt(x.rest));
        // запас строк кончился на раскрытых соседях — без фильтра оставить раскрытым только путь к этой ветке; иначе — следующее окно ветки
        // V12.1h · п. 3: в фильтре путь ветки добавляется к filter.open (не заменяя), ветке — своё окно (не больше двух таких веток)
        b.onclick = () => keepAnchor(b, 'prev', () => {
          if (x.cut && filter) {
            x.trail.forEach(k => filter.open.add(k));
            const fp = filter.pages, cap = MAX_ROWS - kids({ kind: 'root', key: 'root' }).filter(r => filter.keep.has(r.key)).length - x.trail.length - 1;
            const was = fp.get(x.parent); fp.delete(x.parent);
            const n = Math.min(cap, Math.max(was ? was.n + PAGE : 0, x.inBranch + PAGE));
            // запас ветки исчерпан — свернуть с конца столько её раскрытых детей выше кнопки, чтобы поместились оставшиеся строки
            if (n <= (was ? was.n : x.inBranch)) { let free = 0; for (let j = x.before.length - 1; j >= 0 && free < Math.min(x.rest, PAGE); j--) { filter.open.delete(x.before[j][0]); free += x.before[j][1] - 1; } }
            let others = 0; for (const v of fp.values()) others += v.n;
            while (fp.size && others + n > cap) { const k0 = fp.keys().next().value; others -= fp.get(k0).n; fp.delete(k0); }
            fp.set(x.parent, { n, trail: x.trail.slice() });
          } else if (x.cut) { for (const k of [...expanded]) if (!x.trail.includes(k)) expanded.delete(k); }
          else pages.set(x.parent, (pages.get(x.parent) || PAGE) + PAGE);
          renderNow();
        }, x.next);
        frag.append(b); continue;
      }
      const r = x.r, el = make('div', { class: 'nt-row nt-' + r.kind, role: 'treeitem', 'aria-level': String(x.depth + 1), 'data-key': r.key, tabindex: '-1', style: '--d:' + x.depth });
      if (x.expandable) el.setAttribute('aria-expanded', String(x.isOpen));
      const tw = make('span', { class: 'nt-tw', 'aria-hidden': 'true' });
      if (x.expandable) { tw.append(window.AtlasIcons ? window.AtlasIcons.el('chevron-right', null, 'icon--16') : document.createTextNode('▸')); tw.onclick = e => { e.stopPropagation(); toggle(r.key); }; }
      const lab = make('span', { class: 'nt-l', title: r.full || r.label }, r.label);
      const cnt = make('span', { class: 'nt-n' }, counter(r)); { const t = counterTitle(r); if (t) { cnt.title = t; lab.title = (r.full || r.label) + ' · ' + t; } }
      if (x.depth === 0 && r.kind === 'tree') { el.title = r.label + ' · ' + fmt(secCount(r)) + ' ' + plural(secCount(r), 'элемент', 'элемента', 'элементов'); if (secSet.has(r.key)) el.classList.add('nt-on'); el.append(tw, lab, secBox(r)); { const z = secZero(r); if (z) { el.append(make('span', { class: 'nt-sub' }, z)); el.title = r.label + ' · ' + z; } } }   // V12.2 · M15: галка вместо числа
      else el.append(tw, lab, cnt);
      if (r.kind === 'node' && (x.isOpen || state.k === r.k)) { const c = composition(r.n); if (c) el.append(make('span', { class: 'nt-sub' }, c)); }
      else if (subNote(r)) el.append(make('span', { class: 'nt-sub' }, subNote(r)));
      if (isCurrent(r)) { el.setAttribute('aria-current', 'true'); cur = el; }
      el.onclick = () => activate(r, x);
      frag.append(el);
    }
    box.replaceChildren(frag);
    const f = focusKey && box.querySelector('[data-key="' + CSS.escape(focusKey) + '"]') || cur || box.querySelector('.nt-row');
    if (f) { f.tabIndex = 0; if (hadFocus) f.focus({ preventScroll: true }); }
    note.replaceChildren();
    // V12.1g · п. 3: «показаны N» — по фактически выведенным узлам-совпадениям; упор в предел строк — «уточните запрос»
    const hitSet = filter ? new Set(filter.hits) : null, drawn = filter ? rows.filter(x => x.r && x.r.kind === 'node' && hitSet.has(x.r.k)).length : 0, capped = filter && rows.some(x => x.cut);
    if (filter && !rows.length) {   // 1.0.19a A-04 (М-8): пусто — запрос, «Искать во всём здании» (поиск шапки, 1 нажатие) и «Сбросить»
      const q = (find && find.value || '').trim();
      note.append(document.createTextNode('Ничего не найдено по «' + q + '». '));
      const all = make('button', { type: 'button', class: 'nt-more nt-all' }, S.siteText('search_all', 'Искать во всём здании'));
      all.onclick = () => document.dispatchEvent(new CustomEvent('atlas:searchall', { detail: { q } }));
      const rs = make('button', { type: 'button', class: 'nt-more nt-reset' }, 'Сбросить');
      rs.onclick = () => { find.value = ''; applyFilter(''); find.focus(); };
      note.append(all, document.createTextNode(' '), rs);
    }
    else if (filter && (capped || drawn < filter.shown)) note.textContent = 'Узлов: ' + fmt(filter.total) + ', показаны ' + fmt(drawn) + ' — уточните запрос';
    else if (filter && filter.total > filter.shown) {
      note.append(document.createTextNode('Узлов: ' + fmt(filter.total) + ', показаны ' + fmt(drawn) + ' '));
      const more = make('button', { type: 'button', class: 'nt-more' }, 'ещё ' + fmt(Math.min(60, filter.total - filter.shown)));
      more.onclick = () => { filterLimit.n += 60; applyFilter(find.value); };
      note.append(more);
    }
  }
  // V121-R1-01: после открытия узла (ссылка, поиск, «К узлу») строка узла — в середине колонки
  // V121-R1-08: прокручивается только контейнер дерева; колонка #left (вкладки, поиск, вид, «Уровень») не двигается
  const leftCol = $('left');
  N._fit = () => fitHost();
  function fitHost() {
    if (!host.offsetParent) return;
    const keep = leftCol.scrollTop; leftCol.scrollTop = 0;
    const tab = document.querySelector('.as-tabbar'), tabTop = tab && tab.offsetParent ? tab.getBoundingClientRect().top : innerHeight;
    const top = host.getBoundingClientRect().top, bottom = Math.min(leftCol.getBoundingClientRect().bottom, tabTop, innerHeight);
    host.style.maxHeight = Math.max(240, Math.floor(bottom - top - 8)) + 'px';
    leftCol.scrollTop = keep;
  }
  function scrollToCurrent() {
    requestAnimationFrame(() => { if (rq) renderNow();
      fitHost();
      const el = box.querySelector('.nt-row[aria-current="true"]'); if (!el || !el.offsetParent) return;
      leftCol.scrollTop = 0;
      const hr = host.getBoundingClientRect(), er = el.getBoundingClientRect();
      host.scrollTop += (er.top - hr.top) - (hr.height - er.height) / 2;
    });
  }
  addEventListener('resize', () => requestAnimationFrame(fitHost));
  document.addEventListener('atlas:navview', () => requestAnimationFrame(() => { if (phone()) pBar(); fitHost(); }));
  new ResizeObserver(() => requestAnimationFrame(fitHost)).observe(leftCol);
  // V12.1b · п. 7: колесо над полями колонки (вкладки, поиск, вид, «Уровень») не двигает #left — прокручивается дерево
  leftCol.addEventListener('wheel', e => {
    if (!host.offsetParent || host.contains(e.target) || !$('panelSections') || $('panelSections').hidden) return;
    if (!$('panelSections').contains(e.target) && !e.target.closest('.navigation-heading, .atlas-navigation, .left-tabs')) return;
    e.preventDefault(); host.scrollTop += e.deltaY; leftCol.scrollTop = 0;
  }, { passive: false });
  // шторка 390: при открытии — к текущему узлу (пока шторка закрыта, строк не видно и прокручивать нечего)
  let wasOpen = leftCol.classList.contains('open');
  new MutationObserver(() => { const o = leftCol.classList.contains('open'); if (o && !wasOpen) { scrollToCurrent(); setTimeout(scrollToCurrent, 80); setTimeout(scrollToCurrent, 320); } wasOpen = o; }).observe(leftCol, { attributes: true, attributeFilter: ['class'] });
  // V12.1g · п. 4: «ещё» / «предыдущие» — строка рядом с кнопкой остаётся на том же месте экрана (без скачка прокрутки)
  function keepAnchor(btn, side, fn, alt) {
    const sib = side === 'prev' ? btn.previousElementSibling : btn.nextElementSibling, key = sib && sib.dataset ? sib.dataset.key : null;
    const off = sib ? sib.getBoundingClientRect().top : null, bOff = btn.getBoundingClientRect().top;
    fn();
    const el = key && box.querySelector('[data-key="' + CSS.escape(key) + '"]');
    if (el && off != null) { host.scrollTop += el.getBoundingClientRect().top - off; return; }
    // V12.2 · S1: строка-якорь свернулась (cut у ветки на пределе) — первая новая строка встаёт на место кнопки
    const a = alt && box.querySelector('[data-key="' + CSS.escape(alt) + '"]');
    if (a) host.scrollTop += a.getBoundingClientRect().top - bOff;
  }
  function toggle(key) { if (filter) { if (filter.open.has(key)) filter.open.delete(key); else filter.open.add(key); } else if (expanded.has(key)) expanded.delete(key); else { collapseSiblings(key); expanded.add(key); } renderNow(); }
  // Аккордеон по соседям: раскрытие ветки сворачивает раскрытых соседей (строк в DOM ≤ 200).
  function collapseSiblings(key) {
    const rows = flat(), me = rows.find(x => x.r && x.r.key === key); if (!me) return;
    for (const x of rows) if (x.r && x.parent === me.parent && x.r.key !== key && expanded.has(x.r.key)) closeDeep(x.r.key);
  }
  function closeDeep(key) { expanded.delete(key); for (const k of [...expanded]) if (k !== key && k.startsWith('R:') && key.startsWith('N:') && k.startsWith('R:' + key.slice(2) + '|')) expanded.delete(k); }
  function activate(r, x) {
    focusKey = r.key;
    if (r.kind === 'all') { if (state.k) closeQuiet(); $('navBuilding')?.click(); render(); return; }
    if (r.kind === 'tree') {
      if (!expanded.has(r.key)) { collapseSiblings(r.key); expanded.add(r.key); }
      try { if (state.k) closeQuiet(); A().setScope('TREE:' + r.ids[0]); } catch (e) { /* */ }
      render();
    } else if (r.kind === 'node') {
      if (filter) clearFilter();
      if (!expanded.has(r.key)) { collapseSiblings(r.key); expanded.add(r.key); }
      N.open(r.k);
      if (phone()) $('left').classList.remove('open');
    } else if (r.kind === 'grp') { toggle(r.key); }
    else if (r.kind === 'role') { selectBody(r.ids[0]); }
    else if (r.kind === 'el') { if (r.link) { N.open(r.link); if (phone()) $('left').classList.remove('open'); } else selectBody(r.id); }
  }
  function selectBody(id) { try { A().select(id); $('right')?.classList.add('open'); } catch (e) { /* тело не в сцене */ } render(); }

  /* ---------- клавиатура: ↑ ↓ ← → Enter Home End ---------- */
  box.addEventListener('keydown', e => {
    const rows = [...box.querySelectorAll('.nt-row,.nt-more')], i = rows.indexOf(document.activeElement); if (i < 0) return;
    const go = j => { const t = rows[Math.max(0, Math.min(rows.length - 1, j))]; rows.forEach(r => r.tabIndex = -1); t.tabIndex = 0; t.focus(); focusKey = t.dataset.key || null; };
    const el = rows[i], key = el.dataset.key;
    if (e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(rows.length - 1); }
    else if (e.key === 'ArrowRight' && key) { e.preventDefault(); if (el.getAttribute('aria-expanded') === 'false') { toggle(key); refocus(key); } else if (el.getAttribute('aria-expanded') === 'true') go(i + 1); }
    else if (e.key === 'ArrowLeft' && key) {
      e.preventDefault();
      if (el.getAttribute('aria-expanded') === 'true') { toggle(key); refocus(key); }
      else { const lv = +el.getAttribute('aria-level'); for (let j = i - 1; j >= 0; j--) if (+rows[j].getAttribute('aria-level') === lv - 1) { go(j); break; } }
    } else if ((e.key === 'Enter' || e.key === ' ') && el.classList.contains('nt-row')) { e.preventDefault(); el.click(); renderNow(); refocus(key); }
  });
  const refocus = key => { const t = box.querySelector('[data-key="' + CSS.escape(key) + '"]'); if (t) { box.querySelectorAll('.nt-row').forEach(r => r.tabIndex = -1); t.tabIndex = 0; t.focus(); } };

  /* ---------- путь узла и раскрытие ---------- */
  function pathKeys(k) {                                                         // ключи рядов от раздела до узла
    const n = R.byK.get(k); if (!n) return null;
    if (n.up && R.byK.has(n.up) && n.up !== k) { const p = pathKeys(n.up); return p ? p.concat('N:' + k) : null; }   // вложенный узел — через родителя
    const out = []; let row = { kind: 'root', key: 'root' };
    for (let guard = 0; guard < 16; guard++) {
      const list = kids(row);
      const hit = list.find(r => r.kind === 'node' && r.k === k);
      if (hit) { out.push(hit.key); return out; }
      const g = list.find(r => r.kind === 'grp' && r.list.some(x => x.k === k || (n.up && x.k === n.up)));
      if (g) { out.push(g.key); row = g; continue; }
      const up = n.up && list.find(r => r.kind === 'node' && r.k === n.up);
      if (up) { out.push(up.key); row = up; continue; }
      const anchor = n.anchors[0], p = world().pos.get(anchor);
      const next = list.find(r => r.kind === 'tree' && r.ids.some(id => T[id].span && T[id].span[0] <= p && p < T[id].span[1]));
      if (!next) return out.length ? out : null;
      out.push(next.key); row = next;
    }
    return out;
  }
  function reveal(k) {
    const path = pathKeys(k); if (!path) return;
    expanded.clear(); for (const key of path) expanded.add(key);
    // строки узла за пределом «ещё N» — расширить страницу
    let row = { kind: 'root', key: 'root' };
    for (const key of path) { const list = kids(row), i = list.findIndex(r => r.key === key); if (i >= (pages.get(row.key) || PAGE)) pages.set(row.key, i + 1); row = list[i] || row; }
    focusKey = path[path.length - 1];
  }

  /* ---------- фильтр «Найти узел или марку» ---------- */
  function applyFilter(q) {
    const nq = norm(q);
    if (!nq) { filter = null; render(); return; }
    const keep = new Set(), openK = new Set();
    // V12.1g · п. 1: совпадения не отсекаются — порядок как у ⌘K (search: точное, начало, вхождение; точный регистр — только выше, при заглавной в запросе)
    const hitNodes = R.ready ? rank(q, R.nodes) : [];
    const limit = filterLimit.q === nq ? filterLimit.n : (filterLimit.q = nq, filterLimit.n = 60);
    const paths = [];
    for (const n of hitNodes.slice(0, limit)) { const p = pathKeys(n.k); if (!p) continue; paths.push(p); p.forEach((key, i) => { keep.add(key); if (i < p.length - 1) openK.add(key); }); }
    // разделы и группы по подписи
    const walk = (row, trail, d) => { if (d > 4) return; for (const r of kids(row)) { if (r.kind !== 'tree') continue; const t = trail.concat(r.key); if (norm(r.label).includes(nq)) t.forEach((key, i) => { keep.add(key); if (i < t.length - 1) openK.add(key); }); walk(r, t, d + 1); } };
    walk({ kind: 'root', key: 'root' }, [], 0);
    const best = new Map(); paths.forEach((p, i) => p.forEach(key => { if (!best.has(key)) best.set(key, i); }));
    const keepPg = filter && filter.q === nq ? filter.pages : new Map();
    filter = { q: nq, keep, open: openK, total: hitNodes.length, shown: Math.min(limit, hitNodes.length), hits: hitNodes.slice(0, limit).map(n => n.k), paths, best, pages: keepPg };
    render();
  }
  const filterLimit = { q: '', n: 60 };
  function clearFilter() { if (find) find.value = ''; filter = null; }
  if (find) { find.hidden = false; let t = 0; find.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => applyFilter(find.value), 120); }); find.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(t); if (norm(find.value) && (!filter || filterLimit.q !== norm(find.value))) applyFilter(find.value); renderNow(); const hs = filter && new Set(filter.hits), fr = hs && [...box.querySelectorAll('.nt-row.nt-node')].find(e => hs.has(e.dataset.key.slice(2))), k = fr && fr.dataset.key.slice(2); if (k) { e.preventDefault(); clearFilter(); N.open(k); } } if (e.key === 'ArrowDown') { const r = box.querySelector('.nt-row'); if (r) { e.preventDefault(); r.tabIndex = 0; r.focus(); } } }); }
  // Поиск узлов для меню и ⌘K: точный регистр (Пм2 / ПМ2) выше.
  function search(q, limit = 20) { return R.ready ? rank(q, R.nodes).slice(0, limit) : []; }
  function rank(q, list) {
    const nq = norm(q), sq = squash(q), cased = /[A-ZА-ЯЁ]/.test(String(q)); if (!nq) return [];
    const res = [];
    for (const n of list) {
      let s = -1;
      for (const x of n.qn) { if (x === nq) s = Math.max(s, 3); else if (x.startsWith(nq)) s = Math.max(s, 2); else if (x.includes(nq)) s = Math.max(s, 1); }
      if (s < 0) continue;
      // совпадение с начала слова подписи («ВК» в «Лоток ВК») выше, чем внутри слова («подготовка»)
      if (s < 2 && (n._lw || (n._lw = String(n.l || '').split(/[\s·/,()]+/).map(norm).filter(Boolean))).some(w => w.startsWith(nq))) s = 1.5;
      // точный регистр (Пм2 — плита пола, ПМ2 — плита лифта): полное совпадение +4, вхождение +3
      if (cased) { const vs = [n.l, n.k, ...(n.q || [])].map(squash); if (vs.some(x => x === sq)) s += 4; else if (vs.some(x => x.includes(sq))) s += 3; }
      res.push([s, n]);
    }
    return res.sort((a, b) => b[0] - a[0] || String(a[1].l).localeCompare(String(b[1].l), 'ru', { numeric: true })).map(x => x[1]);
  }

  /* ---------- открытие узла ---------- */
  let state = { k: null, mode: null, rebar: false, loading: false, count: { scene: 0, rebar: 0 } };
  let prev = null, applying = false, roofOn = false, hint = '';
  // V12.2 · E4: узел закрыт — node= и rebar= из адреса убрать (движок их теперь сохраняет, иначе следующий hashchange откроет узел снова)
  const hashNodeClear = () => { if (state.k || !HK() || !A().setHashParams) return; const h = new URLSearchParams(location.hash.slice(1)); if (h.has('node') || h.has('rebar')) try { A().setHashParams({ node: null, rebar: null }); } catch (e) { /* */ } };
  // V12.9 · W8 (решение владельца): открытый узел тела не заливает — выбор без заливки, подсветка только у элемента под курсором (движок, E1). Прежняя подсветка узла (V12.2 · E10) убрана.
  const emit = () => { hashNodeClear(); document.dispatchEvent(new CustomEvent('atlas:node', { detail: { k: state.k, mode: state.mode, rebar: state.rebar, loading: state.loading } })); render(); };
  // Тела раздела без нашего наложения (sceneObjects включает и добавленные наложением тела).
  const sceneIds = () => { const ov = new Set((A().overlayState() || {}).ids || []); return new Set((A().sceneObjects() || []).map(o => o.renderId).filter(id => !ov.has(id))); };
  function resetLevel() { const lv = $('levelName'); if (lv && lv.textContent.trim() !== 'Все уровни') { const b = $('levelChoices')?.querySelector('button'); if (b) b.click(); } }
  function hostOf(n) {
    if (n.host && T[n.host]) return n.host;
    const p = world().pos.get(n.anchors[0]); if (p == null) return null;
    let best = null; for (const id in T) { const s = T[id].span; if (id !== 'building' && id !== 'construction' && s && s[0] <= p && p < s[1] && (!best || s[1] - s[0] < T[best].span[1] - T[best].span[0])) best = id; }
    return best;
  }
  // V121-R1-05: виртуальный набор МУ кровли — одно тело сцены, но в данных — число стержней/уголков (армирование bars_total, уголки count)
  let vcnt = null;
  function vcount(id) {
    if (!isVirt(id)) return 1;
    if (!vcnt) { vcnt = new Map(); try { const m = A().muRebar() || {}; for (const b of m.bodies || []) vcnt.set(b.renderId, +b.bars_total || 1); for (const x of m.nodes || []) vcnt.set(x.renderId, +x.count || 1); } catch (e) { /* */ } }
    return vcnt.get(id) || 1;
  }
  const bodies = ids => ids.reduce((s, id) => s + vcount(id), 0);
  // «арм. N»: тела роли «Армирование» без тела армирования * + поле bars из nodes.js (A); без поля — число из mu_rebar
  // V12.1c · п. 1: при армировании полупрозрачны все тела узла, кроме армирования и деталей «по щелчку» (решение координатора), а не только якорь
  const rebarConcrete = n => [...new Set(n.anchors.concat(n.memberIds))];
  // V12.1c · п. 2: разбивка по ролям тел кнопки (армирование + детали «по щелчку») и подпись: «Армирование», «Обвязка», «Анкеры и уголки», «Армирование и покрытие», «Армирование и детали»
  function rebarRoles(n) { return n._roles || (n._roles = rebarRolesRaw(n)); }
  function rebarRolesRaw(n) {
    const out = {}, want = new Set(wantRebarIds(n)), mr = isVRebar;
    for (const [role, ids] of Object.entries(n.roles)) { const mine = ids.filter(id => want.has(id)); if (!mine.length) continue; out[role] = mine.filter(id => !mr(id)).length + (mine.some(mr) ? (n.bars != null ? +n.bars : bodies(mine.filter(mr))) : 0); }
    const m = muRebarId(n); if (m && want.has(m) && !Object.values(n.roles).some(ids => ids.includes(m))) out[RBL] = (out[RBL] || 0) + (n.bars != null ? +n.bars : bodies([m]));
    return out;
  }
  const SHORT = NC.role_abbr || {};   // К1: config.nodes.role_abbr
  function shortRole(roles) { const names = Object.keys(roles); const main = RB && names.includes(RB) ? RB : names.sort((a, b) => a.localeCompare(b, 'ru'))[0]; return SHORT[main] || (main ? main.slice(0, 4).toLowerCase() + '.' : 'арм.'); }
  /* ---------- V12.2 · M15: набор разделов («галки») ---------- */
  // Галка у раздела первого уровня — раздел в набор на модели, без перехода. Набор — «Всё здание» с фильтром видимости (AtlasViewSettings.sections).
  // V12.3 · U1: набор сохраняется в «на уровне», узле, M3 и M4 (E3 keepOnScope); тела узла, якорь уровня и замечания M4 видны поверх набора (secPins).
  // Переход в другой раздел по названию снимает набор с подсказкой. Сброс — «Всё здание» (#navBuilding), домик в крошке, «Сбросить».
  const secSet = new Set();                                                    // ключи строк 'T:<id>' разделов первого уровня
  let secIds = null, secKeep = null, secLevel = null, secLevelLab = null, secLevelK = null;   // secLevelK — узел «на уровне» (V12.5: в «Ссылку на вид»)                                           // secKeep — раздел, куда перешли сами (узел, уровень, M3): набор в нём сохраняется
  const secPins = new Map();                                                   // владелец → тела, видимые поверх набора ('issues' — M4)
  const secRows = () => kids({ kind: 'root', key: 'root' });
  const secKey = r => String(r.ids[0]).replace(/^section:/, '');
  function secInfo() { const rows = secRows().filter(r => secSet.has(r.key)); return { on: rows.length > 0, keys: rows.map(secKey), labels: rows.map(r => r.label), n: secIds ? secIds.size : 0, visible: secVisible(), level: rows.length && secLevel && curScope() === secLevel ? secLevelLab : null, levelNode: rows.length && secLevel && curScope() === secLevel ? secLevelK : null, count: rows.length, total: secRows().length }; }   // V123-R2-01: level — подпись уровня «на уровне» (крошка)
  // V12.3 · U1 (скептик §3): число тел набора на модели — по видимым движка, не по составу разделов
  function secVisible() { if (!secIds) return 0; try { const v = E3() && A().visibleSetState && A().visibleSetState(); if (v) return v.visible; } catch (e) { /* */ } return secIds.size; }
  function secPinIds() {
    const out = []; for (const v of secPins.values()) out.push(...v);
    const n = state.k ? R.byK.get(state.k) : null; if (n) out.push(...n.all);
    if (rebarFor) out.push(...rebarFor.ids, ...rebarFor.concrete);
    return out;
  }
  // V12.2 · E3: набор — API движка setVisibleSet (фильтр в visibleState); без E3 — фильтр в AtlasViewSettings.visible (запасной путь)
  const E3 = () => !!(window.__ATLAS && window.__ATLAS.features && window.__ATLAS.features.visibleSet);
  function secApply() {
    let ids = null; if (secIds) { ids = new Set(secIds); for (const id of secPinIds()) ids.add(id); }
    if (E3()) { try { A().setVisibleSet(ids ? [...ids] : null, { keepOnScope: true }); } catch (e) { /* */ } return; }
    try { window.AtlasViewSettings.sections(ids); } catch (e) { /* */ }
  }
  // тела узла / уровня / M4 поверх набора; без набора — ничего не делает
  let secVisLast = -1;
  let secMute = false;                                                         // V12.4 · P6: галка с уровня/узла — одно применение набора (secSync), без промежуточного secRepin
  function secRepin() { if (secMute) return; if (!secIds) { secVisLast = -1; return; } secApply(); const v = secVisible(); if (v !== secVisLast) { secVisLast = v; document.dispatchEvent(new CustomEvent('atlas:sections', { detail: secInfo() })); } }
  function secPin(owner, ids) { if (ids && ids.length) secPins.set(owner, ids.slice()); else secPins.delete(owner); secRepin(); return secInfo(); }
  function secSync() {
    const rows = secRows().filter(r => secSet.has(r.key));
    if (!rows.length) secIds = null;
    else { const set = new Set(); for (const r of rows) for (const id of r.ids) { const ms = E3() && A().scopeMembers ? A().scopeMembers('TREE:' + id) : null; for (const b of (ms && ms.length ? ms : bodiesOf(id))) set.add(b); } secIds = set; }   // E3: scopeMembers без смены сцены; без E3 — карта тел
    secApply(); render();
    if (HK() && A().setHashParams) { const ks = secInfo().keys; try { A().setHashParams({ sections: ks.length ? ks.join(',') : null }); } catch (e) { /* */ } }   // E4: набор — в адресе
    document.dispatchEvent(new CustomEvent('atlas:sections', { detail: secInfo() }));
  }
  // V12.3 · U1 (скептик §3): галка из узла / уровня — во «Всё здание»; окружение M3 и армирование вне узла снимаются вместе с переходом
  function secToBuilding() {
    if (curScope() === 'BUILDING' && !state.k) return;
    if (state.k) closeQuiet();
    if (rebarFor || state.rebar) { rebarFor = null; state.rebar = false; }
    ctxOff();
    applying = true; try { A().setScope('BUILDING'); } catch (e) { /* */ } finally { applying = false; }
    lastScope = curScope(); secKeep = secLevel = secLevelK = null; secPins.delete('level'); secPins.delete('view'); applyOverlay(); emit(); textsSync(); linkSync();
  }
  function secBuildingQuiet() { secMute = true; try { secToBuilding(); } finally { secMute = false; } }
  function secToggle(key) { if (secSet.has(key)) secSet.delete(key); else secSet.add(key); if (secSet.size) secBuildingQuiet(); secSync(); }
  // V12.4 · P1: opt.stay — набор в текущем разделе (уровень / узел из «Ссылки на вид»), без перехода во «Всё здание»; opt.level — подпись уровня для крошки, opt.pins — тела поверх набора (выбор вида)
  function secSet_(keys, opt = {}) {
    secSet.clear(); const want = new Set((keys || []).map(String)); for (const r of secRows()) if (want.has(secKey(r)) || want.has(String(r.ids[0]))) secSet.add(r.key);
    const sc = curScope();
    if (secSet.size && opt.stay && (sc !== 'BUILDING' || state.k)) {
      if (sc !== 'BUILDING') secKeep = sc;
      if (opt.level) { secLevel = sc; secLevelLab = String(opt.level); secLevelK = null; }
      // V12.5 · Q8: вид уровня из ссылки — якорь и тела узла «на уровне» поверх набора (без них при пустом выборе сцена пуста)
      if (opt.level && opt.node && R.byK.has(opt.node)) { const ln = R.byK.get(opt.node); secLevelK = ln.k; secPins.set('level', [...new Set(ln.anchors.concat(ln.memberIds))]); }
      if (opt.pins && opt.pins.length) secPins.set('view', opt.pins.slice()); else secPins.delete('view');
    } else if (secSet.size) secBuildingQuiet();
    secSync();
  }
  const secSame = keys => { const a = [...new Set(keys.map(String))].sort().join(','), b = secInfo().keys.slice().sort().join(','); return secSet.size > 0 && a === b; };
  function secReset() { if (!secSet.size) return; secSet.clear(); secSync(); }
  function secDrop(why) { if (!secSet.size) return; secSet.clear(); secSync(); if (why) toast(why); }
  /* ---------- 1.0.15 B3-15: набор групп «По РД» (флажки) — тела групп поверх «Всего здания» и набора разделов (наложение extra и secPin 'placed', как режим «Замечания»).
     Живёт во «Всём здании» (и в разделе, где сохраняется набор: узел, уровень); переход по названию группы (PLACED:<id>) и в другой раздел снимает набор. Адрес — #placed=<id,id>. Объект без слоя «По РД» — ничего */
  const plSet = new Set();
  const plGroups = () => { try { const a = A(); return a && typeof a.placedGroups === 'function' ? (a.placedGroups() || []).filter(g => !g.context) : []; } catch (e) { return []; } };
  const plShort = s => String(s || '').split(/[:(,]/)[0].trim() || String(s || '');
  function plInfo() { const gs = plGroups().filter(g => plSet.has(g.id)); return { on: gs.length > 0, ids: gs.map(g => g.id), labels: gs.map(g => plShort(g.label)), n: gs.reduce((s, g) => s + (g.renderIds || []).length, 0) }; }
  function plApply() { const ids = []; for (const g of plGroups()) if (plSet.has(g.id)) ids.push(...(g.renderIds || [])); if (ids.length) { extra.set('placed', { ids }); secPins.set('placed', ids); } else { extra.delete('placed'); secPins.delete('placed'); } applyOverlay(); }
  function plSync() {
    plApply(); render();
    if (HK() && A().setHashParams) { try { A().setHashParams({ placed: plSet.size ? [...plSet].join(',') : null }); } catch (e) { /* */ } }
    document.dispatchEvent(new CustomEvent('atlas:sections', { detail: secInfo() }));
  }
  function plSet_(ids) { plSet.clear(); const have = new Set(plGroups().map(g => g.id)); for (const id of (ids || [])) if (have.has(String(id))) plSet.add(String(id)); if (plSet.size && (curScope() !== 'BUILDING' || state.k) && !secKeep) secBuildingQuiet(); plSync(); }
  function plToggle(id) { id = String(id); const s = new Set(plSet); if (s.has(id)) s.delete(id); else s.add(id); plSet_([...s]); }
  function plReset() { if (!plSet.size) return; plSet.clear(); plSync(); }
  // строка набора: разделы «Узлов» и группы «По РД»
  function setLine() { const inf = secInfo(), pi = plInfo(); if (!inf.on && !pi.on) return null; const parts = []; if (inf.on) parts.push(inf.count === inf.total ? 'все ' + fmt(inf.total) : fmt(inf.count) + ' из ' + fmt(inf.total)); if (pi.on) parts.push('По РД: ' + pi.labels.join(', '));
    // 1.0.19a A-11 (словарь): «Набор: …» → «Показано разделов: N из 13», «тел» → «элементов»
    return { b: (inf.on ? 'Показано разделов: ' : 'Показано: ') + parts.join(' + '), s: (inf.on ? fmt(inf.n) + ' ' + plural(inf.n, 'элемент', 'элемента', 'элементов') + ' на модели' : S.siteText('whole','Всё здание').toLocaleLowerCase('ru')) + (pi.on ? ' + ' + fmt(pi.n) + ' «По РД»' : '') }; }
  function secBox(r) {
    const on = secSet.has(r.key), lab = make('label', { class: 'nt-ck', title: on ? 'Убрать с модели' : 'Показать на модели' });
    const i = make('input', { type: 'checkbox', 'aria-label': r.label + ' — показать на модели' }); i.checked = on;
    if (noBodies()) { i.disabled = true; lab.title = 'Размещений нет'; lab.classList.add('nt-ck--off'); }   // К1: тел на модели нет — галка неактивна
    i.addEventListener('click', e => { e.stopPropagation(); secToggle(r.key); });
    lab.addEventListener('click', e => e.stopPropagation()); lab.append(i); return lab;
  }
  const secCount = r => r.ids.reduce((s, id) => s + countOf(id), 0);
  function secHeadSync() {
    const inf = secInfo(); secHead.replaceChildren(); secHead.hidden = phone() && !filter && pstack.length > 0; if (secHead.hidden) return;   // на 390 — только на первом уровне шторки (галки там)
    const hint = make('div', { class: 'nt-sethint', title: 'Галка — показать раздел на модели; можно отметить несколько и смотреть сопряжение' });
    hint.append(make('span', {}, 'Можно отметить несколько'), make('b', {}, 'На модели')); secHead.append(hint);
    const ln = setLine();   // 1.0.15 B3-15: и группы «По РД»
    if (ln) {
      const pl = make('div', { class: 'nt-set', role: 'status' });
      pl.append(make('b', {}, ln.b), make('span', {}, ln.s));
      const x = make('button', { type: 'button', class: 'nt-set-x' }, 'Сбросить'); x.onclick = () => { $('navBuilding') ? $('navBuilding').click() : secReset(); };
      pl.append(x); secHead.append(pl);
    }
  }
  function counterTitle(row) { if (row.kind !== 'node') return null; const arm = armCount(row.n); return arm ? rebarLabel(rebarRoles(row.n)) + ' · ' + fmt(arm) : null; }
  function rebarLabel(roles) {
    const names = Object.keys(roles), low = x => x.charAt(0).toLowerCase() + x.slice(1);
    if (!names.length) return RBL;
    const arm = !!RB && names.includes(RB), rest = names.filter(x => x !== RB).sort((a, b) => a.localeCompare(b, 'ru'));
    if (arm) return !rest.length ? RBL : rest.length === 1 ? RBL + ' и ' + low(rest[0]) : RBL + ' и детали';
    return rest.length === 1 ? rest[0] : rest.length === 2 ? rest[0] + ' и ' + low(rest[1]) : 'Детали';
  }
  const armCount = n => n._arm != null ? n._arm : (n._arm = armCountRaw(n));
  const armCountRaw = n => { const ids = wantRebarIds(n), plain = ids.filter(id => !isVRebar(id)); return plain.length + (n.bars != null ? +n.bars : bodies(ids.filter(isVRebar))); };
  const muVirt = n => (n.mu != null ? [n.mu] : []).flatMap(mu => [RV.deck, RV.angles].filter(Boolean).map(p => p + mu));
  const muRebarId = n => n.mu != null && RV.rebar ? RV.rebar + n.mu : null;
  let known = null;
  // V12.3 · E16: есть ли тело в модели — __ATLAS.has (без пересборки набора objects() на каждый промах); без E16 — набор по objects()
  const has = id => { const a = A(); if (a.features && a.features.objectGet && a.has) return a.has(id); if (!known) known = new Set(A().objects().map(o => o.renderId)); if (known.has(id)) return true; known = new Set(A().objects().map(o => o.renderId)); return known.has(id); };
  // данные узла не меняются — наборы и счёт армирования запоминаются у узла (перерисовка дерева не пересчитывает 1 602 тела Пм2)
  function wantRebarIds(n) { if (n._want) return n._want; const ids = n.rebarIds.concat(n.odIds || []); const m = muRebarId(n); if (m && !ids.includes(m)) ids.push(m); return (n._want = ids); }
  // Одно наложение на всех: набор «члены узла не из сцены (+ профлист/уголки) (+ армирование)» — одним вызовом.
  // V12.2 · M4 / M3: наложение по заказу других модулей (владелец → { ids, concrete }; concrete — полупрозрачно 0,25); ведёт только этот модуль
  const extra = new Map();
  let ctxScope = null;                                                          // M3: раздел уровня, где показано окружение Ку/Р
  // V12.3 · E14: слои наложения движка — node (тела узла вне сцены + МУ), rebar (армирование + бетон 0,25), roof (кровля МУ), issues (M4 «По РД»), context (M3).
  // Слой меняется, только если изменился его набор; снятие одного слоя другие не трогает. keepOnScope не используем: смена раздела снимает все слои,
  // повторное наложение — как раньше (onScope / atlas:overlay). Без E14 — один сводный вызов (ниже).
  const E14 = () => { const a = A(); return !!(a && a.features && a.features.overlayLayers); };
  const layerSig = new Map();
  function layerSet(a, layer, ids, concrete, opt) {
    const sig = ids.join('|') + '#' + concrete.join('|') + '#' + JSON.stringify(opt);
    let live = false; try { live = !!a.overlayState(layer).active; } catch (e) { /* */ }
    if (!ids.length) { layerSig.delete(layer); if (live) a.hideOverlay(layer); return; }
    if (live && layerSig.get(layer) === sig) return;
    const r = a.showOverlay({ overlay: ids, concrete }, Object.assign({ layer }, opt));
    if (r) layerSig.set(layer, sig); else layerSig.delete(layer);
  }
  function applyLayers() {
    const a = A(), n = state.k ? R.byK.get(state.k) : null, inScene = sceneIds(), out = id => has(id) && !inScene.has(id), uniq = l => [...new Set(l)];
    let node = [], nodeConc = [], reb = [], rebConc = [];
    if (n) {
      if (state.mode === 'overlay') node.push(...n.memberIds.filter(id => !inScene.has(id)));
      node.push(...muVirt(n));
      if (state.rebar) { reb = wantRebarIds(n).slice(); rebConc = rebarConcrete(n); } else nodeConc = n.anchors.slice();
    } else if (state.rebar && rebarFor) { reb = rebarFor.ids.slice(); rebConc = rebarFor.concrete; }
    node = uniq(node).filter(out);
    // V12.1b · п. 1: армирование, которое уже стоит в здании, — тоже в слое (иначе бетон не полупрозрачен)
    reb = uniq(reb).filter(id => has(id) && (state.rebar ? true : !inScene.has(id)));
    layerSet(a, 'node', node, nodeConc, { concreteAlpha: 1, cover: false });
    layerSet(a, 'rebar', reb, reb.length ? rebConc : [], { concreteAlpha: .25 });
    layerSet(a, 'roof', roofOn ? uniq(roofIds()).filter(out) : [], [], { concreteAlpha: .25 });
    for (const own of ['issues', 'context']) { const v = extra.get(own); layerSet(a, own, v ? uniq(v.ids).filter(out) : [], v && v.concrete ? v.concrete : [], v && v.concrete && v.concrete.length ? { concreteAlpha: .25 } : { concreteAlpha: 1, cover: false }); }
    for (const own of extra.keys()) if (own !== 'issues' && own !== 'context') { const v = extra.get(own); layerSet(a, 'x:' + own, uniq(v.ids).filter(out), v.concrete || [], own === 'placed' ? { concreteAlpha: .25, isolateHide: true } : { concreteAlpha: .25 }); }   /* 1.0.16 B3-5 (A2): группы «По РД» при изоляции скрыты (движок, isolateHide); context (Ку/Р) — как прежде */
    for (const l of [...layerSig.keys()]) if (/^x:/.test(l) && !extra.has(l.slice(2))) layerSet(a, l, [], [], {});
  }
  function applyOverlay() {
    const a = A(); applying = true;
    if (E14()) {
      try { applyLayers(); } finally { applying = false; }
      secRepin();
      state.count = { scene: (a.sceneObjects() || []).length, rebar: state.rebar ? (state.k ? wantRebarIds(R.byK.get(state.k)).length : (rebarFor ? rebarFor.ids.length : 0)) : 0 };
      return;
    }
    try {
      const n = state.k ? R.byK.get(state.k) : null, inScene = sceneIds();
      let ids = [], concrete = [];
      if (n) {
        if (state.mode === 'overlay') ids.push(...n.memberIds.filter(id => !inScene.has(id)));
        ids.push(...muVirt(n));
        if (state.rebar) ids.push(...wantRebarIds(n));
        concrete = state.rebar ? rebarConcrete(n) : n.anchors.slice();
      } else if (state.rebar && rebarFor) {
        ids.push(...rebarFor.ids); concrete = rebarFor.concrete;
      }
      if (roofOn) ids.push(...roofIds());
      let extraConcrete = false;
      for (const v of extra.values()) { ids.push(...v.ids); if (v.concrete && v.concrete.length) { concrete = concrete.concat(v.concrete); extraConcrete = true; } }
      ids = [...new Set(ids)].filter(id => has(id) && !inScene.has(id));
      // V12.1b · п. 1: армирование, которое уже стоит в здании (МУ 1–3, сваи, рамки Р), тоже в наборе — иначе бетон не становится полупрозрачным и стержней не видно
      if (state.rebar) { const reb = n ? wantRebarIds(n) : (rebarFor ? rebarFor.ids : []); for (const id of reb) if (has(id) && inScene.has(id) && !ids.includes(id)) ids.push(id); }
      if (ids.length) a.showOverlay({ overlay: ids, concrete }, state.rebar || roofOn || extraConcrete ? { concreteAlpha: .25 } : { concreteAlpha: 1, cover: false });
      else a.hideOverlay();
    } finally { applying = false; }
    secRepin();
    const ov = a.overlayState();
    state.count = { scene: (a.sceneObjects() || []).length + (ov.active ? 0 : 0), rebar: state.rebar ? (state.k ? wantRebarIds(R.byK.get(state.k)).length : (rebarFor ? rebarFor.ids.length : 0)) : 0 };
  }
  function roofIds() { const out = []; try { const ls = (A().rebarLinks() || {}).links || []; for (const l of ls) if (LINKS_SRC && l.source === LINKS_SRC) out.push(...l.overlay); } catch (e) { /* */ } return out; }
  // тела — из готовой карты world().byId (allWorld() — проход по всем объектам движка при каждом вызове)
  function fitTo(ids) { const w = world().byId, list = ids.map(id => w.get(id)).filter(Boolean); try { if (list.length) A().fit(list); } catch (e) { /* */ } }
  async function open(k, opt = {}) {
    if (!R.ready) { await loadRegistry(); if (!R.ready) return st(); }
    const n = R.byK.get(k); if (!n) return st();
    if (filter) clearFilter();                     // V12.2 · M8: открытие узла (ссылка, ⌘K, карточка) снимает фильтр меню — строка узла есть в дереве
    if (!state.k) prev = { scope: curScope(), rebar: state.rebar };
    const wantRebar = opt.rebar != null ? !!opt.rebar : state.rebar;
    const limit = phone() ? REBAR_MAX.phone : REBAR_MAX.pc;
    hint = '';
    state = { k, mode: n.tree && T[n.tree] ? 'tree' : 'overlay', rebar: false, loading: false, count: { scene: 0, rebar: 0 } };
    rebarFor = null;
    resetLevel();
    const scope = state.mode === 'tree' ? 'TREE:' + n.tree : (hostOf(n) ? 'TREE:' + hostOf(n) : 'BUILDING');
    if (scope !== 'BUILDING') secKeep = scope;                                     // V12.3 · U1: набор сохраняется в узле (тела узла — поверх набора, secRepin в applyOverlay)
    applying = true; try { if (curScope() !== scope) A().setScope(scope); } finally { applying = false; }
    let rebar = wantRebar;
    if (rebar && opt.rebar == null && wantRebarIds(n).length > limit) { rebar = false; hint = RBL + ' выключено: ' + fmt(wantRebarIds(n).length) + ' ' + plural(wantRebarIds(n).length, 'элемент', 'элемента', 'элементов') + ' — включите кнопкой'; }
    if (rebar && wantRebarIds(n).length) { state.loading = true; emit(); await ensureOd(); state.loading = false; state.rebar = true; }
    applyOverlay();
    if (opt.select !== false) { const want = typeof opt.select === 'string' && sceneIds().has(opt.select) ? opt.select : n.anchors[0]; try { A().select(want); } catch (e) { /* */ } }   // V12.1g · п. 7
    fitTo(n.all.filter(id => world().byId.has(id)));
    reveal(k); phoneStackTo(k); textsSync(); crumbsSync();
    scrollToCurrent();
    if (hint) toast(hint);
    emit();
    linkSync();
    return st();
  }
  // M3: снять окружение этажа (без перерисовки наложения — её делает вызывающий)
  function ctxOff() { if (!extra.has('context') && !ctxScope) return false; extra.delete('context'); ctxScope = null; try { window.AtlasViewSettings.ghost('context', null); } catch (e) { /* */ } document.dispatchEvent(new CustomEvent('atlas:context', { detail: { k: null } })); return true; }
  function closeQuiet() { state = { k: null, mode: null, rebar: false, loading: false, count: { scene: 0, rebar: 0 } }; rebarFor = null; }
  async function close() {
    const p = prev; closeQuiet();
    if (p && p.scope && p.scope !== 'BUILDING' && p.scope === secLevel) secKeep = p.scope;   // V12.3 · U1: возврат из узла на уровень — набор остаётся
    applying = true; try { if (E14()) { for (const l of ['node', 'rebar']) { layerSig.delete(l); A().hideOverlay(l); } } else A().hideOverlay(); if (p && p.scope) A().setScope(p.scope); } finally { applying = false; }
    if (roofOn) applyOverlay(); else secRepin();
    emit(); textsSync(); linkSync();
    return st();
  }
  async function ensureOd() { const a = A(); try { const s = a.rebarOnDemand && a.rebarOnDemand().state; if (s !== 'ready') await a.loadRebarOnDemand(); } catch (e) { /* */ } known = null; }
  // Армирование вне узла («Всё здание»): связь выбранного тела.
  let rebarFor = null;
  async function rebar(on, opt = {}) {
    on = !!on;
    // V12.7 · S7: включение для тела, которое уже не выбрано (кнопка карточки прежнего тела, пока грузится паспорт нового), — не исполнять: иначе открывается прежний узел
    if (on && opt.id) { let sel = null; try { const o = F().selected(); sel = o && o.renderId; } catch (e) { /* */ } if (sel && opt.id !== sel) return st(); }
    if (state.k) {
      const n = R.byK.get(state.k);
      if (on && !wantRebarIds(n).length) return st();
      if (on) { state.loading = true; emit(); await ensureOd(); state.loading = false; }
      state.rebar = on; hint = ''; applyOverlay(); emit(); textsSync(); linkSync(); return st();
    }
    const id = opt.id || (F().selected() && F().selected().renderId);
    if (!on) { state.rebar = false; rebarFor = null; applyOverlay(); emit(); return st(); }
    const k = id && (R.anchorOf.get(id) || R.owner.get(id));
    const inScene = sceneIds();
    if (k) {
      const n = R.byK.get(k);
      if (!n.anchors.some(a => inScene.has(a))) return open(k, { rebar: true });       // бетона в сцене нет — открыть узел с армированием
      state.loading = true; emit(); await ensureOd(); state.loading = false;
      rebarFor = { k, ids: wantRebarIds(n).concat(n.memberIds.filter(x => !inScene.has(x))), concrete: rebarConcrete(n) };
    } else {
      const l = id && A().rebarLinkOf(id);
      if (!l || !l.overlay) return st();
      state.loading = true; emit(); await ensureOd(); state.loading = false;
      rebarFor = { ids: l.overlay.slice(), concrete: (l.concrete || []).slice() };
    }
    state.rebar = true; applyOverlay(); emit(); return st();
  }
  async function roof(on) { roofOn = !!on; if (roofOn) await ensureOd(); applyOverlay(); emit(); return st(); }
  // on — включено ли армирование именно этого узла / связи этого тела (для кнопки B3)
  function rebarOn(k, id) {
    if (!state.rebar) return false;
    if (state.k) return !!k && state.k === k;
    if (!rebarFor) return false;
    if (k && rebarFor.k === k) return true;
    return !!id && (rebarFor.ids.includes(id) || rebarFor.concrete.includes(id));
  }
  function rebarInfo(x) { const r = rebarInfoRaw(x); const id = x && !R.byK.has(x) ? x : null, k = x ? (R.byK.has(x) ? x : (R.anchorOf.get(x) || R.owner.get(x) || null)) : state.k; r.on = rebarOn(k, id || (F().selected() && F().selected().renderId)); return r; }
  function rebarInfoRaw(x) {
    const id = x && !R.byK.has(x) ? x : null;
    const k = x ? (R.byK.has(x) ? x : (R.anchorOf.get(x) || R.owner.get(x) || null)) : state.k;
    const n = k ? R.byK.get(k) : null;
    const loading = state.loading || (!R.ready && R.loading);
    if (n && wantRebarIds(n).length) { const roles = rebarRoles(n), label = rebarLabel(roles); return { available: true, count: armCount(n), roles, label, text: label + ' · ' + fmt(armCount(n)), reason: null, loading, scope: n.tree ? 'TREE:' + n.tree : null }; }
    const l = id ? A().rebarLinkOf(id) : null;
    if (l && l.overlay && l.overlay.length) return { available: true, count: l.overlay.length, roles: { [RBL]: l.overlay.length }, label: RBL, text: RBL + ' · ' + fmt(l.overlay.length), reason: null, loading, scope: null };
    if (l && l.no_rebar) return { available: false, count: 0, reason: l.reason || 'Для этого элемента армирование в данных не задано', loading, scope: null };
    return { available: false, count: 0, reason: 'Для этого элемента армирование в данных не задано', loading, scope: null };
  }
  const sceneNow = () => { try { return (A().sceneObjects() || []).length; } catch (e) { return 0; } };
  const st = () => ({ k: state.k, mode: state.mode, rebar: state.rebar, loading: state.loading, count: { ...state.count } });

  // После любой смены раздела (не нашей) наложение снято движком — накладываем то, что включено. Уход из раздела узла закрывает узел.
  let lastScope = curScope();
  const onScope = () => {
    const sc = curScope(); if (sc === lastScope) return; lastScope = sc;
    // V12.2 · S2 (запрос B3): без открытого узла count.scene — по сцене нового раздела (один раз на смену раздела, не в state())
    if (!state.k) state.count = { ...state.count, scene: sceneNow() };
    // V12.3 · U1: набор сохраняется в разделе, куда перешли сами (узел, «на уровне», M3); переход в другой раздел по названию — снимает с подсказкой
    if (sc === 'BUILDING' || sc !== secKeep) secKeep = null;
    // V12.4 · P6 / V12.4b: узел, открытый с уровня, и возврат на уровень — уровень и якорь остаются; исключение при уходе во «Всё здание» — только узел без хоста (раздел узла = «Всё здание»)
    if (secLevel && sc !== secLevel && !(state.k && state.mode === 'overlay' && !hostOf(R.byK.get(state.k))) && (sc === 'BUILDING' || !secKeep)) { secLevel = null; secLevelK = null; secPins.delete('level'); }
    if (secPins.has('view') && sc !== secKeep) secPins.delete('view');   // выбор вида из ссылки — только в разделе вида
    if (secSet.size && sc !== 'BUILDING' && !secKeep) secDrop('Набор разделов снят');
    if (plSet.size && sc !== 'BUILDING' && !secKeep) { const quiet = secSet.size > 0; plSet.clear(); plSync(); if (!quiet) toast('Набор «По РД» снят'); }   // 1.0.15 B3-15
    if (applying) return;
    // V12.2 · M3: уход с уровня, где показано окружение Ку/Р, — окружение снимается
    if (ctxScope && sc !== ctxScope) ctxOff();
    if (state.k) {
      const n = R.byK.get(state.k), mine = state.mode === 'tree' ? 'TREE:' + n.tree : 'TREE:' + hostOf(n);
      if (sc !== mine) {
        const keepRebar = state.rebar, kk = state.k; closeQuiet(); state.rebar = false;
        // V12.1b · п. 8: «Показать на уровне …» и другие разделы, где бетон узла в сцене, — армирование узла остаётся; иначе снимается с подсказкой
        if (keepRebar) setTimeout(() => { const n2 = R.byK.get(kk), inS = sceneIds(); if (n2 && n2.anchors.some(a => inS.has(a))) { rebarFor = { k: kk, ids: wantRebarIds(n2).concat(n2.memberIds.filter(x => !inS.has(x))), concrete: rebarConcrete(n2) }; state.rebar = true; applyOverlay(); } else { hint = RBL + ' выключено: узел вне раздела'; toast(hint); } emit(); }, 0);
        emit(); textsSync();
      }
    }
    if (roofOn || state.rebar || extra.size) setTimeout(() => {
      // V12.1g · п. 6: армирование вне узла, а бетона связи в новом разделе нет — выключить с подсказкой (как п. 8 V12.1b)
      if (!state.k && state.rebar && rebarFor) { const inS = sceneIds(); if (!rebarFor.concrete.some(a => inS.has(a))) { state.rebar = false; rebarFor = null; hint = RBL + ' выключено: элемент вне раздела'; toast(hint); emit(); } }
      applyOverlay();
    }, 0);
    else secRepin();
    render();
  };
  // V12.2 · E2: смена раздела — событие движка atlas:scope (микрозадачей, как прежний наблюдатель); без E2 — наблюдатель #sectionTitle
  if (E2()) document.addEventListener('atlas:scope', () => queueMicrotask(onScope));
  else new MutationObserver(onScope).observe($('sectionTitle'), { childList: true, characterData: true, subtree: true });
  document.addEventListener('atlas:selection', () => {
    if (state.k) { render(); if (state.rebar && state.mode === 'tree') setTimeout(linkSync, 0); return; }
    // V12.1b · п. 9: вне узла армирование следует за выбором — наложение переносится на связь нового тела, без связи — снимается
    if (!state.rebar || !rebarFor) return;
    const o = F().selected(), id = o && o.renderId; if (!id || rebarFor.ids.includes(id) || rebarFor.concrete.includes(id)) return;
    setTimeout(async () => {
      const k = R.anchorOf.get(id) || R.owner.get(id), inS = sceneIds();
      if (k && R.byK.get(k).anchors.some(a => inS.has(a)) && wantRebarIds(R.byK.get(k)).length) { const n = R.byK.get(k); rebarFor = { k, ids: wantRebarIds(n).concat(n.memberIds.filter(x => !inS.has(x))), concrete: rebarConcrete(n) }; }
      else { const l = A().rebarLinkOf(id); if (l && l.overlay && l.overlay.length) rebarFor = { ids: l.overlay.slice(), concrete: (l.concrete || []).slice() }; else { rebarFor = null; state.rebar = false; } }
      applyOverlay(); emit();
    }, 0);
  });
  // Движок снял наложение, не сменив раздел (restoreView, повторный setScope того же раздела) — наложить включённое заново.
  // 1.0.19a A-16 (ВЕНТИЛЯЦИЯ.md, п. г): и слои набора (группы «По РД» — x:placed, окружение — x:context): restoreView того же раздела снимал слой «По РД», флажок ОВ оставался отмечен
  document.addEventListener('atlas:overlay', e => {
    if (applying || (e.detail && e.detail.active)) return;
    if (!state.k && !state.rebar && !roofOn && !extra.size) return;
    setTimeout(() => { if (applying || A().overlayState().active) return; if (state.k) { const n = R.byK.get(state.k), mine = state.mode === 'tree' ? 'TREE:' + n.tree : 'TREE:' + hostOf(n); if (curScope() !== mine) return; } applyOverlay(); emit(); }, 0);
  });

  /* ---------- тексты движка для раздела узла в режиме «наложение» (§3.2 п. 5) ---------- */
  function textsSync() {
    const n = state.k && R.byK.get(state.k);
    document.body.classList.toggle('node-open', !!n);
    if (!n || state.mode !== 'overlay') return;
    const total = n.memberIds.length + (state.rebar ? wantRebarIds(n).length : 0);
    const tt = $('sectionTitle'), t = n.ls || n.l; if (tt && tt.textContent !== t) tt.textContent = t;
  }
  function crumbsSync() { document.dispatchEvent(new Event('atlas:nodecrumbs')); }
  function toast(t) { try { window.AtlasViewSettings.toast(t); } catch (e) { /* */ } }

  /* ---------- ссылка ---------- */
  function linkSync() {
    if (state.mode === 'tree') {                                                   // адрес пишет движок (#scope=TREE:n:<k>&id=…); армирование — &rebar=1
      if (HK() && A().setHashParams) { try { A().setHashParams({ rebar: state.rebar ? '1' : null }); } catch (e) { /* */ } return; }   // E4: без повторной записи адреса
      try { const p = new URLSearchParams(location.hash.slice(1)); if (state.rebar) p.set('rebar', '1'); else p.delete('rebar'); history.replaceState(null, '', '#' + p); } catch (e) { /* */ }
      return;
    }
    if (state.mode !== 'overlay') return;
    if (HK() && A().setHashParams) { if (!state.k) return; try { A().setHashParams({ node: state.k, rebar: state.rebar ? '1' : null }); } catch (e) { /* */ } return; }   // E4
    try { const p = new URLSearchParams(); if (state.k) { p.set('node', state.k); if (state.rebar) p.set('rebar', '1'); } else return; history.replaceState(null, '', '#' + p); } catch (e) { /* */ }
  }
  // Старая ссылка #scope=TREE:<id>: группа нового дерева или id из `was` → узел; группа текущего дерева, все тела которой — в одном узле, → этот узел; иначе как раньше.
  function nodeOfTree(id) {
    const byTree = R.nodes.find(n => n.tree === id); if (byTree) return byTree.k;
    if (!T[id]) return nodeFromWas(id);
    if (/^section:/.test(id) || id === 'building' || id === 'construction') return null;
    const own = new Set(); for (const b of bodiesOf(id)) { const k = R.owner.get(b); if (!k) return null; own.add(k); if (own.size > 1) return null; }
    return own.size === 1 ? [...own][0] : null;
  }
  // V12.1c · п. 6: смена только «#» в открытой странице — узел по node= и по старому id (tree / was / группа одного узла), как при загрузке. Движок разбирает адрес раньше (setTimeout 0 — после него).
  addEventListener('hashchange', () => setTimeout(() => {
    if (!R.ready) return;
    const h = new URLSearchParams(location.hash.slice(1)), node = h.get('node'), scope = h.get('scope') || '';
    let k = node && R.byK.has(node) ? node : null;
    if (!k && scope.startsWith('TREE:')) k = nodeOfTree(scope.slice(5));
    if (k && k !== state.k) open(k, { rebar: h.get('rebar') === '1' });
  }, 0));
  function nodeFromWas(id) { for (const n of R.nodes) if ((n.was || []).includes(id)) return n.k; return null; }
  function startLink() {
    const node = START.get('node'), scope = START.get('scope') || '';
    let k = node && R.byK.has(node) ? node : null;
    if (!k && scope.startsWith('TREE:')) k = nodeOfTree(scope.slice(5));
    if (k) open(k, { rebar: START.get('rebar') === '1' });
  }

  /* ---------- API ---------- */
  Object.assign(N, {
    stub: false,
    ready: () => R.ready, failed: () => { if (R.failed) return true; if (R.ready) return false; const t = document.querySelector('script[src$="' + NODES_SRC + '"]'); return !!(t && t.dataset.state === 'error'); },   // V12.11 · Z6: и когда тег data/nodes.js (карточки) уже упал, а реестр ещё не запрашивался; до попытки загрузки — false («ещё не пробовали»)
    whenReady: () => R.ready ? Promise.resolve(true) : (REGISTRY_PRESENT ? loadRegistry() : new Promise(r => document.addEventListener('atlas:nodes', () => r(true), { once: true }))),
    list: (f = {}) => R.nodes.filter(n => (!f.t || n.t === f.t) && (!f.sec || n.sec === f.sec)).map(n => ({ k: n.k, t: n.t, l: n.l, sec: n.sec, lev: n.lev, n: n.n, od: n.od, virt: n.virt, lk: n.lk, mu: n.mu, arm: armCount(n), bars: n.bars != null ? n.bars : null })),
    get: k => R.byK.get(k) || null,
    of: id => R.owner.get(id) || null,
    open, close, state: st, rebarInfo, rebar, roof,
    check() {
      if (!R.ready) return null;
      const w = world(), cnt = new Map();
      for (const n of R.nodes) for (const id of n.all) cnt.set(id, (cnt.get(id) || 0) + 1);
      const b = [...w.byAi.values()], od = [...cnt.keys()].filter(id => !w.byId.has(id) && !isVirt(id)), virt = [...cnt.keys()].filter(isVirt);
      const un = new Set((R.unassigned || []).map(x => toId(x.id)));
      return {
        building: { total: b.length, assigned: b.filter(id => cnt.has(id)).length, unassigned: b.filter(id => !cnt.has(id) && un.has(id)).length, missing: b.filter(id => !cnt.has(id) && !un.has(id)).length, dup: b.filter(id => cnt.get(id) > 1).length },
        od: { assigned: od.length, dup: od.filter(id => cnt.get(id) > 1).length },
        virt: { assigned: virt.length, dup: virt.filter(id => cnt.get(id) > 1).length },
        noAnchor: R.nodes.filter(n => !n.anchors.length).map(n => n.k),
        parentMismatch: R.conflicts.length
      };
    },
    // Подписи раздела узла в режиме «наложение» (§3.2 п. 5): «МУ 29 · 12 тел»; prototype.js переписывает ими тексты движка.
    caption() { const n = state.k && R.byK.get(state.k); if (!n) return null; const total = n.memberIds.length + (state.rebar ? wantRebarIds(n).length : 0); return { title: n.ls || n.l, count: total, text: fmt(total) + ' ' + plural(total, 'элемент', 'элемента', 'элементов') + (state.rebar ? ' · с армированием' : ''), mode: state.mode, rebar: state.rebar }; },
    // V12.1c · п. 5: уровень узла — родительская группа n:<k> в дереве с подписью уровня узла (lev); нет — null (пункт не показывать)
    levelScope(k) {
      const n = R.byK.get(k || state.k); if (!n || !n.lev) return null;
      let id = n.tree && T[n.tree] ? T[n.tree].parent : null; const want = fold(n.lev), wm = levMark(n.lev);
      while (id && id !== 'construction' && id !== 'building') { const lab = label(id); if (fold(lab) === want || (wm && levMark(lab) === wm && !/^section:/.test(id))) return 'TREE:' + id; id = T[id] && T[id].parent; }
      return null;
    },
    // «Показать на уровне …»: раздел уровня, выбран якорь, армирование узла сохраняется (одно действие — один вызов; B3 не вызывает rebar повторно)
    async showLevel(k) {
      const n = R.byK.get(k || state.k), sc = n && N.levelScope(n.k); if (!sc) return null;
      const keep = state.rebar; if (keep) await ensureOd();
      closeQuiet(); state.rebar = keep; rebarFor = null;
      secKeep = secLevel = sc; secLevelK = n.k; secLevelLab = n.lev ? 'уровень ' + String(n.lev).replace(/^Перекрытие\s+/, '') : null; secPins.set('level', [...new Set(n.anchors.concat(n.memberIds))]);   // V12.3 · U1: набор сохраняется на уровне, якорь и тела узла видны поверх набора
      applying = true; try { resetLevel(); A().setScope(sc); A().select(n.anchors[0]); } catch (e) { /* */ } finally { applying = false; }
      // V12.1f: набор — по сцене уровня (после перехода): тела узла, которые уже в сцене, в него не входят (иначе hideOverlay снимает выбор у Р, Ку5, LIFT2)
      if (keep) { const inS = sceneIds(); rebarFor = { k: n.k, ids: wantRebarIds(n).concat(n.memberIds.filter(x => !inS.has(x))), concrete: rebarConcrete(n) }; }
      lastScope = curScope(); applyOverlay(); emit(); textsSync();
      // V12.2 · M8: камера — на якорь (рамка по телу, как «К элементу»). Не focusSelected: его отложенная фокусировка сбивала кнопку армирования карточки (уровень_выкл)
      fitTo([n.anchors[0]]);
      return st();
    },
    path(k) { const p = pathKeys(k || state.k); if (!p) return []; let row = { kind: 'root', key: 'root' }; const out = []; for (const key of p) { const r = kids(row).find(x => x.key === key); if (!r) break; out.push({ label: r.full || r.label, scope: r.kind === 'tree' ? 'TREE:' + r.ids[0] : null, k: r.kind === 'node' ? r.k : null }); row = r; } return out; },
    // V12.2 · M4: extra(владелец, ids) — добавить тела в сцену наложением (PLACED_RD «По РД» во «Всём здании»); extra(владелец, null) — убрать. Ответ — число тел в наложении.
    extra(owner, ids) { if (ids && ids.length) extra.set(owner, { ids: ids.slice() }); else extra.delete(owner); applyOverlay(); try { return (A().overlayState().ids || []).length; } catch (e) { return 0; } },
    // V12.2 · M3 (API для B3): context(k) — переход на уровень узла Ку/Р (путь «Показать на уровне») + полупрозрачно (0,25) перегородки и двери этажа:
    // пакеты слоя «Размещено по РД» из поля ctx узла (data/nodes.js, A), тела тела слоя <n>. context(null) — выход. Ответ — { ok, k, packages, ids, scope } или { ok: false, reason }.
    async context(k) {
      if (!k) { if (ctxOff()) applyOverlay(); return { ok: true, off: true }; }
      if (!R.ready) { await loadRegistry(); if (!R.ready) return { ok: false, reason: 'Реестр узлов не загружен' }; }
      const n = R.byK.get(k); if (!n) return { ok: false, reason: 'Узел не найден' };
      if (!Array.isArray(n.ctx)) return { ok: false, reason: 'Для узла окружение этажа не задано' };
      if (!n.ctx.length) return { ok: false, reason: n.ctx_why || 'Пакета этажа нет — показа нет' };
      const sc = N.levelScope(n.k); if (!sc) return { ok: false, reason: 'Уровень узла не найден' };
      const RP = (((window.ATLAS_REVISIONS_META || {}).layers || [])[0] || {}).record_prefix;   // К1: префикс тел слоя — набор ревизий объекта
      if (!RP) return { ok: false, reason: 'Слоя окружения у объекта нет' };
      const ids = n.ctx.map(p => RP + p).filter(id => has(id));
      if (!ids.length) return { ok: false, reason: 'Пакетов этажа нет в модели' };
      extra.delete('context'); try { window.AtlasViewSettings.ghost('context', null); } catch (e) { /* */ }
      await N.showLevel(n.k);
      extra.set('context', { ids }); ctxScope = curScope(); applyOverlay();
      try { window.AtlasViewSettings.ghost('context', ids, .25); } catch (e) { /* */ }   // движок делает полупрозрачным только «бетон», уже стоящий в сцене, — пакеты этажа полупрозрачны через view-settings
      document.dispatchEvent(new CustomEvent('atlas:context', { detail: { k: n.k, packages: n.ctx.slice() } }));
      return { ok: true, k: n.k, packages: n.ctx.slice(), ids, scope: ctxScope };
    },
    // V12.2 · M15: набор разделов — sections() → { on, keys, labels, n, count, total }; setSections(['ground', 'facade'] | null)
    sections: () => Object.assign(secInfo(), { placed: plInfo(), line: setLine() }), setSections: (keys, opt) => secSet_(keys, opt),
    // 1.0.15 B3-15: группы «По РД» вместе со зданием — placed() → { on, ids, labels, n }; setPlaced(['OV', 'VK'] | null); placedToggle(id)
    placed: () => plInfo(), setPlaced: ids => plSet_(ids), placedToggle: id => plToggle(id),
    // V12.3 · U1: secPin(владелец, ids) — тела, видимые поверх набора разделов (M4 — тела замечаний); secPin(владелец, null) — убрать
    secPin,
    contextState: () => ({ on: extra.has('context'), scope: ctxScope, ids: extra.has('context') ? extra.get('context').ids.slice() : [] }),
    _perf: () => ({ ...PERF }),
    search, norm, reveal: k => { reveal(k); renderNow(); }, _R: R
  });

  // первая перерисовка и загрузка реестра — после карты тел (строится в простое, без длинных задач)
  worldAsync().then(() => {
    mapReady = true; renderNow(); requestAnimationFrame(fitHost); maybeLoad();
    // V12.2 · M15: «Всё здание» сбрасывает набор; адрес #sections=ground,facade — набор при загрузке и по ссылке
    const nb = $('navBuilding'); if (nb) { nb.addEventListener('click', secReset); nb.addEventListener('click', plReset); }   // 1.0.15 B3-15: «Всё здание» / «Сбросить» снимают и группы «По РД»
    // V12.4 · P6: тот же набор в адресе (hashchange на уровне / в узле) — не применять повторно (иначе secToBuilding уводит во «Всё здание»)
    const fromHash = (h, reset) => { const v = new URLSearchParams(String(h || '').slice(1)).get('sections'); if (v) { const ks = v.split(',').filter(Boolean); if (!(reset && secSame(ks))) secSet_(ks); } else if (reset) secReset(); };
    // E4: sections= движок сохраняет; V12.3 · U1 (скептик §3): адрес без sections= (правка «#», «Назад») снимает набор
    fromHash(HK() ? location.hash : window.__ATLAS_START_HASH); addEventListener('hashchange', () => fromHash(location.hash, true));
    // 1.0.15 B3-15: #placed=OV,VK — группы «По РД» вместе со зданием; адрес без placed= («Назад», правка) снимает
    const plFromHash = (h, reset) => { const v = new URLSearchParams(String(h || '').slice(1)).get('placed'); if (v) { const ks = v.split(',').filter(Boolean); if (!(reset && ks.slice().sort().join(',') === [...plSet].sort().join(','))) plSet_(ks); } else if (reset) plReset(); };
    plFromHash(HK() ? location.hash : window.__ATLAS_START_HASH); addEventListener('hashchange', () => plFromHash(location.hash, true));
  });
})();
