/* 3D Атлас · «Размеры» (этап 1 единого плана, пп. 1–5 и 8): выноски снаружи выбранного элемента — габарит и высотные отметки.
   Работает поверх сцены на API движка, движок не меняет:
   __ATLAS.projectToScreen(p) → [x, y, виден], события atlas:camera, atlas:selectionchange, atlas:part, atlas:sceneready, atlas:visibility, atlas:section,
   atlas:snapshotpaint (выноски попадают в «Снимок»), __ATLAS.labelsOverride (подпись выбранного уступает место), __ATLAS.fit (кадр с запасом).
   Данные: вершины тела o.g (собственные оси повёрнутого в плане элемента), габарит o.bounds; документные значения — ключ паспорта atlas_dims
   (на пилоте — наложение window.ATLAS_DIMS.items[id]). Нет документного значения — «По модели» (пунктир и «≈»), ничего не додумывается.
   Пока режим выключен, модуль ничего не рисует и не слушает камеру. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = window.AtlasShell; if (!S || !S.make) return;
  const make = S.make;
  const canvas = $('canvas'), stage = document.querySelector('.stage');
  if (!canvas || !stage) return;
  const A = () => window.__ATLAS || {};
  const F = () => window.__FULL_ATLAS || null;
  const ready = () => typeof A().projectToScreen === 'function' && !!F();
  const phone = () => innerWidth <= 850;

  /* ---------- допуски и подписи ---------- */
  const TOL_MM = 5, TOL_REL = 0.01;   // размер: лист и модель «совпадают», если разница ≤ max(5 мм, 1 %); у записи можно задать свой tol_mm
  const TOL_LVL_M = 0.005;            // отметка: ≤ 5 мм
  const OFF = 26;                     // размерная линия — в 26 px от ребра
  const NAME = { length: 'Длина', width: 'Ширина', height: 'Высота', diameter: 'Диаметр', route_length: 'Длина по оси', bottom: 'Низ', top: 'Верх', axis: 'Ось', invert: 'Лоток' };
  const SHORT = { length: 'Д', width: 'Ш', height: 'В', diameter: 'Ø', route_length: 'По оси', bottom: 'низ', top: 'верх', axis: 'ось', invert: 'лоток' };
  const BASIS = { sheet: 'по листу', spec: 'по спецификации', passport: 'по паспорту изделия', calc: 'расчёт' };
  const STATUS = { doc: 'По документу', model: 'По модели', conflict: 'Расхождение', unresolved: 'Требует уточнения' };
  const MODEL_NOTE = 'Снято с геометрии модели, точность зависит от детализации. Это не размер по проектной документации.';

  /* ---------- числа ---------- */
  const nbsp = s => s.replace(/ /g, ' ');
  const fmtMM = v => nbsp((Math.round(v * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 }));
  const roundModel = mm => (mm < 1000 ? Math.round(mm) : Math.round(mm / 10) * 10);   // как в карточке: до 1 мм при размере меньше 1 м, до 10 мм — выше
  const fmtLvl = z => { const r = Math.round(z * 1000) / 1000, a = Math.abs(r).toFixed(3).replace('.', ','); return Math.abs(r) < 0.0005 ? '±0,000' : (r < 0 ? '−' : '+') + a; };
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const okB = b => Array.isArray(b) && b.length === 2 && b.every(r => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite));

  /* ---------- состояние ---------- */
  const KEY = 'atlas:global:dims';
  const st = { on: false, size: true, level: true };
  try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && typeof j === 'object') { st.size = j.size !== false; st.level = j.level !== false; } } catch (e) { /* хранилища нет — умолчания */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ size: st.size, level: st.level })); } catch (e) { /* */ } };

  /* ---------- геометрия: собственные оси в плане ---------- */
  function hullXY(pts) {   // выпуклая оболочка (Эндрю), pts — [[x, y], …]
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), n = p.length;
    if (n < 3) return p;
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (let i = 0; i < n; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (let i = n - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
    lo.pop(); up.pop(); return lo.concat(up);
  }
  // Рамка элемента: центр в плане, единичные направления u (длинная сторона) и v, полуразмеры, низ и верх. own — оси свои (элемент повёрнут в плане).
  const frameCache = new WeakMap();
  function frameOf(o, part, hint) {   // hint — [большая, меньшая] горизонтальные стороны по документу, м: выбор между равными по площади прямоугольниками
    const rd = o && (o.bounds_rd || (o.albumRecord || {}).bounds_rd);
    const pb = part && okB(part.bounds) ? part.bounds : null;
    const b = pb || (okB(rd) ? rd : o && o.bounds);
    if (!okB(b)) return null;
    const g = o.g, cacheable = !pb, hk = hint ? hint[0] + ':' + hint[1] : '';
    if (cacheable) { const c = frameCache.get(o); if (c && c.g === g && c.hk === hk) return c.f; }
    const dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
    let f = { c: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], u: dx >= dy ? [1, 0] : [0, 1], hl: Math.max(dx, dy) / 2, hw: Math.min(dx, dy) / 2, z0: b[0][2], z1: b[1][2], own: false, basis: 'bounds' };
    f.v = [-f.u[1], f.u[0]];
    // собственные оси — по вершинам тела; не для части, не для тел с исходными границами bounds_rd (там вершины смещены) и не без геометрии
    if (!pb && !okB(rd) && g && g.nv >= 3 && (g.pf || (g.q && g.lo && g.sc)) && dx > 1e-6 && dy > 1e-6) {
      const nv = g.nv, step = Math.max(1, Math.floor(nv / 40000)), seen = new Set(), pts = [];
      for (let i = 0; i < nv; i += step) {
        const x = g.pf ? g.pf[i * 3] : g.lo[0] + g.q[i * 3] * g.sc[0], y = g.pf ? g.pf[i * 3 + 1] : g.lo[1] + g.q[i * 3 + 1] * g.sc[1];
        const k = Math.round(x * 2000) + ':' + Math.round(y * 2000);   // слияние с шагом 0,5 мм
        if (!seen.has(k)) { seen.add(k); pts.push([x, y]); }
      }
      const h = hullXY(pts);
      if (h.length >= 3) {
        const cands = [], m = h.length, stepE = Math.max(1, Math.floor(m / 360));
        for (let i = 0; i < m; i += stepE) {
          const a = h[i], c = h[(i + 1) % m]; let ux = c[0] - a[0], uy = c[1] - a[1]; const l = Math.hypot(ux, uy); if (l < 1e-9) continue; ux /= l; uy /= l;
          let s0 = Infinity, s1 = -Infinity, t0 = Infinity, t1 = -Infinity;
          for (const q of h) { const s = q[0] * ux + q[1] * uy, t = -q[0] * uy + q[1] * ux; if (s < s0) s0 = s; if (s > s1) s1 = s; if (t < t0) t0 = t; if (t > t1) t1 = t; }
          cands.push({ ar: (s1 - s0) * (t1 - t0), ux, uy, s0, s1, t0, t1, el: l });
        }
        // Прямоугольники с площадью в пределах 1,5 % от наименьшей равноправны (у треугольника в плане их три):
        // берём ближайший к документным сторонам, а без документа — опёртый на самое длинное ребро контура.
        let best = null;
        if (cands.length) {
          const amin = cands.reduce((v, c) => Math.min(v, c.ar), Infinity), pool = cands.filter(c => c.ar <= amin * 1.015);
          const err = c => { const L = Math.max(c.s1 - c.s0, c.t1 - c.t0), W = Math.min(c.s1 - c.s0, c.t1 - c.t0); return Math.abs(L - hint[0]) + Math.abs(W - hint[1]); };
          best = pool.reduce((v, c) => (!v || (hint ? err(c) < err(v) : c.el > v.el) ? c : v), null);
        }
        // свои оси — только если прямоугольник заметно меньше габарита по осям модели (иначе числа остаются теми же, что по осям модели)
        if (best && best.ar < dx * dy * 0.985) {
          let { ux, uy, s0, s1, t0, t1 } = best; let L = s1 - s0, W = t1 - t0, cs = (s0 + s1) / 2, ct = (t0 + t1) / 2;
          const cx = cs * ux - ct * uy, cy = cs * uy + ct * ux;
          if (W > L) { const nx = -uy, ny = ux; ux = nx; uy = ny; const tmp = L; L = W; W = tmp; }
          if (ux < 0 || (Math.abs(ux) < 1e-12 && uy < 0)) { ux = -ux; uy = -uy; }
          f = { c: [cx, cy], u: [ux, uy], v: [-uy, ux], hl: L / 2, hw: W / 2, z0: b[0][2], z1: b[1][2], own: true, basis: 'vertices' };
        }
      }
    }
    if (cacheable) frameCache.set(o, { g, hk, f });
    return f;
  }
  const corner = (f, i) => { const su = i & 1 ? 1 : -1, sv = i & 2 ? 1 : -1; return [f.c[0] + su * f.u[0] * f.hl + sv * f.v[0] * f.hw, f.c[1] + su * f.u[1] * f.hl + sv * f.v[1] * f.hw, i & 4 ? f.z1 : f.z0]; };

  /* ---------- данные: документные значения ---------- */
  const passCache = new WeakMap();
  function docOf(o) {
    const ov = window.ATLAS_DIMS && window.ATLAS_DIMS.items && window.ATLAS_DIMS.items[o.renderId];
    if (ov && typeof ov === 'object') return ov;
    const p = passCache.get(o);
    return p && p.atlas_dims && typeof p.atlas_dims === 'object' ? p.atlas_dims : null;
  }
  function loadPassport(o) {
    if (passCache.has(o) || !window.AtlasPassports || !window.AtlasPassports.get) return;
    passCache.set(o, null);
    try { window.AtlasPassports.get(o).then(p => { passCache.set(o, p || {}); if (p && p.atlas_dims && st.on && current && current.o === o) { pickCurrent(); soon(); } }).catch(() => { /* паспорта нет — по модели */ }); } catch (e) { /* */ }
  }
  const sources = () => { try { return (F() && F().sourceAvailability()) || {}; } catch (e) { return {}; } };
  // Документная запись годится, только если есть число, основание и источник из реестра источников атласа (расчёт — с пояснением).
  function docEntry(d, unit) {
    if (!d || typeof d !== 'object') return null;
    const v = unit === 'm' ? d.value_m : d.value_mm;
    const okV = isNum(v) || (unit === 'mm' && Array.isArray(v) && v.length === 2 && v.every(isNum));
    if (!okV || !BASIS[d.basis] || (unit === 'm' && !(typeof d.datum === 'string' && d.datum.trim()))) return null;   // отметка без указанного нуля отсчёта документной не считается
    const src = typeof d.source_key === 'string' ? sources()[d.source_key] : null;
    if (!src) return null;
    if (d.basis === 'calc' && !(typeof d.note === 'string' && d.note.trim())) return null;
    return { v, basis: d.basis, key: d.source_key, src, note: typeof d.note === 'string' ? d.note : '', datum: typeof d.datum === 'string' ? d.datum : '', tol: isNum(d.tol_mm) ? d.tol_mm : null };
  }
  const agree = (docV, modelV, tol) => Math.abs(docV - modelV) <= (tol != null ? tol : Math.max(TOL_MM, Math.abs(docV) * TOL_REL));

  /* Факты элемента: { frame, dims: [{key, axis, model, doc, status, text}], levels: [{key, z, model, doc, status, text}], unresolved: [{what, note}], round } */
  function factsOf(o, part) {
    const D = part ? null : docOf(o);
    const hl0 = D ? docEntry(D.length, 'mm') : null, hw0 = D ? docEntry(D.width, 'mm') : null;
    const hint = hl0 && hw0 && isNum(hl0.v) && isNum(hw0.v) ? [Math.max(hl0.v, hw0.v) / 1000, Math.min(hl0.v, hw0.v) / 1000] : null;
    const f = frameOf(o, part, hint); if (!f) return null;
    const mdl = [f.hl * 2000, f.hw * 2000, (f.z1 - f.z0) * 1000];
    const dims = [], levels = [];
    const dia = D ? docEntry(D.diameter, 'mm') : null, sec = D ? docEntry(D.section, 'mm') : null;
    // Условное тело (geometry: 'symbolic'): его габарит не является размером элемента — модельные числа не показываем, документные с геометрией не сверяем
    const sym = !!(D && (D.geometry === 'symbolic' || D.model_extent === false));
    const one = (key, axis, d) => {
      const m = !sym && axis != null && mdl[axis] > 0.05 ? mdl[axis] : null;   // нулевой размер по оси (плоское тело) — по модели не показываем
      if (d && isNum(d.v)) {
        if (m == null || agree(d.v, m, d.tol)) return { key, axis: sym ? null : axis, model: m, doc: d, status: 'doc', text: fmtMM(d.v) };
        return { key, axis, model: m, doc: d, status: 'conflict', text: fmtMM(d.v) + ' / ≈' + fmtMM(roundModel(m)) };
      }
      return m == null ? null : { key, axis, model: m, doc: null, status: 'model', text: '≈' + fmtMM(roundModel(m)) };
    };
    const push = x => { if (x) dims.push(x); };
    // «Длина» и «ширина» документа — к той стороне рамки, к которой они ближе (в документе длиной может быть названа меньшая сторона)
    const dl = D ? docEntry(D.length, 'mm') : null, dw = D ? docEntry(D.width, 'mm') : null, nl = dl && isNum(dl.v), nw = dw && isNum(dw.v);
    let aL = 0, aW = 1;
    if (nl && nw) { if (Math.abs(dl.v - mdl[1]) + Math.abs(dw.v - mdl[0]) < Math.abs(dl.v - mdl[0]) + Math.abs(dw.v - mdl[1])) { aL = 1; aW = 0; } }
    else if (nl && !dia && !sec) { if (Math.abs(dl.v - mdl[1]) < Math.abs(dl.v - mdl[0])) { aL = 1; aW = 0; } }
    else if (nw) { if (Math.abs(dw.v - mdl[0]) < Math.abs(dw.v - mdl[1])) { aL = 1; aW = 0; } }
    push(one('length', aL, dl));
    if (dia && isNum(dia.v)) {
      // круглое сечение: вместо ширины и высоты — диаметр выноской; сверяется с меньшим поперечным размером тела
      const m = !sym && Math.min(mdl[1], mdl[2]) > 0.05 ? Math.min(mdl[1], mdl[2]) : null, ok = m == null || agree(dia.v, m, dia.tol);
      dims.push({ key: 'diameter', axis: null, sym, model: m, doc: dia, status: ok ? 'doc' : 'conflict', text: 'Ø' + fmtMM(dia.v) + (ok ? '' : ' / ≈' + fmtMM(roundModel(m))) });
    } else if (sec && Array.isArray(sec.v)) {
      // прямоугольное сечение a × b: большее — к большей стороне
      const a = Math.max(sec.v[0], sec.v[1]), c = Math.min(sec.v[0], sec.v[1]), wide = mdl[1] >= mdl[2];
      push(one('width', 1, Object.assign({}, sec, { v: wide ? a : c }))); push(one('height', 2, Object.assign({}, sec, { v: wide ? c : a })));
    } else { push(one('width', aW, dw)); push(one('height', 2, D ? docEntry(D.height, 'mm') : null)); }
    const lvl = (key, z, d) => {
      if (d) {
        if (z == null || sym || Math.abs(d.v - z) <= (d.tol != null ? d.tol / 1000 : TOL_LVL_M)) return { key, z: z == null ? d.v : z, model: z, doc: d, status: 'doc', text: fmtLvl(d.v) };
        return { key, z, model: z, doc: d, status: 'conflict', text: fmtLvl(d.v) + ' / ≈' + fmtLvl(z) };
      }
      return z == null || sym ? null : { key, z, model: z, doc: null, status: 'model', text: '≈' + fmtLvl(z) };
    };
    const pl = x => { if (x) levels.push(x); };
    pl(lvl('bottom', f.z0, D ? docEntry(D.bottom, 'm') : null));
    for (const k of ['invert', 'axis']) { const d = D ? docEntry(D[k], 'm') : null; if (d) pl(lvl(k, null, d)); }
    pl(lvl('top', f.z1, D ? docEntry(D.top, 'm') : null));
    const unresolved = (D && Array.isArray(D.unresolved) ? D.unresolved : []).filter(u => u && typeof u.what === 'string' && NAME[u.what]).map(u => ({ what: u.what, note: typeof u.note === 'string' ? u.note : '' }));
    // «Требует уточнения» снимает модельное число с выноски: строка остаётся в карточке и в полосе слоёв
    const run = Array.isArray(D?.axis_path) ? D.axis_path : [];
    if (run.length >= 2 && run.length <= 4096 && run.every(point => Array.isArray(point) && point.length === 3 && point.every(isNum))) {
      let metres = 0, horizontal = 0;
      for (let i = 1; i < run.length; i++) {
        const [x,y,z] = run[i].map((v,k) => v-run[i-1][k]);
        metres += Math.hypot(x,y,z);
        horizontal += Math.hypot(x,y);
      }
      if (metres > 0) {
        const slope = horizontal > 0 ? (run[run.length-1][2] - run[0][2])*100/horizontal : null;
        const derivedNote = slope == null ? 'Длина по ломаной оси из модели.' :
          'Длина по ломаной оси из модели. Средний уклон от начала к концу: ' + slope.toLocaleString('ru-RU',{maximumFractionDigits:2}) + ' %.';
        dims.push({ key: 'route_length', axis: null, model: metres*1000, doc: null, status: 'model', text: '≈' + fmtMM(roundModel(metres*1000)), modelNote: derivedNote });
      }
    }
    const hide = new Set(unresolved.map(u => u.what));
    return { frame: f, dims: dims.filter(x => !(hide.has(x.key) && x.status === 'model')), levels: levels.filter(x => !(hide.has(x.key) && x.status === 'model')), unresolved, part: !!part, symbolic: sym };
  }

  /* ---------- разметка ---------- */
  const cv = make('canvas', { id: 'atlasDims', class: 'adim-canvas', 'aria-hidden': 'true' });
  const hitBox = make('div', { class: 'adim-hits', id: 'atlasDimsHits' });
  const bar = make('div', { class: 'adim-bar', id: 'atlasDimsBar', role: 'group', 'aria-label': 'Размеры: что показывать', hidden: true });
  const pop = make('div', { class: 'adim-pop', id: 'atlasDimsPop', role: 'dialog', 'aria-label': 'Источник значения', hidden: true });
  const live = make('p', { class: 'sr-only', 'aria-live': 'polite' });
  stage.append(cv, hitBox, bar, pop, live);
  const btn = make('button', { type: 'button', id: 'quickDims', 'aria-pressed': 'false', 'aria-label': 'Размеры', title: 'Размеры выбранного элемента (D)' });
  btn.append(make('span', {}, 'Размеры')); btn.hidden = true;
  const chk = (name, text) => { const l = make('label', { class: 'adim-chk' }), i = make('input', { type: 'checkbox', id: 'adim_' + name }); i.checked = st[name]; i.onchange = () => { st[name] = i.checked; persist(); announce(); soon(); emit(); }; l.append(i, document.createTextNode(' ' + text)); return l; };
  const barMain = make('div', { class: 'adim-bar-main' }), barRow = make('div', { class: 'adim-bar-row' });
  barMain.append(chk('size', 'Габарит'), chk('level', 'Отметки'));
  bar.append(barMain, barRow);

  /* ---------- цвета сцены ---------- */
  let pal = null, palKey = '';
  function palette() {
    const dark = (() => { try { return window.AtlasViewSettings.state().background === 'dark'; } catch (e) { return false; } })() || document.body.classList.contains('ui-dark');
    const k = String(dark); if (pal && k === palKey) return pal; palKey = k;
    pal = dark ? { ink: '#F2F6F9', ink2: '#C3D1DB', halo: 'rgba(14,24,32,.88)', warn: '#FFB067' } : { ink: '#101A22', ink2: '#33485B', halo: 'rgba(255,255,255,.9)', warn: '#9A4300' };
    return pal;
  }
  const FONT = '600 12.5px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace';
  const measurer = document.createElement('canvas').getContext('2d');
  const tw = t => { measurer.font = FONT; return measurer.measureText(t).width; };

  /* ---------- раскладка кадра: список примитивов + места чисел ---------- */
  let current = null;      // { o, facts }
  let covered = null;
  let lastList = null;     // { prims: [...], hits: [...], row: [...] }
  const camEl = () => { try { const c = A().setCamera ? A().setCamera(null) : null; return c && isNum(c.el) ? c.el : 0.5; } catch (e) { return 0.5; } };
  const P = (p, r) => { const s = A().projectToScreen(p); return [s[0] - r.left, s[1] - r.top, s[2] !== false]; };
  const AVOID = ['.tools', '.atb-tr', '.stage-path', '.zoom-controls', '#right.open', '#atlasLayers', '#atlasCompare', '#atlasDimsBar', '.measure-panel'];
  const EDGES = (() => { const out = []; for (let ax = 0; ax < 3; ax++) for (let i = 0; i < 8; i++) if (!(i & (1 << ax))) out.push([ax, i, i | (1 << ax)]); return out; })();
  function layout() {
    const cur = current; if (!cur || !cur.facts) return null;
    const r = canvas.getBoundingClientRect(), w = r.width, h = r.height; if (!w || !h) return null;
    if (covered === cur.o.renderId) return { prims: [], hits: [], row: [], w, h, covered: true };
    const f = cur.facts.frame, C = [], prims = [], hits = [], row = [], placed = [];
    for (let i = 0; i < 8; i++) C.push(P(corner(f, i), r));
    const cx = C.reduce((s, c) => s + c[0], 0) / 8, cy = C.reduce((s, c) => s + c[1], 0) / 8;
    // Рёбра контура: все остальные углы — по одну сторону от прямой ребра. Наружу — в сторону, где углов нет.
    const sil = [];
    for (const [ax, i, j] of EDGES) {
      const a = C[i], b = C[j], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 6) continue;
      let pos = 0, neg = 0;
      for (let k = 0; k < 8; k++) { if (k === i || k === j) continue; const d = ((C[k][0] - a[0]) * -dy + (C[k][1] - a[1]) * dx) / L; if (d > 0.75) pos++; else if (d < -0.75) neg++; }
      if (pos && neg) continue;
      let nx = -dy / L, ny = dx / L; if (pos) { nx = -nx; ny = -ny; } else if (!neg && ((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
      sil.push({ ax, i, j, a, b, L, nx, ny, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, top: (i & 4 ? 1 : 0) + (j & 4 ? 1 : 0) });
    }
    const pickE = (ax, score) => { let best = null; for (const e of sil) if (e.ax === ax) { const s = score(e); if (!best || s > best.s) best = { e, s }; } return best && best.e; };
    const vis = e => e.a[2] || e.b[2];   // признак projectToScreen: точка в кадре и внутри сечения
    const col = x => (x.status === 'conflict' ? 'warn' : x.status === 'doc' ? 'ink' : 'ink2');
    const free = (x, y, tw2, th2) => { for (const q of placed) if (Math.abs(x - q[0]) < (tw2 + q[2]) / 2 + 4 && Math.abs(y - q[1]) < (th2 + q[3]) / 2 + 3) return false; return true; };
    // Панели поверх сцены: число, попавшее под панель или за край поля, уходит в короткую строку (иначе по нему не нажать).
    // Список — панели ядра; панели объекта добавляются через window.AtlasDimsAvoid = ['селектор', …].
    const avoid = [...document.querySelectorAll(AVOID.concat(Array.isArray(window.AtlasDimsAvoid) ? window.AtlasDimsAvoid : []).join(','))].filter(el => !el.hidden && el.getClientRects().length).map(el => el.getBoundingClientRect());
    const hit = (x, y, tw2, th2, item, kind) => {
      const padX = tw2 / 2 + 5, padY = th2 / 2 + 4, xx = x + r.left, yy = y + r.top;
      if (x < padX || y < padY || x + padX > w || y + padY > h || avoid.some(q => xx + padX >= q.left && xx - padX <= q.right && yy + padY >= q.top && yy - padY <= q.bottom)) { prims.pop(); row.push({ item, kind }); return; }
      placed.push([x, y, tw2, th2]); hits.push({ x, y, w: tw2 + 10, h: th2 + 8, item, kind });
    };
    const narrow = phone(), planView = Math.cos(camEl()) < 0.2;   // вид сверху: высота и отметки остаются в карточке
    // Отметки стоят справа от элемента, высота — слева. Если справа до края холста места нет, меняем стороны.
    const flip = (() => { if (!st.level || !cur.facts.levels.length) return false; const er = pickE(2, x => x.mx), el = pickE(2, x => -x.mx); if (!er || !el) return false;
      const need = 26 + Math.max(...cur.facts.levels.map(L => tw(L.text))) + 40; return Math.max(er.a[0], er.b[0]) + need > w - 4 && Math.min(el.a[0], el.b[0]) - need > 4; })();

    if (st.size) {
      for (const d of cur.facts.dims) {
        if (d.key === 'diameter') continue;
        if (d.axis == null) { row.push({ item: d, kind: 'dim' }); continue; }
        const e = pickE(d.axis, d.axis === 2 ? (x => (flip ? x.mx : -x.mx)) : (x => x.my * 4 + x.top));
        if (!e || !vis(e)) { if (!(d.axis === 2 && planView)) row.push({ item: d, kind: 'dim' }); continue; }
        const solid = d.status !== 'model', c = col(d), ux = (e.b[0] - e.a[0]) / e.L, uy = (e.b[1] - e.a[1]) / e.L, nx = e.nx, ny = e.ny;
        const a2 = [e.a[0] + nx * OFF, e.a[1] + ny * OFF], b2 = [e.b[0] + nx * OFF, e.b[1] + ny * OFF];
        const t = d.text, wT = tw(t), fits = e.L >= wT + 16;
        if (!fits && narrow) { row.push({ item: d, kind: 'dim' }); }
        prims.push({ k: 'l', p: [e.a[0] + nx * 4, e.a[1] + ny * 4, a2[0] + nx * 6, a2[1] + ny * 6], w: 1, c });
        prims.push({ k: 'l', p: [e.b[0] + nx * 4, e.b[1] + ny * 4, b2[0] + nx * 6, b2[1] + ny * 6], w: 1, c });
        prims.push({ k: 'l', p: [a2[0] - ux * 5, a2[1] - uy * 5, b2[0] + ux * 5, b2[1] + uy * 5], w: 1.2, c, dash: solid ? null : [5, 4] });
        const tx = (ux + nx) * 0.7071, ty = (uy + ny) * 0.7071;   // засечки под 45°
        for (const q of [a2, b2]) prims.push({ k: 'l', p: [q[0] - tx * 5.5, q[1] - ty * 5.5, q[0] + tx * 5.5, q[1] + ty * 5.5], w: 1.8, c });
        if (!fits && narrow) continue;
        let ang = Math.atan2(uy, ux); if (ang > Math.PI / 2 || ang <= -Math.PI / 2) ang += Math.PI; if (ang > Math.PI) ang -= 2 * Math.PI;
        const m2 = [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2];
        if (fits) {
          const px = m2[0] + nx * 11, py = m2[1] + ny * 11, bw = Math.abs(Math.cos(ang)) * wT + Math.abs(Math.sin(ang)) * 14, bh = Math.abs(Math.sin(ang)) * wT + Math.abs(Math.cos(ang)) * 14;
          prims.push({ k: 't', t, x: px, y: py, rot: ang, c }); hit(px, py, bw, bh, d, 'dim');
        } else {
          let kk = 14 + Math.abs(nx) * wT / 2 + Math.abs(ny) * 7, px = m2[0] + nx * kk, py = m2[1] + ny * kk, n = 0;
          while (!free(px, py, wT, 14) && n++ < 4) { kk += 16; px = m2[0] + nx * kk; py = m2[1] + ny * kk; }
          prims.push({ k: 't', t, x: px, y: py, c }); hit(px, py, wT, 14, d, 'dim');
        }
      }
      const dia = cur.facts.dims.find(d => d.key === 'diameter');
      if (dia && dia.sym) row.push({ item: dia, kind: 'dim' });
      else if (dia) {
        // диаметр — выноской от образующей: от середины нижнего контурного ребра длины
        const e = pickE(0, x => x.my * 4 + x.top);
        if (e && vis(e)) {
          const c = col(dia), sx = e.a[0] + (e.b[0] - e.a[0]) * 0.3, sy = e.a[1] + (e.b[1] - e.a[1]) * 0.3, t = dia.text, wT = tw(t);
          const x1 = sx + e.nx * 34, y1 = sy + e.ny * 34, dir = e.nx >= 0 ? 1 : -1, x2 = x1 + dir * (wT + 12);
          prims.push({ k: 'd', x: sx, y: sy, c }); prims.push({ k: 'l', p: [sx, sy, x1, y1], w: 1, c }); prims.push({ k: 'l', p: [x1, y1, x2, y1], w: 1, c, dash: dia.status === 'model' ? [5, 4] : null });
          const px = x1 + dir * (wT / 2 + 6), py = y1 - 9; prims.push({ k: 't', t, x: px, y: py, c }); hit(px, py, wT, 14, dia, 'dim');
        } else row.push({ item: dia, kind: 'dim' });
      }
    }
    if (st.level && cur.facts.levels.length) {
      const labelOf = L => (L.key === 'invert' || L.key === 'axis' ? SHORT[L.key] + ' ' : '') + L.text;
      const need = 26 + Math.max(...cur.facts.levels.map(L => tw(labelOf(L)))) + 16;
      // правое вертикальное ребро контура; не помещается у правого края — левое (высота тогда уходит направо, см. flip)
      let e = flip ? pickE(2, x => -x.mx) : pickE(2, x => x.mx);
      if (e && vis(e) && e.L >= 10 && (flip ? Math.min(e.a[0], e.b[0]) - need > 4 : Math.max(e.a[0], e.b[0]) + need < w - 4)) {
        const lo = e.a[1] > e.b[1] ? e.a : e.b, hi = e.a[1] > e.b[1] ? e.b : e.a, thin = Math.abs(lo[1] - hi[1]) < 44;
        const z0 = f.z0, z1 = f.z1, at = z => { const k = z1 > z0 ? Math.max(0, Math.min(1, (z - z0) / (z1 - z0))) : 0; return [lo[0] + (hi[0] - lo[0]) * k, lo[1] + (hi[1] - lo[1]) * k]; };
        const side = flip ? -1 : 1, used = [];
        for (const L of cur.facts.levels) {
          const s = at(L.z), c = col(L), up = L.key === 'top' ? true : L.key === 'bottom' ? !thin : true, k = up ? -1 : 1;
          const label = labelOf(L), wT = tw(label);
          let h2 = up ? 20 : 12; while (used.some(u => u.up === up && Math.abs(u.y - (s[1] + k * h2)) < 18) && h2 < 90) h2 += 18;
          used.push({ up, y: s[1] + k * h2 });
          const txx = s[0] + side * 26, x2 = txx + side * (wT + 12);
          prims.push({ k: 'l', p: [s[0] + side * 5, s[1], s[0] + side * 46, s[1]], w: 1, c, dash: L.status === 'model' ? [5, 4] : null });
          prims.push({ k: 'p', p: [[txx, s[1]], [txx - 4.5, s[1] + k * 8], [txx + 4.5, s[1] + k * 8]], c });
          prims.push({ k: 'l', p: [txx, s[1] + k * 8, txx, s[1] + k * h2], w: 1, c }); prims.push({ k: 'l', p: [txx, s[1] + k * h2, x2, s[1] + k * h2], w: 1, c });
          const px = txx + side * (wT / 2 + 7), py = s[1] + k * h2 + (up ? -9 : 10);
          prims.push({ k: 't', t: label, x: px, y: py, c }); hit(px, py, wT, 14, L, 'level');
        }
      } else if (!planView) for (const L of cur.facts.levels) row.push({ item: L, kind: 'level' });
    }
    return { prims, hits, row, w, h };
  }
  function paint(ctx, list) {
    if (!list) return; const pl = palette();
    ctx.save(); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    // 1) кайма цвета подложки под всеми линиями — выноска читается и на светлом поле, и на тёмном грунте
    ctx.strokeStyle = pl.halo; ctx.fillStyle = pl.halo;
    for (const q of list.prims) {
      if (q.k === 'l') { ctx.beginPath(); ctx.lineWidth = (q.w || 1) + 3; ctx.moveTo(q.p[0], q.p[1]); ctx.lineTo(q.p[2], q.p[3]); ctx.stroke(); }
      else if (q.k === 'p') { ctx.beginPath(); q.p.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.lineWidth = 3; ctx.stroke(); }
      else if (q.k === 'd') { ctx.beginPath(); ctx.arc(q.x, q.y, 4.2, 0, 7); ctx.fill(); }
    }
    // 2) сами линии
    for (const q of list.prims) {
      const c = pl[q.c] || pl.ink;
      if (q.k === 'l') { ctx.beginPath(); ctx.setLineDash(q.dash || []); ctx.lineWidth = q.w || 1; ctx.strokeStyle = c; ctx.moveTo(q.p[0], q.p[1]); ctx.lineTo(q.p[2], q.p[3]); ctx.stroke(); ctx.setLineDash([]); }
      else if (q.k === 'p') { ctx.beginPath(); q.p.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); }
      else if (q.k === 'd') { ctx.beginPath(); ctx.arc(q.x, q.y, 2.4, 0, 7); ctx.fillStyle = c; ctx.fill(); }
    }
    // 3) числа: мягкая плашка цвета подложки без рамки, поверх — текст
    ctx.font = FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const q of list.prims) if (q.k === 't') {
      ctx.save(); ctx.translate(q.x, q.y); if (q.rot) ctx.rotate(q.rot);
      const wT = ctx.measureText(q.t).width, bw = wT + 8, bh = 17;
      ctx.fillStyle = pl.halo; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 4); else ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.fill();
      ctx.fillStyle = pl[q.c] || pl.ink; ctx.fillText(q.t, 0, 0.5); ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- кадр ---------- */
  const hitPool = [];
  function ariaOf(item, kind) { return NAME[item.key] + ' ' + item.text.replace('≈', 'примерно ').replace(' / ', ', по модели ') + (kind === 'dim' ? ' мм' : ' м') + '. ' + STATUS[item.status] + '. Показать источник'; }
  function syncHits(list) {
    const hs = list ? list.hits : [];
    while (hitPool.length < hs.length) { const b = make('button', { type: 'button', class: 'adim-hit' }); b.onclick = () => openPop(b._item, b._kind, b); hitBox.append(b); hitPool.push(b); }
    hitPool.forEach((b, i) => {
      const q = hs[i]; b.hidden = !q; if (!q) return;
      b._item = q.item; b._kind = q.kind;
      b.style.left = (q.x - q.w / 2) + 'px'; b.style.top = (q.y - q.h / 2) + 'px'; b.style.width = q.w + 'px'; b.style.height = q.h + 'px';
      const al = ariaOf(q.item, q.kind); if (b.getAttribute('aria-label') !== al) b.setAttribute('aria-label', al);
    });
  }
  let barSig = null;
  function syncBar(list) {
    const cur0 = current, sig = !cur0 ? '-' : !cur0.facts ? cur0.o.renderId + '|x' : cur0.o.renderId + '|' + ((list && list.row) || []).map(q => q.item.key + q.item.text + q.item.status).join(',') + '|' + cur0.facts.unresolved.map(u => u.what).join(',') + '|' + (cur0.facts.symbolic ? 's' : cur0.facts.frame.own && st.size ? 'o' : '');
    const key = (list?.covered ? 'covered|' : '') + sig;
    if (key === barSig) return; barSig = key;
    barRow.replaceChildren();
    const cur = current;
    if (!cur) { barRow.append(make('span', { class: 'adim-note' }, 'Выберите элемент на модели')); return; }
    if (list?.covered) { barRow.append(make('span', { class: 'adim-note' }, 'Элемент закрыт окружением. Размеры есть в карточке.')); return; }
    if (!cur.facts) { barRow.append(make('span', { class: 'adim-note' }, 'У элемента нет габарита в данных')); return; }
    for (const q of (list && list.row) || []) {
      const b = make('button', { type: 'button', class: 'adim-chip adim-chip--' + q.item.status }, (q.item.key === 'diameter' ? '' : SHORT[q.item.key] + ' ') + q.item.text + (q.kind === 'dim' ? ' мм' : ' м'));
      b.onclick = () => openPop(q.item, q.kind, b); barRow.append(b);
    }
    for (const u of cur.facts.unresolved) barRow.append(make('span', { class: 'adim-chip adim-chip--unresolved', title: u.note || null }, NAME[u.what] + ': требует уточнения'));
    if (cur.facts.symbolic) barRow.append(make('span', { class: 'adim-note' }, 'условное тело: габарит модели не показан'));
    else if (cur.facts.frame.own && st.size) barRow.append(make('span', { class: 'adim-note' }, 'по собственным осям элемента'));
  }
  let raf = 0, nextPositionCheck = 0;
  const soon = () => { if (!st.on || raf) return; raf = requestAnimationFrame(() => { raf = 0; frame(); }); };
  function frame() {
    if (!st.on) return;
    const r = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    for (const el of [cv, hitBox]) { el.style.left = (r.left - sr.left) + 'px'; el.style.top = (r.top - sr.top) + 'px'; el.style.width = r.width + 'px'; el.style.height = r.height + 'px'; }
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    let list = null; try { list = layout(); } catch (e) { list = null; }
    const previous = barSig;
    lastList = list;
    paint(ctx, list);
    syncHits(list);
    syncBar(list);
    const now = performance.now();
    if (previous !== barSig || now >= nextPositionCheck) {
      placeBar();
      nextPositionCheck = now + 120;
    }
  }

  /* ---------- выбранный элемент ---------- */
  let ovMine = false;
  function labels(off) {   // подпись выбранного уступает место выноскам; чужой режим подписей не трогаем
    try { const a = A(); if (!a.labelsOverride) return; if (off) { if (a.labelsOverride() == null) { a.labelsOverride('off'); ovMine = true; } } else if (ovMine) { if (a.labelsOverride() === 'off') a.labelsOverride(null); ovMine = false; } } catch (e) { /* */ }
  }
  function pickCurrent() {
    let o = null, part = null;
    try { o = F().selected() || null; } catch (e) { o = null; }
    if (o) { try { const ps = A().partSelection && A().partSelection(); if (ps && ps.id === o.renderId) part = ps; } catch (e) { /* */ } }
    if (o) {
      const a = A(), id = o.renderId;
      const hidden = a.hiddenState?.().ids, displayed = a.visibleSetState?.(), isolated = a.isolateState?.();
      if (hidden?.includes(id) || (displayed && !displayed.ids.includes(id)) || (isolated?.on && !isolated.ids.includes(id))) o = null;
    }
    if (!o) { current = null; labels(false); return; }
    loadPassport(o);
    let facts = null; try { facts = factsOf(o, part); } catch (e) { facts = null; }
    current = { o, facts }; labels(!!facts);
  }
  function refresh() { if (covered !== F()?.selected()?.renderId) covered = null; closePop(); if (st.on) { pickCurrent(); frame(); } }

  /* ---------- окно источника ---------- */
  function srcLine(s) { return [s.section || s.source_code || null, s.printed_sheet ? 'лист ' + s.printed_sheet : null, s.pdf_page ? 'PDF стр. ' + s.pdf_page : null, s.revision && !/нет в источнике/i.test(String(s.revision)) ? 'ред. ' + s.revision : 'редакция в источнике не указана'].filter(Boolean).join(' · '); }
  function viewUrl() { try { return location.href; } catch (e) { return ''; } }
  // 1.3.0 · Codex 0303: подтверждённый лист элемента (не источник числа) — точная страница: вход объекта, лист атласа или точный PDF; общий альбом не считается
  function sheetOfElement(o) {
    const S0 = sources(), keys = [];
    try { for (const l of (F().sourceLinks ? F().sourceLinks(o) : []) || []) if (l && l.key) keys.push(l.key); } catch (e) { /* */ }
    for (const l of (o.albumRecord && o.albumRecord.sources) || []) if (l && l.key && !keys.includes(l.key)) keys.push(l.key);
    for (const k of keys) {
      try { if (window.AtlasSheets && window.AtlasSheets.resolve && window.AtlasSheets.resolve(k)) return k; } catch (e) { /* */ }
      const s = S0[k]; if (!s) continue;
      if (s.available) return k;
      try { const r = window.AtlasStatus && window.AtlasStatus.resolveSource ? window.AtlasStatus.resolveSource(s) : null; if (r && r.kind === 'pdf' && r.exact && Number.isInteger(r.page) && r.page > 0 && r.href) return k; } catch (e) { /* */ }
    }
    return null;
  }
  function openSheet(key) {
    const id = current && current.o ? current.o.renderId : null;
    try { if (window.AtlasSheets && typeof window.AtlasSheets.open === 'function' && window.AtlasSheets.open(key, { id, viewUrl: viewUrl() }) === true) return true; } catch (e) { /* вход объекта не сработал — общий путь */ }
    const s = sources()[key]; if (!s) return false;
    try { if (s.available && F().source) { F().source(key); return true; } } catch (e) { /* */ }
    try {
      const r = window.AtlasStatus && window.AtlasStatus.resolveSource ? window.AtlasStatus.resolveSource(s) : null;
      if (r && r.kind === 'pdf' && r.exact && Number.isInteger(r.page) && r.page > 0 && r.href) { const m = window.AtlasPackageLinks && window.AtlasPackageLinks.map ? window.AtlasPackageLinks.map(r.href) : null, href = (m && m.href) || r.href; if (/\.pdf(#|$)/i.test(href)) window.open(href, '_blank', 'noopener'); else location.href = href; return true; }
    } catch (e) { /* */ }
    return false;
  }
  let popFor = null;
  function openPop(item, kind, anchor) {
    if (!item) return;
    const unit = kind === 'dim' ? ' мм' : ' м', own = current && current.facts && current.facts.frame.own;
    pop.replaceChildren();
    const head = make('div', { class: 'adim-pop-h' });
    head.append(make('b', {}, NAME[item.key]), make('span', { class: 'adim-st adim-st--' + item.status }, STATUS[item.status]));
    const x = make('button', { type: 'button', class: 'adim-pop-x', 'aria-label': 'Закрыть' }, '×'); x.onclick = () => { closePop(); anchor && anchor.focus && anchor.focus(); };
    head.append(x); pop.append(head);
    const d = item.doc;
    if (d) {
      const v = kind === 'dim' ? (item.key === 'diameter' ? 'Ø' : '') + fmtMM(d.v) : fmtLvl(d.v);
      pop.append(make('p', { class: 'adim-pop-v' }, v + unit + ' — ' + BASIS[d.basis]));
      pop.append(make('p', { class: 'adim-pop-s' }, srcLine(d.src)));
      if (d.datum) pop.append(make('p', { class: 'adim-pop-n' }, 'Отсчёт: ' + d.datum));
      if (d.note) pop.append(make('p', { class: 'adim-pop-n' }, d.note));
    }
    if (item.status !== 'doc' && item.model != null) {
      const v = kind === 'dim' ? fmtMM(roundModel(item.model)) : fmtLvl(item.model);
      pop.append(make('p', { class: 'adim-pop-v' }, '≈' + v + unit + ' — по модели'));
      pop.append(make('p', { class: 'adim-pop-n' }, kind === 'dim' ? (item.modelNote || MODEL_NOTE + (item.key !== 'height' ? (own ? ' Габарит по собственным осям элемента.' : ' Габарит по осям модели.') : '')) : 'Высота в координатах модели. ' + MODEL_NOTE));
    }
    if (item.status === 'conflict') pop.append(make('p', { class: 'adim-pop-w' }, 'Документ и модель расходятся. Показаны оба значения.'));
    if (d) { const go = make('button', { type: 'button', class: 'adim-pop-go' }, 'Открыть лист'); go.onclick = () => { if (openSheet(d.key)) closePop(); else { go.disabled = true; go.textContent = 'Лист в атласе не открывается'; } }; pop.append(go); }
    else if (current && current.o) { const k = sheetOfElement(current.o); if (k) { pop.append(make('p', { class: 'adim-pop-n' }, 'Число снято с модели. Лист связан с элементом, но не является источником этого числа.')); const go = make('button', { type: 'button', class: 'adim-pop-go adim-pop-go--alt' }, 'Чертёж элемента'); go.onclick = () => { if (openSheet(k)) closePop(); else { go.disabled = true; go.textContent = 'Лист в атласе не открывается'; } }; pop.append(go); } }
    pop.hidden = false; popFor = anchor || null;
    const topLayer = typeof pop.showPopover === 'function';   // верхний слой браузера: окно не уходит под карточку и панели
    if (topLayer) { pop.setAttribute('popover', 'manual'); try { pop.showPopover(); } catch (e) { /* уже открыто */ } }
    const sr = stage.getBoundingClientRect(), ar = anchor ? anchor.getBoundingClientRect() : sr;
    const cardR = phone() ? (() => { const c = document.querySelector('#right.open'); return c ? c.getBoundingClientRect() : null; })() : null;
    const bottom = Math.min(sr.bottom, innerHeight, cardR && cardR.top > sr.top ? cardR.top : Infinity) - sr.top - 8, topMin = Math.min(54, bottom / 4);
    pop.style.maxHeight = Math.max(90, bottom - topMin) + 'px';
    const pw = pop.offsetWidth, ph = pop.offsetHeight, left = ar.left - sr.left + ar.width / 2 - pw / 2, above = ar.top - sr.top - ph - 10, below = ar.bottom - sr.top + 10;
    const top = phone() ? topMin : Math.max(topMin, Math.min(bottom - ph, above >= topMin ? above : below));
    pop.style.left = ((topLayer ? sr.left : 0) + Math.max(8, Math.min(sr.width - pw - 8, left))) + 'px'; pop.style.top = ((topLayer ? sr.top : 0) + top) + 'px';
    (pop.querySelector('.adim-pop-go') || x).focus({ preventScroll: true });
  }
  function closePop() { if (pop.hidden) return; try { if (typeof pop.hidePopover === 'function' && pop.matches(':popover-open')) pop.hidePopover(); } catch (e) { /* */ } pop.hidden = true; popFor = null; }

  /* ---------- полоса слоёв: место ---------- */
  // Полоса ставится на свободное место сцены: панели ядра и объекта не перекрывает (проверка — по тому, что лежит под точками полосы).
  function spotFree(x, y, w2, h2) {
    for (const fx of [0.04, 0.5, 0.96]) for (const fy of [0.15, 0.85]) {
      const e = document.elementFromPoint(x + w2 * fx, y + h2 * fy);
      if (!(e === canvas || (e && (bar.contains(e) || e.classList.contains('adim-hit'))))) return false;
    }
    return true;
  }
  function placeBar() {
    if (bar.hidden) return;
    const sr = stage.getBoundingClientRect(), vis = el => (el && el.offsetParent && el.getBoundingClientRect().width ? el.getBoundingClientRect() : null);
    const tr = vis(document.querySelector('.tools')), br = vis(btn), bs = bar.style, ph = phone();
    const zr = vis(document.querySelector('.zoom-controls'));
    // телефон: полоса не заходит на столбец «+ / − / Вписать» справа — числа переносятся на вторую строку
    bs.right = 'auto'; bs.bottom = 'auto'; bs.maxWidth = ph ? Math.max(180, (zr && zr.left > sr.left + sr.width / 2 ? zr.left - sr.left - 16 : sr.width - 16)) + 'px' : '';
    const bw = bar.offsetWidth, bh = bar.offsetHeight;
    let x, y, ok = false;
    if (!ph) {
      // компьютер: над панелью инструментов, по центру кнопки; занято — выше с шагом 12 px, затем левее и правее
      const y0 = (tr && tr.top > sr.top + sr.height / 2 ? tr.top : sr.bottom - 8) - bh - 8, cxx = br ? br.left + br.width / 2 : sr.left + sr.width / 2;
      const xs = [cxx - bw / 2, sr.left + 12, sr.right - bw - 84].map(v => Math.max(sr.left + 8, Math.min(sr.right - bw - 8, v)));
      out: for (let dy = 0; dy <= 264; dy += 12) for (const xx of xs) if (spotFree(xx, y0 - dy, bw, bh)) { x = xx; y = y0 - dy; ok = true; break out; }
      if (!ok) { x = xs[0]; y = y0; }
    } else {
      // телефон: под верхним рядом кнопок; занято — ниже с шагом 8 px
      // 1.4.2: телефон — ниже всех плавающих панелей верха сцены (путь, кнопки, значок «На модели · N из M»), не под ними
      const tops = ['.stage-actions', '#atbIssues', '.atb-tr', '.tools'].map(q => vis(document.querySelector(q))).filter(q => q && q.top < sr.top + sr.height * 0.4 && q.left < sr.left + bw + 8);
      const y0 = (tops.length ? Math.max(...tops.map(q => q.bottom)) : sr.top + 56) + 6;
      for (let dy = 0; dy <= 200; dy += 8) if (spotFree(sr.left + 8, y0 + dy, bw, bh)) { x = sr.left + 8; y = y0 + dy; ok = true; break; }
      if (!ok) { x = sr.left + 8; y = y0; }
    }
    bs.left = Math.round(x - sr.left) + 'px'; bs.top = Math.round(y - sr.top) + 'px';
  }

  /* ---------- включение ---------- */
  function emit() { document.dispatchEvent(new CustomEvent('atlas:dims', { detail: state() })); }
  const state = () => ({ on: st.on, size: st.size, level: st.level });
  function announce() { live.textContent = st.on ? 'Размеры включены: ' + [st.size ? 'габарит' : null, st.level ? 'отметки' : null].filter(Boolean).join(', ') : 'Размеры выключены'; }
  // Свободное поле сцены: самая длинная полоса по вертикали через центр холста, где сверху нет панелей, и такая же по горизонтали.
  function freeRect() {
    const r = canvas.getBoundingClientRect(), free = (x, y) => { const e = document.elementFromPoint(x, y); return e === canvas; };
    const scan = (from, to, at, vert) => { let best = [from, from], run = null; for (let t = from + 4; t < to - 4; t += 8) { if (vert ? free(at, t) : free(t, at)) { if (!run) run = [t, t]; run[1] = t; if (run[1] - run[0] > best[1] - best[0]) best = run.slice(); } else run = null; } return best; };
    const v = scan(r.top, r.bottom, r.left + r.width / 2, true), hz = scan(r.left, r.right, (v[0] + v[1]) / 2, false);
    return { top: v[0] - r.top, bottom: r.bottom - v[1], left: hz[0] - r.left, right: r.right - hz[1], w: hz[1] - hz[0], h: v[1] - v[0], r };
  }
  function fitIfSmall() {
    const cur = current; if (!cur || !cur.facts || !A().fit) return;
    try {
      const fr = freeRect(), r = fr.r, f = cur.facts.frame; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) { const s = P(corner(f, i), r); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); }
      // Поля под выноски вокруг элемента: полные, затем урезанные (отметки уйдут в короткую строку), затем наименьшие — важнее, чтобы элемент был в кадре.
      const ph = phone(), sets = ph ? [{ top: 34, right: 96, bottom: 46, left: 46 }, { top: 26, right: 44, bottom: 40, left: 40 }, { top: 12, right: 12, bottom: 12, left: 12 }] : [{ top: 46, right: 132, bottom: 64, left: 72 }, { top: 34, right: 60, bottom: 52, left: 60 }, { top: 16, right: 16, bottom: 16, left: 16 }];
      const m = sets.find(q => fr.w - q.left - q.right >= (ph ? 90 : 140) && fr.h - q.top - q.bottom >= (ph ? 80 : 120)) || sets[2];
      const ins = { top: fr.top + m.top, right: fr.right + m.right, bottom: fr.bottom + m.bottom, left: fr.left + m.left };
      const big = Math.max(x1 - x0, y1 - y0), out = x0 < ins.left || y0 < ins.top || x1 > r.width - ins.right || y1 > r.height - ins.bottom;
      if (big >= (ph ? 90 : 140) && !out) return;
      if (r.width - ins.left - ins.right < 40 || r.height - ins.top - ins.bottom < 40) return;   // свободного поля нет — кадр не трогаем
      A().fit([{ bounds: [[f.c[0] - f.hl, f.c[1] - f.hl, f.z0], [f.c[0] + f.hl, f.c[1] + f.hl, f.z1]] }], { insets: ins, pad: 1.15 });
    } catch (e) { /* кадр остаётся прежним */ }
  }
  const EV = ['atlas:camera', 'atlas:sceneready', 'atlas:section'];
  const onSel = () => refresh();
  const onVis = () => {
    if (!st.on) return;
    const previous = current?.o;
    pickCurrent();
    if (current?.o !== previous) closePop();
    soon();
  };
  const onCam = () => { closePop(); soon(); };
  document.addEventListener('atlas:occludedchange', e => {
    const id = e.detail?.state === 'occluded' ? e.detail.id : null;
    if (id === covered) return;
    covered = id;
    if (covered && current?.o.renderId === covered) closePop();
    soon();
  });
  const onDoc = e => { if (!pop.hidden && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.adim-hit, .adim-chip'))) closePop(); };
  function setOn(v, opt) {
    v = !!v; if (v === st.on || (v && !ready())) return;
    st.on = v;
    btn.setAttribute('aria-pressed', String(v)); stage.classList.toggle('adim-on', v); bar.hidden = !v; cv.hidden = !v; hitBox.hidden = !v;
    if (v) {
      for (const n of EV) document.addEventListener(n, n === 'atlas:camera' ? onCam : soon);
      for (const n of ['atlas:selectionchange', 'atlas:part']) document.addEventListener(n, onSel);
      document.addEventListener('atlas:visibility', onVis); addEventListener('resize', soon); document.addEventListener('pointerdown', onDoc, true);
      pickCurrent();
      if (!current && !(opt && opt.quiet)) { try { window.AtlasViewSettings.toast('Размеры: выберите элемент на модели'); } catch (e) { /* */ } }
      // полоса сначала встаёт на место без чисел (одна строка), затем кадр считается по свободному полю уже с ней
      barSig = null; syncBar(null); placeBar();
      if (current && !(opt && opt.quiet)) fitIfSmall();
      frame();
    } else {
      for (const n of EV) document.removeEventListener(n, n === 'atlas:camera' ? onCam : soon);
      for (const n of ['atlas:selectionchange', 'atlas:part']) document.removeEventListener(n, onSel);
      document.removeEventListener('atlas:visibility', onVis); removeEventListener('resize', soon); document.removeEventListener('pointerdown', onDoc, true);
      closePop(); labels(false); current = null; lastList = null; barSig = null; syncHits(null);
      const ctx = cv.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    }
    announce(); emit(); if (!(opt && opt.quiet)) { try { A().draw && A().draw(); } catch (e) { /* */ } }
  }
  cv.hidden = true; hitBox.hidden = true;
  btn.onclick = () => setOn(!st.on);
  // «Снимок»: выноски рисуются в картинку тем же кодом, что и на экране
  document.addEventListener('atlas:snapshotpaint', e => {
    if (!st.on || !e.detail || typeof e.detail.add !== 'function') return;
    pickCurrent();
    let list = null; try { list = layout(); } catch (err) { list = null; }
    if (!list) return;
    e.detail.add(ctx => {
      paint(ctx, list);
      if (!list.row.length) return;
      ctx.save(); ctx.font = FONT; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const pl = palette(), lines = []; let line = '';
      for (const q of list.row) { const v = NAME[q.item.key] + ' ' + q.item.text + (q.kind === 'dim' ? ' мм' : ' м'), j = line ? line + '  ·  ' + v : v; if (line && ctx.measureText(j).width > list.w - 44) { lines.push(line); line = v; } else line = j; }
      if (line) lines.push(line);
      const hh = lines.length * 20 + 10, ww = Math.min(list.w - 30, Math.max(...lines.map(t => ctx.measureText(t).width)) + 20);
      ctx.fillStyle = pl.halo; ctx.fillRect(14, 14, ww, hh); ctx.fillStyle = pl.ink; lines.forEach((t, i) => ctx.fillText(t, 23, 29 + i * 20, ww - 18));
      ctx.restore();
    });
  });
  // Клавиши: D / В — включить и выключить (только в сцене), Esc — закрыть окно источника
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !pop.hidden) { e.preventDefault(); e.stopImmediatePropagation(); const a = popFor; closePop(); a && a.focus && a.focus(); return; }
    const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable;
    const inScene = S.inScene ? S.inScene(e) : (!typing && !!(e.target.closest && e.target.closest('.stage')));
    if (inScene && !typing && !e.repeat && !e.isComposing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В')) { if (ready()) { e.preventDefault(); setOn(!st.on); } }
  }, true);

  /* ---------- кнопка в панели сцены ---------- */
  function mount() {
    if (!ready()) return false;
    const labelsBtn = $('quickLabels'), group = document.querySelector('.tools .r23-quality-group');
    if (!btn.isConnected) { if (labelsBtn) labelsBtn.after(btn); else if (group) group.append(btn); else (document.querySelector('.tools') || stage).append(btn); }
    btn.hidden = false;
    try { window.AtlasToolbar && window.AtlasToolbar.layout && window.AtlasToolbar.layout(); } catch (e) { /* */ }
    const help = $('atlasHelp');
    if (help && !help.querySelector('.help-dims')) { const p = make('p', { class: 'help-dims' }, 'Размеры (D): выберите элемент — габарит и отметки появятся выносками снаружи. Сплошная линия — по документу, пунктир и «≈» — по модели. Нажмите на число, чтобы увидеть источник.'); const k = help.querySelector('.help-measure') || help.querySelector('.help-keyboard'); if (k) k.after(p); else help.append(p); }
    // режим из ссылки: #…&dims=gl
    try { const d = new URLSearchParams(location.hash.slice(1)).get('dims'); if (d != null) apply(d); } catch (e) { /* */ }
    return true;
  }
  function apply(code) {   // 'gl' — габарит и отметки, 'g', 'l', '' или '0' — выключить
    if (!['', '0', 'g', 'l', 'gl'].includes(code)) return;
    if (code === '' || code === '0') { setOn(false, { quiet: true }); return; }
    st.size = code.includes('g'); st.level = code.includes('l');
    const a = $('adim_size'), b = $('adim_level'); if (a) a.checked = st.size; if (b) b.checked = st.level;
    if (st.on) { soon(); emit(); } else setOn(true, { quiet: true });
  }
  function reset() {
    st.size = true;
    st.level = true;
    for (const name of ['size', 'level']) {
      const input = $('adim_' + name);
      if (input) input.checked = st[name];
    }
    persist();
    if (st.on) setOn(false);
    else emit();
  }
  // вид по ссылке и шаг «Предыдущий вид»: режим размеров — как в сохранённом виде
  document.addEventListener('atlas:viewlink', e => { const d = e.detail && e.detail.dims; if (typeof d === 'string') apply(d || '0'); });
  document.addEventListener('atlas:ready', () => setTimeout(mount, 0));
  if (window.__ATLAS && window.__ATLAS.ready && window.__ATLAS.ready()) setTimeout(mount, 0);

  window.AtlasDims = { state, reset, set: v => setOn(v), toggle: () => setOn(!st.on), setLayer(name, v) { if (name !== 'size' && name !== 'level') return; st[name] = !!v; const i = $('adim_' + name); if (i) i.checked = st[name]; persist(); soon(); emit(); },
    code: () => (st.on ? (st.size ? 'g' : '') + (st.level ? 'l' : '') || '0' : ''), apply, facts: (o, part) => { try { return factsOf(o, part || null); } catch (e) { return null; } }, refresh,
    debug: () => ({ current: current ? { id: current.o.renderId, facts: current.facts } : null, list: lastList }) };
})();
