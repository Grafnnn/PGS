/* 1.2.1 (K-F), 1.2.2 (K-H) · DEMO.html — «Демонстрация»: показ хода работ на экране, проекторе и телефоне. 1.2.2 — по уточнению владельца:
   «в центре большая модель, невыполненные элементы прозрачные, выполненные в натуральных цветах», «основное это модель, все данные возле нее».
   Раскладка: в центре — 3D-модель объекта (главная атласа в рамке index.html?demo=embed: штатный движок, WebGL, без него canvas; модуль
   atlas-demo-embed.js — только поле модели, хранилище главной не меняется), сверху — итог, сбоку — этапы и прочие экраны, снизу — шкала этапов
   и последние отметки; телефон — модель сверху (~60 % высоты), данные под ней. Первый экран (рамка и цифры) строится сразу, модель догружается.
   Окраска модели: выполнено и принято — натуральные цвета; частично — цвет «частично»; не выполнено (позиции плана без факта) — прозрачно;
   вне плана хода работ (рельеф, существующие сети и т. п.) — приглушённо и прозрачно, щелчок сквозь. Легенда — у модели.
   «Тестовый пример» (кнопка или DEMO.html?test=30): временные отметки в памяти страницы — первые ~N % объёма каждой единицы
   (м отдельно от шт., единицы не складываются) по порядку этапов плана и пикетам внутри этапа; крупная плашка «ТЕСТОВЫЕ ДАННЫЕ — не факт»;
   в журнал и хранилище ничего не пишется; выход — снова реальные данные («Факта нет», если отметок нет).
   Без сети: данные — только тегами <script src> (file:// и http одинаково).
   Данные — штатные наборы «Хода работ» объекта (DATA_CONTRACT §9.14): progress_items, progress_plan, progress_journal, progress_digest,
   progress_estimate + progress_cost_map (набор plugins: progress, все записи — независимо от их pages), отметки журнала этого браузера
   (IndexedDB «atlas:<project_id>:progress», только чтение; базы нет — не создаётся), замечания к РД (AtlasData 'remarks', после первого экрана).
   Счёт — AtlasProgressSummary.digest / pick (тот же, что «Итог»), свёртка — AtlasProgress.fold. Правила:
   - процент по смете — только если он есть в данных (estimate.donePermille); доля объёма — отношение величин одной единицы из данных
     (выполнено + частично по отметке к плану), в тесте — с пометкой «тест»;
   - объёмы — по единицам источника (u в progress_items), единицы не складываются и не переводятся; q = null — «без объёма», не ноль;
   - факта нет (ни одной отметки) — так и написано крупно, вместо цифр «выполнено»;
   - каждая цифра — с подписью источника (файл, срез, дата).
   Конфиг (необязательно): demo {enabled, slides[], interval_s, group, model, test_enabled, test_pct} — CONFIG.md «demo». Тексты: ATLAS_TEXTS.demo {subtitle}.
   API: window.AtlasDemo {ready (Promise), model (Promise: модель готова), state(), go(id), play(on), screens(), test(on, pct?), fit(), spin(on)}. */
