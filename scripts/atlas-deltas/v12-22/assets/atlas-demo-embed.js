/* 1.2.2 (K-H) · atlas-demo-embed.js — главная атласа (index.html) как модель страницы «Демонстрация» (DEMO.html: <iframe src="index.html?demo=embed">).
   Подключается в index.html сразу после project/config.js. Без ?demo=embed или не в рамке — сразу выходит: главная прежняя побайтно по поведению.
   В рамке:
   - видно только поле модели (штатный движок: WebGL, без него — canvas; ?renderer=canvas передаётся из адреса DEMO);
   - хранилище браузера только читается: записи localStorage / sessionStorage остаются в памяти рамки, главная атласа после показа та же
     (вид, оси, подписи, тема, режимы, правая панель); ключ progress конфига в рамке выключен — журнал «Хода работ» (IndexedDB) не открывается;
   - вид для показа (только в памяти): тема DEMO, без осей, подписей тел, сетки, габаритов и HUD;
   - окраска по ходу работ — от DEMO сообщением {type:'paint', states:{<тело>: 'acc'|'done'|'part'|'todo'}}: выполнено и принято — свой цвет модели,
     частично — цвет «частично», не выполнено — прозрачно (призрак), всё вне плана хода работ — приглушённо и прозрачно, щелчок проходит сквозь;
   - «Вписать», автоповорот (__ATLAS.orbit, api 30), отступы под подписи DEMO (setFitInsets), выбор щелчком → подпись элемента в DEMO.
   Сообщения — postMessage только с родителем (источник проверяется), данных объекта наружу не уходит, кроме id и названий тел для подписи. */
