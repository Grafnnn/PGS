/* 1.0.17 П-3 · вкладка «Ход работ» на главной (index.html#progress=1&stage=&lot=&date=). Грузится после atlas:ready и только при ключе config progress.
   Сама подгружает progress-core.js, progress-sync.js (только http(s)) и данные набора progress (data/progress_*.js) — первый кадр не трогает.
   Окраска состояний на дату: выполнено (до дня) · выполнено в выбранный день · частично · конфликт — setTint; не начато — ghost('progress', alpha .18); вне этапа — скрыто (setVisibleSet).
   Отметка: одиночная (щелчок в режиме «Отмечать»: Е-3 setToolMode('mark') → atlas:markpick; без Е-3 — через выбор), Shift/Ctrl — набор, пакетная (этап, захватка, этаж, видимое), обвести (Е-3 pickRect).
   Части сетей — строки ведомости; на модели тело «частично» по доле частей, сами части — setPartTint (Е-4), если он есть.
   «Замечания на модели» и «Ход работ» — всегда по одному (решение координатора 21.10: done ≈ fix, ΔE ≈ 5). Слои окраски Е-2 (setTint('progress', map)), если есть, — чтобы переключение не стирало окраску другого режима.
   1.0.19a (без движка и сервера): Б2 — подтверждение по риску (AtlasProgress.batchRisk), «частично» не понижает выполненное, принятое пропускается, «Этаж целиком» — только в этапе,
   обведённое подсвечивается до записи; Б6/Принцип 4 — строка «Записано · Отменить» 10 с; Б4 — захватка в адресе, память этапа, захватки и режима (AtlasShell.storageKey);
   Б5 — «Сохранить файл журнала» и «Поделиться» в панели, «Покинуть сайт?» только при риске потери; Б9 — «Отмечено выполненными: X из N · условно», «Отметок пока нет»;
   Б6/Т-3 — даты «Сегодня / Вчера / Другая дата», «Снять» отдельно, крупные цели на сенсоре, свёрнутая шторка; Б7 — без кодов этапов, статус отправки в три слова, заметные плашки;
   Б10 — словарь (элемент, Обвести, Принять / Вернуть); М-12, О-12 — фокус и title при входе, Esc через atlas:escape, сообщения об ошибках не гаснут сами. Форматы событий прежние. */