'use strict';
(() => {
  const P = window.ATLAS_PROJECT || {}, AP = window.AtlasProgress, SUM = window.AtlasProgressSummary;
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const DC = isObj(P.demo) ? P.demo : {};
  const TT = isObj(window.ATLAS_TEXTS) && isObj(window.ATLAS_TEXTS.demo) ? window.ATLAS_TEXTS.demo : {};
  const T0 = performance.now();
  const $ = id => document.getElementById(id);
  const root = $('demoMain'), tabsEl = $('demoTabs'), statusEl = $('demoStatus'), kpiEl = $('demoKpi'), footEl = $('demoFoot');
  if (!root) return;
  const MODEL_ON = DC.model !== false, TEST_ON = DC.test_enabled !== false;
  const TEST_PCT = (() => { const v = Number(DC.test_pct); return Number.isFinite(v) && v >= 5 && v <= 95 ? v : 30; })();
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const r9 = v => Math.round(v * 1e9) / 1e9;
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

  /* ---------- разметка ---------- */
  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(a || {})) {
      if (v == null || v === false) continue;
      if (k === 'on') { for (const [e, f] of Object.entries(v)) el.addEventListener(e, f); continue; }
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : String(v));
    }
    const add = x => { if (x == null || x === false) return; if (Array.isArray(x)) x.forEach(add); else el.append(x instanceof Node ? x : String(x)); };
    kids.forEach(add);
    return el;
  }
  const nf3 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }), nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const fmt = n => n == null || !Number.isFinite(Number(n)) ? '—' : nf3.format(Number(n));
  const qfmt = n => { n = Number(n); return !Number.isFinite(n) ? '—' : Math.abs(n) >= 100 ? nf1.format(n) : nf3.format(n); };
  const plural = (n, f) => AP && AP.plural ? AP.plural(n, f) : f[2];
  const ru = s => AP && AP.ruDate ? AP.ruDate(String(s || '').slice(0, 10)) : String(s || '');
  const EL = ['элемент', 'элемента', 'элементов'], ST = ['этап', 'этапа', 'этапов'];
  const src = (...parts) => h('p', { class: 'demo-src' }, h('span', { class: 'demo-src-k' }, 'Источник: '), parts.filter(Boolean).join(' · '));
  const nodata = (what, why) => h('p', { class: 'demo-nodata' }, h('strong', {}, 'Нет данных'), ' · ' + what + (why ? ' (' + why + ')' : ''));

  /* ---------- хранилище страницы: тема, контраст ---------- */
  const pid = String((P.progress && P.progress.project_id) || P.project_id || 'default');
  const prefKey = (isObj(P.storage) && typeof P.storage.prefix === 'string' && P.storage.prefix ? P.storage.prefix : 'atlas:' + (P.project_id || 'default') + ':') + 'demo';
  const pref = (() => { try { return JSON.parse(localStorage.getItem(prefKey)) || {}; } catch (e) { return {}; } })();
  const savePref = () => { try { localStorage.setItem(prefKey, JSON.stringify(pref)); } catch (e) { /* хранилище недоступно — только на эту загрузку */ } };

  /* ---------- данные ---------- */
  const SAFE = /^(data|project)\/[^?#:]+\.js$/;
  function progressSets() {
    const pl = (Array.isArray(P.plugins) ? P.plugins : []).find(p => p && p.name === 'progress');
    return (pl && Array.isArray(pl.data) ? pl.data : []).map(d => typeof d === 'string' ? { src: d } : d).filter(d => isObj(d) && typeof d.src === 'string' && SAFE.test(d.src));
  }
  const loaded = new Map();   // src → true | false
  function script(s) {
    if (document.querySelector('script[src="' + s.replace(/"/g, '') + '"]')) { loaded.set(s, true); return Promise.resolve(true); }
    return new Promise(ok => { const el = document.createElement('script'); el.src = s; el.async = false; el.onload = () => { loaded.set(s, true); ok(true); }; el.onerror = () => { loaded.set(s, false); ok(false); }; document.head.append(el); });
  }
  const fileOf = glob => { const d = progressSets().find(x => x.global === glob); return d ? d.src.split('/').pop() : 'набор ' + glob; };   // имя файла — из записи набора объекта (в ядре имён файлов объекта нет)
  async function localStore() {
    if (!AP || !window.indexedDB) return null;
    try { if (indexedDB.databases) { const L = await indexedDB.databases(); if (!L.some(d => d && d.name === AP.dbName(pid))) return null; } } catch (e) { /* список баз недоступен — открываем */ }
    try { return await AP.openStore(pid); } catch (e) { return null; }
  }


  const S = { screen: null, play: false, timer: 0, store: null, data: null, remarks: 'none', test: null, spinUser: null, model: { state: MODEL_ON ? 'load' : 'off', engine: null, readyMs: null, frameMs: null, painted: null, fps: null, spin: false, text: '' } };

  /* ---------- тестовый пример: отметки только в памяти страницы ---------- */
  // порядок: этапы плана по n, внутри этапа — по пикету из поля ax (ПК0+31 → 31 м), без пикета — порядок плана
  const pkOf = it => { const m = isObj(it) && typeof it.ax === 'string' ? /ПК\s*(\d+)\s*\+\s*(\d+(?:[.,]\d+)?)/.exec(it.ax) : null; return m ? Number(m[1]) * 100 + Number(m[2].replace(',', '.')) : null; };
  function testOrder(items, plan) {
    const out = [], seen = new Set();
    for (const s of AP.stagesOf(plan)) {
      const ids = (Array.isArray(s.ids) ? s.ids : []).filter(k => typeof k === 'string' && k && !seen.has(k)).map((k, i) => ({ k, i, pk: pkOf(items[k]) }));
      ids.sort((a, b) => (a.pk ?? Infinity) - (b.pk ?? Infinity) || a.i - b.i);
      for (const x of ids) if (!seen.has(x.k)) { seen.add(x.k); out.push(x.k); }
    }
    return out;
  }
  // доля pct каждой единицы: по объёму (q), позиции подряд; позиция на границе — «частично» с объёмом остатка (у шт. — только целые);
  // позиции без объёма (q = null) — по счёту внутри своей единицы
  function buildTest(pub, plan, pct) {
    const items = pub.items || {}, order = testOrder(items, plan), U = new Map(), today = AP.today(), t = AP.nowIso(), ev = [];
    const unitOf = k => isObj(items[k]) && typeof items[k].u === 'string' && items[k].u ? items[k].u : null;
    for (const k of order) { const u = unitOf(k); if (!u) continue; let x = U.get(u); if (!x) U.set(u, x = { plan: 0, noq: 0, cum: 0, cnt: 0 }); const q = num(items[k].q); if (q == null) x.noq++; else x.plan += q; }
    const whole = u => /^шт\.?$/i.test(u) || /^(компл|ед)/i.test(u);
    let i = 0;
    const mk = (op, k, extra) => Object.assign({ eid: 'demo-test.' + (++i), t, date: today, op, id: k, by: 'тестовый пример', role: 'operator', src: 'тест' }, extra || {});
    for (const k of order) {
      const u = unitOf(k); if (!u) continue;
      const x = U.get(u), q = num(items[k].q);
      if (q == null) { if (x.cnt < Math.round(x.noq * pct / 100)) { x.cnt++; ev.push(mk('done', k)); } continue; }
      const goal = x.plan * pct / 100;
      if (x.cum >= goal - 1e-9) continue;
      if (x.cum + q <= goal + 1e-9) { x.cum += q; ev.push(mk('done', k)); continue; }
      const rest = r9(goal - x.cum);
      if (!whole(u) && rest > 0) { x.cum += rest; ev.push(mk('partial', k, { qty: Math.round(rest * 1000) / 1000, unit: u })); }
      else if (whole(u) && goal - x.cum >= q / 2) { x.cum += q; ev.push(mk('done', k)); }
    }
    return { pct, events: ev, units: [...U.entries()].map(([u, x]) => ({ unit: u, plan: r9(x.plan), done: r9(x.cum), noq: x.noq, noqDone: x.cnt })) };
  }

  // всё, что показывают экраны и модель, — одним объектом; пересчёт при новых отметках (другая вкладка), после замечаний, при входе и выходе из теста
  async function compute() {
    const cfg = AP ? AP.config() : null, pub = AP ? AP.published() : { items: {}, plan: null, journal: [] };
    let local = [], lplan = null;
    if (S.store && !S.test) { try { local = await S.store.active(); lplan = (await S.store.get('plan')) || null; } catch (e) { local = []; } }
    const plan = AP && pub.plan ? AP.effectivePlan(pub.plan, lplan) : pub.plan;
    const test = S.test && plan ? buildTest(pub, plan, S.test.pct) : null;
    const events = test ? test.events : AP ? AP.merge(pub.journal || [], local).events : [];
    const dg = window.ATLAS_PROGRESS_DIGEST;
    const snapOk = !test && isObj(dg) && dg.kind === 'atlas-progress-digest' && Array.isArray(dg.stages) && (!cfg || !dg.project || dg.project === cfg.project_id);
    let pk = null;
    if (SUM && (plan || snapOk)) pk = SUM.pick({ items: pub.items, plan, events, digestSnapshot: snapOk ? dg : null, online: () => false, srcText: () => test ? 'тестовый пример (в памяти страницы)' : 'данные этого браузера' + ((pub.journal || []).length ? ' и среза выпуска' : '') });
    const D = pk ? pk.D : null;
    const anyFact = !!D && (D.elements_done + D.elements_partial > 0 || D.stages_done + D.stages_work > 0 || D.elements_accepted > 0);
    const asOf = D ? D.as_of : (AP ? AP.today() : '');
    const localIds = new Set(local.map(e => e.eid));
    const states = AP ? AP.fold(events, asOf) : new Map();
    const resolver = AP && AP.keyResolver ? AP.keyResolver(pub.items, { bodyIds: pub.bodyIds }) : null;
    return { cfg, pub, plan, events, local, localIds, D, pick: pk, anyFact, asOf, states, resolver, test, cost: AP ? AP.costMapOf() : { map: null, est: null } };
  }

  /* ---------- объёмы по единицам: выполнено, частично (объём или % отметки), принято ---------- */
  const planKeys = d => { const out = [], seen = new Set(); for (const s of d.plan ? AP.stagesOf(d.plan) : []) for (const k of Array.isArray(s.ids) ? s.ids : []) if (typeof k === 'string' && k && !seen.has(k)) { seen.add(k); out.push(k); } return out; };
  function aggUnits(keys, d) {
    const items = d.pub.items || {}, U = new Map();
    for (const k of keys) {
      const it = items[k];
      if (!isObj(it) || typeof it.u !== 'string' || !it.u) continue;
      let u = U.get(it.u); if (!u) U.set(it.u, u = { unit: it.u, n: 0, plan: 0, no_qty: 0, done: 0, part: 0, accepted: 0, nDone: 0, nPart: 0 });
      u.n++;
      const st = d.states.get(k), done = !!st && st.st === 'done', part = !!st && st.st === 'partial', acc = !!st && st.conf === 'confirmed' && !!st.cv && st.cv.st === 'done';
      if (done) u.nDone++; if (part) u.nPart++;
      const q = num(it.q);
      if (q == null) { u.no_qty++; continue; }
      u.plan += q; if (done) u.done += q; if (acc) u.accepted += q;
      if (part) u.part += st.qty != null && (!st.unit || st.unit === it.u) ? Math.min(q, st.qty) : st.pct != null ? q * st.pct / 100 : 0;
    }
    return [...U.values()].map(u => Object.assign(u, { plan: r9(u.plan), done: r9(u.done), part: r9(u.part), accepted: r9(u.accepted) }));
  }
  const share = u => u.plan > 0 ? Math.min(100, (u.done + u.part) / u.plan * 100) : null;
  const pctText = v => v == null ? '—' : (v > 0 && v < 1 ? '<1' : nf0.format(Math.round(v))) + ' %';

  /* ---------- окраска модели: тело → acc | done | part | todo (только позиции плана) ---------- */
  function modelStates(d) {
    const B = new Map();
    for (const k of planKeys(d)) {
      const id = d.resolver ? d.resolver.split(k).id : k, st = d.states.get(k);
      let b = B.get(id); if (!b) B.set(id, b = { n: 0, done: 0, acc: 0, part: 0 });
      b.n++;
      if (st && st.st === 'done') { b.done++; if (st.conf === 'confirmed' && st.cv && st.cv.st === 'done') b.acc++; } else if (st && st.st === 'partial') b.part++;
    }
    const out = {};
    for (const [id, b] of B) out[id] = b.done === b.n ? (b.acc === b.n ? 'acc' : 'done') : b.done + b.part > 0 ? 'part' : 'todo';
    return out;
  }
  // для штрихов поверх модели: пикеты позиции (поле ax ведомости, «ПК0+31–ПК3+90» → [31, 390] м) и доля «частично» (объём или % отметки)
  const pkPair = it => { const L = isObj(it) && typeof it.ax === 'string' ? [...it.ax.matchAll(/ПК\s*(\d+)\s*\+\s*(\d+(?:[.,]\d+)?)/g)].map(m => Number(m[1]) * 100 + Number(m[2].replace(',', '.'))) : []; return L.length >= 2 ? [L[0], L[L.length - 1]] : null; };
  function modelInfo(d) {
    const items = d.pub.items || {}, out = {};
    for (const k of planKeys(d)) {
      if (d.resolver && d.resolver.split(k).id !== k) continue;   // часть тела — штрихов по ней нет
      const it = items[k], st = d.states.get(k), q = isObj(it) ? num(it.q) : null;
      let frac = null;
      if (st && st.st === 'partial') frac = st.qty != null && q > 0 && (!st.unit || st.unit === it.u) ? Math.min(1, st.qty / q) : st.pct != null ? Math.min(1, st.pct / 100) : null;
      const pk = pkPair(it);
      // граница выполненного в пикетах: в метрах трассы — начало + объём отметки (м), иначе — доля длины по пикетам
      const pkAt = pk && frac != null ? pk[0] + (it.u === 'м' && st.qty != null && (!st.unit || st.unit === 'м') ? Math.min(st.qty, pk[1] - pk[0]) : (pk[1] - pk[0]) * frac) : null;
      if (pk || frac != null) out[k] = { pk, frac, pkAt };
    }
    return out;
  }
  const MSTATE = { acc: 'принято технадзором', done: 'выполнено', part: 'частично', todo: 'не выполнено' };

  /* ---------- подписи источников ---------- */
  function srcPlan(d) {
    const p = d.plan; if (!p) return null;
    return fileOf('ATLAS_PROGRESS_PLAN') + ' — план ' + (p.plan_id || '') + ', ревизия ' + (p.rev ?? '—') + ', ' + (p.status === 'approved' ? 'утверждён' : 'черновик') + (p._local ? ' (местная правка этого браузера)' : '') + (p.basis ? ' («' + p.basis + '»)' : '');
  }
  function srcItems(d) {
    const m = d.pub.itemsMeta; if (!m || !Object.keys(d.pub.items || {}).length) return null;
    return fileOf('ATLAS_PROGRESS_ITEMS') + ' — объёмы' + (m.release ? ' выпуска ' + m.release : '') + (m.generated ? ' от ' + ru(m.generated) : '');
  }
  function srcFact(d) {
    if (!d.pick) return null;
    if (d.pick.snap) return fileOf('ATLAS_PROGRESS_DIGEST') + ' — срез на ' + ru(d.D.as_of) + (d.D.capturedAt ? ', собран ' + ru(d.D.capturedAt) : '');
    const J = window.ATLAS_PROGRESS_JOURNAL, parts = [];
    if (isObj(J) && (d.pub.journal || []).length) parts.push(fileOf('ATLAS_PROGRESS_JOURNAL') + ' — срез журнала на ' + ru(J.as_of) + ' (' + fmt(d.pub.journal.length) + ' ' + plural(d.pub.journal.length, ['запись', 'записи', 'записей']) + ')');
    parts.push('журнал этого браузера: ' + fmt(d.local.length) + ' ' + plural(d.local.length, ['отметка', 'отметки', 'отметок']));
    parts.push('свёртка на ' + ru(d.D.as_of));
    return parts.join('; ');
  }

  // строка состояния гаснет через 5 с (не закрывает данные на телефоне)
  { let tm = 0; new MutationObserver(() => { clearTimeout(tm); if (statusEl.textContent) tm = setTimeout(() => { statusEl.textContent = ''; }, 5000); }).observe(statusEl, { childList: true, characterData: true, subtree: true }); }
  /* ---------- общие части экранов ---------- */
  const STATE = { done: 'готово', work: 'в работе', none: 'не начат' };
  const chip = st => h('span', { class: 'demo-chip demo-chip--' + st }, STATE[st] || st);
  const testTag = d => d && d.test ? h('span', { class: 'demo-testtag' }, 'тест') : null;
  // полоса «выполнено / частично / план» одной единицы: ширины — отношения величин из данных; без факта полосы нет, только «факта нет»
  function bar(u, fact) {
    const has = fact && u.plan > 0 && u.done + u.part > 0, w = x => Math.max(0, Math.min(100, x / u.plan * 100));
    const wd = has ? w(u.done) : 0, wp = has ? Math.min(100 - wd, w(u.part)) : 0;
    return h('div', { class: 'demo-bar', role: 'img', 'aria-label': fact ? 'выполнено ' + qfmt(u.done) + (u.part ? ', частично ' + qfmt(u.part) : '') + ' из ' + qfmt(u.plan) + ' ' + u.unit : 'факта нет, план ' + qfmt(u.plan) + ' ' + u.unit },
      h('span', { class: 'demo-bar-fill', style: 'width:' + (wd > 0 ? Math.max(1.5, wd) : 0).toFixed(2) + '%' }),
      wp > 0 ? h('span', { class: 'demo-bar-part', style: 'left:' + wd.toFixed(2) + '%;width:' + Math.max(1.5, wp).toFixed(2) + '%' }) : null);
  }
  function unitRows(units, fact) {
    if (!units.length) return [nodata('объёмов', 'ключей нет в ведомости')];
    return units.map(u => h('div', { class: 'demo-unit' },
      h('div', { class: 'demo-unit-h' }, h('span', { class: 'demo-unit-u' }, u.unit), h('span', { class: 'demo-unit-v' },
        u.plan > 0 || u.n - u.no_qty > 0 ? [h('span', { class: 'demo-k' }, 'план '), qfmt(u.plan), ' · ', h('span', { class: 'demo-k' }, 'выполнено '), fact ? qfmt(u.done) + (u.part ? ' + частично ' + qfmt(u.part) : '') : 'факта нет'] : [fmt(u.n) + ' ' + plural(u.n, EL) + ' без объёма', fact && u.nDone ? ' · готово ' + fmt(u.nDone) : ''])),
      u.plan > 0 ? bar(u, fact) : null,
      u.no_qty ? h('p', { class: 'demo-note' }, 'без объёма в источнике: ' + fmt(u.no_qty) + ' ' + plural(u.no_qty, EL) + ' (не ноль, в сумму не входят)') : null,
      fact && u.accepted > 0 ? h('p', { class: 'demo-note' }, 'принято технадзором: ' + qfmt(u.accepted) + ' ' + u.unit) : null));
  }
  function noFactBanner(d) {
    return h('div', { class: 'demo-nofact', role: 'note' }, h('strong', {}, 'Факта нет'), h('span', {}, ' — отметок о выполнении пока нет' + (d.pick && d.pick.snap ? ' в срезе на ' + ru(d.D.as_of) : ' (журнал выпуска и этого браузера пуст)') + '. Показан только план.'));
  }

  /* ---------- экраны (сбоку от модели) ---------- */
  const SCREENS = [
    { id: 'stages', title: 'Этапы', has: d => !!d.D && d.D.stages.length > 0 },
    { id: 'summary', title: 'Итог', has: d => !!d.D },
    { id: 'sections', title: 'По разделам', has: d => sectionsOf(d).groups.length > 0 },
    { id: 'timeline', title: 'Сроки', has: d => datedStages(d).length > 0 },
    { id: 'journal', title: 'Отметки', has: d => d.events.length > 0 },
    { id: 'remarks', title: 'Замечания', has: () => isObj(window.ATLAS_REMARKS) && Array.isArray(window.ATLAS_REMARKS.items) && window.ATLAS_REMARKS.items.length > 0, always: false }
  ];

  function renderSummary(d) {
    const D = d.D, N = D.stages_total, box = h('section', { class: 'demo-screen demo-sum', 'aria-labelledby': 'dsH' });
    box.append(h('h2', { id: 'dsH', class: 'demo-h2' }, 'Итог хода работ', testTag(d)));
    if (!d.anyFact) box.append(noFactBanner(d));
    const PN = d.plan && Array.isArray(d.plan.stages) ? d.plan.stages.length : N;
    const line = (k, v) => h('p', { class: 'demo-line' }, h('span', { class: 'demo-k' }, k + ' '), v);
    box.append(line('Этапов в плане:', fmt(PN) + (PN > N ? ' (с позициями ' + fmt(N) + ')' : '')), line('Элементов в этапах:', fmt(D.elements_total)));
    if (d.anyFact) box.append(line('Готово:', fmt(D.stages_done) + ' ' + plural(D.stages_done, ST) + ', ' + fmt(D.elements_done) + ' ' + plural(D.elements_done, EL) + (D.elements_partial ? ' · частично ' + fmt(D.elements_partial) : '') + ' · в работе этапов ' + fmt(D.stages_work)),
      line('Принято технадзором:', fmt(D.stages_accepted) + ' ' + plural(D.stages_accepted, ST) + ', ' + fmt(D.elements_accepted) + ' ' + plural(D.elements_accepted, EL)));
    if (d.anyFact && D.week && !d.test) box.append(h('p', { class: 'demo-week' }, 'За неделю (' + ru(D.week.from).slice(0, 5) + '–' + ru(D.week.to).slice(0, 5) + '): ' + (D.week.stages_done_delta >= 0 ? '+' : '−') + fmt(Math.abs(D.week.stages_done_delta)) + ' ' + plural(Math.abs(D.week.stages_done_delta), ST) + ', ' + (D.week.elements_done_delta >= 0 ? '+' : '−') + fmt(Math.abs(D.week.elements_done_delta)) + ' ' + plural(Math.abs(D.week.elements_done_delta), EL)));
    box.append(h('h3', { class: 'demo-h3' }, 'Объёмы по единицам — план и выполнено'), h('div', { class: 'demo-units' }, unitRows(aggUnits(planKeys(d), d), d.anyFact)));
    if (D.unknown) box.append(h('p', { class: 'demo-note' }, 'ключей плана без строки ведомости (единица и объём неизвестны): ' + fmt(D.unknown)));
    // стоимость — только при снимке сметы и карте соответствия
    const X = isObj(D.estimate) ? D.estimate : null, cm = d.cost, wl = AP && AP.weightsLabel ? AP.weightsLabel(cm.map, cm.est) : '';
    box.append(h('h3', { class: 'demo-h3' }, 'Стоимость'), X ? h('p', { class: 'demo-cost' }, X.donePermille == null ? 'вес этапов по смете — 0 ₽, доли не считаются' : 'По смете: ' + nf1.format(X.donePermille / 10) + ' % · сопоставлено работ: ' + fmt(X.mapped.works) + ' · не сопоставлено: ' + fmt(X.unmapped.works))
      : nodata('стоимости', 'нет снимка сметы и карты соответствия — ' + (wl || 'веса из сметы не сопоставлены с этапами')));
    if (X) box.append(src(d.pick.snap ? srcFact(d) : wl));
    box.append(src(srcPlan(d), srcItems(d)), src('факт — ' + (srcFact(d) || 'нет')));
    return box;
  }

  function renderStages(d) {
    const D = d.D, box = h('section', { class: 'demo-screen', 'aria-labelledby': 'dstH' });
    const PS = d.plan && Array.isArray(d.plan.stages) ? AP.stagesOf(d.plan) : [], byId = new Map(PS.map(s => [String(s.id), s])), inD = new Set(D.stages.map(s => s.id));
    box.append(h('h2', { id: 'dstH', class: 'demo-h2' }, 'Этапы: ' + fmt(PS.length || D.stages_total) + (PS.length > D.stages_total ? ' (с позициями ' + fmt(D.stages_total) + ')' : ''), testTag(d)));
    if (!d.anyFact) box.append(noFactBanner(d));
    // этапы плана без позиций (ids пуст) в срез не входят — показываются отдельно: «состав не задан», без цифр
    const empty = PS.filter(s => s && s.id != null && !inD.has(String(s.id))).map(s => ({ id: String(s.id), n: s.n, title: s.title || String(s.id), empty: true }));
    const all = D.stages.concat(empty).sort((a, b) => (Number(a.n) || 0) - (Number(b.n) || 0));
    box.append(h('ol', { class: 'demo-stages' }, all.map(s => {
      if (s.empty) { const ps = byId.get(s.id) || {}; return h('li', { class: 'demo-stage demo-stage--empty' }, h('div', { class: 'demo-stage-h' }, h('span', { class: 'demo-stage-n' }, String(s.n ?? '')), h('span', { class: 'demo-stage-t' }, s.title)), h('p', { class: 'demo-stage-c' }, 'Состав не задан: позиций в плане нет' + (ps.rd ? ' · ' + ps.rd : ''))); }
      const ps = byId.get(s.id) || {}, pl = isObj(ps.plan) ? ps.plan : null, lots = Array.isArray(ps.lots) ? ps.lots.length : 0, ids = Array.isArray(ps.ids) ? ps.ids : [];
      return h('li', { class: 'demo-stage demo-stage--' + s.state },
        h('div', { class: 'demo-stage-h' }, h('span', { class: 'demo-stage-n' }, String(s.n ?? '')), h('span', { class: 'demo-stage-t' }, s.title), d.anyFact ? chip(s.state) : null),
        h('p', { class: 'demo-stage-c' }, fmt(s.total) + ' ' + plural(s.total, EL) + (d.anyFact ? ' · готово ' + fmt(s.done) + (s.partial ? ' · частично ' + fmt(s.partial) : '') + (s.accepted ? ' · принято ' + fmt(s.accepted) : '') : '') + (lots ? ' · захваток ' + fmt(lots) : '')),
        pl && (pl.start || pl.finish) ? h('p', { class: 'demo-note' }, 'по графику: ' + (pl.start ? ru(pl.start) : '…') + ' — ' + (pl.finish ? ru(pl.finish) : '…')) : null,
        unitRows(aggUnits(ids, d), d.anyFact));
    })));
    if (empty.length) box.append(h('p', { class: 'demo-note' }, 'Без позиций (состав не задан, в счёт не входят): ' + fmt(empty.length) + ' ' + plural(empty.length, ST)));
    box.append(src(srcPlan(d), srcItems(d)), src('факт — ' + (srcFact(d) || 'нет')));
    return box;
  }

  // «По разделам»: группа — demo.group конфига (rd | sec | lot); по умолчанию раздел РД (rd), если разделов немного, иначе крупный раздел (sec), иначе захватки
  let secCache = null;
  function sectionsOf(d) {
    if (secCache && secCache.d === d) return secCache.r;
    const items = d.pub.items || {}, stages = d.plan && Array.isArray(d.plan.stages) ? d.plan.stages : [], keys = new Set(planKeys(d));
    const anyRd = [...keys].some(k => isObj(items[k]) && items[k].rd), anyLot = stages.some(s => Array.isArray(s.lots) && s.lots.length);
    const nRd = new Set([...keys].map(k => isObj(items[k]) ? items[k].rd : null).filter(Boolean)).size, anySec = [...keys].some(k => isObj(items[k]) && items[k].sec);
    const mode = ['rd', 'sec', 'lot'].includes(DC.group) ? DC.group : anyRd && nRd <= 8 ? 'rd' : anySec ? 'sec' : anyLot ? 'lot' : 'rd';
    const lotOf = new Map();
    if (mode === 'lot') for (const s of stages) for (const l of Array.isArray(s.lots) ? s.lots : []) for (const k of Array.isArray(l.ids) ? l.ids : []) if (!lotOf.has(k)) lotOf.set(k, (s.title || s.id) + ' · ' + (l.title || l.id));
    const G = new Map(), NONE = mode === 'rd' ? 'раздел РД не указан' : mode === 'lot' ? 'вне захваток' : 'раздел не указан';
    for (const k of keys) {
      const it = items[k];
      if (!isObj(it) || typeof it.u !== 'string' || !it.u) continue;
      const g = mode === 'rd' ? it.rd || NONE : mode === 'sec' ? it.sec || NONE : lotOf.get(k) || NONE;
      let x = G.get(g); if (!x) G.set(g, x = { name: g, keys: [] });
      x.keys.push(k);
    }
    const groups = [...G.values()].map(x => { const U = aggUnits(x.keys, d); return { name: x.name, n: x.keys.length, done: U.reduce((a, u) => a + u.nDone, 0), units: U }; }).sort((a, b) => (a.name === NONE) - (b.name === NONE) || b.n - a.n);
    const r = { mode, groups };
    secCache = { d, r };
    return r;
  }
  const MODE_T = { rd: 'по разделам РД (поле rd ведомости)', sec: 'по крупным разделам (поле sec ведомости)', lot: 'по захваткам плана (stages[].lots)' };
  function renderSections(d) {
    const R = sectionsOf(d), box = h('section', { class: 'demo-screen', 'aria-labelledby': 'dsecH' });
    box.append(h('h2', { id: 'dsecH', class: 'demo-h2' }, 'По разделам · ' + MODE_T[R.mode], testTag(d)));
    if (!R.groups.length) { box.append(nodata('разделов', 'у элементов плана нет строк ведомости')); return box; }
    if (!d.anyFact) box.append(noFactBanner(d));
    box.append(h('ol', { class: 'demo-stages demo-secs' }, R.groups.map(g => h('li', { class: 'demo-stage' },
      h('div', { class: 'demo-stage-h' }, h('span', { class: 'demo-stage-t' }, g.name)),
      h('p', { class: 'demo-stage-c' }, fmt(g.n) + ' ' + plural(g.n, EL) + (d.anyFact ? ' · готово ' + fmt(g.done) : '')),
      unitRows(g.units, d.anyFact)))));
    box.append(src(srcItems(d), srcPlan(d)), src('факт — ' + (srcFact(d) || 'нет')));
    return box;
  }

  // «Сроки»: только даты графика из плана (stages[].plan.start / finish); нет дат — «нет данных», шкала не строится
  function datedStages(d) {
    const st = d.plan && Array.isArray(d.plan.stages) ? d.plan.stages : [];
    return st.filter(s => isObj(s.plan) && AP && (AP.isDate(s.plan.start) || AP.isDate(s.plan.finish)));
  }
  function renderTimeline(d) {
    const L = datedStages(d), box = h('section', { class: 'demo-screen', 'aria-labelledby': 'dtlH' });
    box.append(h('h2', { id: 'dtlH', class: 'demo-h2' }, 'Сроки по графику'));
    if (!L.length) { box.append(nodata('сроков', 'в плане нет дат графика — поля stages[].plan.start / finish'), src(srcPlan(d))); return box; }
    const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
    const all = []; for (const s of L) { if (AP.isDate(s.plan.start)) all.push(day(s.plan.start)); if (AP.isDate(s.plan.finish)) all.push(day(s.plan.finish)); }
    const today = day(AP.today()), a = Math.min(...all), b = Math.max(...all, a + 1), span = b - a;
    const pos = x => Math.max(0, Math.min(100, (x - a) / span * 100));
    const stOf = new Map((d.D ? d.D.stages : []).map(s => [s.id, s.state]));
    const rows = L.map(s => {
      const x0 = AP.isDate(s.plan.start) ? pos(day(s.plan.start)) : null, x1 = AP.isDate(s.plan.finish) ? pos(day(s.plan.finish)) : null;
      const left = x0 ?? x1, w = x0 != null && x1 != null ? Math.max(0.8, x1 - x0) : 0.8, st = d.anyFact ? stOf.get(String(s.id)) || 'none' : 'plan';
      return h('li', { class: 'demo-tl-row' }, h('span', { class: 'demo-tl-name' }, s.title || s.id),
        h('span', { class: 'demo-tl-track', role: 'img', 'aria-label': (s.title || s.id) + ': ' + (s.plan.start ? ru(s.plan.start) : 'начало не задано') + ' — ' + (s.plan.finish ? ru(s.plan.finish) : 'окончание не задано') + (d.anyFact ? ', ' + (STATE[st] || '') : '') },
          h('span', { class: 'demo-tl-bar demo-tl-bar--' + st, style: 'left:' + left.toFixed(2) + '%;width:' + w.toFixed(2) + '%' }),
          today >= a && today <= b ? h('span', { class: 'demo-tl-now', style: 'left:' + pos(today).toFixed(2) + '%' }) : null),
        h('span', { class: 'demo-tl-d' }, (s.plan.start ? ru(s.plan.start) : '…') + ' — ' + (s.plan.finish ? ru(s.plan.finish) : '…')));
    });
    const tl = h('div', { class: 'demo-tl' }, h('ol', { class: 'demo-tl-list' }, rows));
    box.append(h('p', { class: 'demo-note' }, ru(new Date(a * 864e5).toISOString()) + ' — ' + ru(new Date(b * 864e5).toISOString()) + (today >= a && today <= b ? ' · пунктир — сегодня, ' + ru(AP.today()) : '') + (L.length < (d.plan.stages || []).length ? ' · этапов без дат: ' + fmt(d.plan.stages.length - L.length) : '')), tl);
    const lg = (cls, t) => h('span', { class: 'demo-lg' }, h('span', { class: 'demo-lg-sw demo-tl-bar--' + cls, 'aria-hidden': 'true' }), t);
    box.append(h('p', { class: 'demo-legend' }, d.anyFact ? [lg('done', 'готово'), lg('work', 'в работе'), lg('none', 'не начат')] : [lg('plan', 'срок по графику (факта нет)')]));
    box.append(src(srcPlan(d) + ' — сроки stages[].plan', d.anyFact ? 'состояние этапа — ' + srcFact(d) : null));
    return box;
  }

  // «Отметки»: последние записи журнала выпуска и этого браузера; кто отметил и кто принял — поля by / role события (если есть)
  const OPL = () => (AP && AP.OP_LABEL) || {};
  const ROLE = { operator: 'оператор', supervisor: 'технадзор' };
  const origin = (e, d) => d.test ? 'тестовый пример (память страницы)' : !d.localIds.has(e.eid) ? 'журнал выпуска' : e.src === 'server' ? 'PGS (копия в этом браузере)' : 'этот браузер';
  function renderJournal(d) {
    const box = h('section', { class: 'demo-screen', 'aria-labelledby': 'djH' }), ev = d.events.slice();
    box.append(h('h2', { id: 'djH', class: 'demo-h2' }, d.test ? 'Тестовые отметки' : 'Отметки журнала', testTag(d)));
    if (!ev.length) { box.append(h('div', { class: 'demo-nofact', role: 'note' }, h('strong', {}, 'Отметок нет'), h('span', {}, ' — факта выполнения нет: журнал выпуска и журнал этого браузера пусты.')), src('факт — ' + (srcFact(d) || 'журнала нет'))); return box; }
    ev.sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.t || '').localeCompare(String(x.t || '')) || String(y.eid).localeCompare(String(x.eid)));
    const by = {}; for (const e of ev) by[e.op] = (by[e.op] || 0) + 1;
    const accBy = [...new Set(ev.filter(e => e.op === 'confirm' && e.by).map(e => e.by))];
    box.append(h('div', { class: 'demo-tiles' }, Object.keys(OPL()).filter(k => by[k]).map(k => h('div', { class: 'demo-tile demo-tile--fact' }, h('div', { class: 'demo-tile-big' }, fmt(by[k])), h('div', { class: 'demo-tile-l' }, OPL()[k])))));
    box.append(h('p', { class: 'demo-note' }, 'Приняли (поле by событий «принято»): ' + (accBy.length ? accBy.join(', ') : ev.some(e => e.op === 'confirm') ? 'не указано в журнале' : 'приёмок нет')));
    const items = d.pub.items || {}, stName = new Map((d.plan && d.plan.stages || []).map(s => [String(s.id), s.title || s.id])), stOfKey = AP.stageIndex ? AP.stageIndex(d.plan) : new Map();
    const N = Math.min(ev.length, 12);
    const tb = h('table', { class: 'demo-table' }, h('caption', { class: 'demo-cap' }, 'Последние ' + fmt(N) + ' из ' + fmt(ev.length)),
      h('thead', {}, h('tr', {}, ['Дата', 'Отметка', 'Элемент', 'Объём', 'Кто', 'Откуда'].map(t => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, ev.slice(0, N).map(e => {
        const it = items[e.id], s = e.stage ? stName.get(String(e.stage)) : (stOfKey.get(e.id) || {}).title;
        const v = e.qty != null ? qfmt(e.qty) + ' ' + (e.unit || (it && it.u) || '') : e.pct != null ? fmt(e.pct) + ' % (в отметке)' : it && typeof it.q === 'number' ? qfmt(it.q) + ' ' + it.u + ' (ведомость)' : it && it.u ? 'без объёма' : '—';
        const off = !stOfKey.has(e.id) && !(e.body && stOfKey.has(e.body));   // отметка не по позиции плана — в счёт «Итога» не входит
        return h('tr', {}, h('td', {}, ru(e.date)), h('td', {}, OPL()[e.op] || e.op), h('td', {}, h('span', {}, (it && it.nm) || e.id), s ? h('span', { class: 'demo-td-s' }, s) : off ? h('span', { class: 'demo-td-s' }, 'вне плана — в итог не входит') : null), h('td', {}, v),
          h('td', {}, e.by || 'не указано', e.role ? h('span', { class: 'demo-td-s' }, ROLE[e.role] || e.role) : null), h('td', {}, origin(e, d)));
      })));
    box.append(h('div', { class: 'demo-tablebox' }, tb), src('факт — ' + srcFact(d)));
    return box;
  }

  function renderRemarks(d) {
    const R = window.ATLAS_REMARKS, box = h('section', { class: 'demo-screen', 'aria-labelledby': 'drH' });
    box.append(h('h2', { id: 'drH', class: 'demo-h2' }, 'Замечания к документации'));
    if (!isObj(R) || !Array.isArray(R.items)) { box.append(nodata('замечаний', S.remarks === 'load' ? 'загружаются' : 'набора замечаний у объекта нет')); return box; }
    const cnt = (f) => { const m = new Map(); for (const x of R.items) { const k = isObj(x) && x[f] != null && x[f] !== '' ? String(x[f]) : null; if (k) m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const st = cnt('status'), sig = cnt('significance'), sec = cnt('section').length ? cnt('section') : cnt('section_code');
    box.append(h('div', { class: 'demo-tiles' }, h('div', { class: 'demo-tile' }, h('div', { class: 'demo-tile-big' }, fmt(R.items.length)), h('div', { class: 'demo-tile-l' }, plural(R.items.length, ['замечание', 'замечания', 'замечаний']))),
      st.map(([k, n]) => h('div', { class: 'demo-tile' }, h('div', { class: 'demo-tile-big' }, fmt(n)), h('div', { class: 'demo-tile-l' }, k)))));
    const list = (title, L) => L.length ? h('div', { class: 'demo-rlist' }, h('h3', { class: 'demo-h3' }, title), h('ul', {}, L.slice(0, 10).map(([k, n]) => h('li', {}, h('span', {}, k), h('span', { class: 'demo-rn' }, fmt(n)))))) : null;
    box.append(h('div', { class: 'demo-rcols' }, list('По значимости', sig), list('По разделам', sec)));
    if (d.D && isObj(d.D.rdBlockers)) box.append(h('p', { class: 'demo-note' }, 'У элементов плана: ' + fmt(d.D.rdBlockers.remarks) + ' ' + plural(d.D.rdBlockers.remarks, ['замечание', 'замечания', 'замечаний']) + ' у ' + fmt(d.D.rdBlockers.elements) + ' ' + plural(d.D.rdBlockers.elements, EL) + (d.D.rdBlockers.unlinked ? ' · связь не проверена: ' + fmt(d.D.rdBlockers.unlinked) : '')));
    const ed = isObj(R.edition) ? R.edition : {};
    box.append(src(((((window.AtlasDataSets || {}).remarks || {}).src || 'набор замечаний').split('/').pop()) + (ed.title ? ' — ' + ed.title : '') + (ed.date ? ' (' + ed.date + ')' : '')));
    return box;
  }
  const RENDER = { summary: renderSummary, stages: renderStages, sections: renderSections, timeline: renderTimeline, journal: renderJournal, remarks: renderRemarks };

  /* ---------- сверху: итог ---------- */
  function renderKpi(d) {
    kpiEl.textContent = '';
    const D = d.D, tiles = h('div', { class: 'demo-kpi-row' });
    const tile = (big, label, cls, sub) => h('div', { class: 'demo-ktile' + (cls ? ' ' + cls : '') }, h('div', { class: 'demo-ktile-big' }, big), h('div', { class: 'demo-ktile-l' }, label), sub ? h('div', { class: 'demo-ktile-s' }, sub) : null);
    const N = D.stages_total, PN = d.plan && Array.isArray(d.plan.stages) ? d.plan.stages.length : N;
    if (d.anyFact) {
      tiles.append(tile(fmt(D.stages_done) + ' из ' + fmt(N), plural(N, ST) + ' готово · в работе ' + fmt(D.stages_work), 'demo-ktile--fact', PN > N ? 'в плане ' + fmt(PN) + ', без позиций ' + fmt(PN - N) : null),
        tile(fmt(D.elements_done) + ' из ' + fmt(D.elements_total), plural(D.elements_total, EL) + ' готово' + (D.elements_partial ? ' · частично ' + fmt(D.elements_partial) : ''), 'demo-ktile--fact'));
    } else {
      tiles.append(tile(fmt(PN), plural(PN, ST) + ' в плане', null, PN > N ? 'с позициями ' + fmt(N) : null), tile(fmt(D.elements_total), plural(D.elements_total, EL) + ' в этапах'),
        tile('Факта нет', d.pick && d.pick.snap ? 'в срезе на ' + ru(D.as_of) + ' отметок нет' : 'отметок о выполнении пока нет', 'demo-ktile--none'));
    }
    for (const u of aggUnits(planKeys(d), d)) {
      if (!(u.plan > 0)) continue;
      const sh = share(u);
      tiles.append(d.anyFact
        ? tile(pctText(sh), u.unit + ': ' + qfmt(r9(u.done + u.part)) + ' из ' + qfmt(u.plan), 'demo-ktile--unit demo-ktile--fact', (u.part ? 'в т. ч. частично ' + qfmt(u.part) + ' · ' : '') + 'доля по объёму' + (d.test ? ' · тест' : ''))
        : tile(qfmt(u.plan) + ' ' + u.unit, 'план · выполнено: факта нет', 'demo-ktile--unit'));
    }
    if (d.anyFact && D.elements_accepted > 0) tiles.append(tile(fmt(D.elements_accepted), plural(D.elements_accepted, EL) + ' принято технадзором', 'demo-ktile--fact'));
    const X = isObj(D.estimate) ? D.estimate : null;
    if (X && X.donePermille != null && !d.test) tiles.append(tile(nf1.format(X.donePermille / 10) + ' %', 'по смете · ' + (X.mapStatus === 'confirmed' ? 'карта подтверждена' : 'карта — черновик') + ' · условно', 'demo-ktile--fact'));
    const srcLine = [srcPlan(d), d.test ? 'отметки — ' + fmt(d.events.length) + ' временных, в памяти страницы, не факт' : 'факт — ' + (srcFact(d) || 'нет')].filter(Boolean).join(' · ');
    kpiEl.append(tiles, h('p', { class: 'demo-kpi-src', title: srcLine }, h('span', { class: 'demo-src-k' }, d.test ? 'Тестовый пример: ' : 'Источник: '), [srcPlan(d), d.test ? 'отметки — ' + fmt(d.events.length) + ' временных, в памяти страницы, не факт' : 'факт — ' + (srcFact(d) || 'нет')].filter(Boolean).join(' · ')));
  }

  /* ---------- снизу: шкала этапов и последние отметки ---------- */
  function renderFoot(d) {
    footEl.textContent = '';
    const PS = d.plan ? AP.stagesOf(d.plan) : [], byId = new Map((d.D ? d.D.stages : []).map(s => [s.id, s]));
    if (PS.length) {
      const scale = h('ol', { class: 'demo-scale', 'aria-label': 'Этапы по порядку плана' }, PS.map(s => {
        const x = byId.get(String(s.id)), st = !x ? 'empty' : d.anyFact ? x.state : 'plan';
        return h('li', { class: 'demo-scale-i demo-scale-i--' + st, title: (s.title || s.id) + (x ? ': ' + fmt(x.done) + ' из ' + fmt(x.total) + ' ' + plural(x.total, EL) + ' готово' : ': состав не задан') },
          h('span', { class: 'demo-scale-bar' }, x && x.total && d.anyFact ? h('span', { class: 'demo-scale-fill', style: 'width:' + (x.done / x.total * 100).toFixed(1) + '%' }) : null),
          h('span', { class: 'demo-scale-t' }, String(s.n ?? '') + ' · ' + (s.title || s.id)));
      }));
      footEl.append(h('div', { class: 'demo-foot-col demo-foot-col--scale' }, h('h2', { class: 'demo-foot-h' }, 'Шкала этапов', testTag(d)), scale));
    }
    const ev = d.events.filter(e => e.op === 'done' || e.op === 'partial' || e.op === 'confirm' || e.op === 'reject').slice()
      .sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(y.t || '').localeCompare(String(x.t || '')) || String(y.eid).localeCompare(String(x.eid)));
    const items = d.pub.items || {}, L = ev.slice(0, 3);
    footEl.append(h('div', { class: 'demo-foot-col' }, h('h2', { class: 'demo-foot-h' }, d.test ? 'Тестовые отметки' : 'Последние отметки', testTag(d)),
      L.length ? h('ul', { class: 'demo-marks' }, L.map(e => { const it = items[e.id]; return h('li', {}, h('span', { class: 'demo-marks-d' }, ru(e.date).slice(0, 5)), h('span', { class: 'demo-marks-op demo-marks-op--' + e.op }, (AP.OP_LABEL || {})[e.op] || e.op), h('span', { class: 'demo-marks-n' }, (it && (it.nm || it.mk)) || e.id), e.qty != null ? h('span', { class: 'demo-marks-q' }, qfmt(e.qty) + ' ' + (e.unit || '')) : e.pct != null ? h('span', { class: 'demo-marks-q' }, fmt(e.pct) + ' %') : null); }))
        : h('p', { class: 'demo-note' }, 'Отметок нет — факт выполнения не внесён.'),
      ev.length > L.length ? h('p', { class: 'demo-note' }, 'ещё ' + fmt(ev.length - L.length) + ' — экран «Отметки»') : null));
  }

  /* ---------- модель ---------- */
  const frameBox = $('demoModelBox'), loadEl = $('demoModelLoad'), legendEl = $('demoLegend'), pickEl = $('demoPick');
  let frame = null, frameWin = null, modelRes, modelTimer = 0;
  const model = new Promise(r => { modelRes = r; });
  let linked = false;
  const toFrame = m => { if (frameWin && linked) try { frameWin.postMessage(Object.assign({ src: 'atlas-demo' }, m), '*'); } catch (e) { /* рамка закрыта */ } };
  const themeDark = () => document.documentElement.dataset.theme === 'dark';
  function modelStart() {
    const fig = $('demoModel');
    if (!MODEL_ON || !frameBox) { if (fig) fig.hidden = true; document.documentElement.classList.add('demo-nomodel'); modelRes({ state: 'off' }); return; }
    const qs = new URLSearchParams(location.search), u = new URLSearchParams({ demo: 'embed', theme: themeDark() ? 'dark' : 'light' });
    const rnd = qs.get('renderer'); if (rnd && /^[a-z-]{2,20}$/.test(rnd)) u.set('renderer', rnd);
    frame = h('iframe', { class: 'demo-frame', id: 'demoFrame', title: '3D-модель объекта: вращение — мышью или пальцем, масштаб — колесом или двумя пальцами', src: 'index.html?' + u, allow: 'fullscreen' });
    frameBox.append(frame); frameWin = frame.contentWindow;
    modelTimer = setTimeout(() => { if (S.model.state === 'load') { S.model.state = 'error'; loadEl.textContent = 'Модель не открылась за 60 с. Откройте атлас — кнопка «В атласе».'; loadEl.classList.add('demo-model-load--err'); modelRes({ state: 'error' }); } }, 60000);
    legend();
    sendInsets();
    if (window.ResizeObserver) new ResizeObserver(() => sendInsets()).observe($('demoModel'));
  }
  // отступы кадра под кнопки и легенду поверх модели
  function sendInsets() {
    const fig = $('demoModel'); if (!fig || !frame) return;
    const fr = fig.getBoundingClientRect(), tb = $('demoModelTools').getBoundingClientRect(), lg = legendEl.getBoundingClientRect();
    toFrame({ type: 'insets', top: Math.max(0, tb.bottom - fr.top) + 8, bottom: lg.height ? Math.max(0, fr.bottom - lg.top) + 8 : 8, left: 8, right: 8 });
  }
  function legend() {
    if (!legendEl) return;
    const d = S.data, any = !!(d && d.anyFact), tst = !!(d && d.test);
    const li = (cls, t) => h('li', { class: 'demo-ml' }, h('span', { class: 'demo-ml-sw demo-ml-sw--' + cls, 'aria-hidden': 'true' }), t);
    legendEl.textContent = '';
    legendEl.append(li('done', 'выполнено — цвет модели' + (tst ? ' (тест)' : '')), li('part', 'частично'), li('todo', 'не выполнено — прозрачно'), li('ctx', 'вне плана работ'));
    if (d && !any) legendEl.append(h('li', { class: 'demo-ml demo-ml--nofact' }, 'факта нет — весь план прозрачный'));
  }
  function paintModel() {
    if (!frame || !S.data || !S.data.D) return;
    toFrame({ type: 'paint', states: modelStates(S.data), info: modelInfo(S.data) });
  }
  addEventListener('message', e => {
    if (!frame || e.source !== frameWin) return;
    const m = e.data;
    if (!isObj(m) || m.src !== 'atlas-demo-embed') return;
    const M = S.model;
    if (!linked) { linked = true; sendInsets(); paintModel(); }
    if (m.type === 'load' && M.state === 'load') { M.text = String(m.text || ''); loadEl.textContent = 'Загрузка модели' + (/\d/.test(M.text) ? ' · ' + M.text : '…'); }
    else if (m.type === 'engine') { M.engine = { api: m.api, backend: m.backend, orbit: !!m.orbit }; $('demoSpin').hidden = !m.orbit; }
    else if (m.type === 'frame') { if (M.frameMs == null) { M.frameMs = Math.round(performance.now()); document.body.dataset.demoFrameMs = String(M.frameMs); } }
    else if (m.type === 'ready') {
      clearTimeout(modelTimer); M.state = m.error ? 'error' : 'ready'; M.readyMs = Math.round(performance.now()); M.backend = m.backend;
      document.body.dataset.demoModelMs = String(M.readyMs);
      if (m.error) { loadEl.textContent = 'Модель загрузилась с ошибкой: ' + m.error; loadEl.classList.add('demo-model-load--err'); }
      else loadEl.hidden = true;
      sendInsets(); paintModel();
      if (S.play && S.spinUser !== false) spin(true);
      modelRes({ state: M.state, ms: M.readyMs, backend: m.backend });
    } else if (m.type === 'painted') { M.painted = { counts: m.counts, missing: m.missing, inScene: m.inScene, at: Math.round(performance.now()) }; }
    else if (m.type === 'spin') { M.spin = !!m.on; $('demoSpin').setAttribute('aria-pressed', String(M.spin)); }
    else if (m.type === 'fps') { M.fps = m.fps; }
    else if (m.type === 'error') { (M.errors || (M.errors = [])).length < 10 && M.errors.push(String(m.msg || '').slice(0, 300)); }
    else if (m.type === 'strokes') { M.strokes = { lines: m.lines, thin: m.thin, marks: m.marks }; }
    else if (m.type === 'pick') {
      if (!m.id) { pickEl.hidden = true; return; }
      const st = m.state ? MSTATE[m.state] + (S.data && S.data.test ? ' (тест)' : '') : 'вне плана хода работ';
      $('demoPickT').textContent = (m.name || m.key || m.id) + ' · ' + st; pickEl.hidden = false;
    }
  });
  function spin(on) { toFrame({ type: 'spin', on: !!on }); }
  $('demoFit').addEventListener('click', () => toFrame({ type: 'fit' }));
  $('demoSpin').addEventListener('click', () => { const on = !S.model.spin; S.spinUser = on; spin(on); });
  $('demoPickX').addEventListener('click', () => { toFrame({ type: 'deselect' }); pickEl.hidden = true; });

  /* ---------- тестовый пример ---------- */
  const testBtn = $('demoTest'), testBar = $('demoTestBar');
  function setTest(on, pct) {
    if (!TEST_ON || !S.data || !S.data.plan) on = false;
    const was = !!S.test;
    S.test = on ? { pct: Number.isFinite(pct) && pct >= 5 && pct <= 95 ? pct : TEST_PCT } : null;
    if (!!S.test === was && !on) return Promise.resolve(false);
    document.documentElement.classList.toggle('demo-test', !!S.test);
    testBtn.setAttribute('aria-pressed', String(!!S.test));
    testBar.hidden = !S.test;
    try { const u = new URL(location.href); if (S.test) u.searchParams.set('test', String(S.test.pct)); else u.searchParams.delete('test'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* file:// без истории */ }
    return refresh().then(() => {
      if (S.test) $('demoTestNote').textContent = '~' + fmt(S.test.pct) + ' % объёма каждой единицы по порядку этапов и пикетов · ' + fmt(S.data.events.length) + ' временных отметок в памяти страницы · в журнал и хранилище не пишется';
      statusEl.textContent = S.test ? 'Тестовый пример включён: данные не факт' : 'Тестовый пример выключен: показаны реальные данные';
      return true;
    });
  }
  testBtn.addEventListener('click', () => setTest(!S.test));
  $('demoTestOff').addEventListener('click', () => setTest(false));

  /* ---------- «нет хода работ» ---------- */
  function renderNone(d) {
    const why = [];
    if (!AP || !SUM) why.push('модули хода работ ядра не загрузились (assets/progress-core.js, progress-summary.js)');
    if (!d.cfg) why.push('в конфиге объекта нет ключа progress (или progress.enabled: false)');
    const sets = progressSets();
    if (d.cfg && !sets.length) why.push('нет набора plugins: progress');
    for (const s of sets) if (loaded.get(s.src) === false) why.push('файл не загрузился: ' + s.src);
    if (d.cfg && !d.plan) why.push('нет плана этапов (набор ATLAS_PROGRESS_PLAN)');
    if (d.cfg && !Object.keys(d.pub.items || {}).length) why.push('нет ведомости объёмов (набор ATLAS_PROGRESS_ITEMS)');
    root.textContent = ''; kpiEl.textContent = ''; footEl.textContent = '';
    kpiEl.append(h('div', { class: 'demo-nofact', role: 'note' }, h('strong', {}, d.cfg ? 'Ход работ: нет данных' : 'Ход работ не ведётся'), h('span', {}, d.cfg ? ' — ни плана этапов, ни среза. Модель показана без окраски.' : ' — для этого объекта ход работ в атласе не ведётся. Модель показана без окраски.')));
    root.append(h('section', { class: 'demo-screen demo-none', 'aria-labelledby': 'dnH' },
      h('h2', { id: 'dnH', class: 'demo-h2' }, d.cfg ? 'Ход работ: нет данных' : 'Ход работ не ведётся'),
      h('ul', { class: 'demo-why' }, why.map(w => h('li', {}, w))),
      h('p', { class: 'demo-note' }, 'Проценты и объёмы не показываются: их нет в данных. Что нужно объекту — docs/DATA_CONTRACT.md §9.14: ведомость объёмов и план этапов (наборы ATLAS_PROGRESS_ITEMS, ATLAS_PROGRESS_PLAN), необязательно журнал, срез «Итога», снимок сметы и карта соответствия.')));
    tabsEl.hidden = true; $('demoPlay').hidden = true; testBtn.hidden = true; if (legendEl) legendEl.hidden = true;
    if (!d.cfg && $('demoProgress')) $('demoProgress').hidden = true;
  }

  /* ---------- навигация: вкладки, слайды, клавиши ---------- */
  const avail = () => SCREENS.filter(s => s.id !== 'remarks' || s.has(S.data));
  function slideList() {
    const ids = Array.isArray(DC.slides) && DC.slides.length ? DC.slides.filter(x => RENDER[x]) : SCREENS.map(s => s.id);
    return ids.filter(id => { const s = SCREENS.find(x => x.id === id); return s && s.has(S.data); });
  }
  const interval = () => { const v = Number(DC.interval_s); return (Number.isFinite(v) && v >= 5 && v <= 120 ? v : 12) * 1000; };
  function buildTabs() {
    tabsEl.textContent = '';
    for (const s of avail()) {
      const b = h('button', { type: 'button', role: 'tab', id: 'dtab-' + s.id, class: 'demo-tab', 'aria-controls': 'demoMain', 'aria-selected': String(s.id === S.screen), tabindex: s.id === S.screen ? '0' : '-1', 'data-screen': s.id, on: { click: () => { go(s.id); } } }, s.title);
      if (!s.has(S.data)) b.classList.add('demo-tab--empty');
      tabsEl.append(b);
    }
    tabsEl.hidden = false;
  }
  const hashOf = () => '#screen=' + (S.screen || 'stages') + (S.play ? '&play=1' : '');
  function go(id, opt) {
    if (!S.data || !S.data.D || !RENDER[id]) return false;
    S.screen = id; document.documentElement.dataset.screen = id;
    for (const b of tabsEl.querySelectorAll('[role="tab"]')) { const on = b.dataset.screen === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    root.setAttribute('aria-labelledby', 'dtab-' + id);
    root.textContent = '';
    try { root.append(RENDER[id](S.data)); } catch (e) { root.append(h('p', { class: 'demo-nodata', role: 'alert' }, 'Экран не построен: ' + (e && e.message || e))); console.error(e); }
    root.scrollTop = 0;
    if (!(opt && opt.keepHash)) { try { history.replaceState(null, '', location.pathname + location.search + hashOf()); } catch (e) { /* file:// без истории */ } }
    if (opt && opt.focus) { const t = tabsEl.querySelector('[data-screen="' + id + '"]'); if (t) t.focus(); }
    if (S.play) arm();
    return true;
  }
  function step(k, focus) {
    const L = S.play ? slideList() : avail().map(s => s.id); if (!L.length) return;
    let i = L.indexOf(S.screen); i = i < 0 ? 0 : (i + k + L.length) % L.length;
    go(L[i], { focus });
  }
  function arm() { clearTimeout(S.timer); const bar = $('demoTick'); if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; bar.style.animationDuration = interval() + 'ms'; } S.timer = setTimeout(() => step(1), interval()); }
  // «Слайды»: экраны сбоку листаются, модель медленно поворачивается (выключается кнопкой «Автоповорот»; без рук на модели)
  function play(on) {
    S.play = !!on && slideList().length > 0;
    const b = $('demoPlay'); b.setAttribute('aria-pressed', String(S.play)); b.querySelector('.demo-btn-t').textContent = S.play ? 'Пауза' : 'Слайды';
    document.documentElement.classList.toggle('demo-playing', S.play);
    statusEl.textContent = S.play ? 'Слайды: ' + slideList().length + ' ' + plural(slideList().length, ['экран', 'экрана', 'экранов']) + ', смена каждые ' + Math.round(interval() / 1000) + ' с' + (S.spinUser === false ? '' : ', модель поворачивается') + ' · Esc — пауза' : 'Слайды на паузе';
    if (S.play) { const L = slideList(); go(L.includes(S.screen) ? S.screen : L[0]); } else clearTimeout(S.timer);
    if (S.model.state === 'ready' && S.spinUser == null) spin(S.play);
    try { history.replaceState(null, '', location.pathname + location.search + hashOf()); } catch (e) { /* нет */ }
  }
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const tg = e.target, typing = tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName));
    if (typing) return;
    const inTabs = tabsEl.contains(document.activeElement);
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1, inTabs); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1, inTabs); }
    else if (e.key === 'Home' && inTabs) { e.preventDefault(); const L = avail(); if (L.length) go(L[0].id, { focus: true }); }
    else if (e.key === 'End' && inTabs) { e.preventDefault(); const L = avail(); if (L.length) go(L[L.length - 1].id, { focus: true }); }
    else if (e.key === 'Escape' && S.play) { play(false); }
  });

  /* ---------- шапка: заголовок, кнопки ---------- */
  const title = isObj(P.title) ? P.title : {};
  $('demoObj').textContent = title.object || title.short || P.project_id || 'Объект';
  const subParts = [title.code, TT.subtitle].filter(Boolean);
  $('demoSub').textContent = subParts.join(' · ') || 'Демонстрация хода работ';
  document.title = 'Демонстрация · ' + (title.short || title.object || '3D Атлас');
  if (!TEST_ON) testBtn.hidden = true;
  const fsBtn = $('demoFull');
  if (fsBtn) {
    if (!document.fullscreenEnabled) fsBtn.hidden = true;
    fsBtn.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => { statusEl.textContent = 'Полный экран недоступен в этом браузере'; }); });
    document.addEventListener('fullscreenchange', () => { const on = !!document.fullscreenElement; document.documentElement.classList.toggle('demo-stage', on); fsBtn.setAttribute('aria-pressed', String(on)); fsBtn.querySelector('.demo-btn-t').textContent = on ? 'Обычный экран' : 'На весь экран'; setTimeout(sendInsets, 300); });
  }
  const themeBtn = $('demoTheme'), hcBtn = $('demoContrast');
  const applyTheme = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    themeBtn.setAttribute('aria-pressed', String(dark)); themeBtn.querySelector('.demo-btn-t').textContent = dark ? 'Светлая тема' : 'Тёмная тема';
    hcBtn.setAttribute('aria-pressed', String(!!pref.hc)); document.documentElement.classList.toggle('demo-hc', !!pref.hc);
  };
  themeBtn.addEventListener('click', () => { const dark = document.documentElement.dataset.theme !== 'dark'; document.documentElement.dataset.theme = dark ? 'dark' : 'light'; pref.theme = dark ? 'dark' : 'light'; savePref(); applyTheme(); toFrame({ type: 'theme', dark }); });
  hcBtn.addEventListener('click', () => { pref.hc = !pref.hc; savePref(); applyTheme(); });
  applyTheme();
  $('demoPlay').addEventListener('click', () => play(!S.play));

  /* ---------- запуск: рамка модели — сразу, цифры — по данным ---------- */
  modelStart();
  let readyRes; const ready = new Promise(r => { readyRes = r; });
  async function refresh() {
    secCache = null;
    S.data = await compute();
    if (!S.data.D) { renderNone(S.data); return; }
    if (!S.screen) {
      const q = new URLSearchParams(location.hash.slice(1)), want = q.get('screen');
      S.screen = RENDER[want] && avail().some(s => s.id === want) ? want : 'stages';
      if (q.get('play') === '1') S.play = true;
    }
    if (!avail().some(s => s.id === S.screen)) S.screen = avail()[0] ? avail()[0].id : 'summary';
    renderKpi(S.data); renderFoot(S.data); legend();
    buildTabs(); go(S.screen, { keepHash: true });
    paintModel();
    setTimeout(sendInsets, 0);
  }
  (async () => {
    const sets = progressSets();
    if (AP && AP.config()) await Promise.all(sets.map(s => script(s.src)));
    S.store = AP && AP.config() ? await localStore() : null;
    const tq = Number(new URLSearchParams(location.search).get('test') || new URLSearchParams(location.hash.slice(1)).get('test'));
    if (TEST_ON && Number.isFinite(tq) && tq > 0) { await refresh(); if (S.data.plan) await setTest(true, tq); }
    else await refresh();
    root.setAttribute('aria-busy', 'false');
    const ms = Math.round(performance.now()), own = Math.round(performance.now() - T0);   // от начала перехода на страницу; own — от запуска модуля
    document.body.dataset.demoReady = '1'; document.body.dataset.demoMs = String(ms); document.body.dataset.demoOwnMs = String(own);
    if (S.data.D && S.play) play(true);
    readyRes({ ms, own });
    if (S.store && S.store.on) S.store.on(() => { if (!S.test) refresh(); });
    // замечания — после первого экрана, тем же <script src> AtlasData (набор «remarks»); нет набора — экрана нет
    if (S.data.D && !window.ATLAS_REMARKS && window.AtlasData && typeof AtlasData.load === 'function') {
      S.remarks = 'load';
      AtlasData.load('remarks').then(() => { S.remarks = 'ok'; refresh(); }, () => { S.remarks = 'none'; });
    }
  })().catch(e => { console.error(e); root.textContent = ''; root.append(h('p', { class: 'demo-nodata', role: 'alert' }, 'Демонстрация не построена: ' + (e && e.message || e))); readyRes({ ms: -1, error: String(e) }); });

  window.AtlasDemo = {
    ready, model,
    state: () => ({ screen: S.screen, play: S.play, screens: S.data && S.data.D ? avail().map(s => s.id) : [], slides: S.data && S.data.D ? slideList() : [], fact: !!(S.data && S.data.anyFact), events: S.data ? S.data.events.length : 0, local: S.data ? S.data.local.length : 0, basis: S.data && S.data.D ? S.data.D.basis : null, snapshot: !!(S.data && S.data.pick && S.data.pick.snap),
      test: S.test ? { pct: S.test.pct, events: S.data ? S.data.events.length : 0, units: S.data && S.data.test ? S.data.test.units : [] } : null,
      units: S.data && S.data.D ? aggUnits(planKeys(S.data), S.data).map(u => ({ unit: u.unit, plan: u.plan, done: u.done, part: u.part, share: share(u) })) : [],
      bodies: S.data && S.data.D ? modelStates(S.data) : {},
      model: Object.assign({}, S.model) }),
    go, play, screens: () => avail().map(s => s.id), test: (on, pct) => setTest(on !== false, Number(pct)), fit: () => toFrame({ type: 'fit' }), spin: on => { S.spinUser = !!on; spin(on); }
  };
})();