'use strict';
(() => {
  let q;
  try { q = new URLSearchParams(location.search); } catch (e) { return; }
  if (q.get('demo') !== 'embed' || window.parent === window) return;
  const html = document.documentElement;
  html.classList.add('atlas-demo-embed');
  window.__ATLAS_DEMO_EMBED = true;
  let dark = q.get('theme') === 'dark';
  html.dataset.theme = dark ? 'dark' : 'light';

  /* ---------- хранилище: только чтение ---------- */
  const SP = window.Storage && Storage.prototype;
  if (SP) {
    const real = { get: SP.getItem, set: SP.setItem, rm: SP.removeItem };
    const mem = new WeakMap(), over = st => { let m = mem.get(st); if (!m) mem.set(st, m = new Map()); return m; };
    let LS = null; try { LS = window.localStorage; } catch (e) { LS = null; }
    const VIEW = 'atlas:global:view';
    // предпочтения вида для показа: поверх сохранённых человеком, только в этой рамке
    const showView = v => { let o = null; try { o = JSON.parse(v); } catch (e) { o = null; } o = o && typeof o === 'object' ? o : {}; return JSON.stringify(Object.assign(o, { background: dark ? 'dark' : (o.background === 'white' ? 'white' : 'light'), axes: false, xyz: false, labels: 'off', grid: false, bounds: false, hud: false, hoverHighlight: false })); };
    SP.getItem = function (k) {
      k = String(k); const m = mem.get(this);
      if (m && m.has(k)) return m.get(k);
      const v = real.get.call(this, k);
      return this === LS && k === VIEW ? showView(v) : v;
    };
    SP.setItem = function (k, v) { over(this).set(String(k), String(v)); };
    SP.removeItem = function (k) { over(this).set(String(k), null); };
    SP.clear = function () { const m = over(this); m.clear(); try { for (let i = 0; i < this.length; i++) m.set(this.key(i), null); } catch (e) { /* только память */ } };
  }
  // «Ход работ» в рамке не нужен: DEMO считает сам; журнал браузера рамка не открывает
  const P = window.ATLAS_PROJECT;
  if (P && P.progress && typeof P.progress === 'object') P.progress = Object.assign({}, P.progress, { enabled: false });

  /* ---------- вид: только поле модели ---------- */
  const css = document.createElement('style');
  css.id = 'atlasDemoEmbedCss';
  css.textContent = 'html.atlas-demo-embed,html.atlas-demo-embed body{margin:0!important;padding:0!important;width:100%;height:100%;overflow:hidden!important}'
    + 'html.atlas-demo-embed body>:not(#atlasMain):not(script):not(style):not(link){display:none!important}'
    + 'html.atlas-demo-embed #atlasMain{position:fixed!important;inset:0!important;display:block!important;margin:0!important;padding:0!important;width:auto!important;height:auto!important;max-width:none!important}'
    + 'html.atlas-demo-embed #atlasMain>:not(.stage){display:none!important}'
    + 'html.atlas-demo-embed #atlasMain>.stage{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;box-shadow:none!important}'
    + 'html.atlas-demo-embed .stage>:not(#canvas):not(#error):not(#atlasDemoStrokes){display:none!important}'
    + 'html.atlas-demo-embed #canvas{display:block!important;width:100%!important;height:100%!important;touch-action:none}'
    + 'html.atlas-demo-embed #atlasDemoStrokes{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2}';
  (document.head || html).append(css);

  /* ---------- связь с DEMO ---------- */
  const post = m => { try { window.parent.postMessage(Object.assign({ src: 'atlas-demo-embed' }, m), '*'); } catch (e) { /* рамка закрыта */ } };
  // ошибки страницы в рамке — в DEMO (для проверок: на file:// консоль рамки снаружи не видна)
  window.addEventListener('error', e => post({ type: 'error', msg: (e && e.message) || 'ошибка' }));
  window.addEventListener('unhandledrejection', e => post({ type: 'error', msg: 'Promise: ' + String(e && e.reason && (e.reason.message || e.reason)) }));
  const T0 = performance.now();
  let A = null, V = null, ready = false, moved = false, isTrace = false, pending = null, planIds = [], insets = { top: 0, right: 0, bottom: 0, left: 0 }, firstFit = false;
  const byRender = new Map();   // renderId → состояние окраски
  const keyOf = new Map();      // renderId → id тела из DEMO
  const isDark = () => html.dataset.theme === 'dark';
  const GREY = () => isDark() ? [0.36, 0.39, 0.42] : [0.72, 0.75, 0.78];
  const PART = [0.97, 0.82, 0.24];   // как --c-partial (tokens.css)
  const ALPHA = { ctx: 0.12, todo: 0.10, part: 0.27 };   // 1.2.4: контраст как у R1.13.2 (Codex): не выполнено .10, частично .27

  let info = {};
  function paint(states, inf) {
    if (inf && typeof inf === 'object') info = inf;
    if (!ready) { pending = states; return; }
    byRender.clear(); keyOf.clear();
    let missing = 0;
    for (const [k, st] of Object.entries(states || {})) {
      let o = null; try { o = A.get(k); } catch (e) { o = null; }
      if (!o || !o.renderId) { missing++; continue; }
      byRender.set(o.renderId, st); keyOf.set(o.renderId, k);
    }
    const scene = (A.sceneObjects() || []).map(o => o.renderId), ctx = [], todo = [], part = [], tint = new Map(), n = { acc: 0, done: 0, part: 0, todo: 0, ctx: 0 };
    for (const r of scene) {
      const st = byRender.get(r);
      if (!st) { ctx.push(r); tint.set(r, GREY()); n.ctx++; continue; }
      n[st] = (n[st] || 0) + 1;
      if (st === 'todo') todo.push(r);
      else if (st === 'part') { tint.set(r, PART); part.push(r); }
    }
    if (V && V.ghost) { V.ghost('demo-context', ctx, { alpha: ALPHA.ctx, pick: false }); V.ghost('demo-todo', todo, { alpha: ALPHA.todo }); V.ghost('demo-part', part, { alpha: ALPHA.part }); }
    A.setTint('default', tint.size ? tint : null);
    planIds = [...byRender.keys()];
    post({ type: 'painted', counts: n, missing, inScene: scene.length });
    if (!firstFit) { firstFit = true; fit(); }
    queueOv();
  }
  // протяжённый объект (трасса): ракурс поворачивается так, чтобы главная ось позиций плана в плане шла поперёк экрана — модель крупнее;
  // компактный (здание) — ракурс конфига. Затем «вписать всё» с отступами под подписи DEMO (провайдер setFitInsets, кадр по fit_pad конфига)
  function align() {
    const C = [];
    for (const id of planIds) { const b = A.bounds([id]); if (b) C.push([(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]); }
    isTrace = false;
    if (C.length < 2 || typeof A.orbit !== 'function') return;
    let mx = 0, my = 0; for (const c of C) { mx += c[0]; my += c[1]; } mx /= C.length; my /= C.length;
    let xx = 0, yy = 0, xy = 0; for (const c of C) { const dx = c[0] - mx, dy = c[1] - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
    const tr = xx + yy, det = xx * yy - xy * xy, l1 = tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det)), l2 = tr - l1;
    if (!(l1 > 0) || l1 < 9 * Math.max(l2, 1e-9)) return;   // вытянутость по осям меньше 3 : 1 — ракурс не трогаем
    isTrace = true;
    const th = 0.5 * Math.atan2(2 * xy, xx - yy), ux = Math.cos(th), uy = Math.sin(th);
    const az0 = A.orbit().az, t = Math.atan2(-ux, uy), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    const d1 = wrap(t - az0), d2 = wrap(t + Math.PI - az0);
    A.orbit(Math.abs(d1) <= Math.abs(d2) ? d1 : d2, 0);
  }
  // кадр по позициям плана: углы их габаритов в проекции ракурса заполняют свободную часть холста (без кнопок и легенды DEMO) на 90 %;
  // без позиций или без setCamera (движок до api 30) — «вписать всё»
  function fit() {
    if (!ready) return;
    moved = false;
    try { align(); } catch (e) { /* ракурс конфига */ }
    if (!planIds.length || typeof A.setCamera !== 'function') { A.fit(); return; }
    const cv = document.getElementById('canvas'), W = cv ? cv.clientWidth : innerWidth, H = cv ? cv.clientHeight : innerHeight;
    const Wa = W - insets.left - insets.right, Ha = H - insets.top - insets.bottom;
    if (Wa < 40 || Ha < 40) return;
    const c = A.setCamera(null), r = [-Math.sin(c.az), Math.cos(c.az), 0], f = [Math.cos(c.el) * Math.cos(c.az), Math.cos(c.el) * Math.sin(c.az), Math.sin(c.el)];
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const XS = [], YS = [], add = p => { XS.push(dot(p, r)); YS.push(dot(p, u)); };
    for (const id of planIds) {
      const ax = isTrace ? axisOf(id) : null;   // трасса: протяжённое тело — по точкам оси (габарит косой трубы — большой квадрат); остальное — по углам габарита
      if (ax && ax.linear) { for (const p of ax.pts) add(p); continue; }
      const b = A.bounds([id]); if (!b) continue;
      for (let i = 0; i < 8; i++) add([b[i & 1 ? 1 : 0][0], b[i & 2 ? 1 : 0][1], b[i & 4 ? 1 : 0][2]]);
    }
    // много тел (здание) — без 0,5 % крайних точек с каждой стороны: одиночные выносы не уменьшают модель
    const cut = XS.length > 1600 ? Math.floor(XS.length * 0.005) : 0, sx = XS.sort((a, b) => a - b), sy = YS.sort((a, b) => a - b);
    if (sx.length) { x0 = sx[cut]; x1 = sx[sx.length - 1 - cut]; y0 = sy[cut]; y1 = sy[sy.length - 1 - cut]; }
    if (!(x1 >= x0 && y1 >= y0)) return;
    const FILL = 0.9, scale = Math.max((x1 - x0) * H / (2 * FILL * Wa), (y1 - y0) * H / (2 * FILL * Ha), 0.5), k = 2 * scale / H;
    const dx = (insets.left - insets.right) / 2, dy = (insets.top - insets.bottom) / 2, ma = (x0 + x1) / 2 - dx * k, mb = (y0 + y1) / 2 + dy * k, mf = dot(c.center, f);
    const bb = A.bounds(planIds), diag = bb ? Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1], bb[1][2] - bb[0][2]) : 0;
    A.setCamera({ center: [0, 1, 2].map(i => r[i] * ma + u[i] * mb + f[i] * mf), scale, radius: Math.min(1e5, Math.max(c.radius, diag * 3)) });
  }

  /* ---------- протяжённые тела (трубы, футляры): ось по вершинам и штрихи поверх кадра ----------
     Тонкая труба на общем виде трассы — меньше пикселя; поверх кадра рисуется её ось с толщиной не меньше 7 px (только пока сама труба тоньше):
     выполнено — насыщенный цвет материала (originalColor тела), не выполнено — прозрачный контур, частично — доля от начала;
     на границе выполненного — метка «ПК… · выполнено до сюда» (пикеты — из ведомости, поле ax, присылает DEMO). Движок не меняется. */
  const axes = new Map();
  function axisOf(r) {
    if (axes.has(r)) return axes.get(r);
    let V = null;
    try { const G = window.__FULL_ATLAS && window.__FULL_ATLAS.geometry, g = typeof G === 'function' ? G(r) : null; V = g && g.v && g.v.length ? g.v : null; } catch (e) { V = null; }
    if (!V || V.length < 4 || !Array.isArray(V[0])) { axes.set(r, null); return null; }
    const n = V.length, m = [0, 0, 0];
    for (const p of V) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
    m[0] /= n; m[1] /= n; m[2] /= n;
    const C = [0, 0, 0, 0, 0, 0];   // xx yy zz xy xz yz
    for (const p of V) { const x = p[0] - m[0], y = p[1] - m[1], z = p[2] - m[2]; C[0] += x * x; C[1] += y * y; C[2] += z * z; C[3] += x * y; C[4] += x * z; C[5] += y * z; }
    let e = [1, 1, 1];
    for (let i = 0; i < 30; i++) { const w = [C[0] * e[0] + C[3] * e[1] + C[4] * e[2], C[3] * e[0] + C[1] * e[1] + C[5] * e[2], C[4] * e[0] + C[5] * e[1] + C[2] * e[2]], l = Math.hypot(w[0], w[1], w[2]) || 1; e = [w[0] / l, w[1] / l, w[2] / l]; }
    let t0 = Infinity, t1 = -Infinity; const T = V.map(p => { const t = (p[0] - m[0]) * e[0] + (p[1] - m[1]) * e[1] + (p[2] - m[2]) * e[2]; if (t < t0) t0 = t; if (t > t1) t1 = t; return t; });
    const L = t1 - t0, nb = Math.min(64, Math.max(2, Math.ceil(L / 4))), B = Array.from({ length: nb }, () => [0, 0, 0, 0]);
    T.forEach((t, i) => { const k = Math.min(nb - 1, Math.floor((t - t0) / (L || 1) * nb)), b = B[k], p = V[i]; b[0] += p[0]; b[1] += p[1]; b[2] += p[2]; b[3]++; });
    const pts = B.filter(b => b[3]).map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]);
    let R = 0; T.forEach((t, i) => { const k = Math.min(nb - 1, Math.floor((t - t0) / (L || 1) * nb)), b = B[k], p = V[i]; R += Math.hypot(p[0] - b[0] / b[3], p[1] - b[1] / b[3], p[2] - b[2] / b[3]); });
    R /= n;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const ax = { pts, R, len, linear: pts.length >= 2 && L > 1 && L > 12 * Math.max(R, 1e-3) };
    axes.set(r, ax); return ax;
  }
  const hex = c => { const m = /^#([0-9a-f]{6})/i.exec(c || ''); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255) : null; };
  function rich(c) {   // насыщенный цвет материала: та же гамма, насыщенность ≥ 0,55, светлота 0,32…0,48; серое — сталь
    const v = hex(c); if (!v) return '#1F5F8B';
    const mx = Math.max(...v), mn = Math.min(...v), l = (mx + mn) / 2, d = mx - mn;
    if (d < 0.06) return '#1F5F8B';
    let hh = mx === v[0] ? ((v[1] - v[2]) / d) % 6 : mx === v[1] ? (v[2] - v[0]) / d + 2 : (v[0] - v[1]) / d + 4; hh = (hh * 60 + 360) % 360;
    return 'hsl(' + hh.toFixed(0) + ' ' + Math.round(Math.max(55, d / (1 - Math.abs(2 * l - 1)) * 100)) + '% ' + Math.round(Math.min(48, Math.max(32, l * 100))) + '%)';
  }
  const pkText = m => { const a = Math.floor(m / 100 + 1e-9), b = m - a * 100, t = Math.abs(b - Math.round(b)) < 0.05 ? String(Math.round(b)) : b.toFixed(1).replace('.', ','); return 'ПК' + a + '+' + (t.length < 2 || /^\d,/.test(t) ? '0' + t : t); };
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // точка на ломаной по доле длины от начала
  function cutAt(pts, f) {
    let len = 0; for (let i = 1; i < pts.length; i++) len += d3(pts[i], pts[i - 1]);
    let need = len * Math.max(0, Math.min(1, f));
    for (let i = 1; i < pts.length; i++) { const s = d3(pts[i], pts[i - 1]); if (need <= s || i === pts.length - 1) { const k = s ? Math.min(1, need / s) : 0, q = [0, 1, 2].map(j => pts[i - 1][j] + (pts[i][j] - pts[i - 1][j]) * k); return { head: pts.slice(0, i).concat([q]), tail: [q].concat(pts.slice(i)), at: q }; } need -= s; }
    return { head: pts, tail: [], at: pts[pts.length - 1] };
  }
  let ov = null, octx = null, ovQ = false;
  const queueOv = () => { if (ovQ || !ready) return; ovQ = true; requestAnimationFrame(() => { ovQ = false; try { drawOv(); } catch (e) { /* штрихи — только оформление */ } }); };
  function drawOv() {
    const cv = document.getElementById('canvas'); if (!cv || !A) return;
    if (!ov) { ov = document.createElement('canvas'); ov.id = 'atlasDemoStrokes'; ov.setAttribute('aria-hidden', 'true'); cv.after(ov); octx = ov.getContext('2d'); }
    const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (ov.width !== Math.round(W * dpr) || ov.height !== Math.round(H * dpr)) { ov.width = Math.round(W * dpr); ov.height = Math.round(H * dpr); }
    const g = octx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    // штрихи — только у протяжённого объекта (трасса), не больше 600 тел; у здания тонкие тела (арматура) не выделяются
    if (!byRender.size || !isTrace) { if (drawOv.sig) { drawOv.sig = ''; post({ type: 'strokes', lines: 0, thin: 0, marks: [] }); } return; }
    const ppm = H / (2 * A.setCamera(null).scale), dk = isDark();
    const L = [];
    // 1.2.4: штрих гаснет плавно при приближении: тоньше 7 px — полностью, 7–11 px — убывает, толще — нет
    for (const [r, st] of byRender) { if (L.length >= 600) break; const ax = axisOf(r); if (ax && ax.linear) { const d = 2 * ax.R * ppm, op = Math.max(0, Math.min(1, (11 - d) / 4)); L.push({ r, st, ax, thin: op > 0, op, inf: info[keyOf.get(r)] || {} }); } }
    if (!L.length) return;
    const done = L.filter(x => x.st === 'done' || x.st === 'acc'), todo = L.filter(x => x.st === 'todo'), part = L.filter(x => x.st === 'part');
    const near = (p, list) => { let b = Infinity; for (const x of list) for (const q of x.ax.pts) b = Math.min(b, d3(p, q)); return b; };
    // у частично выполненного — начало у выполненного соседа (иначе — первая точка оси); доля — от DEMO (объём или % отметки)
    const segs = { done: [], todo: [] }, marks = [];
    for (const x of done) segs.done.push({ x, pts: x.ax.pts });
    for (const x of todo) segs.todo.push({ x, pts: x.ax.pts });
    for (const x of part) {
      let pts = x.ax.pts; const a = pts[0], b = pts[pts.length - 1];
      if (done.length && near(b, done) < near(a, done)) pts = pts.slice().reverse();
      const f = Number.isFinite(x.inf.frac) ? x.inf.frac : null;
      if (f == null) { segs.todo.push({ x, pts, part: true }); continue; }
      const c = cutAt(pts, f); segs.done.push({ x, pts: c.head }); segs.todo.push({ x, pts: c.tail });
      const pk = Array.isArray(x.inf.pk) ? x.inf.pk : null;
      if (pk) marks.push({ at: c.at, text: pkText(Number.isFinite(x.inf.pkAt) ? x.inf.pkAt : pk[0] + (pk[1] - pk[0]) * f) + ' · выполнено до сюда' });
    }
    // без частичных: граница — конец выполненного тела с наибольшим пикетом, обращённый к невыполненному
    if (!marks.length && done.length && todo.length) {
      const W2 = done.filter(x => Array.isArray(x.inf.pk)).sort((p, q) => q.inf.pk[1] - p.inf.pk[1])[0];
      if (W2) { const a = W2.ax.pts[0], b = W2.ax.pts[W2.ax.pts.length - 1]; marks.push({ at: near(a, todo) < near(b, todo) ? a : b, text: pkText(W2.inf.pk[1]) + ' · выполнено до сюда' }); }
    }
    const P = pts => { const out = []; for (const p of pts) { const q = A.projectToScreen(p); if (q && Number.isFinite(q[0]) && Number.isFinite(q[1])) out.push(q); } return out; };
    const path = q => { g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    // 1.2.4 (значения R1.13.2, Codex): белая кромка + ось цвета материала; не выполнено — 3,75 px α .12 / 2,25 px α .18 (частично без доли — .32); выполнено — 6,5 px α .93 / 4,5 px α 1
    const colOf = r => { let c = '#1F5F8B'; try { c = rich((A.get(r) || {}).originalColor); } catch (e) { /* сталь */ } return c; };
    const stroke = (s, fin) => { if (!s.x.thin || s.pts.length < 2) return; const q = P(s.pts); if (q.length < 2) return; const op = s.x.op;
      path(q); g.globalAlpha = op * (fin ? 0.93 : 0.12); g.strokeStyle = '#FFFFFF'; g.lineWidth = fin ? 6.5 : 3.75; g.stroke();
      path(q); g.globalAlpha = op * (fin ? 1 : s.part ? 0.32 : 0.18); g.strokeStyle = colOf(s.x.r); g.lineWidth = fin ? 4.5 : 2.25; g.stroke(); g.globalAlpha = 1; };
    for (const s of segs.todo) stroke(s, false);
    for (const s of segs.done) stroke(s, true);
    // метка границы выполненного
    g.font = '600 13px "Golos Text", system-ui, sans-serif';
    for (const mk of marks) {
      const q = A.projectToScreen(mk.at); if (!q || !Number.isFinite(q[0])) continue;
      const x = q[0], y = q[1], tw = g.measureText(mk.text).width + 16, bx = Math.max(4, Math.min(W - tw - 4, x - tw / 2)), by = Math.max(4, y - 44);
      g.strokeStyle = dk ? '#E6EEF5' : '#16324A'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(Math.max(bx + 8, Math.min(bx + tw - 8, x)), by + 24); g.stroke();
      g.fillStyle = dk ? '#0F1C27' : '#FFFFFF'; g.strokeStyle = '#0E8A6A'; g.lineWidth = 2; g.beginPath(); if (g.roundRect) g.roundRect(bx, by, tw, 24, 6); else g.rect(bx, by, tw, 24); g.fill(); g.stroke();
      g.fillStyle = dk ? '#E6EEF5' : '#0B2236'; g.textBaseline = 'middle'; g.fillText(mk.text, bx + 8, by + 12.5);
      g.beginPath(); g.arc(x, y, 5.5, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#0E8A6A'; g.stroke();
    }
    const sig = L.length + '|' + L.filter(x => x.thin).length + '|' + marks.map(m => m.text).join(';');
    if (sig !== drawOv.sig) { drawOv.sig = sig; post({ type: 'strokes', lines: L.length, thin: L.filter(x => x.thin).length, marks: marks.map(m => m.text) }); }
  }
  document.addEventListener('atlas:camera', queueOv);
  window.addEventListener('resize', queueOv);

  /* ---------- автоповорот: только пока нет рук на модели ---------- */
  let spin = false, last = 0, quietUntil = 0, frames = 0, fpsT = 0;
  const RATE = 2 * Math.PI / 75;   // оборот за 75 с
  function loop(t) {
    if (!spin) { last = 0; return; }
    if (last && ready && t > quietUntil && !document.hidden) { const dt = Math.min(0.1, (t - last) / 1000); A.orbit(-RATE * dt, 0); frames++; }
    if (!fpsT) fpsT = t; else if (t - fpsT >= 2000) { post({ type: 'fps', fps: Math.round(frames * 1000 / (t - fpsT)) }); frames = 0; fpsT = t; }
    last = t; requestAnimationFrame(loop);
  }
  const hands = () => { quietUntil = performance.now() + 6000; moved = true; };
  for (const e of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(e, hands, { capture: true, passive: true });
  let rsT = 0;
  window.addEventListener('resize', () => { clearTimeout(rsT); rsT = setTimeout(() => { if (firstFit && !moved) fit(); }, 200); });

  addEventListener('message', e => {
    if (e.source !== window.parent) return;
    const m = e.data;
    if (!m || typeof m !== 'object' || m.src !== 'atlas-demo') return;
    if (m.type === 'paint') paint(m.states, m.info);
    else if (m.type === 'fit') fit();
    else if (m.type === 'insets') { let ch = false; for (const k of ['top', 'right', 'bottom', 'left']) { const v = Math.max(0, Number(m[k]) || 0); if (v !== insets[k]) { insets[k] = v; ch = true; } } if (ch && firstFit && !moved) fit(); }
    else if (m.type === 'spin') { const on = !!m.on && ready && typeof A.orbit === 'function'; if (on && !spin) { spin = true; frames = 0; fpsT = 0; requestAnimationFrame(loop); } else if (!on) spin = false; post({ type: 'spin', on: spin }); }
    else if (m.type === 'theme') {
      dark = !!m.dark; html.dataset.theme = dark ? 'dark' : 'light';
      try { if (V && V.set) V.set('background', dark ? 'dark' : 'light'); } catch (x) { /* вид */ }
      if (ready && byRender.size) paint(Object.fromEntries([...keyOf].map(([r, k]) => [k, byRender.get(r)])));
      queueOv();
    } else if (m.type === 'deselect') { try { A.deselect(); } catch (x) { /* нет выбора */ } }
  });

  /* ---------- ход загрузки, готовность ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    const lt = document.getElementById('loadText');
    if (lt) { const send = () => post({ type: 'load', text: lt.textContent.trim() }); send(); new MutationObserver(send).observe(lt, { childList: true, characterData: true, subtree: true }); }
    // правая панель (карточка) в рамке не открывается: иначе движок сдвигает кадр под неё
    const right = document.getElementById('right');
    if (right) new MutationObserver(() => { if (right.classList.contains('open')) right.classList.remove('open'); }).observe(right, { attributes: true, attributeFilter: ['class'] });
  });
  document.addEventListener('atlas:sceneready', e => { const d = e.detail || {}; post({ type: 'frame', partial: !!d.partial, ms: Math.round(performance.now()) }); });
  document.addEventListener('atlas:ready', () => {
    A = window.__ATLAS; V = window.AtlasViewSettings;
    if (!A) return;
    try { A.setFitInsets(() => insets); } catch (e) { /* старый движок */ }
    try { A.labelsOverride('off'); } catch (e) { /* старый движок */ }
    post({ type: 'engine', api: A.apiVersion, backend: (A.state && A.state().backend) || null, orbit: typeof A.orbit === 'function' });
    A.whenReady().then(r => {
      ready = true;
      // касание: один палец вращает (кнопка «Вращать» главной, только в памяти рамки)
      const ot = document.getElementById('atlasOrbitToggle');
      if (ot && ot.getAttribute('aria-pressed') !== 'true') ot.click();
      post({ type: 'ready', ms: Math.round(performance.now()), own: Math.round(performance.now() - T0), error: r && r.error ? String(r.error.message || r.error) : null, backend: A.state().backend });
      if (pending) { const s = pending; pending = null; paint(s); } else fit();
    });
  }, { once: true });
  document.addEventListener('atlas:selectionchange', e => {
    const id = e.detail && e.detail.id;
    if (!id) { post({ type: 'pick', id: null }); return; }
    let o = null; try { o = A.get(id); } catch (x) { o = null; }
    post({ type: 'pick', id, key: keyOf.get(id) || (o && o.id) || id, name: o ? (o.name || o.title || null) : null, state: byRender.get(id) || null });
  });
})();
