/* 3D Атлас · «Замечания на модели» (V12.2 · M4, B2; ПЛАН_D 1.15, макет D — D_дизайн/итог/V12_2_замечания.html).
   Кнопка «Замечания · N» на панели сцены, легенда по значимости с числами из data/rd_remarks_final.js, обход ← → по связанным замечаниям,
   фильтр по значимости, выход. Связанные тела плотные и подкрашены цветом значимости (__ATLAS.setTint, «С цветом» / «Без цвета»), вокруг прозрачно (AtlasViewSettings.through).
   Тела слоя «По РД» добавляются во «Всё здание» наложением AtlasNodes.extra — наложение ведёт только atlas-nodes.js.
   Набор разделов (M15) в режиме сохраняется, тела замечаний видны поверх него (AtlasNodes.secPin).
   Данные — <script src="data/…">, без fetch/XHR (запуск из file://). Вход по адресу: index.html#issues; адрес без issues («Назад», правка «#») — выход.
   Ядро 1.0.2 (D): исправлено/допроектировано атласом (atlas_fix) — свой цвет --c-fix, значимость вне трёх — --c-sig-none; ID записи → тела `<ID>::<часть>`;
   камера по всем телам замечания (без среза глубины); метки точек коллизии (collision.pairs[].point_mm / 1000) — свой слой, не список линейки; фильтр Все / Коллизии / Ошибки проекта / Исправлено. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = window.AtlasShell;
  const make = (tag, attrs, text) => S.make(tag, attrs, text);
  const icon = (name, cls) => window.AtlasIcons ? window.AtlasIcons.el(name, null, cls || 'icon--16') : document.createTextNode('');
  const fmt = n => S.fmt ? S.fmt(n) : String(n);
  const plural = (n, a, b, c) => S.plural ? S.plural(n, a, b, c) : c;
  const SIG = [['Высокая', 'high'], ['Средняя', 'mid'], ['Низкая', 'low']];
  const SIGK = Object.fromEntries(SIG);
  const sigKey = s => SIGK[s] || 'none';                               // значимость вне трёх — «Не оценена», запасной цвет --c-sig-none
  const NOSIG = 'Не оценена';
  const FIXK = { 'исправлено': 'fix-1', 'допроектировано': 'fix-2' };   // atlas_fix.kind
  const FIXT = { 'fix-1': 'Исправлено атласом', 'fix-2': 'Допроектировано атласом' };
  const keyOf = r => r.fix ? (FIXK[String(r.fix.kind || '').toLowerCase()] || 'fix-1') : sigKey(r.sig);
  const PRI = { high: 0, mid: 1, low: 2, none: 3, 'fix-1': 4, 'fix-2': 4 };   // приоритет цвета тела: ошибка проекта важнее исправленного
  const GRP = [['all', 'Все', 'Все'], ['col', 'Коллизии', 'Коллизии'], ['prj', 'Ошибки проекта', 'Ошибки'], ['fix', 'Исправлено', 'Исправл.']];
  const PTMAX = 1000;
  const DATA_SRC = 'data/rd_remarks_final.js';
  const A = () => window.__ATLAS, F = () => window.__FULL_ATLAS, V = () => window.AtlasViewSettings, N = () => window.AtlasNodes;
  const scope = () => { try { const a = window.__ATLAS; if (a && typeof a.scope === 'function') return a.scope(); return null; } catch (e) { return null; } };   /* К1 § 2: раздел — только __ATLAS.scope() */   // V12.2 · E2: __ATLAS.scope()

  /* ---------- данные ---------- */
  let D = null, loading = null;
  function loadData() {
    if (D) return Promise.resolve(D);
    if (loading) return loading;
    loading = new Promise(res => {
      const done = () => { D = build(window.ATLAS_REMARKS); res(D); syncButton(); };
      if (window.ATLAS_REMARKS) { done(); return; }
      const s = document.createElement('script'); s.src = DATA_SRC; s.onload = done; s.onerror = () => { D = null; loading = null; res(null); }; document.head.append(s);
    });
    return loading;
  }
  // Связанные замечания: тела здания (scope ≠ WORLD_REVIEW) и «По РД» (scope = WORLD_REVIEW, тела слоя N). Порядок обхода — высокая → средняя → низкая, внутри — по номеру.
  function build(src) {
    if (!src || !Array.isArray(src.items)) return null;
    const coll = new Intl.Collator('ru', { numeric: true });
    const rank = s => { const i = SIG.findIndex(x => x[0] === s); return i < 0 ? 3 : i; };
    const pt = p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) ? p.map(v => v / 1000) : null;   // point_mm → м (сцена)
    const items = src.items.map(r => {
      const b = [], p = [], pairs = [];
      for (const l of (r.building_links || [])) { if (!l || !l.id) continue; (l.review_package != null ? p : b).push(l.id); /* К1: тело слоя — по номеру пакета слоя в данных */ }
      for (const q of ((r.collision && r.collision.pairs) || [])) { if (!q) continue; pairs.push({ a: q.a, b: q.b, pt: pt(q.point_mm), a_part: q.a_part != null ? String(q.a_part) : null, b_part: q.b_part != null ? String(q.b_part) : null });   /* 1.0.16 B3-4: и часть тела пары */ if (q.a) b.push(q.a); if (q.b) b.push(q.b); }
      const ppt = Array.isArray(r.place_pt) && r.place_pt.length === 3 && r.place_pt.every(v => Number.isFinite(Number(v))) ? r.place_pt.map(Number) : null;   // 1.0.12: точка места без пары, м (как pairs[].pt)
      return { id: r.id, ppt, sig: r.significance, cat: r.category || '', what: r.what || '', fix: (r.atlas_fix && typeof r.atlas_fix === 'object') ? r.atlas_fix : null, pairs, b: [...new Set(b)], p: [...new Set(p)], x: null };
    }).filter(r => r.b.length || r.p.length).sort((x, y) => ((x.fix ? 1 : 0) - (y.fix ? 1 : 0)) || (rank(x.sig) - rank(y.sig)) || coll.compare(x.id, y.id));
    for (const r of items) r.k = keyOf(r);
    const inB = items.filter(r => r.b.length), inP = items.filter(r => r.p.length);
    const count = {}; for (const r of items) count[r.k] = (count[r.k] || 0) + 1;
    const countAll = {}; for (const r of src.items) { if (!r) continue; const k = keyOf({ fix: (r.atlas_fix && typeof r.atlas_fix === 'object') ? r.atlas_fix : null, sig: r.significance }); countAll[k] = (countAll[k] || 0) + 1; }   /* 1.0.19a М-2: «из N» — по всем замечаниям данных */
    return {
      items, total: (src.edition && src.edition.count) || src.items.length, count, countAll, nb: null, np: null,
      grp: { all: items.length, col: items.filter(isCol).length, prj: items.filter(r => !r.fix).length, fix: items.filter(r => r.fix).length },
      bld: { remarks: inB.length }, rd: { remarks: inP.length },
      both: items.filter(r => r.b.length && r.p.length).length
    };
  }
  const isCol = r => r.cat === 'Коллизия' || r.pairs.length > 0;
  const inGrp = r => grp === 'all' || (grp === 'col' && isCol(r)) || (grp === 'prj' && !r.fix) || (grp === 'fix' && !!r.fix);

  /* ---------- тела записи из частей: ID записи → её тела `<ID>::<часть>` (ядро 1.0.2) ---------- */
  let bidx = null;
  function bodyIndex() {
    if (bidx) return bidx;
    bidx = new Map(); let list = []; try { list = A().objects(); } catch (e) { /* */ }
    const add = (k, rid) => { const a = bidx.get(k); if (a) a.push(rid); else bidx.set(k, [rid]); };
    for (const o of list) { const rid = o.renderId; if (!rid) continue; add(rid, rid); let i = rid.indexOf('::'); while (i > 0) { add(rid.slice(0, i), rid); i = rid.indexOf('::', i + 2); } }
    return bidx;
  }
  function expand(ids) { const ix = bodyIndex(), out = new Set(); for (const id of ids) { const a = ix.get(id); if (a) a.forEach(x => out.add(x)); else out.add(id); } return [...out]; }
  const X = r => r.x || (r.x = { b: expand(r.b), p: expand(r.p) });
  function bodyCounts() { if (!D.nb) { const nb = new Set(), np = new Set(); for (const r of D.items) { X(r).b.forEach(i => nb.add(i)); X(r).p.forEach(i => np.add(i)); } D.nb = nb.size; D.np = np.size; } return D; }

  /* ---------- разметка ---------- */
  const stage = document.querySelector('.stage');
  const btn = make('button', { type: 'button', id: 'atbIssues', class: 'atb-b', 'aria-pressed': 'false', title: 'Замечания на модели', 'aria-label': 'Замечания на модели' });
  btn.append(icon('sig-mid'), make('span', { class: 'atb-t' }, 'Замечания'));
  btn.onclick = () => (on ? off('user') : enter());
  const onModel = () => 'На модели · ' + fmt(D.items.length) + ' из ' + fmt(D.total);   // 1.0.19a М-2
  function syncButton() {
    const t = btn.querySelector('.atb-t'); if (t) t.textContent = D ? onModel() : 'Замечания';   /* 1.0.19a М-2: одна подпись везде — «На модели · 83 из 136» (числа — из данных) */
    { const rest = D ? Math.max(0, D.total - D.items.length) : 0, t = D ? onModel() + ' ' + plural(D.total, 'замечания', 'замечаний', 'замечаний') + (rest ? ' · ещё ' + fmt(rest) + ' не ' + plural(rest, 'привязано', 'привязаны', 'привязаны') + ' к элементам' : '') : 'Замечания на модели'; btn.setAttribute('aria-label', t); btn.title = t; }   /* имя начинается с видимой подписи (WCAG 2.5.3) */   // 1.0.15 B3-8 (L9): второй счётчик (вкладка — все замечания) поясняется до нажатия
    btn.style.display = D && !D.items.length ? 'none' : '';   // К1: нет замечаний — кнопки нет
  }
  // Кнопка — в группу панели сцены (раскладку панели ведёт atlas-toolbar.js, B3; чужие узлы .tools он переносит в скрытый запас)
  // На телефоне (≤ 850 px) группы панели нет на экране — кнопка плавающим чипом на сцене (макет D, 390)
  const phoneMQ = matchMedia('(max-width: 850px)');
  function place() {
    // V12.2: на ПК — своя группа панели «Замечания на модели» (#atbGIssues, atlas-toolbar.js, B3); без неё — к группе «Сечение»
    const g = $('atbGIssues') || ($('atbSlice') && $('atbSlice').parentElement);
    btn.classList.toggle('iss-chip', phoneMQ.matches);
    if (phoneMQ.matches) { if (stage && btn.parentElement !== stage) stage.append(btn); }
    else if (g && btn.parentElement !== g) g.append(btn);
    else if (!g && !btn.isConnected && stage) stage.append(btn);
  }
  document.addEventListener('atlas:toolbar', place);
  phoneMQ.addEventListener('change', () => { place(); if (on) { dock(); if (D) renderLegend(); schedulePts(); } });

  const legend = make('section', { class: 'iss-legend', 'aria-label': 'Замечания на модели', hidden: '' });
  // выбранное тело в режиме «с цветом» — плашкой в легенде: какие замечания у него и их значимость
  const pick = make('div', { class: 'iss-pick', 'aria-live': 'polite', hidden: '' });
  function pickSync() {
    const o = F() && F().selected(), rs = o && D ? remarksOf(o.renderId) : [];
    pick.replaceChildren(); pick.hidden = !(on && color && canTint() && rs.length);
    if (pick.hidden) return;
    let name = o.name; try { if (window.AtlasCard) name = window.AtlasCard.human(o).title || name; } catch (e) { /* */ }
    pick.append(icon('focus-element'), make('span', { class: 'iss-pt' }, 'Выбрано: '), make('b', { class: 'iss-pn', title: name }, name), document.createTextNode(' · '));
    rs.slice(0, 3).forEach((r, i) => { if (i) pick.append(document.createTextNode(', ')); pick.append(make('span', { class: 'sig sig--' + (r.fix ? 'fix' : sigKey(r.sig)) }, r.id)); });
    if (rs.length > 3) pick.append(document.createTextNode(' +' + fmt(rs.length - 3)));
  }
  document.addEventListener('atlas:selection', () => { if (on) pickSync(); });
  document.addEventListener('atlas:selectionchange', () => { if (on) pickSync(); });   // 1.0.12: снятие выбора (id null) — «Выбрано: …» прошлого тела не остаётся
  const nav = make('nav', { class: 'iss-nav', 'aria-label': 'Обход замечаний', hidden: '' });
  if (stage) stage.append(legend, nav);
  // 1.0.15 B3-4 (L5): высота шторки замечаний (телефон) — в --iss-sheet-h у .stage: колонка «Вписать» поднимается над шторкой (atlas-issues.css)
  if (stage && window.ResizeObserver) { const sheetH = () => { const h = on && !legend.hidden && phoneMQ.matches ? Math.ceil(legend.getBoundingClientRect().height) : 0, v = h + 'px'; if (stage.style.getPropertyValue('--iss-sheet-h') !== v) { stage.style.setProperty('--iss-sheet-h', v); if (on && cs.own && ownLive()) refitIfOut(); } };   /* 1.0.15 B3-4b: колонка «Вписать» сдвинулась — кадр выреза сразу, без переходных кадров (ЭЛ-05 390) */ new ResizeObserver(sheetH).observe(legend); document.addEventListener('atlas:issues', sheetH); phoneMQ.addEventListener('change', sheetH); }

  let on = false, only = null, grp = 'all', idx = -1, pairIdx = -1, placeIdx = -1, list = [], wmap = null, ptsNote = null, navItem = null;
  // 1.0.11 · вырез у замечания: want — вкл./выкл. (память), step — ступень R, own — наш куб, prev — сечение до выреза (раз на сеанс), yielded — уступлен чужому сечению, info — расчёт cropBox
  const cs = { want: null, step: -1, stepAuto: -1, own: null, prev: null, yielded: null, busy: false, info: null, ghost: null, frame: null, userR: false };
  const E16 = () => !!(A() && A().features && A().features.objectGet);
  let selBefore = null;
  // V12.2 · M4 цвет: подкраска по значимости через __ATLAS.setTint (А1, A); без А1 — только «без цвета»
  const canTint = () => !!(A() && A().setTint);
  /* 1.0.17 B3-17d (Е-2): слой 'issues' — «Ход работ» и замечания не стирают окраску друг друга при переключении; без слоёв (движок ≤ 1.0.16) — общий setTint, как было */
  const tint = m => { const a = A(); if (a.features && a.features.tintLayers) a.setTint('issues', m); else a.setTint(m); };
  let color = true;
  function rgbOf(v) {
    v = String(v || '').trim(); let m;
    if ((m = /^#([0-9a-f]{6})$/i.exec(v))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    if ((m = /^#([0-9a-f]{3})$/i.exec(v))) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16));
    if ((m = /rgba?\(([^)]+)\)/i.exec(v))) return m[1].split(/[\s,/]+/).slice(0, 3).map(Number);
    return null;
  }
  // цвета — токены главной текущей темы (--c-sig-high / -mid / -low / -none, --c-fix)
  function palette() {
    const cs = getComputedStyle(document.documentElement), o = {};
    for (const k of ['high', 'mid', 'low']) o[k] = rgbOf(cs.getPropertyValue('--c-sig-' + k)) || [128, 128, 128];
    o.none = rgbOf(cs.getPropertyValue('--c-sig-none')) || [79, 115, 163]; o.fix = rgbOf(cs.getPropertyValue('--c-fix')) || [30, 122, 76];
    return o;
  }
  // цвет тела — по самому значимому из его замечаний в показанном наборе; исправленное атласом — --c-fix, если у тела нет открытых ошибок проекта
  function tintFor(rs) {
    const best = new Map(), pal = palette();
    for (const r of rs) for (const id of X(r).b.concat(X(r).p)) { const cur = best.get(id); if (cur == null || PRI[r.k] < PRI[cur]) best.set(id, r.k); }
    const m = new Map(); for (const [id, k] of best) m.set(id, pal[k.slice(0, 3) === 'fix' ? 'fix' : k]); return m;
  }
  function remarksOf(id) { return D ? D.items.filter(r => X(r).b.includes(id) || X(r).p.includes(id)).sort((x, y) => PRI[x.k] - PRI[y.k]) : []; }
  // значок значимости / «исправлено атласом»
  const badge = r => r.fix ? make('span', { class: 'iss-fix', title: r.fix.done || '' }, FIXT[r.k]) : make('span', { class: 'sig sig--' + sigKey(r.sig) }, r.sig || NOSIG);
  // фокус клавиатуры не теряется при перерисовке легенды/обхода: кнопки несут data-fk
  const fkOf = root => { const a = document.activeElement; return a && a.dataset && a.dataset.fk && root.contains(a) ? a.dataset.fk : null; };
  const refocus = (root, k) => { if (!k) return; const e = root.querySelector('[data-fk="' + k + '"]'); if (e && !e.disabled) try { e.focus({ preventScroll: true }); } catch (x) { /* */ } };

  const cntKey = k => D.items.filter(r => r.k === k && inGrp(r)).length;   // строки легенды — по выбранной группе
  function renderLegend() {
    const fk = fkOf(legend);
    legend.replaceChildren();
    // 1.0.12: подписи легенды и фильтров — ATLAS_TEXTS.issues (ключи ниже), без текстов — нейтральные умолчания
    const head = make('div', { class: 'iss-lh' }); head.append(make('b', {}, TXI('legend_title', 'Замечания на модели')));
    const x = make('button', { type: 'button', class: 'iss-x', 'aria-label': 'Выключить замечания на модели', title: 'Выключить' }); x.append(icon('close')); x.onclick = () => off('user');
    const sum = make('p', { class: 'iss-ls' }); sum.append(make('b', {}, fmt(D.items.length)), document.createTextNode(' из ' + fmt(D.total) + ' ' + plural(D.total, 'замечания', 'замечаний', 'замечаний') + ' ' + TXI('legend_linked', plural(D.items.length, 'привязано', 'привязаны', 'привязаны') + ' к модели') + ' · '), make('a', { class: 'iss-all', href: 'RD_REMARKS.html', 'data-fk': 'all' }, 'Открыть все'));   /* 1.0.19a М-2 */
    let seg = null;
    if (canTint()) {
      seg = make('div', { class: 'iss-mode', role: 'group', 'aria-label': 'Подкраска' });
      for (const [v, t] of [[true, 'С цветом'], [false, 'Без цвета']]) { const b = make('button', { type: 'button', 'data-fk': 'm:' + v, 'aria-pressed': String(color === v) }, t); b.onclick = () => { if (color !== v) { color = v; refresh(); } }; seg.append(b); }
    }
    if (seg && phoneMQ.matches) head.append(seg);   // на телефоне переключатель — в шапке шторки: она не выше прежней
    head.append(x); legend.append(head, sum);
    // фильтр: Все / Коллизии / Ошибки проекта / Исправлено
    const gseg = make('div', { class: 'iss-grp', role: 'group', 'aria-label': 'Фильтр замечаний' });
    const prjSame = D.grp.prj === D.grp.all;   /* 1.0.19a М-2: «Ошибки проекта» ⊆ «Все»; поровну — состав тот же, вкладка лишняя */
    if (prjSame && grp === 'prj') grp = 'all';
    const gN = GRP.filter(([v]) => !(v === 'fix' && !D.grp.fix) && !(v === 'prj' && prjSame)).length; gseg.classList.toggle('iss-grp--many', gN > 2);   /* три и больше — коротко, число второй строкой */
    for (const [v, t0, ts0] of GRP) {
      if (v === 'fix' && !D.grp.fix) continue;   // 1.0.12: нет записей atlas_fix — фильтра «Исправлено» нет
      if (v === 'prj' && prjSame) continue;
      const t = TXI('grp_' + v, t0), ts = TXI('grp_' + v + '_short', ts0);
      const n = D.grp[v] || 0, nT = v === 'all' && D.total > n ? fmt(n) + ' из ' + fmt(D.total) : fmt(n);   /* 1.0.19a М-2: «Все · 83 из 136» — число на модели не стоит без «из 136» */
      const b = make('button', { type: 'button', 'data-fk': 'g:' + v, 'aria-pressed': String(grp === v), 'aria-label': t + ' · ' + nT, disabled: v !== 'all' && !n ? '' : null, title: v === 'fix' ? TXI('fix_title', 'Исправлено / допроектировано атласом') : t });
      b.append(make('span', { class: 'iss-l-f' }, t + ' · ' + nT), make('span', { class: 'iss-l-s' }, ts), make('span', { class: 'iss-l-n' }, nT));
      b.onclick = () => { if (grp !== v) { grp = v; idx = -1; pairIdx = -1; placeIdx = -1; refresh(); } }; gseg.append(b);
    }
    legend.append(gseg);
    if (seg && !phoneMQ.matches) legend.append(seg);
    const row = (k, label, ic, cls) => {
      const tot = D.count[k] || 0; if (!tot && k !== 'high' && k !== 'mid' && k !== 'low') return null;
      const n = cntKey(k);
      const r = make('button', { type: 'button', 'data-fk': 'r:' + k, class: 'iss-row iss-row--' + cls, 'aria-pressed': String(!only || only === k), disabled: !n && only !== k ? '' : null, title: only === k ? 'Показать все' : 'Оставить только «' + label + '»' });
      const sw = make('span', { class: 'iss-sw iss-sw--' + cls, 'aria-hidden': 'true' }); sw.append(icon(ic));
      const all = (D.countAll || {})[k] || 0, nb = make('b', {}, fmt(n));   /* 1.0.19a М-2: «13 из 19» — сколько на модели из всех замечаний этой значимости (при «Все») */
      if (grp === 'all' && all > n) { nb.append(make('span', { class: 'iss-of' }, ' из ' + fmt(all))); r.setAttribute('aria-label', label + ': ' + fmt(n) + ' из ' + fmt(all) + ' на модели'); }
      r.append(sw, make('span', { class: 'iss-lt' }, label), nb);
      r.onclick = () => { only = only === k ? null : k; idx = -1; pairIdx = -1; placeIdx = -1; refresh(); };
      return r;
    };
    const rw = make('div', { class: 'iss-rwrap' });
    const rowsP = make('div', { class: 'iss-rows', role: 'group', 'aria-label': 'Ошибки проекта' });
    for (const [s, k] of SIG) { const e = row(k, s, 'sig-' + k, k); if (e) rowsP.append(e); }
    const en = row('none', NOSIG, 'info', 'none'); if (en) rowsP.append(en);
    rw.append(make('p', { class: 'iss-hd' }, TXI('legend_sig', 'Ошибки проекта на модели — по значимости')), rowsP);
    const rowsF = make('div', { class: 'iss-rows', role: 'group', 'aria-label': 'Исправлено атласом' });
    for (const k of ['fix-1', 'fix-2']) { const e = row(k, TXI(k === 'fix-1' ? 'fix_1' : 'fix_2', FIXT[k]), k === 'fix-1' ? 'status-done' : 'element', 'fix'); if (e) rowsF.append(e); }
    if (rowsF.children.length) rw.append(make('p', { class: 'iss-hd' }, TXI('fix_title', 'Исправлено / допроектировано атласом')), rowsF);
    rw.style.setProperty('--iss-rn', String(Math.max(1, rowsP.children.length + rowsF.children.length)));   /* 1.0.19a М-2: телефон — строк значимости столько колонок, сколько строк (место для «из N») */
    rw.classList.toggle('iss-rwrap--many', rowsP.children.length + rowsF.children.length > 3);
    legend.append(rw);
    if (color && canTint()) legend.append(pick);
    const note = (only || grp !== 'all') ? make('p', { class: 'iss-note' }, 'Показано ' + fmt(list.length) + ' из ' + fmt(D.items.length) + '. Повторный щелчок по фильтру — сброс.') : null;
    if (note) legend.append(note);
    ptsNote = make('p', { class: 'iss-note', hidden: '' }); legend.append(ptsNote);
    const C = bodyCounts();
    const l1 = make('p', { class: 'iss-line' }); l1.append(make('span', {}, TXI('legend_building', 'В здании')), make('b', {}, fmt(C.bld.remarks) + ' ' + plural(C.bld.remarks, 'замечание', 'замечания', 'замечаний') + ' · ' + fmt(C.nb) + ' ' + plural(C.nb, 'элемент', 'элемента', 'элементов')));
    legend.append(make('div', { class: 'iss-sep' }), l1);
    if (C.rd.remarks) { const l2 = make('p', { class: 'iss-line' }); l2.append(make('span', {}, TXI('legend_layer', '«По РД»')), make('b', {}, fmt(C.rd.remarks) + ' ' + plural(C.rd.remarks, 'замечание', 'замечания', 'замечаний') + ' · ' + fmt(C.np) + ' ' + plural(C.np, 'элемент', 'элемента', 'элементов'))); legend.append(l2); }
    legend.append(make('p', { class: 'iss-note' }, !list.length ? 'Нет замечаний в выборке — сбросьте фильтр.' : (C.both ? 'У ' + fmt(C.both) + ' ' + plural(C.both, 'замечания', 'замечаний', 'замечаний') + ' связи и в здании, и «По РД». ' : '') + (color && canTint() ? 'Цвет элемента — по самой значимой ошибке проекта' + (C.grp.fix ? '; исправленное атласом — зелёным' : '') + '; вокруг — прозрачно.' : 'Связанные элементы плотные, вокруг — прозрачно.')));
    refocus(legend, fk);
  }
  // 1.0.19a (владелец 24.10, п. 13): КС-2/КС-3, RFI, PGS в строке обхода замечаний — с расшифровкой в подсказке, assets/atlas-abbr.js.
  // index.html — файл A, поэтому модуль подгружается отсюда тегом <script> (без fetch: работает из file://); нет файла — текст как был.
  function abbrWatch(root) {
    if (!root) return;
    const go = () => { try { if (window.AtlasAbbr) window.AtlasAbbr.watch(root); } catch (e) { /* без подсказок */ } };
    if (window.AtlasAbbr) return go();
    let s = document.querySelector('script[src$="assets/atlas-abbr.js"]');
    if (!s) { s = document.createElement('script'); s.src = 'assets/atlas-abbr.js'; document.head.append(s); }
    s.addEventListener('load', go, { once: true });
  }
  let abbrOn = false;
  function renderNav() {
    if (!abbrOn) { abbrOn = true; abbrWatch(nav); }   // 1.0.19a: при первом показе обхода
    const fk = fkOf(nav), oldPs = nav.querySelector('.iss-pairs'), keepTop = oldPs && navItem === (idx >= 0 ? list[idx].id : null) ? oldPs.scrollTop : 0;
    nav.replaceChildren();
    const prev = make('button', { type: 'button', class: 'iss-nb', 'data-fk': 'prev', 'aria-label': 'Предыдущее замечание' }); prev.append(icon('chevron-left')); prev.onclick = () => go(-1);
    const next = make('button', { type: 'button', class: 'iss-nb', 'data-fk': 'next', 'aria-label': 'Следующее замечание' }); next.append(icon('chevron-right')); next.onclick = () => go(1);
    const mid = make('div', { class: 'iss-cur', 'aria-live': 'polite' });
    if (!list.length) mid.append(make('span', { class: 'iss-nt' }, 'Нет замечаний в выборке'));
    else if (idx < 0) mid.append(make('span', { class: 'iss-nt' }, 'Обход по замечаниям ← → · ' + fmt(list.length) + (list.length === D.items.length && D.total > list.length ? ' из ' + fmt(D.total) : '')));
    else {
      const r = list[idx];
      mid.append(make('a', { class: 'iss-nid', href: 'RD_REMARKS.html#id=' + encodeURIComponent(r.id), title: 'Открыть замечание ' + r.id }, r.id), make('span', { class: 'iss-nn' }, '· ' + fmt(idx + 1) + ' из ' + fmt(list.length)), badge(r), make('span', { class: 'iss-nt', title: r.what }, r.what));
      const a = make('a', { class: 'iss-na', href: 'RD_REMARKS.html#id=' + encodeURIComponent(r.id) }, 'Открыть замечание'); mid.append(a);
    }
    const rowEl = make('div', { class: 'iss-navrow' }); rowEl.append(prev, mid, next); nav.append(rowEl);
    if (idx >= 0) { const r = list[idx], t2 = make('div', { class: 'iss-nrow2' }); if (r.what) t2.append(make('span', { class: 'iss-nt2', title: r.what }, r.what)); t2.append(make('a', { class: 'iss-na2', 'data-fk': 'open', href: 'RD_REMARKS.html#id=' + encodeURIComponent(r.id) }, 'Открыть замечание')); nav.append(t2); }   // 1.0.15 B3-12 (L4): телефон — текст замечания (2 строки) и ссылка второй строкой (на ПК они в строке обхода, ряд скрыт)
    if (on && idx >= 0 && cropCfg()) nav.append(cropRow());   // 1.0.11: ряд «Вырез» — между строкой обхода и парами
    if (cropCfg()) syncOne();
    const PLs = idx >= 0 && cs.info && cs.info.kind === 'PL' && cs.info.rid === list[idx].id && cs.want && cs.plOpen ? cs.info.places : null;   // 1.0.12 П8: места замечания; раунд 6 — список свёрнут, раскрывается кнопкой «Список мест»
    if (idx >= 0 && (list[idx].pairs.length || PLs)) {   // пары коллизии (места): щелчок — тела и камера; прокрутка внутри, ↑ ↓ — по списку
      const ps = make('div', { class: 'iss-pairs' + (PLs ? ' iss-pairs--places' : ''), role: 'group', 'aria-label': PLs ? fill(TXI('places_group', 'Места замечания ({n})'), { n: PLs.length }) : 'Пары коллизии (' + list[idx].pairs.length + ')' });
      if (PLs) {
        const cur = placeIdx >= 0 ? placeIdx : 0;
        PLs.forEach((q, i) => { const nm = pname(q.ids[0]) + (q.ids.length > 1 ? ' +' + fmt(q.ids.length - 1) : ''), ad = addrOf(midOf(q.b)), t = fill(TXI('place_item', 'Место {n}'), { n: i + 1 }) + ': ' + nm + (ad ? ' · ' + ad : ''); const b = make('button', { type: 'button', 'data-fk': 'l:' + i, tabindex: i === cur ? '0' : '-1', 'aria-pressed': String(placeIdx === i), title: t }, t); b.onclick = () => pickPlace(list[idx], i); ps.append(b); });
      } else {
      const cur = pairIdx >= 0 ? pairIdx : 0;
      list[idx].pairs.forEach((q, i) => { const na = pnm(q.a), nb = pnm(q.b), ad = pairWhere(q), h = 'Пара ' + (i + 1) + (ad ? ' · ' + ad : ''), nm = na + ' ↔ ' + nb;   /* 1.0.16 B3-8: строка 1 — пара и место (различает одинаковые пары), строка 2 — имена тел; подсказка — и ID */
        const b = make('button', { type: 'button', class: 'iss-pr', 'data-fk': 'p:' + i, tabindex: i === cur ? '0' : '-1', 'aria-pressed': String(pairIdx === i), 'aria-label': h + ': ' + nm, title: h + '\n' + na + ' (' + (q.a || '—') + ')\n↔ ' + nb + ' (' + (q.b || '—') + ')' }); b.append(make('span', { class: 'iss-pr-h' }, h), make('span', { class: 'iss-pr-n' }, nm)); b.onclick = () => pickPair(list[idx], i); ps.append(b); });
      }
      ps.addEventListener('keydown', e => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const bs = [...ps.querySelectorAll('button')], i = bs.indexOf(document.activeElement); if (i < 0) return;
        e.preventDefault(); const n = bs[Math.max(0, Math.min(bs.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
        bs.forEach(b => b.tabIndex = -1); n.tabIndex = 0; n.focus();
      });
      nav.append(ps);
      ps.scrollTop = keepTop;   // прокрутка не сбрасывается при выборе пары; выбранная пара — в зоне видимости
      const sel = ps.querySelector('[aria-pressed="true"]');
      if (sel) { const pr = ps.getBoundingClientRect(), sr = sel.getBoundingClientRect(); if (sr.top < pr.top) ps.scrollTop += sr.top - pr.top; else if (sr.bottom > pr.bottom) ps.scrollTop += sr.bottom - pr.bottom; }
    }
    navItem = idx >= 0 ? list[idx].id : null;
    refocus(nav, fk);
    if (fk && !nav.contains(document.activeElement)) refocus(nav, 'next');   // кнопки пары нового замечания нет — фокус на «→», обход с клавиатуры продолжается
  }
  /* 1.0.16 B3-4 (A1): у пары есть часть тела (a_part / b_part) — выбрать часть; без *_part — как прежде */
  const pairPart = (r, pi, id) => { try { const q = r && r.pairs && pi != null && pi >= 0 ? r.pairs[pi] : null; if (!q || !id) return; const pk = id === q.a ? q.a_part : id === q.b ? q.b_part : null; if (pk != null && A().selectPart) A().selectPart(id, pk); } catch (e) { /* */ } };
  const short = id => { const s = String(id || '—'); const t = s.split('::').pop(); return t.length > 22 ? t.slice(0, 21) + '…' : t; };
  /* 1.0.16 B3-8 (A5): имя тела для подписей пар — как заголовок карточки (display_titles, иначе human(), иначе имя), не хвост ID */
  const pnm = id => { try { const dt = window.AtlasStatus && window.AtlasStatus.displayTitle && window.AtlasStatus.displayTitle(id); if (dt) return dt; const o = world().get(id); if (o && window.AtlasCard && window.AtlasCard.human) { const h = window.AtlasCard.human(o); if (h && h.title) return h.title; } return (o && o.name) || short(id); } catch (e) { return short(id); } };
  const pairWhere = q => { try { const p = q.pt || (() => { const b = bnd([q.a, q.b].filter(Boolean)); return b ? midOf(b) : null; })(); return p ? [addrOf(p), 'отм. ' + elev(p[2])].filter(Boolean).join(' · ') : ''; } catch (e) { return ''; } };   /* оси и отметка точки пары */
  const pname = id => { try { return (window.AtlasStatus && window.AtlasStatus.displayTitle && window.AtlasStatus.displayTitle(id)) || ((world().get(id) || {}).name) || short(id); } catch (e) { return short(id); } };
  // отметка в списке пар / мест без пересборки: прокрутка и фокус остаются
  function markList(i) {
    const ps = nav.querySelector('.iss-pairs'); if (!ps) return false;
    ps.querySelectorAll('button').forEach((b, j) => { b.setAttribute('aria-pressed', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
    const sel = ps.querySelector('[aria-pressed="true"]');
    if (sel) { const pr = ps.getBoundingClientRect(), sr = sel.getBoundingClientRect(); if (sr.top < pr.top) ps.scrollTop += sr.top - pr.top; else if (sr.bottom > pr.bottom) ps.scrollTop += sr.bottom - pr.bottom; }
    return true;
  }
  // 1.0.12 П8: место замечания — куб по месту ±R, тела места; ↑ ↓ — по списку мест
  function pickPlace(r, i) {
    const k = list.indexOf(r); if (k < 0) return;
    if (k !== idx) { idx = k; apply(); }
    placeIdx = i;
    if (cs.plOpen) { cs.plOpen = false; renderNav(); }   // раунд 6: место выбрано из списка — список свёрнут, тело не закрыто
    else if (!(navItem === r.id && nav.querySelector('.iss-pairs--places') && markList(i))) renderNav();
    cropShow(r, -1, i); renderPoints(); hashSync();
  }

  /* ---------- состояние сцены ---------- */
  // V12.3 · E16: тела — __ATLAS.has / get (без своей карты); без E16 — карта по allWorld()
  function world() {
    if (E16()) return { has: id => A().has(id), get: id => A().get(id) };
    if (wmap) return wmap;
    wmap = new Map(); try { for (const o of F().allWorld()) wmap.set(o.renderId, o); } catch (e) { /* */ }
    return wmap;
  }
  function bodiesOf(rs) { const out = new Set(); for (const r of rs) { X(r).b.forEach(id => out.add(id)); X(r).p.forEach(id => out.add(id)); } return [...out]; }
  function apply() {
    const sel = idx >= 0 ? [list[idx]] : list, ids = bodiesOf(sel);
    if (!ids.length) {   // пустая выборка (фильтр группы × строка легенды) — модель не прозрачнеет
      try { N() && N().extra && N().extra('issues', null); } catch (e) { /* */ }
      try { V().through('issues', null); } catch (e) { /* */ }
      try { if (canTint()) tint(null); } catch (e) { /* */ }
      pickSync(); return ids;
    }
    try { N() && N().extra && N().extra('issues', ids); } catch (e) { /* */ }
    try { V().through('issues', ids); } catch (e) { /* */ }
    try { if (canTint()) tint(color ? tintFor(sel) : null); } catch (e) { /* */ }
    pickSync();
    return ids;
  }
  function refresh() {
    list = D.items.filter(r => inGrp(r) && (!only || r.k === only));
    if (idx >= list.length) idx = -1;
    if (idx < 0 && cs.prev) cropRelease();   // 1.0.11: фильтр, строка легенды, общий обзор — сечение как до выреза
    renderLegend(); renderNav(); dock(); apply(); renderPoints(); hashSync();
  }
  // R1-05: на ≤ 850 px легенда — нижняя шторка, обход ← → в ней (макет D, 390); на ПК обход — отдельной плашкой на сцене
  function dock() { if (phoneMQ.matches) { if (nav.parentElement !== legend) legend.append(nav); } else if (stage && nav.parentElement !== stage) stage.append(nav); }
  // камера — рамкой по всем телам замечания, как «К элементу» V12.11 (A().fit сбрасывает срез глубины: он не остаётся после обхода и выхода)
  function fitTo(ids) {
    const objs = ids.filter(id => { try { return A().inScene ? A().inScene(id) : world().has(id); } catch (e) { return false; } }).map(id => world().get(id)).filter(Boolean);
    if (!objs.length) return;
    try { A().fit(objs); } catch (e) { /* */ }
  }
  function go(d) {
    if (!list.length) return;
    idx = idx < 0 ? (d > 0 ? 0 : list.length - 1) : (idx + d + list.length) % list.length; pairIdx = -1; placeIdx = -1; cs.plOpen = false;
    renderNav();
    const ids = apply(), r = list[idx];
    if (cropUse()) { cropShow(r, -1); renderPoints(); hashSync(); return; }   // 1.0.11: вырез; «Вся модель» — ниже, как 1.0.10
    const first = X(r).b.find(id => world().has(id)) || X(r).p.find(id => world().has(id)) || ids[0];
    try { if (first) A().select(first); } catch (e) { /* тело не в сцене */ }
    // R3-03 (решение координатора): тела замечания — цветом значимости (setTint в apply), выбор — только у выбранного тела; highlight в M4 не используется
    fitTo(X(r).b.concat(X(r).p));
    renderPoints(); hashSync();
  }
  // пара коллизии: оба тела в кадре, первое — выбрано
  function pickPair(r, i) {
    const q = r && r.pairs[i]; if (!q) return;
    const k = list.indexOf(r); if (k >= 0 && k !== idx) { idx = k; apply(); }
    const ps = nav.querySelector('.iss-pairs');
    if (ps && k === idx && navItem === r.id) {   // 1.0.4: тот же список — меняем только отметку, не пересобираем: прокрутка и фокус остаются
      pairIdx = i;
      ps.querySelectorAll('button').forEach((b, j) => { b.setAttribute('aria-pressed', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      const sel = ps.querySelector('[aria-pressed="true"]');
      if (sel) { const pr = ps.getBoundingClientRect(), sr = sel.getBoundingClientRect(); if (sr.top < pr.top) ps.scrollTop += sr.top - pr.top; else if (sr.bottom > pr.bottom) ps.scrollTop += sr.bottom - pr.bottom; }
    } else { pairIdx = i; renderNav(); }
    if (cropUse()) { cropShow(r, i); renderPoints(); hashSync(); return; }   // 1.0.11: куб — к точке пары, меньшее тело выбрано, крупное — призрак
    const ids = expand([q.a, q.b].filter(Boolean));
    try { const f = ids.find(id => world().has(id)); if (f) { A().select(f); pairPart(r, i, f); } } catch (e) { /* */ }
    fitTo(ids); renderPoints(); hashSync();
  }

  /* ---------- метки точек коллизии: свой слой поверх сцены (не список линейки) ---------- */
  const pts = make('div', { class: 'iss-pts', 'aria-label': 'Точки коллизий' });
  if (stage) stage.append(pts);
  let pm = [], raf = 0;
  function renderPoints() {
    const fa = document.activeElement, fkey = fa && fa.classList && fa.classList.contains('iss-pt-m') ? fa.dataset.k : null;
    pts.replaceChildren(); pm = [];
    let total = 0;
    if (on && D) {
      const rs = idx >= 0 ? [list[idx]] : list;
      for (const r of rs) r.pairs.forEach((q, i) => {
        if (!q.pt) return; total++; if (pm.length >= PTMAX) return;
        const b = make('button', { type: 'button', class: 'iss-pt-m' + (r.fix ? ' iss-pt-m--fix' : ''), tabindex: '-1', 'aria-pressed': String(idx >= 0 && pairIdx === i), 'data-k': r.id + '|' + i, 'aria-label': 'Коллизия ' + r.id + ', пара ' + (i + 1), title: 'Коллизия ' + r.id + ' · пара ' + (i + 1) + ': ' + pnm(q.a) + ' ↔ ' + pnm(q.b) });   /* 1.0.16 B3-8 */
        b.onclick = e => { e.stopPropagation(); pickPair(r, i); };
        pts.append(b); pm.push({ b, q });
      });
    }
    if (fkey) { const e = pts.querySelector('[data-k="' + fkey.replace(/"/g, '') + '"]'); if (e) try { e.focus({ preventScroll: true }); } catch (x) { /* */ } }
    if (ptsNote) { ptsNote.hidden = total <= pm.length; ptsNote.textContent = total > pm.length ? 'Метки на модели: показано ' + fmt(pm.length) + ' из ' + fmt(total) : ''; }
    placePoints();
  }
  // чтение и запись раздельно: сначала проекции всех меток, затем запись (transform) — без перекладки разметки на каждой метке
  function placePoints() {
    raf = 0;
    const live = drawBox();
    if (!pm.length || !stage) return;
    const R = stage.getBoundingClientRect(), pos = [];
    for (const m of pm) { let s = null; try { s = A().projectToScreen(m.q.pt); } catch (e) { /* */ } pos.push(s); }
    pm.forEach((m, i) => {
      const s = pos[i], vis = !!(s && s[2] !== false);
      if (m.b.hidden === vis) m.b.hidden = !vis;
      if (vis) { m.b.style.setProperty('--x', (s[0] - R.left).toFixed(1) + 'px'); m.b.style.setProperty('--y', (s[1] - R.top).toFixed(1) + 'px'); }
    });
    // 1.0.11: в вырезе соседние метки в ~40 px от выбранной скрыты (выбранная — кольцом, CSS D)
    const si = live ? pm.findIndex(m => !m.b.hidden && m.b.getAttribute('aria-pressed') === 'true') : -1;
    pm.forEach((m, i) => { const hide = si >= 0 && i !== si && !m.b.hidden && Math.hypot(pos[i][0] - pos[si][0], pos[i][1] - pos[si][1]) < 40; if (m.b.classList.contains('iss-pt-m--hide') !== hide) m.b.classList.toggle('iss-pt-m--hide', hide); });
  }
  const schedulePts = () => { if (!raf && (pm.length || cs.own)) raf = requestAnimationFrame(placePoints); };
  document.addEventListener('atlas:camera', schedulePts);
  document.addEventListener('atlas:camera', () => { let rd = true; try { rd = !A().ready || A().ready(); } catch (e) { /* */ } if (on && cs.own && cs.shown && !cs.drawnAt && rd) cs.drawnAt = performance.now(); });   /* r5: camNotify бывает и до готовности сцены — засчитывать только при готовой */   // 1.0.15 B3-1b: первый кадр выреза нарисован (camNotify — при отрисовке)
  document.addEventListener('atlas:sceneready', schedulePts);
  document.addEventListener('atlas:sheet', schedulePts);
  document.addEventListener('atlas:selectionchange', () => { schedulePts(); setTimeout(schedulePts, 350); });
  // 1.0.12: шторка карточки (телефон) открылась после кадра и сдвинула вид — в первые 1,5 с после показа замечания кадр по кубу заново, если куб вышел за холст
  function refitIfOut() { if (on && cs.own && ownLive() && !cubeInView(cs.own)) { fitFrame(cs.own, cs.frame0, null); schedulePts(); setTimeout(ghostOccluders, 60); } }   // кадр сменился — заслоняющие тела заново   // 1.0.14: куб вышел из свободной части холста — кадр заново (resize, правая панель, шторка, панели)
  let rsT = 0; addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(refitIfOut, 250); });
  document.addEventListener('atlas:sheet', () => {
    if (on && cs.own && ownLive() && (cs.drawnAt ? performance.now() - cs.drawnAt : 0) < 1500 && !cs.userCam) { fitFrame(cs.own, cs.frame0, null); schedulePts(); setTimeout(ghostOccluders, 60); return; }   // 1.0.15 B3-1 (П1): шторка сменилась сразу после показа выреза, камеру не трогали — кадр заново синхронно, до следующей отрисовки (через rAF первый кадр успевал показать куб под чипом)
    requestAnimationFrame(() => { refitIfOut(); setTimeout(ghostOccluders, 60); });
  });
  { const cv = $('canvas'); if (cv) { const u = () => { cs.userCam = true; }; cv.addEventListener('pointerdown', u, true); cv.addEventListener('wheel', u, { capture: true, passive: true }); } }   // 1.0.15 B3-1: камеру тронули — шторка кадр не перестраивает (только если куб вышел)
  // 1.0.13: правая панель свёрнута / развёрнута (переход 200 мс) — холст сменил ширину: подпись куба заново, куб вышел за холст — кадр по кубу
  document.addEventListener('atlas:rightpanel', () => setTimeout(() => { if (on && cs.own && ownLive()) { if (!cubeInView(cs.own)) fitFrame(cs.own, cs.frame0, null); schedulePts(); } }, 320));   // 1.0.12: путь и панели сцены меняют размер после выбора — подпись куба заново обходит их
  addEventListener('resize', schedulePts); addEventListener('orientationchange', schedulePts);
  if (window.ResizeObserver) { const ro = new ResizeObserver(schedulePts); if (stage) ro.observe(stage); const cv = $('canvas'); if (cv) ro.observe(cv); }   // колонка карточки, шторка, поворот телефона меняют холст без движения камеры

  /* ---------- 1.0.11 · вырез у замечания: куб ±R по осям здания (__ATLAS.setSection({box})), движок не меняется ----------
     Настройка — ATLAS_PROJECT.view.issue_crop { steps_m[], default_m, pair_pad_m, max_half_m, max_side_m, auto }; нет ключа или features.sectionApi — выреза нет, всё как в 1.0.10.
     Пара с точкой: центр — точка, по оси h = max(R, край пересечения габаритов пары + запас), не больше max_half. Пары без выбранной: точки ±R в кубе max_side — куб по точкам, иначе «Пара 1».
     Без пар: габарит тел в мире ≤ max_side — габарит ±R; растянутые — без выреза, подсказка; тел в мире нет — пометка.
     Сечение до выреза (сечение, ползунок, раздел) запоминается раз на сеанс и возвращается при сбросе (фильтр, строка легенды, общий обзор, выход любым путём).
     Чужое сечение поверх выреза — вырез уступлен для текущего замечания («Вырез снят · Вернуть»), камера — по телам замечания; следующее замечание режется снова. */
  // 1.0.19a М-3: фокус в сцене — AtlasShell.inScene (A-05); без него — запасная проверка на месте: холст #canvas. В обходе и легенде замечаний — свои кнопки.
  const inScene = e => { try { if (S && typeof S.inScene === 'function') return !!S.inScene(e); } catch (x) { /* */ } const t = e && e.target; return !!(t && t.closest && t.closest('#canvas')); };
  const inIssues = e => { const t = e && e.target; return !!(t && t.closest && t.closest('.iss-nav, .iss-legend')); };
  const TXI = (k, d) => { const t = ((window.ATLAS_TEXTS || {}).issues || {})[k]; return typeof t === 'string' && t ? t : d; };
  let ccfg;
  function cropCfg() {
    if (ccfg !== undefined) return ccfg;
    const a = A(); if (!a || !a.features) return null;   // движок не готов — спросить позже
    ccfg = null;
    try {
      const P = (S && typeof S.project === 'function' && S.project()) || window.ATLAS_PROJECT || {}, c = P.view && P.view.issue_crop;
      if (c && typeof c === 'object' && a.features.sectionApi && typeof a.setSection === 'function' && typeof a.sectionState === 'function') {
        const pos = v => typeof v === 'number' && isFinite(v) && v > 0;
        const steps = [...new Set(Array.isArray(c.steps_m) ? c.steps_m.filter(pos) : [])].sort((x, y) => x - y);
        const def = pos(c.default_m) ? c.default_m : (steps[Math.floor(steps.length / 2)] || 1.5);
        if (!steps.includes(def)) { steps.push(def); steps.sort((x, y) => x - y); }
        ccfg = { steps, def, pad: typeof c.pair_pad_m === 'number' && c.pair_pad_m >= 0 ? c.pair_pad_m : 0.5, maxH: pos(c.max_half_m) ? c.max_half_m : 4, maxS: pos(c.max_side_m) ? c.max_side_m : 8, maxP: pos(c.max_place_m) ? c.max_place_m : 12, gap: typeof c.place_gap_m === 'number' && c.place_gap_m >= 0 ? c.place_gap_m : 1.5, slab: pos(c.slab_m) ? c.slab_m : 0.5, auto: c.auto !== false };
      }
    } catch (e) { ccfg = null; }
    return ccfg;
  }
  const CKEY = () => { try { return S && S.storageKey ? S.storageKey('issues-crop') : null; } catch (e) { return null; } };
  function cropMem() {
    const c = cropCfg(); if (!c || cs.want !== null) return c;
    cs.want = c.auto; cs.step = c.steps.indexOf(c.def);
    try { const k = CKEY(), v = k ? JSON.parse(localStorage.getItem(k) || 'null') : null; if (v && typeof v === 'object') { if (typeof v.on === 'boolean') cs.want = v.on; const i = c.steps.indexOf(v.r); if (i >= 0) cs.step = i; } } catch (e) { /* */ }
    return c;
  }
  function cropSave() { try { const k = CKEY(); if (k) localStorage.setItem(k, JSON.stringify({ on: !!cs.want, r: cropCfg().steps[cs.step] })); } catch (e) { /* */ } }
  const cropUse = () => !!(cropMem() && cs.want);
  const eStep = () => cs.stepAuto >= 0 ? cs.stepAuto : cs.step;   // раунд 5: действующая ступень — авто (мелкое тело / место) или выбранная
  const RR = () => cropCfg().steps[eStep()];
  const nfm = v => S.fmt ? S.fmt(v) : String(v).replace('.', ',');
  const inW = id => { try { return world().has(id); } catch (e) { return false; } };
  const bnd = ids => { try { return ids.length ? A().bounds(ids) : null; } catch (e) { return null; } };
  const diag = b => b ? Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]) : -1;
  const cube = (c, h) => [[0, 1, 2].map(k => c[k] - h[k]), [0, 1, 2].map(k => c[k] + h[k])];
  const meets = (a, b) => [0, 1, 2].every(k => a[0][k] <= b[1][k] && b[0][k] <= a[1][k]);
  const pairIds = (r, i) => { const q = r && r.pairs[i]; return q ? expand([q.a, q.b].filter(Boolean)) : []; };
  // тела пары в мире: меньшее (по диагонали габарита) — выбрать, крупное — призрак
  // 1.0.12: тела по частям — габарит каждой части, расстояние от точки до габарита
  const dist = (p, b) => Math.hypot(...[0, 1, 2].map(k => Math.max(b[0][k] - p[k], 0, p[k] - b[1][k])));
  const partsB = ids => ids.map(id => ({ id, b: bnd([id]) })).filter(x => x.b);
  const nearest = (P, pt) => { let best = null, bd = Infinity; for (const x of P) { const d = pt ? dist(pt, x.b) : 0; if (d < bd) { bd = d; best = x; } } return best ? { id: best.id, b: best.b, d: bd } : null; };
  const midOf = b => [0, 1, 2].map(k => (b[0][k] + b[1][k]) / 2), halfOf = (b, R) => [0, 1, 2].map(k => (b[1][k] - b[0][k]) / 2 + R);
  const fitsP = (b, m) => !!b && [0, 1, 2].every(k => b[1][k] - b[0][k] <= m);
  // тела пары: П7 — «меньшее» по объёму габарита тела целиком, выбрать его часть у точки, крупное — призрак; ba / bb — габариты ближайших частей (контакт)
  function pairBodies(q) {
    const a = expand([q.a].filter(Boolean)).filter(inW), b = expand([q.b].filter(Boolean)).filter(inW), pa = partsB(a), pb = partsB(b), na = nearest(pa, q.pt), nb = nearest(pb, q.pt);
    const vol = b => (b[1][0] - b[0][0]) * (b[1][1] - b[0][1]) * (b[1][2] - b[0][2]);   // объём габарита части: длинная труба «меньше» стены, хотя диагональ у неё больше (АР-58)
    const wa = bnd(a), wb = bnd(b);   // раунд 4: «меньшее» — тело целиком (ИТП-06: часть стены меньше трубы, а стена целиком — нет); при равенстве — часть у точки
    const swap = !na || (!!nb && (vol(wb) < vol(wa) || (vol(wb) === vol(wa) && (vol(nb.b) < vol(na.b) || (vol(nb.b) === vol(na.b) && diag(nb.b) < diag(na.b))))));
    return { pa, pb, na, nb, ba: na && na.b, bb: nb && nb.b, small: swap ? b : a, big: swap ? a : b, sel: swap ? (nb && nb.id) : (na && na.id) };
  }
  // П6: тело пары «в кубе» — хоть одна его часть; иначе пометка с расстоянием от точки до ближайшей части
  const partIn = (P, box) => !P.length || P.some(x => meets(x.b, box));
  const farNote = d => fill(TXI('crop_far', 'ближайшая часть элемента в {d} м от точки (данные)'), { d: nfm(Math.round(d * 10) / 10) });
  // габарит для строки «Выреза нет»: X × Y (× Z) м
  const dimTxt = b => { if (!b) return ''; const d = [0, 1, 2].map(k => b[1][k] - b[0][k]), f = v => nfm(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10); return d.map(f).join(' × ') + ' м'; };
  const wideNote = b => [TXI('crop_wide', 'габарит элементов'), dimTxt(b)].filter(Boolean).join(' ');
  // тела связаны в одну группу (зазор ≤ gap по всем осям)
  function linked(P, gap) {
    if (P.length < 2) return true;
    const par = P.map((_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if ([0, 1, 2].every(k => P[i].b[0][k] <= P[j].b[1][k] + gap && P[j].b[0][k] <= P[i].b[1][k] + gap)) par[f(i)] = f(j);
    return P.every((_, i) => f(i) === f(0));
  }
  // раунд 4, п. 8: причина «выреза нет» для протяжённых тел
  function wideWhy(b, pl, n, c) {
    const lim = nfm(c.maxP) + ' м', dims = dimTxt(b);
    if (n === 1 && b) { const d = [0, 1, 2].map(k => b[1][k] - b[0][k]), k = d.indexOf(Math.max(...d)); return fill(TXI('crop_why_one', '{ax} {v} м больше порога {lim}'), { ax: k === 2 ? 'высота' : 'длина', v: nfm(Math.round(d[k] * 10) / 10), lim }) + ' · ' + dims; }
    if (pl.gLong === 1 && !pl.nCtx) return fill(TXI('crop_why_group', 'одна связная группа длиннее {lim}'), { lim }) + ' · ' + dims;
    return fill(TXI('crop_why_many', 'протяжённые элементы длиннее {lim}, компактных мест нет'), { lim }) + ' · ' + dims;
  }
  // группы мест: сортировка по x (развёртка), объединение при зазоре ≤ gap по всем осям; кэш на замечании
  function placesOf(r, all, c) {
    if (r.pl && r.pl.n === all.length) return r.pl;
    const P = partsB(all), ctx = [], sm = [];
    for (const x of P) ([0, 1, 2].some(k => x.b[1][k] - x.b[0][k] > c.maxP) ? ctx : sm).push(x);
    sm.sort((u, v) => u.b[0][0] - v.b[0][0]);
    const par = sm.map((_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    const near = (u, v) => [0, 1, 2].every(k => u.b[0][k] <= v.b[1][k] + c.gap && v.b[0][k] <= u.b[1][k] + c.gap);
    for (let i = 0; i < sm.length; i++) for (let j = i + 1; j < sm.length && sm[j].b[0][0] <= sm[i].b[1][0] + c.gap; j++) if (near(sm[i], sm[j])) par[f(i)] = f(j);
    const g = new Map(); sm.forEach((x, i) => { const k = f(i); if (!g.has(k)) g.set(k, []); g.get(k).push(x); });
    const groups = [...g.values()].map(xs => { const lo = [0, 1, 2].map(k => Math.min(...xs.map(x => x.b[0][k]))), hi = [0, 1, 2].map(k => Math.max(...xs.map(x => x.b[1][k]))); return { ids: xs.map(x => x.id), b: [lo, hi] }; });
    // раунд 4: группа длиннее max_place_m — не место, а контекст (призрак) со счётом «ещё N тел — протяжённые, вне мест»; тела не теряются
    const places = groups.filter(q => fitsP(q.b, c.maxP)).sort((u, v) => (v.b[0][2] - u.b[0][2]) || (u.b[0][1] - v.b[0][1]) || (u.b[0][0] - v.b[0][0])), long = groups.filter(q => !fitsP(q.b, c.maxP));   // сверху вниз, затем по Y, X
    const lids = long.flatMap(q => q.ids);
    return (r.pl = { n: all.length, places, ctx: ctx.map(x => x.id).concat(lids), nCtx: ctx.length, nLong: lids.length, gLong: long.length, nob: all.length - P.length });   // nob — тела без габарита (для учёта)
  }
  let placeArg = -1;
  function cropBox(r, pi, li) {
    placeArg = li == null ? -1 : li;
    const b0 = cropBox0(r, pi), ref = [...new Set(X(r).b.concat(X(r).p))];
    b0.nAll = ref.length; b0.nIn = ref.filter(inW).length;   // 1.0.12 П13: в модели N из M тел
    return b0;
  }
  function cropBox0(r, pi) {
    const c = cropCfg(), R = RR();
    const all = X(r).b.concat(X(r).p).filter(inW);
    if (r.ppt && !r.pairs.some(q => q.pt)) {   // 1.0.12: place_pt — куб по точке ±R, как A1 по одной точке
      const box = cube(r.ppt, [R, R, R]), P = partsB(all), inb = P.filter(x => meets(x.b, box)), notes = [];
      if (!all.length) notes.push(TXI('crop_none', 'элементов замечания в модели нет')); else if (!inb.length) { const nn = nearest(P, r.ppt); notes.push(farNote(nn ? nn.d : 0)); }
      const sm = inb.slice().sort((u, v) => diag(u.b) - diag(v.b));
      return { kind: 'PT', box, center: r.ppt, sel: sm.length ? sm[0].id : null, notes };
    }
    if (!all.length) return { kind: 'E', why: 'none', note: TXI('crop_none', 'элементов замечания в модели нет') };
    if (pi >= 0 && r.pairs[pi]) {
      const q = r.pairs[pi], pb = pairBodies(q);
      if (!pb.small.length) return { kind: 'P0', why: 'none', pair: pi, note: TXI('crop_pair_none', 'элементов пары в модели нет') };
      let ctr = q.pt, box;
      if (!ctr) {   // точки нет — габарит тел пары, если он компактный
        const b = bnd(pb.small.concat(pb.big)); if (!fitsP(b, c.maxP)) return { kind: 'C', why: 'wide', pair: pi, note: wideNote(b) };
        ctr = midOf(b); box = cube(ctr, halfOf(b, R));
      } else {   // П12: по каждой оси [min(pt−R, начало контакта − запас), max(pt+R, конец контакта + запас)], сторона ≤ 2·max_half, точка ±R внутри
        box = [[], []];
        for (let k = 0; k < 3; k++) {
          let lo = ctr[k] - R, hi = ctr[k] + R;
          if (pb.ba && pb.bb) {
            const il = Math.max(pb.ba[0][k], pb.bb[0][k]), ih = Math.min(pb.ba[1][k], pb.bb[1][k]);
            if (il <= ih) { lo = Math.min(lo, il - c.pad); hi = Math.max(hi, ih + c.pad); const L = 2 * c.maxH; if (hi - lo > L) { lo = Math.max(lo, ctr[k] + R - L); hi = lo + L; } }
          }
          box[0][k] = lo; box[1][k] = hi;
        }
      }
      const notes = [], outA = !partIn(pb.pa, box), outB = !partIn(pb.pb, box);
      if (outA || outB) notes.push(q.pt ? farNote(Math.max(outA && pb.na ? pb.na.d : 0, outB && pb.nb ? pb.nb.d : 0)) : TXI('crop_outside', 'элемент пары вне выреза (точка в данных)'));
      return { kind: 'pair', pair: pi, box, center: ctr, sel: pb.sel || pb.small[0], ghost: pb.big.length ? pb.big : null, notes };
    }
    const pts = r.pairs.filter(q => q.pt);
    if (pts.length) {
      const lo = [0, 1, 2].map(k => Math.min(...pts.map(q => q.pt[k])) - R), hi = [0, 1, 2].map(k => Math.max(...pts.map(q => q.pt[k])) + R);
      if ([0, 1, 2].some(k => hi[k] - lo[k] > c.maxS)) return { kind: 'A2' };   // точки разнесены — «Пара 1»
      const gh = new Set(), box = [lo, hi]; let sel = null, far = -1, none = false;
      for (const q of r.pairs) {
        const pb = pairBodies(q); if (!sel && pb.small.length) sel = pb.sel || pb.small[0]; if (pb.small.length) pb.big.forEach(id => gh.add(id));
        if (!pb.small.length) { none = true; continue; }
        if (!partIn(pb.pa, box)) far = Math.max(far, pb.na ? pb.na.d : 0); if (!partIn(pb.pb, box)) far = Math.max(far, pb.nb ? pb.nb.d : 0);
      }
      const notes = []; if (far >= 0) notes.push(farNote(far)); if (none) notes.push(TXI('crop_pair_none', 'элементов пары в модели нет'));
      return { kind: 'A1', box, center: [0, 1, 2].map(k => (lo[k] + hi[k]) / 2), sel, ghost: gh.size ? [...gh] : null, n: pts.length, notes };
    }
    const b = bnd(all);
    if (fitsP(b, c.maxP)) return { kind: 'B', box: cube(midOf(b), halfOf(b, R)), center: midOf(b), notes: [] };   // П9: порог мест — max_place_m (12 м)
    // П10 «слой»: 1–3 тела, общий габарит по одной оси ≤ slab_m — куб по габариту ±R (как «Показать срезом»)
    if (b && all.length <= 3 && [0, 1, 2].some(k => b[1][k] - b[0][k] <= c.slab) && linked(partsB(all), c.gap)) return { kind: 'S', box: cube(midOf(b), halfOf(b, R)), center: midOf(b), sel: all[0], notes: [] };   // раунд 4: слой — одна связная плоская группа
    // П8 «места»: тела со стороной > max_place_m — контекст (призрак); остальные — группы с зазором ≤ place_gap_m; группа больше max_place_m — не место
    const pl = placesOf(r, all, c);
    const acc = { all: all.length, places: pl.places.reduce((a, q) => a + q.ids.length, 0), ctx: pl.ctx.length, nob: pl.nob };   // учёт тел (отладка): места + контекст + без габарита = все
    if (!pl.places.length) return { kind: 'C', why: 'wide', note: wideWhy(b, pl, all.length, c), acc };
    // раунд 4: одно правило для мест — «место K из N» и «в кубе N из M тел»; протяжённые тела вне мест — строкой (тела не теряются)
    const L = pl.places.length, li = pi < 0 && placeArg >= 0 && placeArg < L ? placeArg : 0, P = pl.places[li], gh = pl.ctx.length ? pl.ctx : null, notes = [];
    notes.push(fill(TXI('crop_in_cube', 'в кубе {n} из {m} элементов'), { n: fmt(P.ids.length), m: fmt(all.length) }));
    if (pl.nCtx + pl.nLong) notes.push(fill(TXI('crop_long_out', 'ещё {n} элементов — протяжённые, вне мест'), { n: fmt(pl.nCtx + pl.nLong) }));   // раунд 6: все тела контекста с габаритом (длиннее max_place_m и длинные группы)
    return { kind: 'PL', rid: r.id, place: li, places: pl.places, box: cube(midOf(P.b), halfOf(P.b, R)), center: midOf(P.b), ghost: gh, sel: P.ids[0], pb: P.b, notes, acc };
  }
  const eqBox = (a, b) => !!(a && b) && [0, 1].every(i => [0, 1, 2].every(k => Math.abs(a[i][k] - b[i][k]) < 1e-9));
  const ownLive = () => { if (!cs.own) return false; try { const s = (A().sectionState() || {}).section; return !!(s && s.box && eqBox(s.box, cs.own)); } catch (e) { return false; } };
  // 1.0.14: призраки выреза не ловят щелчок ({pick:false}): щелчок по крупному телу пары выбирает тело за ним
  function ghostSet(ids) { cs.ghost = ids && ids.length ? ids : null; try { if (cs.ghost && NEW14()) V().ghost('issues-crop', cs.ghost, { pick: false }); else V().ghost('issues-crop', cs.ghost); } catch (e) { /* */ } }
  /* 1.0.14: тела в кубе, которые заслоняют выбранное тело от текущей камеры (лучи pickSurface по проекции его габарита, 3×3, два прохода сквозь новые призраки),
     — тоже призраки (крупное тело пары может и не быть заслоном: у ВК-06 п.20 трубу закрывает другая стена) */
  function occluders(sel, box) {
    if (!sel || !NEW14() || !A().pickSurface) return [];
    const t = bnd([sel]); if (!t) return [];
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < 8; i++) { let q = null; try { q = A().projectToScreen([(i & 1) ? t[1][0] : t[0][0], (i & 2) ? t[1][1] : t[0][1], (i & 4) ? t[1][2] : t[0][2]]); } catch (e) { return []; } if (!q) return []; x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    const out = new Set(), self = new Set(expand([sel]).concat([sel]));
    for (let i = 1; i <= 3; i++) for (let j = 1; j <= 3; j++) {
      let h = null; try { h = A().pickSurface(x0 + (x1 - x0) * i / 4, y0 + (y1 - y0) * j / 4, { snap: false }); } catch (e) { h = null; }
      const id = h && h.id; if (!id || self.has(id) || out.size >= 12) continue;
      const b2 = bnd([id]); if (b2 && meets(b2, box)) out.add(id);
    }
    return [...out];
  }
  function ghostOccluders() {
    if (!(on && cs.own && ownLive() && cs.info && cs.info.sel)) return;
    const base = cs.info.ghost || [], have = new Set(base), add = [];
    if ((cs.occl || []).length) ghostSet(base);   // прежние заслоны (другой кадр) — сняты, ищем заново
    for (let pass = 0; pass < 2; pass++) { const o = occluders(cs.info.sel, cs.own).filter(id => !have.has(id)); if (!o.length) break; o.forEach(id => { have.add(id); add.push(id); }); ghostSet(base.concat(add)); }
    cs.occl = add;
  }
  function cropApply(box) {
    const a = A();
    if (!cs.prev) { let st = null; try { st = a.sectionState(); } catch (e) { /* */ } cs.prev = { st, sc: scope() }; }
    cs.busy = true;
    try {
      const ax = $('sliceAxis'); if (ax && ax.value !== 'none') { ax.value = 'none'; const fl = $('r23SliceFlip'); if (fl) fl.checked = false; ax.dispatchEvent(new Event('change', { bubbles: true })); }   // ползунок режет вместе с кубом — выключить (как P9)
      cs.own = a.setSection({ box }) ? a.sectionState().section.box : null;
    } catch (e) { cs.own = null; } finally { cs.busy = false; }
    cs.yielded = null;
    document.body.classList.toggle('iss-crop', !!cs.own);
    lblMode(cs.own ? 'outside' : null);   // 1.0.15 B3-6
  }
  // сброс выреза: призрак, контур, класс; сечение и ползунок — как до первого выреза (раздел сменился — сечение без keepOnScope и ползунок не возвращаются)
  function cropRelease() {
    ghostSet(null); cs.own = null; cs.yielded = null; document.body.classList.remove('iss-crop'); lblMode(null);
    const p = cs.prev; cs.prev = null; drawBox(); restorePrev(p);
  }
  // 1.0.12: замечание без выреза в том же сеансе — свой куб снять (сечение как до выреза), prev сохраняется до сброса
  function cropUnown() {
    const had = !!cs.own; ghostSet(null); cs.own = null; cs.yielded = null; document.body.classList.remove('iss-crop'); lblMode(null); drawBox();
    if (had) restorePrev(cs.prev);
  }
  function restorePrev(p) {
    if (!p || !p.st) return;
    const a = A(), s = p.st.section, same = p.sc === scope();
    cs.busy = true;
    try {
      const cur = (a.sectionState() || {}).section, want = s && (same || p.st.keepOnScope) ? s : null;
      if (JSON.stringify(cur || null) !== JSON.stringify(want)) a.setSection(want ? (want.box ? { box: want.box } : { axis: want.axis, value: want.value, flip: !!want.flip }) : null, p.st.keepOnScope ? { keepOnScope: true } : undefined);
      const sl = p.st.slider, ax = $('sliceAxis');
      if (same && sl && sl.axis && ax) { ax.value = String('xyz'.indexOf(sl.axis)); const v = $('sliceValue'); if (v) v.value = String(sl.value); const fl = $('r23SliceFlip'); if (fl) fl.checked = !!sl.flip; ax.dispatchEvent(new Event('change', { bubbles: true })); }
    } catch (e) { /* */ } finally { cs.busy = false; }
  }
  // 1.0.12 П11: мелкий узел — кадр по пересечению куба с (тело ± max(0,6 м; 2 диагонали)); куб остаётся ±R; R задан пользователем (−/+) — кадр по кубу
  function smallFrame(box, id) {
    if (!id || cs.userR) return null;
    const t = Array.isArray(id) ? id : bnd([id]); if (!t) return null;   // раунд 4: место — по своему габариту
    const d = diag(t), side = Math.min(...[0, 1, 2].map(k => box[1][k] - box[0][k]));
    if (!(d < 0.15 * side)) return null;
    const m = Math.max(0.6, 2 * d), f = [[0, 1, 2].map(k => Math.max(box[0][k], t[0][k] - m)), [0, 1, 2].map(k => Math.min(box[1][k], t[1][k] + m))];
    return [0, 1, 2].every(k => f[0][k] < f[1][k]) ? f : null;
  }
  /* 1.0.14: свободная часть холста — отступы (px) от панелей поверх холста: верхние панели сцены, плашка «Закрыт окружением», легенда, плашка обхода с рядом выреза,
     нижняя панель инструментов, кнопки масштаба, на телефоне — шторки. Движок 1.0.14 вписывает в неё (fit {insets}); без него — весь холст, как в 1.0.13. */
  const NEW14 = () => { try { return !!(V() && typeof V().ghostNoPick === 'function'); } catch (e) { return false; } };
  const OVER = '.stage-path, .stage-actions, .atb-tr, .atb-view, .view-controls, .card-occl, .iss-legend, .iss-nav, .tools, .zoom-controls, #atbIssues, #right.open';
  // 1.0.15 B3-6 (L2): в вырезе подпись выбранного — движок, над верхним краем куба (labelsOverride('outside')); подпись куба (.iss-box-lbl) — под кубом. Место под обе — в отступах кадра выреза (o.lbl)
  const lblOn = () => { try { return !!(A().labelsOverride && A().labelsOverride() === 'outside'); } catch (e) { return false; } };
  const lblMode = m => { try { const a = A(); if (a && a.features && a.features.labelsOverride && a.labelsOverride && a.labelsOverride() !== (m || null)) a.labelsOverride(m || null); } catch (e) { /* */ } };
  function lblNeed() {   // плашка подписи выбранного, как её рисует движок (r23Overlay, 'outside'): шрифт 600 13px, перенос по словам в maxWidth − 16, до 3 строк, строка 17, +10, «N замечаний» +22; над кубом — зазор 12
    let lo = false; try { lo = !!(A().features && A().features.labelsOverride); } catch (e) { /* */ } if (!lo || !cs.own) return { top: 0, bottom: 0, tw: 0, th: 0 };
    let id = null; try { id = A().selection(); } catch (e) { id = null; }
    const bottom = cropWhere() ? 26 : 0; if (!id) return { top: 0, bottom, tw: 0, th: 0 };
    const rc = ((((window.ATLAS_REMARKS || {}).by_element) || {})[id] || []).length; let nm = '';
    try { const o = F() && F().selected(); nm = String((o && typeof window.atlasDisplayName === 'function' && window.atlasDisplayName(o)) || (o && o.name) || 'Без названия').trim(); } catch (e) { /* */ }
    const cv = $('canvas'), mw = Math.min(300, (cv ? cv.clientWidth : 800) - 24); let lines = 1, tw = mw;
    try { const c2 = lblNeed.c || (lblNeed.c = document.createElement('canvas').getContext('2d')); c2.font = '600 13px "Golos Text",system-ui'; const L = []; let row = '';
      for (const w of nm.split(/\s+/)) { const nx = row ? row + ' ' + w : w; if (row && c2.measureText(nx).width > mw - 16) { L.push(row); row = w; } else row = nx; } if (row) L.push(row);
      lines = Math.max(1, Math.min(3, L.length)); c2.font = '500 12px "Golos Text",system-ui'; const rw = rc ? c2.measureText(String(rc) + ' замечаний').width + 22 : 0; c2.font = '600 13px "Golos Text",system-ui'; tw = Math.min(mw, Math.max(rw, ...L.slice(0, 3).map(s => c2.measureText(s).width)) + 16); } catch (e) { /* */ }
    const th = lines * 17 + 10 + (rc ? 22 : 0);
    return { top: th + 12 + 4, bottom, tw, th };
  }
  // прямоугольники панелей поверх холста (px холста) и предсказанная плашка движка над кубом
  function panelRects(R) { const out = []; for (const el of document.querySelectorAll(OVER)) { if (el.hidden || !el.getClientRects().length) continue; const s0 = getComputedStyle(el); if (s0.display === 'none' || s0.visibility === 'hidden') continue; const q = el.getBoundingClientRect(); if (q.width && q.height) out.push([q.left - R.left, q.top - R.top, q.right - R.left, q.bottom - R.top]); } return out; }
  function lblRect(ref) {   // ref — прямоугольник, от которого считаются координаты (холст или .stage)
    const cv = $('canvas'); if (!cv || !cs.own) return null; const N = lblNeed(); if (!N.th) return null; let id = null; try { id = A().selection(); } catch (e) { return null; } const t = id && bnd([id]); if (!t) return null;
    const R = ref || cv.getBoundingClientRect(), b = cs.own; let y0 = Infinity; for (let i = 0; i < 8; i++) { const s = A().projectToScreen([(i & 1) ? b[1][0] : b[0][0], (i & 2) ? b[1][1] : b[0][1], (i & 4) ? b[1][2] : b[0][2]]); if (!s || !isFinite(s[1])) return null; y0 = Math.min(y0, s[1] - R.top); }
    const c = A().projectToScreen([0, 1, 2].map(k => (t[0][k] + t[1][k]) / 2)); if (!c) return null; const cx = c[0] - R.left, w = R.width, left = Math.min(w - N.tw - 4, Math.max(4, cx - N.tw / 2)), top = y0 - N.th - 12;
    return [left, top, left + N.tw, top + N.th];
  }
  function freeInsets(o) {
    const cv = $('canvas'); if (!cv || !NEW14()) return null; const R = cv.getBoundingClientRect(); if (!R.width || !R.height) return null;
    const ins = { top: 0, right: 0, bottom: 0, left: 0 }, m = 8;
    for (const el of document.querySelectorAll(OVER)) {
      if (o && o.skip && o.skip(el)) continue;
      if (o && o.chipLeft && el.id === 'atbIssues') { const q0 = el.getBoundingClientRect(); if (q0.width && q0.width < 0.25 * R.width && q0.right > R.left && q0.left < R.right) { ins.left = Math.max(ins.left, q0.right - R.left + m); continue; } }   /* 1.0.16 B3-15 (B2): ландшафт — узкий чип «Замечания» слева сверху — левый отступ, не верхний */
      if (el.hidden || !el.getClientRects().length) continue; const cs0 = getComputedStyle(el); if (cs0.visibility === 'hidden' || cs0.display === 'none') continue;
      const q = el.getBoundingClientRect(), x0 = Math.max(q.left, R.left), x1 = Math.min(q.right, R.right), y0 = Math.max(q.top, R.top), y1 = Math.min(q.bottom, R.bottom);
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;   // не над холстом (правая панель на ПК — своя колонка)
      const cy = (y0 + y1) / 2, cx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0, tall = h > 0.5 * R.height || (w < 0.25 * R.width && h > w && (x0 - R.left < 24 || R.right - x1 < 24));   // узкая колонка у края (кнопки масштаба) — боковой отступ
      if (!tall && cy < R.top + 0.45 * R.height) ins.top = Math.max(ins.top, y1 - R.top + m);
      else if (!tall && cy > R.top + 0.55 * R.height) ins.bottom = Math.max(ins.bottom, R.bottom - y0 + m);
      else if (cx > R.left + 0.5 * R.width) ins.right = Math.max(ins.right, R.right - x0 + m);
      else ins.left = Math.max(ins.left, x1 - R.left + m);
    }
    const cut = (a, b, L) => { const s0 = a + b, lim = 0.65 * L; return s0 > lim ? [a * lim / s0, b * lim / s0] : [a, b]; };   // свободно не меньше 35 % по каждой оси
    [ins.top, ins.bottom] = cut(ins.top, ins.bottom, R.height); [ins.left, ins.right] = cut(ins.left, ins.right, R.width);
    for (const k in ins) ins[k] = Math.round(ins[k]);
    if (o && o.lbl) {   // 1.0.15 B3-6: полоса над кубом под подпись движка, под кубом — под подпись куба; только если свободно остаётся не меньше 35 % (иначе куб зашёл бы под панели и шторку)
      const L = lblNeed(), lim = 0.65 * R.height; let t = 0, b = 0;
      if (ins.top + ins.bottom + L.top + L.bottom <= lim) { t = L.top; b = L.bottom; } else if (ins.top + ins.bottom + L.top <= lim) t = L.top;
      ins.top += t; ins.bottom += b; cs.lblRes = { top: t, bottom: b, need: L.top };
    }
    return ins;
  }
  // 1.0.15 B3-5 (L6): телефон — «вписать всё» (первый кадр, «Вписать», Home, ракурсы) в свободную часть холста (__ATLAS.setFitInsets, E1-5): верх — низ чипов и панелей, низ — сводка или шторка поверх холста;
  // шторку карточки, о которой движок знает (AtlasSheet, sheetOffsetY), не считаем; бока — 0; ПК — без отступов (кадр прежний). Сцена не сдвигается (R3-04)
  function fitAllInsets() {
    if (!phoneMQ.matches) return null;
    const cv = $('canvas'), land = !!(cv && cv.clientWidth > cv.clientHeight);   /* 1.0.16 B3-15 (B2): ландшафт — #right правой колонкой: бока из freeInsets, чип — левым отступом; правую колонку не пропускать и при открытой шторке */
    if (land) { const ins = freeInsets({ chipLeft: true }); return ins && (ins.top || ins.bottom || ins.left || ins.right) ? { top: ins.top, right: ins.right, bottom: ins.bottom, left: ins.left } : null; }
    const sh = window.AtlasSheet, known = !!(sh && sh.height > 0 && sh.state && sh.state !== 'closed'), ins = freeInsets(known ? { skip: el => el.id === 'right' } : null);
    return ins && (ins.top || ins.bottom) ? { top: ins.top, right: 0, bottom: ins.bottom, left: 0 } : null;
  }
  { const reg = () => { try { const a = A(); if (a && a.features && a.features.fitInsetsProvider && a.setFitInsets) { a.setFitInsets(fitAllInsets); return true; } } catch (e) { /* */ } return false; }; if (!reg()) document.addEventListener('atlas:ready', reg, { once: true }); }
  // 1.0.15 B3-5b: «вписать всё» с отступами — с первого кадра. Движок вписывает первый кадр при запуске (по метаданным), раньше этого модуля, —
  // кадр с отступами ставится синхронно в первом atlas:sceneready (частичном или полном), до первой отрисовки с геометрией. Затем «Вписать» повторяется при смене отступов
  // (сводка, чипы), только пока камера та, что дал последний такой «Вписать»: любая смена камеры кодом (restoreView, focus, fitIds) или жест — автоповтор снят насовсем.
  // Без адреса вида, элемента, замечаний; окно — 20 с от готовности сцены; вход и выход «Замечаний» тоже снимают (возврат камеры B3-2b не перебивается)
  // 1.0.15 r5: команды камеры — restoreView, fit, fitIds, focus, camera, jump (API движка __ATLAS и __R24/__R23), щелчок «Вписать», ракурсы, «К элементу», смена адреса —
  // снимают автоповтор «Вписать» (B3-5) и охрану возврата камеры (B3-2b). Свои вызовы модуля — под camOwn (не снимают)
  const camStops = new Set(); let camSelf = 0;
  const camCmd = () => { if (camSelf) return; for (const f of [...camStops]) { try { f(); } catch (e) { /* */ } } };
  const CM = window.__ATLAS_CAMCMD || null; if (CM) CM.cb = () => camCmd();   /* r5 (B3-5d): счётчик команд камеры с начала страницы — atlas-status.js */
  const camOwn = f => { camSelf++; if (CM) CM.self = (CM.self || 0) + 1; try { return f(); } finally { camSelf--; if (CM) CM.self--; } };
  function camWrap() { for (const o of [window.__ATLAS, window.__R24]) { if (!o) continue; for (const k of ['restoreView', 'restoreViewAsync', 'fit', 'fitIds', 'focus', 'camera', 'jump']) { const f = o[k]; if (typeof f !== 'function' || f.__b3cam) continue; const g = function () { camCmd(); return f.apply(this, arguments); }; g.__b3cam = 1; try { o[k] = g; } catch (e) { /* */ } } } }
  camWrap(); document.addEventListener('atlas:ready', camWrap); document.addEventListener('atlas:sceneready', camWrap);
  document.addEventListener('click', e => { const t = e.target && e.target.closest && e.target.closest('#fit, [data-view], #fitElement, #focusSelected'); if (t) camCmd(); }, true);
  addEventListener('hashchange', camCmd);
  let fitAutoOff = () => {};
  { const h0 = String(location.hash || ''), deep = /(^|[#&])(view|id|issues|node)=/.test(h0) || /(^|[#&])issues($|&)/.test(h0); let dead = deep || !!(window.__ATLAS_CAMCMD && window.__ATLAS_CAMCMD.n > 0), last = '', t = 0, autoCam = null, cam0 = null, t0 = 0, ro = null;
    const EV = ['pointerdown', 'wheel', 'keydown'], camNow = () => { try { return window.__R24.capture().camera; } catch (e) { return null; } };
    const stop = () => { if (dead) return; dead = true; clearTimeout(t); EV.forEach(e => removeEventListener(e, stop, true)); if (ro) ro.disconnect(); };
    fitAutoOff = stop; EV.forEach(e => addEventListener(e, stop, true)); camStops.add(stop);   /* r5: команда камеры — снять */
    document.addEventListener('atlas:camera', () => { if (!dead && !autoCam && !cam0) cam0 = camNow(); });   /* r5: камера первой отрисовки — до первого «Вписать» её сменил жест или код — автоповтора нет */
    const key = () => { try { const i = fitAllInsets(); return i ? [i.top, i.right, i.bottom, i.left].join(':') : ''; } catch (e) { return ''; } };   /* 1.0.16 B3-15: и бока (ландшафт) */
    const ok = () => { if (dead) return false; if (on || !phoneMQ.matches) return false; if (autoCam && !camSame(camNow(), autoCam)) { stop(); return false; } if (!autoCam && cam0 && !camSame(camNow(), cam0)) { stop(); return false; } if (t0 && performance.now() - t0 > 20000) { stop(); return false; } return true; };
    const fitNow = k => { try { const a = A(); if (!a || (a.selection && a.selection())) return; const f = $('fit'); if (!f) return; last = k; camOwn(() => f.click()); autoCam = camNow(); } catch (e) { /* */ } };
    const now = () => { if (!ok()) return; const k = key(); if (k && k !== last) fitNow(k); };   // синхронно — до следующей отрисовки
    const re = () => { clearTimeout(t); t = setTimeout(now, 120); };
    if (!dead) {
      document.addEventListener('atlas:sceneready', e => { if (!t0 && !(e.detail && e.detail.partial)) t0 = performance.now(); obs(); now(); });
      document.addEventListener('atlas:ready', () => { obs(); now(); });
      const obs = () => { if (dead || !window.ResizeObserver) return; if (!ro) ro = new ResizeObserver(re); for (const el of document.querySelectorAll('#right, #atbIssues, .tools, .stage-actions')) ro.observe(el); if (stage) ro.observe(stage); };
      obs();
    }
  }
  function fitB(bounds) { cs.lastFit = performance.now(); const ins = freeInsets({ lbl: true }); if (cs.own) { const q = cs.lblRes; lblMode(q && q.need && !q.top ? 'off' : 'outside'); } A().fit([{ bounds }], ins ? { insets: ins } : undefined);
    if (cs.own && lblOn()) { const L = lblRect(), cv = $('canvas'); if (L && cv) { const R = cv.getBoundingClientRect(); if (L[1] < 50 || panelRects(R).some(o => L[0] < o[2] && L[2] > o[0] && L[1] < o[3] && L[3] > o[1])) lblMode('off'); } }   // плашка зашла бы под панель — на время выреза подписи нет
  }   // 1.0.15 B3-6: над кубом нет места под подпись — на время выреза подписи нет ('off')
  // кадр П11 не ближе того, при котором куб целиком в свободной части холста: рамка — между кадром по телу (t = 0) и кубом (t = 1), наименьшее t, при котором проекция куба в ней
  function cubeInView(box) {
    const cv = $('canvas'); if (!cv) return true; const r = cv.getBoundingClientRect(), m = 4, ins = freeInsets({ lbl: true }) || { top: 0, right: 0, bottom: 0, left: 0 };
    for (let i = 0; i < 8; i++) { let s = null; try { s = A().projectToScreen([(i & 1) ? box[1][0] : box[0][0], (i & 2) ? box[1][1] : box[0][1], (i & 4) ? box[1][2] : box[0][2]]); } catch (e) { return true; } if (!s || s[0] < r.left + ins.left + m - 6 || s[0] > r.right - ins.right - m + 6 || s[1] < r.top + ins.top + m - 6 || s[1] > r.bottom - ins.bottom - m + 6) return false; }
    return true;
  }
  // кадр по кубу, а куб всё равно выходит за холст (высокий куб, шторка телефона) — рамка шире от центра куба, пока куб не войдёт (до ×3)
  function fitCube(box, ids) {
    fitBox(box, ids); if (cubeInView(box)) return null;
    const c = midOf(box), h = [0, 1, 2].map(k => (box[1][k] - box[0][k]) / 2), at = f => [c.map((v, k) => v - h[k] * f), c.map((v, k) => v + h[k] * f)];
    let lo = 1, hi = 3; try { fitB(at(hi)); } catch (e) { return null; } if (!cubeInView(box)) return at(hi);
    for (let n = 0; n < 8; n++) { const f = (lo + hi) / 2; try { fitB(at(f)); } catch (e) { break; } if (cubeInView(box)) hi = f; else lo = f; }
    const fr = at(hi); fitBox(fr, ids); return fr;
  }
  function fitFrame(box, frame, ids) {
    if (!frame) { cs.frame = fitCube(box, ids); return; }
    const at = t => [0, 1].map(i => [0, 1, 2].map(k => frame[i][k] + (box[i][k] - frame[i][k]) * t));
    try { fitB(frame); } catch (e) { fitBox(box, ids); return; }
    if (cubeInView(box)) return;
    let lo = 0, hi = 1;
    for (let n = 0; n < 9; n++) { const t = (lo + hi) / 2; try { fitB(at(t)); } catch (e) { break; } if (cubeInView(box)) hi = t; else lo = t; }
    if (hi >= 1) { cs.frame = fitCube(box, ids); return; }
    cs.frame = at(hi); fitBox(cs.frame, ids);
  }
  function fitBox(box, ids) { try { fitB(box); } catch (e) { if (ids) fitTo(ids); } }
  // показ замечания (pi < 0) или пары с вырезом
  function cropShow(r, pi, li) {
    cs.stepAuto = -1; cs.userCam = false;
    let b = cropBox(r, pi, li);
    if (b.kind === 'A2') { pairIdx = 0; b = cropBox(r, 0); renderNav(); }   // разнесённые точки — сразу «Пара 1»
    // раунд 5 (решение координатора, вариант «б»): мелкое тело пары или место (диагональ < 0,15 стороны куба) — стартовая ступень наименьшая (0,75 м); R задан вручную (−/+) — не трогать; в память не пишется
    if (b.box && !cs.userR && (b.kind === 'pair' || b.kind === 'A1' || b.kind === 'PL') && eStep() > 0) {
      const ts = [b.kind === 'PL' ? b.pb : null, b.sel ? bnd([b.sel]) : null].filter(Boolean), side = Math.min(...[0, 1, 2].map(k => b.box[1][k] - b.box[0][k]));   // место целиком или выбранное в нём тело
      if (ts.some(t => diag(t) < 0.15 * side)) { cs.stepAuto = 0; b = cropBox(r, b.kind === 'pair' ? b.pair : pi, b.kind === 'PL' ? b.place : li); }
    }
    const plNew = b.kind === 'PL' && (placeIdx !== b.place || !(cs.info && cs.info.kind === 'PL' && cs.info.rid === b.rid));
    cs.info = b;
    if (b.kind === 'PL') { placeIdx = b.place; if (plNew) renderNav(); } else placeIdx = -1;   // места — сразу «Место 1», список в плашке
    if (!cs.prev) { let st0 = null; try { st0 = A().sectionState(); } catch (e) { /* */ } cs.prev = { st: st0, sc: scope() }; }   // до выбора тела: смена выбора снимает срез P9 карточки — он тоже «до входа»
    const ids = b.kind === 'PL' ? b.places[b.place].ids : pi >= 0 || b.kind === 'pair' || b.kind === 'P0' ? pairIds(r, b.pair != null ? b.pair : pi) : X(r).b.concat(X(r).p);
    let first = b.sel || ids.find(inW);
    // в вырезе — только тело, пересекающее куб, и не призрак (выбранное тело плотное и закрыло бы узел): тело вне куба движок «показывает» и уводит камеру (ЭЛ-03 на 390); такого нет — выбор снят
    const inCube = id => { const t = bnd([id]); return !!(t && meets(t, b.box)); }, gh = new Set(b.ghost || []);
    if (b.box && first && !inCube(first)) first = ids.find(id => !gh.has(id) && inW(id) && inCube(id)) || null;
    try { if (first) { A().select(first); pairPart(r, b.pair != null ? b.pair : pi, first); } else if (window.AtlasPrototype && window.AtlasPrototype.deselect) window.AtlasPrototype.deselect(); } catch (e) { /* тело не в сцене */ }   // 1.0.12 П3: тел нет — чужой выбор и карточка не остаются
    if (b.box) { cropApply(b.box); ghostSet(b.ghost); cs.frame0 = cs.frame = smallFrame(b.box, b.kind === 'PL' ? b.pb : first); fitFrame(b.box, cs.frame, ids); cs.shown = performance.now(); cs.drawnAt = 0; cs.occl = null; { const s0 = sess; setTimeout(() => { if (s0 === sess) { refitIfOut(); ghostOccluders(); } }, 450); } setTimeout(schedulePts, 420); }
    else { cropUnown(); if (ids.some(inW)) fitTo(ids); else { const f = $('fit'); if (f) f.click(); } }
    renderCrop(); schedulePts(); setTimeout(schedulePts, 350);
  }
  // «Вырез» / C, −/+ / [ ], «Вернуть»
  function cropGo() {
    if (!on || idx < 0) return;
    const r = list[idx];
    if (cs.want) cropShow(r, pairIdx, placeIdx);
    else {   // «Вся модель» — ровно 1.0.10: без куба и призрака, выбор и кадр по телам
      cropRelease(); cs.info = null;
      const ids = pairIdx >= 0 ? pairIds(r, pairIdx) : X(r).b.concat(X(r).p), first = pairIdx >= 0 ? ids.find(inW) : (X(r).b.find(inW) || X(r).p.find(inW));
      try { if (first) { A().select(first); pairPart(r, pairIdx, first); } } catch (e) { /* */ }
      fitTo(ids); renderCrop();
    }
    renderPoints(); hashSync();
  }
  function cropAct(act) {
    const c = cropMem(); if (!c) return;
    if (act === 'crop') { cs.want = !cs.want; cropSave(); cropGo(); }
    else if (act === 'minus' || act === 'plus') { const n = eStep() + (act === 'plus' ? 1 : -1); if (n < 0 || n >= c.steps.length) return; cs.step = n; cs.stepAuto = -1; cs.userR = true; cropSave(); if (cs.want) cropGo(); else renderCrop(); }
    else if (act === 'back') cropGo();
    else if (act === 'link') copyLink();
    else if (act === 'plprev' || act === 'plnext' || act === 'plfirst' || act === 'pllast') placeStep(act);
    else if (act === 'pllist') { cs.plOpen = !cs.plOpen; renderNav(); if (cs.plOpen) { const sel = nav.querySelector('.iss-pairs [aria-pressed="true"]'); if (sel) try { sel.focus({ preventScroll: true }); } catch (e) { /* */ } } }
    else if (act === 'cut') { try { if (window.AtlasCard && window.AtlasCard.cut) window.AtlasCard.cut(); } catch (e) { /* */ } renderCrop(); }   // 1.0.12 П1/П2: «Срез по телу» / «Убрать» — P9 выбранного тела
  }
  function placeStep(act) {
    if (idx < 0 || !cs.info || cs.info.kind !== 'PL') return false;
    const n = cs.info.places.length, k = cs.info.place, t = act === 'plprev' ? k - 1 : act === 'plnext' ? k + 1 : act === 'plfirst' ? 0 : n - 1;
    if (t === k) { if (cs.own && ownLive()) refitBox(); return true; }   // уже на месте (Home вписал всё здание) — кадр снова по кубу
    if (t < 0 || t >= n) return true;
    pickPlace(list[idx], t); return true;
  }
  function copyLink() {
    hashSync();
    const u = location.href, done = ok => { try { V().toast(ok ? TXI('crop_copied', 'Ссылка на место скопирована') : u); } catch (e) { /* */ } };
    const old = () => { try { const t = make('textarea', { readonly: '', style: 'position:fixed;left:-9999px;opacity:0' }); t.value = u; document.body.append(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; } };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(u).then(() => done(true), () => done(old())); return; } } catch (e) { /* */ }
    done(old());
  }
  // адрес по осям здания (ATLAS_PROJECT.axes → AtlasBuildingAxes.axes); осей нет — адреса нет
  function addrOf(p) {
    const AX = window.AtlasBuildingAxes && window.AtlasBuildingAxes.axes; if (!Array.isArray(AX) || !p) return '';
    const list = d => AX.filter(a => a && a.direction === d && Number.isFinite(Number(a.metres))).map(a => ({ l: String(a.label), m: Number(a.metres) })).sort((x, y) => x.m - y.m);
    const one = (v, ax) => {
      if (!ax.length) return null;
      const e = ax.find(a => Math.abs(a.m - v) < 0.05); if (e) return e.l;
      if (v < ax[0].m) return 'за ' + ax[0].l; if (v > ax[ax.length - 1].m) return 'за ' + ax[ax.length - 1].l;
      return ax.filter(a => a.m < v).pop().l + '–' + ax.find(a => a.m > v).l;
    };
    const x = one(p[0], list('X')), y = one(p[1], list('Y'));
    return x && y ? 'оси ' + x + ' / ' + y : '';
  }
  const elev = z => Math.abs(z) < 0.0005 ? '0,000' : (z > 0 ? '+' : '−') + Math.abs(z).toFixed(3).replace('.', ',');
  function cropWhere() {
    const b = cs.info; if (!b || !b.box) return '';
    const w = b.kind === 'pair' ? 'у пары ' + (b.pair + 1) : b.kind === 'A1' ? 'у точек коллизии · ' + fmt(b.n) : b.kind === 'PL' ? fill(TXI('place_of', 'место {n} из {m}'), { n: b.place + 1, m: fmt(b.places.length) }) : b.kind === 'S' ? TXI('crop_slab', 'по плите') : b.kind === 'PT' ? TXI('crop_place_pt', 'у точки места') : 'у элементов замечания';
    if (b.kind === 'S') return [w, TXI('crop_slab_nopt', 'место в данных не задано')].join(' · ');   // раунд 4: центр плиты — не место замечания; адрес — только по place_pt
    return [w, addrOf(b.center), b.center ? 'отм. ' + elev(b.center[2]) : ''].filter(Boolean).join(' · ');
  }
  // «По этажу»: тела замечания (пары) не в сцене уровня
  function levelNote() {
    try {
      const r = idx >= 0 ? list[idx] : null; if (!r || !A().level || !A().level() || !A().inScene) return '';
      const ids = cs.info && cs.info.pair != null ? pairIds(r, cs.info.pair) : X(r).b.concat(X(r).p);
      return ids.length && !ids.some(id => A().inScene(id)) ? TXI('crop_level', 'элементы на другом уровне') : '';
    } catch (e) { return ''; }
  }
  // 1.0.12 П13: в модели только часть тел замечания
  const countNote = b => b && b.nIn > 0 && b.nIn < b.nAll ? fill(TXI('crop_count', 'в модели {n} из {m} элементов'), { n: fmt(b.nIn), m: fmt(b.nAll) }) : '';
  const fill = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => o[k] != null ? o[k] : m);
  // состояние ряда: all — «Вся модель», live — куб стоит, off — уступлен чужому сечению, na — выреза нет, cut — выреза нет, стоит срез по телу (P9)
  function cropState0() {
    const b = cs.info;
    if (!cs.want) return 'all';
    if (cs.yielded) return 'off';
    if (b && !b.box) { let sec = null; try { sec = (A().sectionState() || {}).section; } catch (e) { /* */ } return sec && sec.box && window.AtlasCard && window.AtlasCard.cutOn && window.AtlasCard.cutOn() ? 'cut' : 'na'; }
    return 'live';
  }
  function cropStatus() {
    const b = cs.info, st = cropState0();
    if (st === 'all') return TXI('crop_all', 'Вся модель');
    if (st === 'off') return [TXI('crop_yielded', 'Вырез снят'), levelNote()].filter(Boolean).join(' · ');
    if (!b) return '';
    if (st === 'cut') return TXI('crop_cut', 'Вырез по элементу');   /* 1.0.19a (словарь, строки 1 и 12): не «срез», не «тело» */
    if (st === 'na') return [b.note, countNote(b), levelNote()].filter(Boolean).join(' · ');
    return [cropWhere(), countNote(b)].concat((b.notes || []).filter(x => !isMore(x))).filter(Boolean).join(' · ');
  }
  const isMore = x => /протяжённые, вне мест/.test(x) || x === fill(TXI('crop_long_out', 'ещё {n} элементов — протяжённые, вне мест'), { n: '' });   // раунд 6: «ещё N тел…» — своей строкой под статусом (без многоточия)
  function cropRow() {
    const c = cropMem(), st = cropState0(), off = st === 'off', na = st === 'na' || st === 'cut';
    const row = make('div', { class: 'iss-crop' + (off ? ' iss-crop--off' : st === 'na' ? ' iss-crop--na' : st === 'cut' ? ' iss-crop--cut' : ''), 'data-state': st === 'live' || st === 'all' ? null : st, role: 'group', 'aria-label': TXI('crop_group', 'Вырез у замечания') });
    const B = (act, ic, t, title, extra) => { const b = make('button', Object.assign({ type: 'button', class: 'iss-crop-b', 'data-act': act, 'data-fk': 'c:' + act, title, 'aria-label': title }, extra || {})); if (ic) b.append(icon(ic)); b.append(make('span', { class: 'iss-crop-t' }, t)); b.onclick = () => cropAct(act); return b; };
    const R = RR();
    row.append(
      B('crop', 'bbox', TXI('crop_btn', 'Вырез'), TXI('crop_btn_title', 'Вырез у замечания') + ' (C)', { 'aria-pressed': String(!!cs.want && !na), 'aria-description': na ? TXI('crop_na_aria', 'вырез включён в настройках, для этого замечания недоступен') : null }),   // 1.0.12: выреза нет — не «нажата»
      B('minus', null, '−', 'Меньше вырез ([)', { disabled: na || eStep() <= 0 ? '' : null }),   // 1.0.12 П1: выреза нет — «−/+» неактивны
      make('span', { class: 'iss-crop-r', title: 'Половина стороны куба' }, '±' + nfm(R) + ' м'),
      B('plus', null, '+', 'Больше вырез (])', { disabled: na || eStep() >= c.steps.length - 1 ? '' : null }),
      B('link', 'copy-link', TXI('crop_link', 'Ссылка'), 'Скопировать ссылку на это место'));
    // раунд 4, п. 4: места — «‹ K / N ›» в ряду (PageUp / PageDown, Alt+← / →, Home / End)
    if (cs.want && cs.info && cs.info.kind === 'PL' && cs.info.rid === (idx >= 0 ? list[idx].id : null)) {
      const n = cs.info.places.length, k = cs.info.place;
      const pg = make('span', { class: 'iss-crop-pl', role: 'group', 'aria-label': fill(TXI('place_of', 'место {n} из {m}'), { n: k + 1, m: fmt(n) }) });
      pg.append(B('plprev', 'chevron-left', '‹', TXI('place_prev', 'Предыдущее место') + ' (PageUp)', { disabled: k <= 0 ? '' : null }), make('span', { class: 'iss-crop-pln' }, fmt(k + 1) + ' / ' + fmt(n)), B('plnext', 'chevron-right', '›', TXI('place_next', 'Следующее место') + ' (PageDown)', { disabled: k >= n - 1 ? '' : null }),
        B('pllist', 'menu', TXI('places_list', 'Список мест'), TXI('places_list', 'Список мест') + ' (Enter)', { 'aria-expanded': String(!!cs.plOpen), 'aria-pressed': String(!!cs.plOpen) }));
      row.append(pg); row.tabIndex = 0;   // раунд 6: Enter на ряду раскрывает список мест
    }
    const sp = make('span', { class: 'iss-crop-s', 'aria-live': 'polite' });
    if (st === 'na') sp.append(make('b', { class: 'iss-crop-why' }, TXI('crop_na', 'Выреза нет:')), document.createTextNode(' '));
    sp.append(document.createTextNode(cropStatus()));
    if (off) { const bk = make('button', { type: 'button', class: 'iss-crop-back', 'data-fk': 'c:back' }, TXI('crop_back', 'Вернуть')); bk.onclick = () => cropAct('back'); sp.append(bk); }
    const canCut = () => { try { return !!(cs.info && cs.info.why !== 'none' && F() && F().selected() && window.AtlasCard && window.AtlasCard.cutReady && window.AtlasCard.cutReady()); } catch (e) { return false; } };   // тела нет / выбор снят — «Среза по телу» нет
    // «Срез по телу» (выреза нет) / «Убрать» (срез по телу стоит) — ссылка в строке (.iss-crop-act, CSS D)
    if (st === 'na' && canCut() || st === 'cut') { sp.append(document.createTextNode(st === 'cut' ? ' · ' : ' ')); const a = make('button', { type: 'button', class: 'iss-crop-act', 'data-fk': 'c:cut' }, st === 'cut' ? TXI('crop_cut_off', 'Убрать') : TXI('crop_cut_on', 'Показать с вырезом')); a.onclick = () => cropAct('cut'); sp.append(a); }
    sp.title = sp.textContent;
    row.append(sp);
    { const more = st === 'live' && cs.info && (cs.info.notes || []).find(isMore); if (more) row.append(make('span', { class: 'iss-crop-s iss-crop-s--more' }, more)); }
    return row;
  }
  // 1.0.12 П4: выбрано замечание и вырез включён — легенда свёрнута (body.iss-one), есть куб или нет; iss-crop — только при живом кубе (метки, контур)
  const syncOne = () => document.body.classList.toggle('iss-one', !!(on && idx >= 0 && cropCfg() && cs.want));
  function renderCrop() {
    syncOne();
    const old = nav.querySelector('.iss-crop');
    if (!(on && idx >= 0 && cropCfg())) { if (old) old.remove(); return; }
    const fk = fkOf(nav), row = cropRow();
    if (old) old.replaceWith(row); else { const nr = nav.querySelector('.iss-navrow'); if (nr) nr.after(row); else nav.prepend(row); }
    refocus(nav, fk);
  }
  // контур куба: 12 рёбер через projectToScreen, углы на 1 мм внутрь; подпись — у верхнего угла
  const SVGNS = 'http://www.w3.org/2000/svg';
  const obsSeen = new WeakSet(), obsRO = window.ResizeObserver ? new ResizeObserver(() => { if (on && cs.own) schedulePts(); }) : null;   // раунд 4: панели сцены меняют размер — подпись куба переставить
  let boxSvg = null, boxLbl = null;
  function drawBox() {
    if (!cs.own && !boxSvg) return false;
    const live = !!(on && stage && ownLive());
    if (!live && on && cs.own && !cs.yielded && !cs.busy) queueMicrotask(onSection);   // куб сменён без события
    if (!live) { if (boxSvg) boxSvg.remove(); if (boxLbl) boxLbl.remove(); return false; }
    if (!boxSvg) { boxSvg = document.createElementNS(SVGNS, 'svg'); boxSvg.setAttribute('class', 'iss-box'); boxSvg.setAttribute('aria-hidden', 'true'); boxSvg.append(document.createElementNS(SVGNS, 'path')); boxLbl = make('span', { class: 'iss-box-lbl', 'aria-hidden': 'true' }); }
    if (boxSvg.parentElement !== stage) { boxSvg.style.zIndex = '3'; stage.insertBefore(boxSvg, pts); }   // раунд 4, п. 7: контур — под легендой (у неё z 4), подпись — в слое меток над ней
    const R = stage.getBoundingClientRect(), lo = cs.own[0].map(v => v + 0.001), hi = cs.own[1].map(v => v - 0.001), P = [];
    for (let i = 0; i < 8; i++) { let s = null; try { s = A().projectToScreen([(i & 1) ? hi[0] : lo[0], (i & 2) ? hi[1] : lo[1], (i & 4) ? hi[2] : lo[2]]); } catch (e) { /* */ } if (!s || !isFinite(s[0]) || !isFinite(s[1])) { boxSvg.firstChild.setAttribute('d', ''); boxLbl.remove(); return true; } P.push([s[0] - R.left, s[1] - R.top]); }
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    boxSvg.firstChild.setAttribute('d', E.map(([i, j]) => 'M' + P[i][0].toFixed(1) + ' ' + P[i][1].toFixed(1) + 'L' + P[j][0].toFixed(1) + ' ' + P[j][1].toFixed(1)).join(''));
    const t = cropWhere();
    if (t) {
      const top = P.reduce((m, p) => p[1] < m[1] ? p : m); if (boxLbl.textContent !== t) boxLbl.textContent = t; if (boxLbl.parentElement !== pts) pts.append(boxLbl);
      // 1.0.12 П5: подпись не выходит за холст и под карточку; угол правее середины — подпись к нему правым краем (.iss-box-lbl--r)
      let right = R.width - 4; const card = $('right'); if (card) { const cr = card.getBoundingClientRect(); if (cr.width && cr.left > R.left && cr.left < R.right && cr.bottom > R.top && cr.top < R.bottom) right = Math.min(right, cr.left - R.left - 4); }
      const w = boxLbl.offsetWidth || 0, rr = top[0] > R.width / 2; boxLbl.classList.toggle('iss-box-lbl--r', rr);
      const x = rr ? Math.max(4 + w, Math.min(top[0], right)) : Math.max(4, Math.min(top[0], right - w));
      // верх — ниже панелей сцены (путь, «3D / План», строка вида); не заходить в легенду и панели — сдвиг ниже них
      const lh = boxLbl.offsetHeight || 20, L = rr ? x - w : x, obs = [];
      for (const el of stage.querySelectorAll('.stage-path, .stage-actions, .atb-tr, .atb-view, .view-controls, .iss-legend')) { if (window.ResizeObserver && !obsSeen.has(el)) { obsSeen.add(el); obsRO.observe(el); } if (el.hidden || !el.getClientRects().length) continue; const q = el.getBoundingClientRect(); if (q.width && q.height) obs.push([q.left - R.left, q.top - R.top, q.right - R.left, q.bottom - R.top]); }
      let y = Math.max(4, top[1] - 24), X = x, below = false;
      let hide = false;
      if (lblOn()) {   // 1.0.15 B3-6: над кубом — плашка выбранного (движок); подпись куба — первое свободное место: под кубом, справа, слева, над плашкой; нет — скрыта (то же — в строке выреза)
        const all = panelRects(R), E = lblRect(R), xs = P.map(p => p[0]), ys = P.map(p => p[1]), cx0 = Math.min(...xs), cx1 = Math.max(...xs), cy0 = Math.min(...ys), cy1 = Math.max(...ys), bot = P.reduce((m, p) => p[1] > m[1] ? p : m);
        const free = (l, t2) => l >= 4 && l + w <= R.width - 4 && t2 >= 4 && t2 + lh <= R.height - 4 && !all.some(o => l < o[2] + 2 && l + w > o[0] - 2 && t2 < o[3] + 2 && t2 + lh > o[1] - 2) && !(E && l < E[2] + 4 && l + w > E[0] - 4 && t2 < E[3] + 4 && t2 + lh > E[1] - 4);
        const cand = [[Math.max(4, Math.min(bot[0] - w / 2, R.width - 4 - w)), cy1 + 6], [cx1 + 6, cy0], [cx0 - 6 - w, cy0], [Math.max(4, Math.min(top[0] - w / 2, R.width - 4 - w)), (E ? E[1] : cy0) - 6 - lh]];
        const f = cand.find(c => free(c[0], c[1]));
        if (f) { below = true; boxLbl.classList.remove('iss-box-lbl--r'); X = f[0]; y = f[1]; } else hide = true;
      }
      if (!below) for (let n = 0; n < 6; n++) { const hit = obs.find(o => L < o[2] + 2 && L + w > o[0] - 2 && y < o[3] + 2 && y + lh > o[1] - 2); if (!hit) break; y = hit[3] + 4; }
      boxLbl.style.left = X.toFixed(1) + 'px'; boxLbl.style.top = y.toFixed(1) + 'px'; if (hide) { boxLbl.style.visibility = 'hidden'; return true; }
      const busy = performance.now() - Math.max(cs.shown || 0, cs.lastFit || 0) < 400; boxLbl.style.visibility = busy ? 'hidden' : ''; if (busy) setTimeout(schedulePts, 420);   // 1.0.14: подпись — после последнего кадра (без «прыжка»)   // раунд 4, п. 6: первые 0,4 с панели сцены ещё меняются (путь, строка вида) — подпись скрыта до перестановки
    }
    else boxLbl.remove();
    return true;
  }
  // чужое сечение поверх выреза («Убрать сечение», «По этажу», P9, «Инструменты») — вырез уступлен; P9 вернул наш куб — снова свой
  document.addEventListener('atlas:section', () => onSection());
  // restoreView / r23Restore («Вернуть вид», импорт вида) ставят сечение без события (ENGINE_API) — сверка sectionState() при перерисовке меток и контура
  function onSection() {
    if (on && !cs.busy && !cs.own && idx >= 0 && cs.want && cs.info && !cs.info.box) { queueMicrotask(renderCrop); return; }   // 1.0.12 П2: P9 в виде без выреза — строка «Срез по телу · Убрать»; своим кубом не считать
    if (!on || cs.busy || !cs.own) return;
    if (ownLive()) { if (cs.yielded) { cs.yielded = null; ghostSet(((cs.info && cs.info.ghost) || []).concat(cs.occl || [])); document.body.classList.add('iss-crop'); renderCrop(); schedulePts(); } return; }
    if (cs.yielded) return;
    cs.yielded = idx >= 0 ? list[idx].id : true;
    ghostSet(null); document.body.classList.remove('iss-crop'); drawBox();
    renderCrop(); schedulePts();
    const r = idx >= 0 ? list[idx] : null;
    if (r) requestAnimationFrame(() => { if (on && cs.yielded && list[idx] === r) { fitTo(X(r).b.concat(X(r).p)); renderCrop(); } });   // иначе срез глубины по кубу режет здание
  }
  document.addEventListener('atlas:sceneready', () => { if (on && cs.yielded) renderCrop(); });
  // 1.0.12 П13: наложение или сцена догрузили тела — у вида без тел (E/P0) или неполного пересчитать вырез
  function recheck(e) {
    if (!on || idx < 0 || !cs.want || !cs.info || cs.busy || (e && e.detail && e.detail.partial)) return;
    const r = list[idx], b = cs.info; if (!(b.kind === 'E' || b.kind === 'P0' || b.nIn < b.nAll)) return;
    const n = [...new Set(X(r).b.concat(X(r).p))].filter(inW).length;
    if (n !== b.nIn) { cropShow(r, pairIdx); renderPoints(); }
  }
  document.addEventListener('atlas:sceneready', recheck); document.addEventListener('atlas:overlay', recheck);
  document.addEventListener('atlas:cardcut', () => { if (on && idx >= 0 && cs.want && cs.info && !cs.info.box) renderCrop(); });   // карточка отрисовала срез по телу (P9) — «Срез по телу» в ряду
  // «Вписать», ракурсы и Home вписывают всё здание — после них кадр снова по кубу
  const refitBox = () => requestAnimationFrame(() => { if (on && ownLive()) fitBox(cs.frame || cs.own); });
  document.addEventListener('click', e => { if (on && cs.own && e.target && e.target.closest && e.target.closest('#fit, [data-view]') && ownLive()) refitBox(); });
  document.addEventListener('keydown', e => {
    if (!on || e.ctrlKey || e.metaKey) return;   // Alt — только для Alt+← / → по местам
    const tt = e.target, typing = tt && tt.closest && tt.closest('input, textarea, select, [contenteditable="true"], [role="menu"]');
    if (e.key === 'Enter' && !e.altKey && tt && tt.closest && tt.closest('.iss-nav .iss-crop') && !tt.closest('button') && cs.info && cs.info.kind === 'PL') { e.preventDefault(); cropAct('pllist'); return; }   // раунд 6: Enter на ряду — список мест
    if (!typing && idx >= 0 && cs.want && cs.info && cs.info.kind === 'PL') {   // раунд 4: переход по местам
      const pa = e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft') ? 'plprev' : e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight') ? 'plnext' : e.key === 'Home' ? 'plfirst' : e.key === 'End' ? 'pllast' : null;
      if (pa) { e.preventDefault(); e.stopPropagation(); placeStep(pa); return; }
    }
    if (e.altKey) return;
    if (e.key === 'Home') { if (cs.own && ownLive()) refitBox(); return; }
    const act = e.code === 'KeyC' && !e.shiftKey ? 'crop' : e.code === 'BracketLeft' ? 'minus' : e.code === 'BracketRight' ? 'plus' : null;   // C / [ ] — по коду клавиши (в русской раскладке те же)
    if (!act || idx < 0 || !cropCfg()) return;
    if (!inScene(e) && !inIssues(e)) return;   /* 1.0.19a М-3 (WCAG 2.1.4): клавиши-символы — только при фокусе в сцене или в обходе и легенде замечаний */
    const t = e.target; if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"], [role="menu"]')) return;
    e.preventDefault(); cropAct(act);
  });
  // адрес: #issues=1&issue=<ID>&pair=<N> — ссылка на место
  function hashSync() {
    if (!on || !cropCfg()) return;
    try { const a = A(); if (a.features.hashKeep && a.setHashParams) a.setHashParams({ issue: idx >= 0 ? list[idx].id : null, pair: idx >= 0 && pairIdx >= 0 ? String(pairIdx + 1) : null, place: idx >= 0 && placeIdx >= 0 ? String(placeIdx + 1) : null }); } catch (e) { /* */ }
  }
  function goHash(q) {
    const id = q.get('issue'); if (!on || !id || !cropCfg()) return false;
    let k = list.findIndex(r => r.id === id);
    if (k < 0 && (only || grp !== 'all')) { only = null; grp = 'all'; idx = -1; pairIdx = -1; placeIdx = -1; refresh(); k = list.findIndex(r => r.id === id); }
    if (k < 0) return false;
    const p = parseInt(q.get('pair'), 10), r = list[k];
    if (k !== idx || !(p >= 1 && r.pairs[p - 1])) { idx = (k - 1 + list.length) % list.length; go(1); }
    if (p >= 1 && r.pairs[p - 1] && pairIdx !== p - 1) pickPair(r, p - 1);
    const l = parseInt(q.get('place'), 10);   // 1.0.12: место N
    if (l >= 1 && cs.info && cs.info.kind === 'PL' && cs.info.rid === r.id && cs.info.places[l - 1] && placeIdx !== l - 1) pickPlace(r, l - 1);
    return true;
  }

  let switching = false, camBefore = null, sess = 0;   // sess — сеанс режима: отложенные вызовы прежнего сеанса не действуют
  // 1.0.15 B3-2b: при выходе камера до входа ставится сразу (не ждёт кадра: после выхода сцена перестраивается, первый кадр бывает через 0,3–4,5 с);
  // охрана: не меньше 1,5 с и 30 кадров после выхода (пока сцена перестраивается, кадры стоят — отложенные таймеры успевают; не дольше 15 с) кадр не от пользователя (поздний fit/focus) камеру не перебивает (до 3 повторов);
  // жест, колесо или клавиша — охрана снята
  const camSame = (a, b) => !!(a && b && Array.isArray(a.center) && Math.abs(a.az - b.az) < 1e-6 && Math.abs(a.el - b.el) < 1e-6 && Math.abs(a.scale - b.scale) <= 1e-6 * Math.max(1, Math.abs(b.scale)) && Math.abs(a.radius - b.radius) <= 1e-6 * Math.max(1, b.radius) && a.center.every((x, k) => Math.abs(x - b.center[k]) < 1e-6));
  function camPut(cam, s0) {
    const R = window.__R24, EV = ['pointerdown', 'wheel', 'keydown'], t0 = performance.now(); let n = 0, dead = false, fr = 0;
    const put = () => { try { if (cam && R && R.capture && R.restoreView) { const v = R.capture(); v.camera = cam; v.__again = true; camOwn(() => R.restoreView(v)); } else { const f = $('fit'); if (f) camOwn(() => f.click()); } } catch (e) { /* */ } };
    put(); if (!R || !R.capture) return;
    if (!cam) { const st = () => { dead = true; EV.forEach(e => removeEventListener(e, st, true)); }; EV.forEach(e => addEventListener(e, st, true)); [450, 1200].forEach((ms, i) => setTimeout(() => { if (!dead && !on && s0 === sess) put(); if (i) st(); }, ms)); return; }   // 1.0.15 B3-2c: вход по ссылке — «Вписать» ещё раз, когда шторка и сводка встанут (отступы B3-5); жест — не трогаем
    const stop = () => { dead = true; camStops.delete(stop); document.removeEventListener('atlas:camera', onCam); EV.forEach(e => removeEventListener(e, stop, true)); };
    const chk = () => { if (dead) return; if (on || s0 !== sess) return stop(); let c = null; try { c = R.capture().camera; } catch (e) { return stop(); } if (!camSame(c, cam) && n < 3) { n++; put(); } };
    const onCam = () => chk(), tick = () => { if (dead) return; chk(); fr++; if (performance.now() - t0 > 1500) return stop(); requestAnimationFrame(tick); };   /* r5: охрана — 1,5 с от выхода (не дольше), в каждом кадре проверка */   // и в каждом кадре: восстановление могло не состояться без события камеры
    EV.forEach(e => addEventListener(e, stop, true)); camStops.add(stop); document.addEventListener('atlas:camera', onCam); requestAnimationFrame(tick); setTimeout(stop, 1600);   /* r5: явная команда камеры снимает охрану */
  }
  async function enter(how) {
    if (on) return;
    const d = await loadData(); if (!d || !d.items.length) { window.AtlasViewSettings?.toast?.('Замечания к РД не загрузились'); return; }
    // модуль узлов (наложение «По РД») грузится после первого кадра — при входе по адресу #issues подождать его (до 20 с)
    await new Promise(r => { const t0 = Date.now(); (function w() { if ((N() && N().extra) || Date.now() - t0 > 20000) r(); else setTimeout(w, 100); })(); });
    if (on) return;
    try { const so = F() && F().selected(); selBefore = so ? so.renderId : null; } catch (e) { selBefore = null; }   // выход возвращает выбор, как до входа
    camBefore = null; if (how !== 'link') try { const R = window.__R24; if (R && R.capture) camBefore = R.capture().camera || null; } catch (e) { camBefore = null; }   // 1.0.15 B3-2 (L1): ракурс до входа — выход × его возвращает; вход по ссылке — снимка нет, выход вписывает здание
    on = true; sess++; fitAutoOff(); switching = true; btn.setAttribute('aria-pressed', 'true'); document.body.classList.add('iss-on');
    try { if (N() && N().state && N().state().k) N().close(); } catch (e) { /* */ }
    // V12.3 · U1: набор разделов сохраняется — во «Всё здание» с набором (setSections), без набора — «Всё здание»; тела замечаний — поверх набора
    const SI = (() => { try { return N() && N().sections ? N().sections() : null; } catch (e) { return null; } })();
    if (scope() !== 'BUILDING') { try { if (SI && SI.on) N().setSections(SI.keys); else $('navBuilding').click(); } catch (e) { /* */ } }
    try { N() && N().secPin && N().secPin('issues', bodiesOf(D.items)); } catch (e) { /* */ }
    try { const a = A(); if (a && a.features && a.features.hashKeep && a.setHashParams) a.setHashParams({ issues: '1' }); } catch (e) { /* */ }   // V12.3 · U1: режим — в адресе; «Назад» к адресу без issues выходит
    await new Promise(r => requestAnimationFrame(() => r()));
    switching = false;
    only = null; grp = 'all'; idx = -1; pairIdx = -1; placeIdx = -1; legend.hidden = false; nav.hidden = false;
    cs.info = null; cs.yielded = null; cs.frame = null; cs.userR = false; cropMem();
    refresh();
    document.dispatchEvent(new CustomEvent('atlas:issues', { detail: { on: true } }));
  }
  function off(how) {
    if (!on) return;
    on = false; btn.setAttribute('aria-pressed', 'false'); document.body.classList.remove('iss-on');
    legend.hidden = true; nav.hidden = true; idx = -1; pairIdx = -1; placeIdx = -1; document.body.classList.remove('iss-one');
    renderPoints();
    try { N() && N().extra && N().extra('issues', null); } catch (e) { /* */ }
    try { N() && N().secPin && N().secPin('issues', null); } catch (e) { /* */ }
    try { V().through('issues', null); } catch (e) { /* */ }
    try { if (canTint()) tint(null); } catch (e) { /* */ }
    pick.hidden = true;
    if (cs.prev || cs.own) cropRelease(); cs.info = null;   // 1.0.11: сечение и ползунок — как до выреза (после снятия наложения и прозрачности: они перестраивают сцену)
    try { const a = A(); if (a && a.features && a.features.hashKeep && a.setHashParams && new URLSearchParams(location.hash.slice(1)).has('issues')) a.setHashParams(cropCfg() ? { issues: null, issue: null, pair: null } : { issues: null }); } catch (e) { /* */ }   // V12.2 · E4: иначе следующий hashchange включит режим снова
    // V12.2b: выход открытием узла — выбор узла не трогать
    if (!exitByNode) try { if (selBefore) A().select(selBefore); else if (window.AtlasPrototype && window.AtlasPrototype.deselect) window.AtlasPrototype.deselect(); } catch (e) { /* */ }
    // 1.0.15 B3-2 (L1): выход пользователем (×, кнопка, «Назад») — камера как до входа (только камера: раздел, выбор, сечение уже возвращены выше); узел или смена раздела камеру не трогают
    { const cam = camBefore, s0 = ++sess; camBefore = null; if (how === 'user' && !exitByNode) camPut(cam, s0); }
    document.dispatchEvent(new CustomEvent('atlas:issues', { detail: { on: false } }));
  }
  // Выход сам: открыт узел или выбран другой раздел (прозрачность и наложение считаются по «Всему зданию»)
  let exitByNode = false;
  document.addEventListener('atlas:node', e => { if (on && !switching && e.detail && e.detail.k) { exitByNode = true; try { off(); } finally { exitByNode = false; } } });
  // V12.2 · E2: смена раздела — событие atlas:scope; без E2 — по hashchange
  const leaveCheck = () => { if (on && !switching && scope() && scope() !== 'BUILDING') off(); };
  if (window.__ATLAS && window.__ATLAS.features && window.__ATLAS.features.scopeEvent) document.addEventListener('atlas:scope', () => queueMicrotask(leaveCheck));
  else addEventListener('hashchange', () => setTimeout(leaveCheck, 0));
  // ← → — обход, когда фокус не в поле ввода
  document.addEventListener('keydown', e => {
    if (!on || e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const t = e.target; if (t && (t.closest('input, textarea, select, [contenteditable="true"], [role="tree"], [role="listbox"], [role="menu"]'))) return;
    if (inScene(e)) return;   /* 1.0.19a М-3: фокус на холсте — стрелки модели (вращение), обход не перехватывает */
    e.preventDefault(); go(e.key === 'ArrowRight' ? 1 : -1);
  });

  const cropState = () => cropCfg() ? { on: !!cs.want, r: RR(), live: ownLive(), kind: cs.info ? cs.info.kind : null, acc: cs.info && cs.info.acc || null, box: cs.own, yielded: !!cs.yielded, prev: cs.prev ? cs.prev.st : null, ghost: cs.ghost, where: cropWhere(), status: cs.info || !cs.want ? cropStatus() : '' } : null;
  window.AtlasIssues = { enter, off, on: () => on, data: () => D, state: () => ({ on, only, grp, idx, pairIdx, placeIdx, places: cs.info && cs.info.places ? cs.info.places.length : 0, id: idx >= 0 ? list[idx].id : null, n: list.length, color: color && canTint(), points: pm.length, crop: cropState() }),
    crop: v => { const c = cropMem(); if (!c) return null; if (typeof v === 'boolean' && v !== !!cs.want) cropAct('crop'); else if (typeof v === 'number') { const i = c.steps.indexOf(v); if (i >= 0 && i !== cs.step) { cs.step = i; cropSave(); if (cs.want) cropGo(); else renderCrop(); } } return cropState(); }, go, pair: i => { if (idx >= 0) pickPair(list[idx], i); }, place: i => { if (idx >= 0 && cs.info && cs.info.kind === 'PL') pickPlace(list[idx], i); }, grp: v => { grp = v || 'all'; idx = -1; pairIdx = -1; if (on) refresh(); }, expand: id => expand([id]), points: () => pm.map(m => ({ pt: m.q.pt, a: m.q.a, b: m.q.b, visible: !m.b.hidden })), color: v => { color = !!v; if (on) refresh(); }, filter: s => { only = s || null; idx = -1; pairIdx = -1; if (on) refresh(); } };

  place();
  const start = new URLSearchParams(String(((window.__ATLAS&&window.__ATLAS.features&&window.__ATLAS.features.hashKeep) ? location.hash : window.__ATLAS_START_HASH) || location.hash).slice(1));   // V12.2 · E4
  const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 3000 }) : f => setTimeout(f, 300);
  if (start.has('issues')) loadData().then(() => enter('link')).then(() => goHash(start)); else idle(() => loadData());   // 1.0.11: issue / pair — место в адресе
  // V12.3 · U1 (скептик §3): адрес без issues («Назад», правка «#») — выход из режима
  addEventListener('hashchange', () => {
    const q = new URLSearchParams(location.hash.slice(1)), has = q.has('issues');
    if (has && !on) enter().then(() => goHash(q)); else if (!has && on && !switching) off('user');
    else if (has && on && !switching && q.get('issue') && (q.get('issue') !== (idx >= 0 ? list[idx].id : null) || (q.get('pair') || null) !== (pairIdx >= 0 ? String(pairIdx + 1) : null) || (q.get('place') || null) !== (placeIdx >= 0 ? String(placeIdx + 1) : null))) goHash(q);   // 1.0.11: смена issue / pair в адресе
  });
  // V12.3 · U1 (скептик §3): смена темы — подкраска токенами новой темы
  document.addEventListener('atlas:theme', () => { if (on && color && canTint()) requestAnimationFrame(() => { if (on) apply(); }); });
})();