'use strict';
(() => {
  if (window.AtlasProgressTab) return;
  const A = () => window.__ATLAS, V = () => window.AtlasViewSettings;
  const P0 = window.ATLAS_PROJECT || {}, CFG = P0.progress;
  if (!CFG || typeof CFG !== 'object' || CFG.enabled === false) return;
  const feat = k => !!(A() && A().features && A().features[k]);
  const LAYERS = () => feat('tintLayers'), MARK = () => feat('markMode'), RECT = () => feat('pickRect') && typeof A().pickRect === 'function', PARTTINT = () => feat('partTint') && typeof A().setPartTint === 'function';   // Е-1…Е-4 (E1, 1.0.17)
  const $ = id => document.getElementById(id);
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'on') { for (const [n, f] of Object.entries(v)) e.addEventListener(n, f); } else if (k === 'class') e.className = v; else if (k in e && typeof v !== 'string') e[k] = v; else e.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat(3)) if (c != null && c !== false) { if (c.nodeType) { if (INTER.test(tag) && c.querySelectorAll) for (const a of c.querySelectorAll('abbr[tabindex]')) a.removeAttribute('tabindex'); e.append(c); continue; } const ps = NO_ABBR.test(tag) ? null : abbrOf(c); if (!ps) { e.append(String(c)); continue; } const sp = document.createElement('span'); for (const x of ps) sp.append(typeof x === 'string' ? x : abbrEl(x, tag)); e.append(sp); }   // одной строкой в <span>: в кнопках-flex части не разносятся промежутком gap
    return e;
  };
  // 1.0.19a, решение владельца 13: КС, RFI, PGS в подписях — <abbr title> с расшифровкой (AtlasProgress.abbrParts); не в option, select, textarea, code, abbr
  const NO_ABBR = /^(option|select|textarea|code|abbr|script|style|title)$/i;
  const abbrOf = s => { const A = window.AtlasProgress; return A && typeof A.abbrParts === 'function' ? A.abbrParts(s) : null; };
  /* круг 4: расшифровка видна с клавиатуры и касанием — у <abbr> tabindex=0, по фокусу подсказка рядом со словом (role=tooltip), без фокуса скрыта;
     внутри кнопки или ссылки tabindex не ставится (вложенный фокус), там расшифровка — в title */
  const INTER = /^(button|a|summary|label)$/i;
  const abbrTip = e => { let t = document.getElementById('apgAbbrTip'); if (e.type === 'blur') { if (t) t.hidden = true; return; } if (!t) { t = document.createElement('div'); t.id = 'apgAbbrTip'; t.className = 'apg-abbr-tip'; t.setAttribute('role', 'tooltip'); document.body.append(t); }
    const r = e.currentTarget.getBoundingClientRect(); t.textContent = e.currentTarget.title; t.hidden = false; t.style.left = Math.max(8, Math.min(r.left, innerWidth - t.offsetWidth - 8)) + 'px'; t.style.top = (r.bottom + 6 + t.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - 6 - t.offsetHeight) : r.bottom + 6) + 'px'; };
  const abbrEl = ([w, t], tag) => { const a = document.createElement('abbr'); a.className = 'apg-abbr'; a.title = t; a.textContent = w; if (!INTER.test(tag || '')) { a.tabIndex = 0; a.addEventListener('focus', abbrTip); a.addEventListener('blur', abbrTip); } return a; };
  const app = (el, ...k) => { el.append(...k.flat(3).filter(x => x != null && x !== false)); return el; };   // append без «null» в тексте (необязательные части панели)
  const fmt = (v, k) => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: k == null ? 1 : k }) : String(v);
  const EL = ['элемент', 'элемента', 'элементов'];
  const nEl = n => fmt(n, 0) + ' ' + AP.plural(n, EL);

  /* ---------- память этапа, захватки и режима (1.0.19a, Б4) — AtlasShell.storageKey объекта, только в try/catch: запрет хранилища — без памяти ---------- */
  const memKey = () => { try { return window.AtlasShell && typeof AtlasShell.storageKey === 'function' ? AtlasShell.storageKey('progress-last') : 'atlas:' + (/^[a-z0-9-]+$/.test(P0.project_id || '') ? P0.project_id : 'default') + ':progress-last'; } catch (e) { return null; } };
  function memGet() { try { const k = memKey(), v = k ? localStorage.getItem(k) : null, o = v ? JSON.parse(v) : null; return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
  function memSet(o) { try { const k = memKey(); if (k) localStorage.setItem(k, JSON.stringify(Object.assign(memGet(), o))); } catch (e) { /* хранилище запрещено — без памяти */ } }

  /* ---------- загрузка зависимостей (file:// — тегами script, без fetch) ---------- */
  const loadJs = src => new Promise((ok, no) => { if (document.querySelector('script[src="' + src + '"]')) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('не загружен ' + src)); document.body.append(s); });
  async function deps() {
    if (!window.AtlasProgress) await loadJs('assets/progress-core.js');
    if (/^https?:$/.test(location.protocol) && !window.AtlasProgressSync) await loadJs('assets/progress-sync.js').catch(() => null);
    const pl = (Array.isArray(P0.plugins) ? P0.plugins : []).find(p => p && p.name === 'progress'), list = pl && Array.isArray(pl.data) ? pl.data : [];
    const glob = { 'progress_items': 'ATLAS_PROGRESS_ITEMS', 'progress_plan': 'ATLAS_PROGRESS_PLAN', 'progress_journal': 'ATLAS_PROGRESS_JOURNAL' };
    // 1.0.20 (круг 5 B): снимок сметы, карта соответствия и срез «Итог» нужны только страницам PROGRESS / OVERVIEW (теги пишет загрузчик наборов), панели модели — нет: без запросов
    const PAGE_ONLY = /^(progress_estimate|progress_cost_map|progress_digest)$/;
    for (const d of list) { const src = typeof d === 'string' ? d : d && d.src; if (!src || PAGE_ONLY.test((src.split('/').pop() || '').replace(/\.js$/, ''))) continue; const g = (d && d.global) || glob[(src.split('/').pop() || '').replace(/\.js$/, '')]; if (g && window[g]) continue; await loadJs(src).catch(() => null); }
  }

  /* ---------- состояние ---------- */
  const S = { on: false, ready: null, store: null, sync: null, online: null, pub: null, items: {}, events: [], plan: null, user: null, closedUntil: null, unsaved: 0,
    stage: '', lot: '', secs: new Set(), date: null, marking: false, pick: new Set(), lastBatch: null, saved: null, visSet: false, partBodies: new Set(), F: null, minDate: null,
    folded: false, titleBase: null, focusBack: null, popBack: null, rectHi: false };
  let AP = null, panel = null, popup = null, rectBox = null;
  const today = () => AP.today();
  /* r2, Р-1: разбор ключа по набору тел (items.bd, body_ids, тела data/parts) — один разборщик AP.keyResolver на модуль, с кэшем;
     __ATLAS.has по ключам частей не вызывается (Д7). isBody — сам разборщик (AP.splitKey принимает его). */
  let isBody = null;
  const bodyOf = k => { const x = AP.splitKey(k, isBody); return x.part ? x.id : undefined; };   // r2, Р-2: событие части несёт body
  const hasCache = new Map();
  const inWorld = id => { let v = hasCache.get(id); if (v === undefined) { try { v = !A().has || !!A().has(id); } catch (e) { v = true; } hasCache.set(id, v); } return v; };
  const nameOf = id => { const it = S.items[id] || {}; if (it.nm) return it.nm; try { const o = A().get(AP.splitKey(id, isBody).id); return o ? (o.displayTitle || o.name || '') : ''; } catch (e) { return ''; } };
  // круг 3 (К2): вход не подтверждён сервером — автор по последнему входу устройства (preUser, preRole), события с пометкой _nc
  const pre = () => !!(S.online && S.online.online && !S.online.user && S.online.preUser);
  const who = () => S.online && S.online.user ? S.online.user : pre() ? S.online.preUser : S.user ? S.user.by : null;
  const role = () => S.online && S.online.user ? S.online.role : pre() ? S.online.preRole : S.user ? S.user.role : null;
  const roleText = () => (S.online && S.online.user && !S.online.role ? 'только просмотр' : AP.ROLE_LABEL[role()] || role() || '') + (pre() ? ' (вход не подтверждён сервером)' : '');   // К-7: не «null»
  const errName = e => String(e && (e.name || e.message) || e);
  const readOnly = () => !!(S.online && S.online.user && S.online.readOnly);
  // круг 4 (Н3-1): вход не подтверждён и К2 выключен, а имя на устройстве есть — куда на деле идёт отметка: в очередь последнего вошедшего (Р-6) или без автора (Р-13)
  const fate = o => o && o.lastUser ? 'отметки записываются в этом браузере в очередь «' + o.lastUser + '» (последний вход на этом устройстве) и ' + (o.lastRole === null ? 'уйдут, только если в PGS ему дадут роль журнала (его последний вход — только просмотр); сохраните журнал в файл' : o.notFound ? 'уйдут, когда объект найдётся в PGS и он войдёт' : 'уйдут, когда он войдёт')   /* К4-1 */ : 'отметки записываются как сделанные до входа';
  const PGS_NOTE = 'PGS — сайт, где ведутся общий журнал и роли';   // 1.0.19a, словарь 22: пояснение при первом упоминании
  const stageTitle = id => { const s = stageById(id); return s ? AP.stageName(s) : ''; };
  const lotTitle = (st, l, i) => l.title || 'захватка ' + (i + 1);

  /* ---------- цвета: токены Д-1 → [r,g,b] ---------- */
  function rgb(name, fb) {
    let v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v); if (!m) return [128, 128, 128];
    let x = m[1]; if (x.length === 3) x = x.split('').map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(x.slice(i, i + 2), 16));
  }
  const COL = () => ({ done: rgb('--c-done', '#0E8A6A'), day: rgb('--c-done-day', '#66C9FF'), partial: rgb('--c-partial', '#F7D23C'), conflict: rgb('--c-conflict', '#8E1FD1') });
  const ALPHA = () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--progress-pending-a')); return Number.isFinite(v) ? v : 0.18; };

  /* ---------- данные ---------- */
  async function load() {
    S.events = AP.merge(S.pub.journal, await S.store.active()).events;   // без отклонённых сервером
    S.plan = AP.effectivePlan(S.pub.plan, await S.store.get('plan'));
    S.user = await S.store.get('user') || null;
    S.closedUntil = await S.store.get('closedUntil') || null;
    S.unsaved = await S.store.unsaved();
    S.rejected = await S.store.rejected();
    S.minDate = S.events.reduce((m, e) => !m || e.date < m ? e.date : m, null);
    // r2, Д7: подпись журнала и плана — перекраска только при изменении
    const last = S.events.reduce((m, e) => e.t > m ? e.t : m, '');
    S.sig = [S.events.length, last, S.rejected, S.unsaved, JSON.stringify([S.user, S.closedUntil])].join('|');
    S.planSig = S.plan ? (S.plan.rev ?? '') + ':' + (S.plan.stages || []).length + ':' + (S.plan.edited || '') : '';
    S._parts = null;
  }
  const stages = () => AP.stagesOf(S.plan);
  const stageById = id => stages().find(s => s.id === id) || null;
  // Тела набора: этап (захватка) или весь объект (все этапы + тела из объёмов); фильтр по крупным разделам (sec)
  // r2, Р-1/Д3: ключи частей этапа (этап из частей сетей) сводятся к телу; кэш по этапу, захватке и разделам (Д7)
  let scopeKey = null, scopeVal = null;
  function scopeIds() {
    const key = [S.stage, S.lot, [...S.secs].sort().join('|'), S.planSig].join('\u0001');
    if (key === scopeKey && scopeVal) return scopeVal;
    let raw;
    const st = S.stage && stageById(S.stage);
    if (st) { const l = S.lot && (st.lots || []).find(x => x.id === S.lot); raw = l ? l.ids : st.ids || []; }
    else { raw = []; for (const s of stages()) for (const id of s.ids || []) raw.push(id); for (const k of Object.keys(S.items)) raw.push(k); }
    const set = new Set(); for (const k of raw) set.add(AP.splitKey(k, isBody).id);
    let ids = [...set];
    if (S.secs.size) ids = ids.filter(id => S.secs.has((S.items[id] || {}).sec || ''));
    scopeVal = ids.filter(inWorld); scopeKey = key;
    return scopeVal;
  }
  const partsIdx = () => { if (S._parts) return S._parts; const M = new Map(); for (const k of Object.keys(S.items)) { const x = AP.splitKey(k, isBody); if (x.part) (M.get(x.id) || M.set(x.id, []).get(x.id)).push(k); } for (const e of S.events) { const x = AP.splitKey(e.id, isBody); if (x.part) { const a = M.get(x.id) || M.set(x.id, []).get(x.id); if (!a.includes(e.id)) a.push(e.id); } } return (S._parts = M); };

  /* ---------- окраска ---------- */
  function paint() {
    if (!S.on || S.sandbox) return;   // 1.0.18, П-7: в окне PGS журнала нет — модель как есть
    const t0 = performance.now(), a = A(), D = S.date || today(), F = AP.fold(S.events, D); S.F = F;
    const confl = new Set(AP.conflicts(S.events, D).filter(c => !c.resolved).map(c => c.id));
    const C = COL(), tint = new Map(), ghost = [], ids = scopeIds(), PI = partsIdx(), cnt = { done: 0, day: 0, partial: 0, conflict: 0, none: 0 }, partTint = new Map();
    let pc = 0; const vol = new Map();
    for (const id of ids) {
      let st, ps = PI.get(id);
      if (ps && ps.length) {   // тело сети: по частям
        let dn = 0, pt = 0, dd = 0; const pm = {};
        for (const k of ps) { const s = F.get(k); const part = AP.splitKey(k, isBody).part; if (s && s.st === 'done') { dn++; if (s.lastDate === D) dd++; pm[part] = s.lastDate === D ? C.day : C.done; } else if (s && s.st === 'partial') { pt++; pm[part] = C.partial; } }
        st = dn === ps.length ? (dd ? 'day' : 'done') : dn || pt ? 'partial' : 'none';
        if (Object.keys(pm).length) partTint.set(id, pm);
        pc += (dn + pt * 0.5) / ps.length;
      } else {
        const s = F.get(id);
        st = !s || s.st === 'none' ? 'none' : s.st === 'partial' ? 'partial' : s.lastDate === D ? 'day' : 'done';
        const v = AP.valueOf(s, S.items[id]); pc += v.pc;
        const it = S.items[id]; if (it && it.q != null && it.u && it.u !== 'шт') { const o = vol.get(it.u) || vol.set(it.u, { plan: 0, done: 0 }).get(it.u); o.plan += it.q; o.done += v.v || 0; }
      }
      if (confl.has(id) || (ps && ps.some(k => confl.has(k)))) st = 'conflict';
      cnt[st]++;
      if (st === 'none') ghost.push(id); else tint.set(id, st === 'day' ? C.day : st === 'partial' ? C.partial : st === 'conflict' ? C.conflict : C.done);
    }
    try { if (LAYERS()) a.setTint('progress', tint.size ? tint : null); else a.setTint(tint.size ? tint : null); } catch (e) { /* без окраски */ }
    try { V().ghost('progress', ghost.length ? ghost : null, { alpha: ALPHA() }); } catch (e) { /* */ }
    if (PARTTINT()) { try { for (const id of S.partBodies) if (!partTint.has(id)) a.setPartTint(id, null); for (const [id, m] of partTint) a.setPartTint(id, m); S.partBodies = new Set(partTint.keys()); } catch (e) { /* */ } }
    const whole = !S.stage && !S.secs.size;
    placedFor(whole ? [] : ids);   // r2, Д3: тела «по РД» этапа — их группы слоя «По РД» на время этапа
    try { if (!whole) { a.setVisibleSet(ids, { keepOnScope: true }); S.visSet = true; } else if (S.visSet) { a.setVisibleSet(null); S.visSet = false; } } catch (e) { /* */ }
    S.sum = { n: ids.length, cnt, pct: ids.length ? pc / ids.length * 100 : 0, vol, ms: Math.round(performance.now() - t0) };
    renderSum();
  }
  // 1.0.19a, Б7: при выборе этапа или захватки камера показывает его (fitIds движка, если есть); весь объект — без смены камеры
  function fitScope() {
    if (!S.stage) return;
    try { const a = A(); if (a && typeof a.fitIds === 'function') { const ids = scopeIds(); if (ids.length) a.fitIds(ids, { reveal: 'auto' }); } } catch (e) { /* без подгонки */ }
  }
  // r2, Д3: тела этапа из слоя «По РД» (placedGroupOf) видны только с их группами — включить на время этапа, при выходе вернуть прежний набор групп
  // r3, Р-14: при глубокой ссылке на этап модуль узлов и слой «По РД» готовы позже первой перекраски — повтор, пока группы не включатся (до 30 с), затем перекраска
  function placedRetry() {
    if (S.placedWait) return;
    const t0 = Date.now();
    S.placedWait = setInterval(() => { if (!S.on || Date.now() - t0 > 30000) { clearInterval(S.placedWait); S.placedWait = null; return; } const N = window.AtlasNodes; if (N && typeof N.setPlaced === 'function' && typeof N.placed === 'function') { clearInterval(S.placedWait); S.placedWait = null; paint(); } }, 400);
  }
  function placedFor(ids) {
    const N = window.AtlasNodes, a = A();
    if (!a || typeof a.placedGroupOf !== 'function') return;
    const gs = new Set(); for (const id of ids) { let g = null; try { g = a.placedGroupOf(id); } catch (e) { g = null; } if (g) gs.add(g); }
    if (!N || typeof N.setPlaced !== 'function' || typeof N.placed !== 'function') { if (gs.size) placedRetry(); return; }
    const cur = ((N.placed() || {}).ids || []).slice().sort();
    if (gs.size) {
      if (!S.placedSaved) S.placedSaved = { ids: cur };
      const want = [...new Set([...S.placedSaved.ids, ...gs])].sort();
      if (want.join('|') !== cur.join('|')) {
        try { N.setPlaced(want); } catch (e) { /* */ }
        const got = (N.placed() || {}).ids || [];
        if (!want.every(g => got.includes(g))) { S.placedSaved = null; placedRetry(); }   // слой ещё не готов — повторить
      }
    } else if (S.placedSaved) { const back = S.placedSaved.ids; S.placedSaved = null; if (back.join('|') !== cur.join('|')) { try { N.setPlaced(back.length ? back : null); } catch (e) { /* */ } } }
  }
  function unpaint() {
    const a = A();
    if (S.placedWait) { clearInterval(S.placedWait); S.placedWait = null; }
    placedFor([]);
    try { if (LAYERS()) a.setTint('progress', null); else a.setTint(null); } catch (e) { /* */ }
    try { V().ghost('progress', null); } catch (e) { /* */ }
    if (PARTTINT()) { try { for (const id of S.partBodies) a.setPartTint(id, null); } catch (e) { /* */ } S.partBodies = new Set(); }
    try { if (S.visSet) a.setVisibleSet(null); } catch (e) { /* */ } S.visSet = false;
    try { a.highlight && a.highlight(null); } catch (e) { /* */ }
  }

  /* ---------- адрес и память ---------- */
  const hq = () => new URLSearchParams(location.hash.slice(1));
  function writeHash() {
    const q = hq();
    if (S.on) { q.set('progress', '1'); if (S.stage) q.set('stage', S.stage); else q.delete('stage'); if (S.stage && S.lot) q.set('lot', S.lot); else q.delete('lot'); if (S.date && S.date !== today()) q.set('date', S.date); else q.delete('date'); }   // 1.0.19a, Б4: и захватка
    else { q.delete('progress'); q.delete('stage'); q.delete('lot'); q.delete('date'); }
    try { history.replaceState(null, '', '#' + q.toString()); } catch (e) { /* */ }
    try { window.AtlasShell && AtlasShell.syncProgressNav && AtlasShell.syncProgressNav(); } catch (e) { /* */ }
    if (S.on) memSet({ stage: S.stage || '', lot: S.stage ? S.lot || '' : '' });
  }

  /* ---------- сообщения: строка состояния (role=status), ошибки — до «Закрыть» (О-12), остальное ≥ 6 с ---------- */
  function announce(t) { let el = $('apgLive'); if (!el) { el = h('div', { id: 'apgLive', class: 'apg-sr', role: 'status', 'aria-live': 'polite' }); document.body.append(el); } el.textContent = ''; setTimeout(() => { el.textContent = t; }, 30); }
  let toastT = 0;
  /* toast(t, bad, act): bad — ошибка (что случилось → что делать), висит до «Закрыть»; act {label, run} — кнопка действия («Повторить» и т. п.);
     прочие — 6,5 с, при наведении не гаснут. Текст сообщения — первым узлом (#apgToast textContent начинается с него). */
  function toast(t, bad, act) {
    let el = $('apgToast');
    if (!el) { el = h('div', { id: 'apgToast', class: 'apg-toast', role: 'status', 'aria-live': 'polite', on: { mouseenter: () => clearTimeout(toastT), mouseleave: () => { if (!el.classList.contains('apg-toast--bad')) arm(); } } }); document.body.append(el); }
    const arm = () => { clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 6500); };
    el.textContent = ''; el.append(h('span', { class: 'apg-toast-msg' }, t));
    if (act && typeof act.run === 'function') el.append(h('button', { type: 'button', class: 'apg-toast-btn', on: { click: () => { el.hidden = true; act.run(); } } }, act.label || 'Повторить'));
    if (bad) el.append(h('button', { type: 'button', class: 'apg-toast-btn', on: { click: () => { el.hidden = true; } } }, 'Закрыть'));
    el.classList.toggle('apg-toast--bad', !!bad); el.setAttribute('role', bad ? 'alert' : 'status');
    el.hidden = false; clearTimeout(toastT); if (!bad) arm();
    placeLow(el);
  }
  /* строка «Записано · Отменить» и сообщения: на телефоне — над шторкой панели (не перекрывают её кнопки); на ПК — внизу по центру, над нижней полосой
     инструментов модели, если она там есть (ищется по точке, без имён чужих классов: невысокий элемент у нижнего края в середине экрана), панель — слева */
  function placeLow(el) {
    let b = 24;
    if (innerWidth <= 850 && panel && !panel.hidden) { const r = panel.getBoundingClientRect(); if (r.height) b = Math.max(24, Math.round(innerHeight - r.top) + 8); }
    else if (innerWidth <= 850) b = 76;
    else {
      let top = innerHeight; const x = Math.round(innerWidth / 2);
      try { for (const y of [innerHeight - 16, innerHeight - 40]) for (const e of document.elementsFromPoint(x, y)) { if (e === el || el.contains(e) || e.tagName === 'CANVAS' || e === document.body || e === document.documentElement) continue; const r = e.getBoundingClientRect(); if (r.height > 0 && r.height < 160 && r.width < innerWidth * 0.9) top = Math.min(top, r.top); } } catch (e) { /* без поиска */ }
      b = Math.max(24, Math.round(innerHeight - top) + 8);
    }
    el.style.bottom = b + 'px';
  }
  let undoT = 0;
  // 1.0.19a, принцип 4: после записи пакета — «Записано: N · Отменить» 10 с; «Отменить» — undoBatch одним нажатием
  function undoBar(n, note) {
    let el = $('apgUndo');
    if (!el) { el = h('div', { id: 'apgUndo', class: 'apg-undo', role: 'status', 'aria-live': 'polite', on: { mouseenter: () => clearTimeout(undoT), mouseleave: () => armUndo() } }); document.body.append(el); }
    el.textContent = '';
    el.append(h('span', { class: 'apg-undo-msg' }, 'Записано: ' + nEl(n) + (note ? ' · ' + note : '')), h('button', { type: 'button', class: 'apg-undo-btn', on: { click: async () => { hideUndo(); await undoLast(); } } }, 'Отменить'));
    el.hidden = false; placeLow(el); armUndo();
  }
  const armUndo = () => { clearTimeout(undoT); undoT = setTimeout(hideUndo, 10000); };
  function hideUndo() { clearTimeout(undoT); const el = $('apgUndo'); if (el) el.hidden = true; }

  /* ---------- панель ---------- */
  function buildPanel() {
    panel = h('section', { class: 'apg', id: 'apg', 'aria-labelledby': 'apgTitle', hidden: true });
    const stage = document.querySelector('.stage') || document.body;
    stage.append(panel);
  }
  const headOf = () => h('div', { class: 'apg-head' }, h('h2', { id: 'apgTitle', tabindex: '-1' }, 'Ход работ'),
    h('button', { type: 'button', class: 'apg-x apg-fold', 'aria-expanded': String(!S.folded), 'aria-controls': 'apg', title: S.folded ? 'Развернуть панель' : 'Свернуть панель', 'aria-label': S.folded ? 'Развернуть панель «Ход работ»' : 'Свернуть панель «Ход работ»', on: { click: () => setFolded(!S.folded) } }, S.folded ? '▴' : '▾'),
    h('button', { type: 'button', class: 'apg-x', 'aria-label': 'Выйти из режима «Ход работ»', title: 'Выйти (Esc)', on: { click: () => exit({ focus: true }) } }, '×'));
  function setFolded(v) { S.folded = !!v; memSet({ folded: S.folded }); renderPanel(); const b = panel && panel.querySelector('.apg-fold'); if (b) b.focus(); }
  // 1.0.18, П-7: окно PGS (iframe sandbox без allow-same-origin) — хранилища браузера и входа PGS нет: сообщение и та же модель в новой вкладке
  // круг 3 (Ф5): вкладка не открылась (нет allow-popups, блокировщик) — постоянная строка с адресом в панели (как на PROGRESS), не только всплывающее сообщение
  let sbxHint = null;
  function renderSandbox() {
    const q = hq(); q.set('progress', '1'); if (S.stage) q.set('stage', S.stage);
    const url = location.href.split('#')[0] + '#' + q.toString(), hint = h('p', { class: 'apg-muted apg-id', hidden: !sbxHint }, sbxHint || '');
    panel.append(h('div', { class: 'apg-head' }, h('h2', { id: 'apgTitle', tabindex: '-1' }, 'Ход работ'), h('button', { type: 'button', class: 'apg-x', 'aria-label': 'Выйти из режима «Ход работ»', title: 'Выйти', on: { click: () => exit({ focus: true }) } }, '×')),
      h('p', { class: 'apg-warn', role: 'status' }, 'В окне PGS отметки недоступны — откройте модель в новой вкладке.'),
      h('p', { class: 'apg-muted' }, 'Здесь браузер не даёт сохранить журнал отметок и войти в PGS (' + PGS_NOTE + '). В новой вкладке — та же модель и этап, отметки и журнал работают как обычно.'),
      h('div', { class: 'apg-row apg-acts' }, h('button', { type: 'button', class: 'apg-btn apg-btn--done', on: { click: () => { if (!AP.openTab(url)) { sbxHint = hint.textContent = 'Не открылась новая вкладка — скопируйте адрес: ' + url; hint.hidden = false; toast(sbxHint + '. Что делать: вставьте адрес в новую вкладку браузера.', true); } } } }, 'Открыть в новой вкладке')), hint);
    panel.hidden = !S.on;
  }
  // 1.0.19a, Б7: статус отправки — три слова (Отправлено / Ждёт сети · N / Нужно войти); подробности — под «Подробности», тревожные состояния 1.0.18 — заметной плашкой
  function syncChip(o) {
    if (!o || !o.online) return null;
    if (o.readOnly && o.user) return null;   // «только просмотр» — плашкой
    if (!o.user) return o.needLogin || o.forbidden || (!o.paused && !o.notFound) ? 'Нужно войти' : 'Ждёт сети' + (o.unconf ? ' · ' + o.unconf : '');
    if (o.paused || o.notFound || o.pending) return 'Ждёт сети' + (o.pending ? ' · ' + o.pending : '');
    return 'Отправлено';
  }
  const syncAlarm = o => !!(o && o.online && (o.notFound || o.paused || o.needLogin || o.forbidden || pre() || (o.user && (o.readOnly || o.warn || o.viewOnly)) || (!o.user && (o.unconf || o.preUser))));
  function renderPanel() {
    if (!panel) buildPanel();
    const hadFocus = panel.contains(document.activeElement) && document.activeElement.id ? document.activeElement.id : null;
    panel.textContent = '';
    panel.classList.toggle('apg--folded', !!S.folded); document.body.classList.toggle('apg-folded', !!S.folded && S.on);
    if (S.sandbox) return renderSandbox();
    const st = S.stage && stageById(S.stage);
    const selStage = h('select', { id: 'apgStage', 'aria-label': 'Этап', on: { change: e => { S.stage = e.target.value; S.lot = ''; writeHash(); renderPanel(); paint(); fitScope(); announce(S.stage ? 'Этап «' + stageTitle(S.stage) + '»: ' + nEl(scopeIds().length) : 'Весь объект'); } } }, h('option', { value: '' }, 'Весь объект'), stages().map(s => h('option', { value: s.id, selected: s.id === S.stage }, AP.stageName(s))));
    const lots = st && (st.lots || []).length ? h('select', { id: 'apgLot', 'aria-label': 'Захватка (участок работ)', title: 'Захватка — участок работ этапа', on: { change: e => { S.lot = e.target.value; writeHash(); renderPanel(); paint(); fitScope(); announce(S.lot ? 'Захватка: ' + nEl(scopeIds().length) : 'Весь этап'); } } }, h('option', { value: '' }, 'весь этап'), st.lots.map((l, i) => h('option', { value: l.id, selected: l.id === S.lot }, lotTitle(st, l, i)))) : null;
    const secList = [...new Set(Object.values(S.items).map(x => x.sec).filter(Boolean))].sort();
    const secs = secList.length > 1 ? h('details', { class: 'apg-secs' }, h('summary', {}, 'Разделы' + (S.secs.size ? ' · ' + S.secs.size : '')), h('div', { class: 'apg-secs-l' }, secList.slice(0, 40).map(s => h('label', {}, h('input', { type: 'checkbox', checked: S.secs.has(s), on: { change: e => { if (e.target.checked) S.secs.add(s); else S.secs.delete(s); paint(); } } }), s)))) : null;
    const max = today(), min = S.minDate && S.minDate < max ? S.minDate : AP.addDays(max, -30);
    const span = Math.max(1, Math.round((Date.parse(max) - Date.parse(min)) / 864e5)), cur = S.date || max, pos = Math.round((Date.parse(cur) - Date.parse(min)) / 864e5);
    const dIn = h('input', { id: 'apgDate', type: 'date', value: cur, min, max, 'aria-label': 'Состояние на дату', on: { change: e => { if (!AP.isDate(e.target.value)) return; S.date = e.target.value >= max ? null : e.target.value; writeHash(); renderPanel(); paint(); } } });
    const slider = h('input', { id: 'apgSlider', type: 'range', min: 0, max: span, value: Math.min(span, Math.max(0, pos)), 'aria-label': 'Состояние на дату — ползунок', on: { input: e => { S.date = +e.target.value >= span ? null : AP.addDays(min, +e.target.value); dIn.value = S.date || max; paint(); }, change: () => writeHash() } });
    const markBtn = h('button', { id: 'apgMark', type: 'button', class: 'apg-btn apg-btn--main' + (S.marking ? ' apg-btn--on' : ''), 'aria-pressed': String(S.marking), on: { click: () => setMarking(!S.marking) }, title: MARK() ? 'Щелчок по элементу — отметка; Shift или Ctrl — добавить в набор' : 'Щелчок по элементу — отметка (через выбор: карточка мелькнёт)' }, S.marking ? 'Отмечаю…' : 'Отмечать');
    const batch = h('div', { class: 'apg-row apg-acts apg-batch' },
      st ? h('button', { id: 'apgWhole', type: 'button', class: 'apg-btn', on: { click: e => batchPopup(scopeIds(), S.lot ? 'Захватка целиком' : 'Этап «' + AP.stageName(st) + '» целиком', e.currentTarget) } }, S.lot ? 'Захватка целиком' : 'Этап целиком') : null,
      levelsBtn(), RECT() ? h('button', { id: 'apgRect', type: 'button', class: 'apg-btn', on: { click: startRect }, title: 'Обвести элементы на модели' }, 'Обвести') : null,
      S.pick.size ? h('button', { id: 'apgSet', type: 'button', class: 'apg-btn apg-btn--on', on: { click: e => batchPopup([...S.pick], 'Набор', e.currentTarget) } }, 'Набор · ' + S.pick.size) : null,
      S.lastBatch ? h('button', { id: 'apgUndoLast', type: 'button', class: 'apg-btn', on: { click: undoLast }, title: 'Снять отметки последнего пакета' }, 'Отменить пакет') : null);
    const user = h('button', { id: 'apgUser', type: 'button', class: 'apg-link', on: { click: () => userDialog() } }, who() ? who() + ' · ' + roleText() : 'Кто отмечает?');   // Д5: без события в then
    const O = S.online, chip = syncChip(O), alarm = syncAlarm(O);
    const pgsLine = O && O.online ? h('span', { class: alarm ? 'apg-warn apg-banner' : 'apg-muted' }, 'PGS: ' + footState() + (O.user && O.warn ? ' · ' + O.warn : '') + (O.unconf ? ' · ждут подтверждения входа: ' + O.unconf : '') + (O.imported ? ' · импорт не отправлен: ' + O.imported : '') + (O.others ? ' · ждут входа своего автора: ' + O.others : '') + (O.anon ? ' · до первого входа: ' + O.anon + ' (решение — в «История отметок и ведомость»)' : '') + (O.preOther ? ' · сделаны до входа: ' + O.preOther + ' (решение — в «История отметок и ведомость»)' : '')) : null;
    const canShare = S.unsaved && AP.canShareFiles();
    const save = S.store && S.store.memory
      ? h('div', { class: 'apg-save apg-banner apg-warn' }, h('span', {}, 'Хранилище браузера недоступно (' + (S.store.memoryWhy || 'частное окно?') + '): отметки живут до закрытия вкладки' + (S.unsaved ? ' · не сохранено: ' + S.unsaved : '')), S.unsaved ? h('button', { type: 'button', class: 'apg-btn', on: { click: saveFile } }, 'Сохранить файл журнала') : null)
      : S.unsaved ? h('div', { class: 'apg-save' }, h('span', { class: 'apg-warn' }, 'Не сохранено: ' + S.unsaved), h('button', { id: 'apgSave', type: 'button', class: 'apg-btn', on: { click: saveFile }, title: 'Файл журнала этого браузера — основное хранилище до сервера' }, 'Сохранить файл журнала'), canShare ? h('button', { type: 'button', class: 'apg-btn', on: { click: shareFile } }, 'Поделиться') : null)
      : h('div', { class: 'apg-save' }, h('span', { class: 'apg-muted' }, S.events.length ? 'все отметки в файле' + (O && O.online && O.user ? ' или на сервере' : '') : 'отметок в этом браузере нет'));
    app(panel, headOf(),
      h('div', { class: 'apg-row apg-scope' }, selStage, lots), secs,
      h('div', { class: 'apg-date' }, h('label', { class: 'apg-lbl', for: 'apgDate' }, 'На дату'), dIn, slider),
      h('div', { class: 'apg-sum', id: 'apgSum', 'aria-live': 'polite' }),
      h('div', { class: 'apg-row apg-acts' }, markBtn, user), batch,
      h('div', { class: 'apg-foot' },
        save,
        chip ? h('span', { class: 'apg-chip' + (chip === 'Отправлено' ? '' : ' apg-chip--wait'), title: PGS_NOTE }, chip) : null,
        pgsLine ? (alarm ? pgsLine : h('details', { class: 'apg-more' }, h('summary', {}, 'Подробности'), pgsLine)) : null,
        S.rejected ? h('a', { href: 'PROGRESS.html#tab=journal', class: 'apg-link apg-warn apg-banner' }, 'отклонено сервером: ' + S.rejected + ' →') : null,
        h('a', { href: 'PROGRESS.html#tab=journal' + (S.stage ? '&stage=' + encodeURIComponent(S.stage) : ''), class: 'apg-link' }, 'История отметок и ведомость →')));
    panel.hidden = !S.on;
    renderSum();
    if (hadFocus) { const f = $(hadFocus); if (f) f.focus({ preventScroll: true }); }
  }
  // 1.0.18, П-1; круг 3 (К2, Ф3): вход в этом сеансе не подтверждён — честно, что будет с отметками
  // круг 4: (О2) после 401 в сеансе и сбоя — «войдите в PGS»; (Н3-1) с именем на устройстве — куда на деле идёт отметка; (Н3-2) «только просмотр» — сколько своих не уйдёт; (Л1) warn — в renderPanel
  function footState() {
    const o = S.online, cause = o.notFound ? 'объект не найден в PGS' : o.paused;
    if (o.forbidden) return 'нет доступа к проекту';
    if (!o.user && cause && pre()) return 'вход не подтверждён сервером (' + cause + ') — отметки от имени ' + o.preUser + ' записываются здесь и уйдут после подтверждения входа';
    if (!o.user && cause && o.needLogin) return 'вход не выполнен (последняя проверка: ' + cause + ') — войдите в PGS' + (who() ? '; ' + fate(o) : '');
    if (!o.user && cause) return 'сервер не подтвердил вход (' + cause + ')' + (who() ? ' — ' + fate(o) : ' — отметки можно будет записать после ответа сервера');
    if (o.notFound) return 'объект не найден в PGS — отметки остаются местными';
    if (o.paused) return 'отправка приостановлена (' + o.paused + ')' + (o.pending ? ' · ждут отправки ' + o.pending : '');
    return !o.user ? 'Войти в PGS' : o.readOnly ? 'только просмотр' + (o.viewOnly ? ' — отметки не уйдут: ' + o.viewOnly + (o.viewOnlyUnsaved ? ' (сохраните журнал в файл)' : ' (они в файле журнала)') : '') : o.pending ? 'ждут отправки ' + o.pending : 'отправлено';
  }
  // 1.0.19a, Б2: «Этаж целиком» — только внутри выбранного этапа (без этапа — весь этаж объекта одним нажатием, проба: 5 302 отметки)
  // круг 3 (к1, низкая 7): без этапа — «Этаж: сначала этап» (прежняя «Этаж целиком — сначала этап» обрезалась до «Этаж це…» на 1440 и 390); полностью — в подсказке и aria-label
  function levelsBtn() {
    if (!S.stage) return h('select', { id: 'apgLevel', 'aria-label': 'Этаж: сначала этап — этаж целиком отмечается только в выбранном этапе', class: 'apg-sel', disabled: true, title: 'Этаж целиком — сначала выберите этап: отметка берёт только элементы этапа на этаже' }, h('option', { value: '' }, 'Этаж: сначала этап'));
    const lv = [...new Set(scopeIds().map(id => (S.items[id] || {}).lv).filter(Boolean))].sort();
    if (!lv.length) return null;
    return h('select', { id: 'apgLevel', 'aria-label': 'Отметить этаж целиком (в выбранном этапе)', class: 'apg-sel', on: { change: e => { const v = e.target.value; e.target.value = ''; if (v) batchPopup(scopeIds().filter(id => (S.items[id] || {}).lv === v), 'Этаж ' + v + ' · ' + stageTitle(S.stage), e.currentTarget); } } }, h('option', { value: '' }, 'Этаж целиком…'), lv.map(v => h('option', { value: v }, v)));
  }
  const srcText = () => S.online && S.online.online && S.online.user ? 'данные PGS и этого браузера' : 'данные этого браузера' + (S.pub && S.pub.journal.length ? ' и среза выпуска' : '');
  function renderSum() {
    const el = $('apgSum'); if (!el || !S.sum) return;
    const s = S.sum, C = s.cnt; el.textContent = '';
    const leg = (k, t, n) => h('span', { class: 'apg-leg apg-leg--' + k }, h('i', { 'aria-hidden': 'true' }), t + ' ' + fmt(n, 0));
    // 1.0.19a, Б9: пустой журнал — «Отметок пока нет», без «0 %»
    if (!S.events.length) { el.append(h('div', { class: 'apg-pct' }, h('b', {}, 'Отметок пока нет'), h('span', { class: 'apg-muted' }, ' · ' + srcText())), h('div', { class: 'apg-muted' }, 'В наборе ' + nEl(s.n))); return; }
    const dn = C.done + C.day, pct = s.n ? dn / s.n * 100 : 0;
    el.append(h('div', { class: 'apg-pct' }, 'Отмечено выполненными: ', h('b', {}, fmt(dn, 0)), ' из ' + nEl(s.n) + ' (' + fmt(pct, 1) + ' %) · ', h('abbr', { class: 'apg-muted', title: 'Как посчитано: доля элементов, отмеченных выполненными, по числу элементов; частично выполненные и объёмы в этой цифре не учтены' }, 'условно')),
      h('div', { class: 'apg-muted' }, srcText()),
      ...[...s.vol].filter(([, o]) => o.done > 0).map(([u, o]) => h('div', { class: 'apg-muted' }, 'Объём: ' + fmt(o.done, 2) + ' из ' + fmt(o.plan, 2) + ' ' + u + ' (' + fmt(o.plan ? o.done / o.plan * 100 : 0, 1) + ' %)')),
      h('div', { class: 'apg-legend' }, leg('done', 'выполнено', C.done), leg('day', 'в этот день', C.day), leg('partial', 'частично', C.partial), C.conflict ? leg('conflict', 'конфликт', C.conflict) : null, leg('none', 'не начато', C.none)));
  }

  /* ---------- отметка ---------- */
  function setMarking(on) {
    S.marking = on; const a = A();
    if (MARK()) { try { a.setToolMode(on ? 'mark' : null); } catch (e) { /* */ } }
    if (!on) { S.pick.clear(); try { a.highlight && a.highlight(null); } catch (e) { /* */ } closePopup(); }
    document.body.classList.toggle('apg-marking', on);
    if (S.on) memSet({ marking: !!on });
    renderPanel();
  }
  function onPick(id, part, multi, x, y) {
    if (!S.on || !S.marking || !id) return;
    const key = part ? AP.joinKey(id, part) : id;
    if (multi) { if (S.pick.has(key)) S.pick.delete(key); else S.pick.add(key); try { A().highlight([...S.pick].map(k => AP.splitKey(k, isBody).id)); } catch (e) { /* */ } renderPanel(); return; }
    markPopup([key], x, y);
  }
  function batchPopup(keys, title, from) { if (!keys.length) { toast('Нет элементов для отметки'); return; } markPopup(keys, null, null, title, from); }
  function closePopup(back) {
    if (!popup) return;
    popup.remove(); popup = null;
    if (S.rectHi) { S.rectHi = false; try { A().highlight && A().highlight(S.pick.size ? [...S.pick].map(k => AP.splitKey(k, isBody).id) : null); } catch (e) { /* */ } }
    if (back && S.popBack && S.popBack.isConnected) { try { S.popBack.focus(); } catch (e) { /* */ } }
    S.popBack = null;
  }
  // тело сети с частями в объёмах — отметка по его частям (ведомость считает части); часть и тело без частей — как есть
  const expand = keys => [...new Set(keys.flatMap(k => { const x = AP.splitKey(k, isBody); const ps = !x.part && partsIdx().get(x.id); return ps && ps.length ? ps : [k]; }))];
  /* 1.0.19a, Б2 (случай 4): пакет без выбранного этапа («Весь объект») от 20 элементов — «Обвести» или «Набор».
     Круг 2 (B-01): «Обвести» отдаёт только видимые элементы, поэтому полное покрытие объекта или этажа не проверяется (окно не появлялось никогда):
     элементы на нескольких этажах — 'object', на одном — 'level:<этаж>' («—» — этаж в данных не указан). */
  function wholeOf(keys) {
    if (S.stage || keys.length < 20) return '';
    const lv = new Set(keys.map(k => (S.items[k] || S.items[AP.splitKey(k, isBody).id] || {}).lv || ''));
    return lv.size > 1 ? 'object' : 'level:' + ([...lv][0] || '—');
  }
  const wholeText = w => w === 'object' ? 'Этап не выбран (весь объект): отметка сразу на нескольких этажах'
    : String(w).replace(/^level:/, '') === '—' ? 'Этап не выбран (весь объект): отметка элементов, у которых этаж не указан' : 'Этап не выбран (весь объект): отметка на этаже ' + String(w).replace(/^level:/, '');
  const skippedText = sk => !sk ? '' : [sk.done ? 'пропущено готовых: ' + sk.done : '', sk.confirmed ? 'пропущено принятых технадзором: ' + sk.confirmed : ''].filter(Boolean).join(' · ');
  /* 1.0.19a, Б2: окно подтверждения со сводкой — только в 4 случаях (batchRisk): понижение; выход за этап; «Снять» или правка принятого; весь объект или этаж без этапа.
     → Promise {ok, includeConfirmed}; фокус — на «Отмена», после закрытия — туда, откуда открыли. */
  function riskDialog(risk, op, title) {
    return new Promise(done => {
      const back = document.activeElement, one = risk.n === 1;
      const d = h('dialog', { class: 'apg-dlg apg-risk', 'aria-labelledby': 'apgRiskH', 'aria-describedby': 'apgRiskL' });
      const inc = !one && op === 'undo' && risk.confirmed ? h('input', { type: 'checkbox', id: 'apgRiskInc' }) : null;
      const what = op === 'undo' ? 'Снять' : op === 'partial' ? 'Записать «частично»' : 'Записать «выполнено»';
      const lines = [];
      if (risk.cases.includes('whole')) lines.push(wholeText(risk.whole));
      if (risk.lower) lines.push((one ? 'Понизит выполненное' : 'Понизит выполненное у ' + nEl(risk.lower)) + (op === 'undo' ? ' (отметка будет снята)' : ' (было больше)'));
      if (risk.outside) lines.push((one ? 'Элемент вне' : nEl(risk.outside) + ' вне') + ' выбранного этапа «' + stageTitle(S.stage) + '»');
      if (risk.confirmed) lines.push(one ? 'Элемент принят технадзором — отметка сбросит приёмку' : op === 'undo' ? 'Принятых технадзором: ' + risk.confirmed + ' — по умолчанию не снимаются' : 'Принятых технадзором: ' + risk.confirmed);
      const n = () => risk.write + (inc && inc.checked ? risk.confirmed : 0), sumEl = h('p', { class: 'apg-muted' });
      const sum = () => { sumEl.textContent = 'Будет записано: ' + nEl(n()) + (risk.skipDone ? ' · пропущено готовых: ' + risk.skipDone : '') + (risk.skipConf && !(inc && inc.checked) ? ' · пропущено принятых: ' + risk.skipConf : ''); go.textContent = what + ' (' + n() + ')'; go.disabled = !n(); };
      const close = v => { try { d.close(); } catch (e) { /* */ } d.remove(); if (back && back.isConnected) { try { back.focus(); } catch (e) { /* */ } } done(v); };
      const go = h('button', { type: 'button', class: 'apg-btn apg-btn--done', on: { click: () => close({ ok: true, includeConfirmed: !!(inc && inc.checked) }) } });
      const no = h('button', { type: 'button', class: 'apg-btn', on: { click: () => close({ ok: false }) } }, 'Отмена');
      app(d, h('h2', { id: 'apgRiskH' }, 'Проверьте перед записью'), h('p', {}, title || ''), h('ul', { id: 'apgRiskL', class: 'apg-risk-l' }, lines.map(t => h('li', {}, t))),
        inc ? h('label', { class: 'apg-chk' }, inc, ' Снять и принятые технадзором (' + risk.confirmed + ') — приёмка будет сброшена') : null, sumEl, h('div', { class: 'apg-row' }, go, no));
      if (inc) inc.addEventListener('change', sum);
      d.addEventListener('cancel', e => { e.preventDefault(); close({ ok: false }); });
      document.body.append(d); sum(); d.showModal(); no.focus();
    });
  }
  function markPopup(keys, x, y, title, from) {
    closePopup();
    if (readOnly()) { toast('Только просмотр: в PGS нет роли журнала — отметки не записываются. Что делать: попросите роль в PGS или отметьте на устройстве с ролью оператора.', true); return; }   // К-8
    keys = expand(keys);
    if (!who()) { userDialog(() => markPopup(keys, x, y, title, from)); return; }
    S.popBack = from || document.activeElement;
    const one = keys.length === 1 ? keys[0] : null, s = one && S.F ? S.F.get(one) : null, it = one ? S.items[one] : null;
    const unit = it && it.u && it.q != null && it.u !== 'шт' ? it.u : null;
    const idx = AP.stageIndex(S.plan), stageOf = k => (AP.stageOfKey(idx, k, isBody) || {}).id;
    const st = one ? stageOf(one) || '' : S.stage || '';   // r3, Р-12: по ключу части, затем по телу
    // 1.0.19a, Б7: предупреждение о порядке — по названиям, серым: этап ещё не начат, а предыдущие не завершены
    const warn = st ? AP.orderWarn(S.plan, S.F || new Map(), st) : [];
    // 1.0.19a, Б6: дата работ — «Сегодня / Вчера / Другая дата» (поле даты — только по «Другая дата», фокус не в нём)
    let date = today();
    const dIn = h('input', { type: 'date', value: today(), max: today(), 'aria-label': 'Дата работ', hidden: true, on: { change: e => { if (AP.isDate(e.target.value)) date = e.target.value; } } });
    const chips = [['Сегодня', () => today()], ['Вчера', () => AP.addDays(today(), -1)], ['Другая дата…', null]].map(([t, f], i) => h('button', { type: 'button', class: 'apg-chip-btn', 'aria-pressed': String(i === 0), on: { click: e => { chipsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); if (f) { date = f(); dIn.hidden = true; } else { dIn.hidden = false; date = AP.isDate(dIn.value) ? dIn.value : today(); dIn.focus(); } } } }, t));
    const chipsEl = h('div', { class: 'apg-row apg-chips', role: 'group', 'aria-label': 'Дата работ' }, chips);
    const pct = h('input', { type: 'number', min: 0, max: 100, step: 1, placeholder: '%', 'aria-label': 'Процент выполнения', class: 'apg-num', inputmode: 'numeric' });
    const qty = unit ? h('input', { type: 'number', min: 0, step: 'any', placeholder: unit, 'aria-label': 'Выполнено, ' + unit, class: 'apg-num', inputmode: 'decimal' }) : null;
    const note = h('input', { type: 'text', placeholder: 'примечание', 'aria-label': 'Примечание' }), photo = h('input', { type: 'url', placeholder: 'ссылка на фото', 'aria-label': 'Ссылка на фото' });
    const go = async (op, btn) => {
      const opt = { date, by: who(), role: role(), note: note.value.trim(), photo: photo.value.trim() };
      if (op === 'partial') { if (pct.value !== '') opt.pct = +pct.value; else if (qty && qty.value !== '') { opt.qty = +qty.value; opt.unit = unit; } else { pct.focus(); return; } }
      const ctx = { closedUntil: S.closedUntil };
      if (op === 'confirm' || op === 'reject') { const r = AP.make(op, keys[0], Object.assign(opt, { stage: st, body: bodyOf(keys[0]) }), ctx); write(r.event ? [r.event] : [], r.errors ? [r.errors] : [], null); return; }
      const states = AP.fold(S.events, AP.today());
      const risk = AP.batchRisk(op, keys, { states, stageOf, stage: S.stage || '', whole: keys.length > 1 ? wholeOf(keys) : '', pct: opt.pct, qty: opt.qty, unit: opt.unit });
      let inc = false;
      if (risk.cases.length) { const r = await riskDialog(risk, op, one ? (nameOf(one) || one) : (title || 'Набор') + ' · ' + nEl(keys.length)); if (!r.ok) { if (btn && btn.isConnected) btn.focus(); return; } inc = r.includeConfirmed; }
      if (keys.length === 1) { const r = AP.make(op, keys[0], Object.assign(opt, { stage: st, body: bodyOf(keys[0]) }), ctx); write(r.event ? [r.event] : [], r.errors ? [r.errors] : [], null); }
      else {
        const r = AP.makeBatch(op, keys, Object.assign(opt, { bodyOf, stageOf, states, includeConfirmed: inc }), ctx);   /* уже выполненное и принятое пакет не перезаписывает */
        if (!r.events.length && !r.errors.length) { toast('Нечего записывать: ' + (skippedText(r.skipped) || 'все элементы уже в этом состоянии')); return; }
        write(r.events, r.errors.map(x => x.errors), r.batch, { skipped: r.skipped });
      }
    };
    const head = h('b', { id: 'apgPopH', tabindex: '-1' }, one ? (nameOf(one) || 'Элемент') : (title || 'Набор') + ' · ' + nEl(keys.length));
    popup = h('div', { class: 'apg-pop', role: 'dialog', 'aria-labelledby': 'apgPopH' },
      h('div', { class: 'apg-pop-h' }, head, h('button', { type: 'button', class: 'apg-x', 'aria-label': 'Закрыть', on: { click: () => closePopup(true) } }, '×')),
      one ? h('div', { class: 'apg-muted' }, h('span', { class: 'apg-id code' }, one), s && s.st !== 'none' ? ' · сейчас: ' + (s.st === 'done' ? 'выполнено' : 'частично ' + (s.pct != null ? fmt(s.pct) + ' %' : fmt(s.qty) + ' ' + (s.unit || ''))) + (s.conf === 'confirmed' ? ' · принято ✓' : '') : '') : null,
      warn.length ? h('div', { class: 'apg-muted apg-order' }, 'Сначала завершите: ' + warn.map(w => (w.title || 'этап') + ' (осталось ' + fmt(w.open, 0) + ')').join(', ') + ' — отметить можно') : null,
      h('div', { class: 'apg-f' }, h('span', {}, 'Дата работ'), chipsEl, dIn),
      h('div', { class: 'apg-row apg-main' }, h('button', { type: 'button', class: 'apg-btn apg-btn--done', on: { click: e => go('done', e.currentTarget) } }, 'Выполнено')),
      h('div', { class: 'apg-row' }, h('span', { class: 'apg-lbl' }, 'Частично'), pct, qty, h('button', { type: 'button', class: 'apg-btn apg-btn--partial', on: { click: e => go('partial', e.currentTarget) } }, 'Записать')),
      note, photo,
      role() === 'supervisor' && one && s && s.st !== 'none' ? h('div', { class: 'apg-row' }, h('button', { type: 'button', class: 'apg-btn', on: { click: e => go('confirm', e.currentTarget) } }, 'Принять'), h('button', { type: 'button', class: 'apg-btn', on: { click: e => go('reject', e.currentTarget) } }, 'Вернуть')) : null,
      h('div', { class: 'apg-row apg-undo-row' }, h('button', { type: 'button', class: 'apg-btn apg-btn--undo', on: { click: e => go('undo', e.currentTarget) } }, 'Снять')));
    (document.querySelector('.stage') || document.body).append(popup);
    const R = popup.parentElement.getBoundingClientRect(), W = popup.offsetWidth, H = popup.offsetHeight;
    if (x != null && innerWidth > 850) { popup.style.left = Math.max(8, Math.min(R.width - W - 8, x - R.left + 12)) + 'px'; popup.style.top = Math.max(8, Math.min(R.height - H - 8, y - R.top + 12)) + 'px'; }
    else popup.classList.add('apg-pop--dock');
    head.focus({ preventScroll: true });
  }
  async function write(events, errs, batch, x) {
    if (events.length) {
      // 1.0.18, П-5: запись в IndexedDB не удалась — в журнале и очереди отправки отметки нет; окно отметки остаётся, сообщение
      try { await S.store.add(events, pre() ? { user: S.online.preUser, nc: true } : undefined); }   // круг 3 (К2): при неподтверждённом входе — с пометкой _nc
      catch (e) { toast('Не записано: хранилище браузера не приняло отметку (' + errName(e) + ') — она не сохранена и не отправлена. Что делать: сохраните файл журнала, освободите место в браузере и нажмите «Повторить».', true, { label: 'Повторить', run: () => (x && x.undo ? retryUndo(x.undo) : write(events, errs, batch, x)) }); return false; }   // круг 1 (К6б): false — сбой хранилища
      if (batch) S.lastBatch = batch;
    }
    const why = errs.length ? errs[0].join('; ') : '';
    if (events.length && batch) { hideToast(); undoBar(events.length, skippedText(x && x.skipped)); if (errs.length) toast('Не записано ' + nEl(errs.length) + ': ' + why + '. Что делать: исправьте и запишите их отдельно.', true); }
    else if (events.length) toast((x && x.undo ? 'Отменено: ' : 'Записано: ') + events.length + (errs.length ? ' · не записано ' + errs.length + ': ' + why : ''), false);
    else toast('Не записано: ' + why + '. Что делать: исправьте и нажмите кнопку ещё раз.', true);
    if (events.length) { closePopup(); S.pick.clear(); try { A().highlight && A().highlight(null); } catch (e) { /* */ } announce((x && x.undo ? 'Отменено: ' : 'Записано: ') + nEl(events.length)); }
    await load(); renderPanel(); paint();
    return true;
  }
  function hideToast() { const t = $('apgToast'); if (t && !t.classList.contains('apg-toast--bad')) t.hidden = true; }
  async function undoLast() {
    if (!S.lastBatch) return;
    hideUndo();
    const lb = S.lastBatch, r = AP.undoBatch(S.events, lb, { by: who(), role: role() || 'operator' }, { closedUntil: S.closedUntil });
    S.lastBatch = null; if (!r.events.length && !r.errors.length) { toast('Нечего отменять: элементы пакета уже изменены позже'); renderPanel(); return; }
    if (!(await write(r.events, r.errors.map(x => x.errors), null, { undo: lb }))) { S.lastBatch = lb; renderPanel(); }   // круг 1 (К6б): хранилище не приняло отмену — пакет остаётся, повтор кнопкой
  }
  function retryUndo(lb) { if (!S.lastBatch) S.lastBatch = lb; return undoLast(); }
  // Обвести (Е-3 pickRect): перетаскивание по холсту при нажатой кнопке «Обвести»; попавшее подсвечивается до записи (1.0.19a, Б2)
  function startRect() {
    const cv = document.getElementById('canvas') || document.querySelector('.stage canvas'); if (!cv) return;
    toast('Обведите элементы на модели');
    const box = rectBox = h('div', { class: 'apg-rect', hidden: true }); (document.querySelector('.stage') || document.body).append(box);
    let p0 = null;
    const dn = e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); p0 = [e.clientX, e.clientY]; box.hidden = false; mv(e); };
    const mv = e => { if (!p0) return; e.preventDefault(); e.stopPropagation(); const R = box.parentElement.getBoundingClientRect(), x0 = Math.min(p0[0], e.clientX), y0 = Math.min(p0[1], e.clientY); Object.assign(box.style, { left: x0 - R.left + 'px', top: y0 - R.top + 'px', width: Math.abs(e.clientX - p0[0]) + 'px', height: Math.abs(e.clientY - p0[1]) + 'px' }); };
    const up = e => { if (!p0) return; e.preventDefault(); e.stopPropagation(); const a = p0; p0 = null; off(); let r = null; try { r = A().pickRect(a[0], a[1], e.clientX, e.clientY, { maxMs: 1500 }); } catch (x) { r = null; }
      const list = r && Array.isArray(r.ids) ? r.ids : Array.isArray(r) ? r : [], scope = new Set(scopeIds()), keys = [...new Set(list.map(x => typeof x === 'string' ? x : x && x.id).filter(k => k && scope.has(k)))];   // Е-3: {ids, complete, ms}
      if (r && r.complete === false) toast('Обвести: найдены не все элементы (' + (r.ms | 0) + ' мс) — уменьшите область или повторите');
      if (keys.length) { try { A().highlight && A().highlight(keys); S.rectHi = true; } catch (x) { /* без подсветки */ } }
      batchPopup(keys, 'Обведено', $('apgRect')); };
    const off = () => { cv.removeEventListener('pointerdown', dn, true); removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); box.remove(); rectBox = null; };
    cv.addEventListener('pointerdown', dn, true); addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true);
    addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { off(); removeEventListener('keydown', esc); } });
  }

  /* ---------- конец смены (1.0.19a, Б5): файл журнала — тот же, что в 1.0.18 (AtlasProgress.saveJournal) ---------- */
  const fileMeta = () => ({ project_id: AP.config().project_id, by: who() || 'оператор' });
  async function saveFile() {
    let r; try { r = await AP.saveJournal(S.store, fileMeta()); } catch (e) { toast('Файл журнала не сохранён (' + errName(e) + '). Что делать: нажмите «Повторить»; если не выходит — сохраните журнал на странице «История отметок и ведомость».', true, { label: 'Повторить', run: saveFile }); return; }
    if (!r.n) toast('В этом браузере отметок нет — сохранять нечего.');
    else if (r.markErr) toast('Файл журнала выгружен (' + r.name + '), но пометка «сохранено в файл» не записана: ' + errName(r.markErr) + '. Что делать: проверьте файл в загрузках; отметки остаются в браузере.', true);
    else toast('Журнал сохранён: ' + r.name);
    await load(); renderPanel();
  }
  async function shareFile() {
    let r; try { r = await AP.shareJournal(S.store, fileMeta()); } catch (e) { r = { error: e }; }
    if (r.unsupported) toast('Этот браузер не умеет передавать файл — сохраните файл журнала и отправьте его из загрузок.');
    else if (r.error) toast('Файл журнала не передан (' + errName(r.error) + '). Что делать: сохраните файл журнала и отправьте его из загрузок.', true, { label: 'Сохранить файл', run: saveFile });
    else if (r.shared) toast(r.markErr ? 'Файл передан, но пометка «сохранено в файл» не записана: ' + errName(r.markErr) : 'Файл журнала передан: ' + r.name, !!r.markErr);
    await load(); renderPanel();
  }
  // «Покинуть сайт?» — только если отметки можно потерять: хранилище в памяти страницы или несохранённые в файл и неотправленные (1.0.19a, Б5)
  const leaveRisk = () => !!(S.store && S.unsaved > 0 && (S.store.memory || (S.on && !(S.online && S.online.user && !S.online.pending))));

  /* ---------- кто отмечает ---------- */
  function userDialog(then) {
    if (typeof then !== 'function') then = null;   // Д5
    const back = document.activeElement;
    const d = h('dialog', { class: 'apg-dlg', 'aria-labelledby': 'apgDlgH' }), close = () => { try { d.close(); } catch (e) { /* */ } d.remove(); if (back && back.isConnected && !then) { try { back.focus(); } catch (e) { /* */ } } };
    if (S.sync && S.online && S.online.online) {
      // круг 1 (К2): проверка входа не удалась (404 или приостановка) — сервер вход не подтвердил, это не «вход не найден»
      // круг 3 (К2): есть последний пользователь устройства — отметки от его имени с пометкой, уйдут после подтверждения входа
      // круг 4 (О2, Н3-1): после 401 в сеансе — «войдите в PGS»; с именем на устройстве — куда на деле идёт отметка
      const noCheck = o => !(o && (o.notFound || o.paused)) ? null : o.preUser ? 'Сервер PGS не подтвердил вход (' + (o.notFound ? 'объект не найден в PGS' : o.paused) + '). Отметки записываются от имени «' + o.preUser + '» (последний вход на этом устройстве) с пометкой «вход не подтверждён сервером» и уйдут на сервер после подтверждения входа; если войдёт другой пользователь — решение в «История отметок и ведомость».'
        : o.needLogin ? 'Вход в PGS не выполнен (последняя проверка: ' + (o.notFound ? 'объект не найден в PGS' : o.paused) + ') — войдите в PGS и нажмите «Проверить вход»' + (who() ? '; ' + fate(o) + '.' : '.')
        : 'Сервер PGS не подтвердил вход (' + (o.notFound ? 'объект не найден в PGS' : o.paused) + ') — ' + (who() ? fate(o) + '.' : 'отметки можно будет записать после ответа сервера.');
      const msg = h('p', { class: 'apg-muted', 'aria-live': 'polite' }, S.online.user ? 'Сейчас: ' + S.online.user + ' · ' + (AP.ROLE_LABEL[S.online.role] || S.online.role || '') : noCheck(S.online) || 'Вход не выполнен. Войдите в PGS (вход и роли ведёт PGS) и нажмите «Проверить вход».');
      d.append(h('h2', { id: 'apgDlgH' }, 'Журнал на сервере PGS'), h('p', { class: 'apg-muted' }, PGS_NOTE + '.'), msg,
        h('div', { class: 'apg-row' }, !S.online.user && S.online.loginUrl ? h('a', { class: 'apg-btn apg-btn--done', href: S.online.loginUrl, target: '_top' }, 'Войти в PGS') : null, h('button', { type: 'button', class: 'apg-btn', on: { click: async () => { const r = await S.sync.me(); if (r.user) { close(); renderPanel(); then && then(); } else msg.textContent = noCheck(S.sync.state()) || 'Вход в PGS не найден — войдите в PGS в этом браузере и повторите.'; } } }, 'Проверить вход'), h('button', { type: 'button', class: 'apg-btn', on: { click: () => { then = null; close(); } } }, 'Закрыть')));
    } else {
      const nm = h('input', { type: 'text', value: S.user ? S.user.by : '', placeholder: 'Иванов И. И.', autocomplete: 'name', id: 'apgName' });
      const rl = h('select', { id: 'apgRole' }, ['operator', 'supervisor'].map(r => h('option', { value: r, selected: S.user && S.user.role === r }, AP.ROLE_LABEL[r])));
      d.append(h('h2', { id: 'apgDlgH' }, 'Кто отмечает'), h('p', { class: 'apg-muted' }, 'Без сервера — по имени, без пароля; имя попадает в каждое событие журнала.'), h('label', { class: 'apg-f', for: 'apgName' }, h('span', {}, 'Фамилия И. О.'), nm), h('label', { class: 'apg-f', for: 'apgRole' }, h('span', {}, 'Роль'), rl),
        h('div', { class: 'apg-row' }, h('button', { type: 'button', class: 'apg-btn apg-btn--done', on: { click: async () => { const by = nm.value.trim(); if (!by) { nm.focus(); return; } try { await S.store.set('user', { by, role: rl.value }); } catch (e) { toast('Не записано: хранилище браузера не приняло имя (' + errName(e) + '). Что делать: проверьте, не запрещено ли хранилище для этого сайта, и повторите.', true); return; }   /* круг 3 (Н-1) */ S.user = { by, role: rl.value }; close(); renderPanel(); then && then(); } } }, 'Сохранить'), h('button', { type: 'button', class: 'apg-btn', on: { click: () => { then = null; close(); } } }, 'Отмена')));
    }
    d.addEventListener('cancel', e => { e.preventDefault(); then = null; close(); });
    document.body.append(d); d.showModal();
  }

  /* ---------- вход и выход ---------- */
  async function init() {
    if (S.ready) return S.ready;
    S.ready = (async () => {
      await deps(); AP = window.AtlasProgress; if (!AP) throw new Error('нет progress-core.js');
      S.pub = AP.published(); S.items = S.pub.items;
      S.folded = !!memGet().folded;
      // 1.0.18, П-7: окно PGS — без хранилища, входа и запросов; план выпуска — только для этапа в адресе новой вкладки
      if (AP.sandboxed()) { S.sandbox = true; S.plan = AP.effectivePlan(S.pub.plan, null); return; }
      // набор тел: bd и body_ids из данных; старые данные без них — тела data/parts/index.js (AtlasParts)
      let has = null; if (!S.pub.bodyIds && !Object.values(S.items).some(v => v && v.bd) && window.AtlasParts && AtlasParts.loadIndex) { try { await AtlasParts.loadIndex(); has = id => AtlasParts.has(id); } catch (e) { has = null; } }
      isBody = AP.keyResolver(S.items, { bodyIds: S.pub.bodyIds, has });
      const pid = AP.config().project_id;
      S.store = await AP.openStore(pid);
      const reload = async () => { const was = S.sig; await load(); if (S.on && S.sig !== was) { renderPanel(); paint(); } else if (S.on) renderPanel(); };   // Д7: без изменений журнала — без перекраски
      S.store.on(async m => { if (m.local) return; await reload(); });
      if (window.AtlasProgressSync && AtlasProgressSync.httpPage()) {
        document.addEventListener('atlas:progresssync', async e => { S.online = e.detail; await reload(); });
        AtlasProgressSync.start(S.store, { project_id: pid, slug: AP.config().slug }).then(c => { S.sync = c; S.online = c.state(); });
      }
      await load();
      // отметка щелчком: Е-3 atlas:markpick; без него — через выбор (карточка мелькнёт)
      document.addEventListener('atlas:markpick', e => { const d = e.detail || {}; onPick(d.id, d.part || null, !!(d.shiftKey || d.ctrlKey || d.metaKey), d.clientX ?? d.x, d.clientY ?? d.y); });   // Е-3: мимо — id null
      document.addEventListener('atlas:selectionchange', e => {
        if (!S.on || !S.marking || MARK()) return;
        const d = e.detail || {}, id = d.id || d.renderId || (A().selection && A().selection());
        if (!id || (d.source && d.source !== 'pick' && d.source !== 'click' && d.source !== 'user')) return;
        const ps = A().partSelection ? A().partSelection() : null, ev = window.__apgLastPointer || {};
        setTimeout(() => { try { A().deselect(); } catch (x) { /* */ } }, 0);
        onPick(id, ps && ps.id === id ? ps.part : null, !!(ev.shiftKey || ev.ctrlKey || ev.metaKey), ev.x, ev.y);
      });
      addEventListener('pointerdown', e => { window.__apgLastPointer = { x: e.clientX, y: e.clientY, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey }; }, true);
      document.addEventListener('atlas:issues', e => { if (e.detail && e.detail.on && S.on) exit(); });   // по одному: вошли в «Замечания» — «Ход работ» выходит
      addEventListener('beforeunload', e => { if (leaveRisk()) { e.preventDefault(); e.returnValue = ''; } });
      addEventListener('resize', () => { for (const id of ['apgUndo', 'apgToast']) { const el = $(id); if (el && !el.hidden) placeLow(el); } });
    })();
    return S.ready;
  }
  const isFocusable = el => !!(el && el.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  function entryButton() {
    const c = [...document.querySelectorAll('.as-nav > .as-link[data-key="progress"], [data-progress="tab"]')].find(isFocusable);
    return c || (isFocusable(S.focusBack) && !(panel && panel.contains(S.focusBack)) ? S.focusBack : null) || [...document.querySelectorAll('.as-more-btn')].find(isFocusable) || null;
  }
  async function enter(opt) {
    opt = opt || {};
    const back = document.activeElement;
    try { await init(); } catch (e) { console.error(e); toast('Режим «Ход работ» не открылся: не загрузились файлы модуля (' + errName(e) + '). Что делать: обновите страницу; если не помогло — откройте «История отметок и ведомость».', true, { label: 'Обновить', run: () => location.reload() }); return false; }
    if (window.AtlasIssues && AtlasIssues.on && AtlasIssues.on()) { try { AtlasIssues.off(); } catch (e) { /* */ } }   // по одному: «Замечания» выходят
    // 1.0.19a, Б4: этап и захватка — из адреса; в адресе их нет — последние (память), если они есть в плане
    const q = hq(), m = memGet(), fromHash = q.has('stage') || opt.stage != null;
    S.stage = opt.stage ?? (q.has('stage') ? q.get('stage') || '' : typeof m.stage === 'string' ? m.stage : ''); if (S.stage && !stageById(S.stage)) S.stage = '';
    const lot0 = opt.lot ?? (q.has('lot') ? q.get('lot') || '' : !fromHash && typeof m.lot === 'string' ? m.lot : ''), st = S.stage && stageById(S.stage);
    S.lot = st && lot0 && (st.lots || []).some(l => l.id === lot0) ? lot0 : '';
    const d = opt.date || q.get('date'); S.date = d && AP.isDate(d) && d < today() ? d : null;   // Д11б: null — «сегодня» (переходит через полночь)
    const was = S.on;
    if (!S.on) { S.on = true; S.focusBack = back && back !== document.body ? back : null; try { const mm = V().state().mode; if (mm === 'outline') { S.saved = { mode: mm }; V().set('mode', 'solid'); } } catch (e) { /* */ } }
    document.body.classList.add('apg-on');
    // М-12: заголовок окна и сообщение в role=status
    if (!was) { S.titleBase = document.title; document.title = 'Ход работ · ' + S.titleBase; }
    renderPanel(); paint(); writeHash();
    if (!was && m.marking && !S.sandbox && !readOnly() && who()) setMarking(true);   // Б4: режим «Отмечать» — как в прошлый раз (только у известного автора)
    if (!was || opt.stage != null) fitScope();
    if (!was) { const t = $('apgTitle'); if (t) t.focus({ preventScroll: true }); announce('Режим «Ход работ»' + (S.stage ? ': этап «' + stageTitle(S.stage) + '»' + (S.lot ? ', захватка «' + (() => { const st = stageById(S.stage), ls = (st && st.lots) || [], i = ls.findIndex(l => l.id === S.lot); return i < 0 ? S.lot : lotTitle(st, ls[i], i); })() + '»' : '') : ': весь объект') + '. Esc — выйти.'); }
    document.dispatchEvent(new CustomEvent('atlas:progress', { detail: { on: true, stage: S.stage, lot: S.lot, date: S.date } }));
    return true;
  }
  function exit(opt) {
    if (!S.on) return;
    const toEntry = opt && opt.focus;
    S.on = false; setMarking(false); unpaint(); hideUndo();   // S.on — раньше: выход не стирает память режима «Отмечать» (Б4)
    if (S.saved && S.saved.mode) { try { V().set('mode', S.saved.mode); } catch (e) { /* */ } } S.saved = null;
    if (panel) panel.hidden = true; closePopup();
    document.body.classList.remove('apg-on', 'apg-folded');
    if (S.titleBase != null) { document.title = S.titleBase; S.titleBase = null; }
    writeHash();
    document.dispatchEvent(new CustomEvent('atlas:progress', { detail: { on: false } }));
    if (toEntry) { const b = entryButton(); if (b) { try { b.focus(); } catch (e) { /* */ } } announce('Режим «Ход работ» закрыт'); }
    S.focusBack = null;
  }
  addEventListener('hashchange', () => { const on = hq().get('progress') === '1'; if (on) enter({}); else if (S.on) exit(); });
  /* М-12: Esc — через отменяемое atlas:escape движка. Захват (раньше карточки): открытое окно отметки, «Обвести», «Отмечать» — по одному шагу;
     после карточки (она снимает выбор первой): выход из режима, фокус — на кнопку входа. Esc в диалоге (<dialog>) — его закрытие, режим не трогаем. */
  const escIn = e => { const o = e.detail && e.detail.original, t = o && o.target; return !!(t && t.closest && t.closest('dialog')) || !!document.querySelector('dialog[open].apg-dlg'); };
  const inPanel = () => { const a = document.activeElement; return !!(a && a !== document.body && ((panel && panel.contains(a)) || (popup && popup.contains(a)))); };
  addEventListener('atlas:escape', e => {
    if (!S.on || e.defaultPrevented || (e.detail && e.detail.modal) || escIn(e)) return;
    if (popup) { e.preventDefault(); closePopup(true); return; }
    if (rectBox) { e.preventDefault(); return; }   // рамку снимает её обработчик keydown
    if (S.marking) { e.preventDefault(); setMarking(false); const b = $('apgMark'); if (b) b.focus(); return; }
    if (inPanel()) { e.preventDefault(); exit({ focus: true }); }   // Esc на панели — выход из режима (карточка не перехватывает)
  }, true);
  document.addEventListener('atlas:escape', e => {
    if (!S.on || e.defaultPrevented || (e.detail && e.detail.modal) || escIn(e)) return;
    e.preventDefault(); exit({ focus: true });
  });
  window.AtlasProgressTab = { enter, exit, on: () => S.on, state: () => ({ on: S.on, stage: S.stage, lot: S.lot, date: S.date || today(), pinnedDate: S.date || null, marking: S.marking, pick: [...S.pick], sum: S.sum, events: S.events.length, unsaved: S.unsaved, lastBatch: S.lastBatch, folded: S.folded, memory: !!(S.store && S.store.memory), leaveRisk: leaveRisk(), layers: LAYERS(), mark: MARK(), rect: RECT(), partTint: PARTTINT() }), paint, pickTest: onPick };
  if (hq().get('progress') === '1') enter({});
})();
