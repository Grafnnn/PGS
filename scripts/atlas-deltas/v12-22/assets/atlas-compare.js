/* 3D Атлас · сравнение редакций с общей камерой (1.1.x, план 2.0, этап 2).
   Пара «было / стало» показывается при одной камере, одном сечении и одном размере кадра: «Было», «Стало», «Различия» (изменившиеся пиксели
   поверх «стало»), числа — изменение внешнего габарита и смещение центра по bounds(). Нулевая разница габарита не выдаётся за отсутствие различий формы.
   Пары — только из данных объекта: data/compare.js → window.ATLAS_COMPARE = {version:1, pairs:[{id, label?, before:[ids], after:[ids], context?:[ids]}]}.
   Пара принимается только целиком (все тела есть, before и after не пустые, ≤ 500 тел). Сверка произвольных поставок по ID — этап 5 плана (после формата A).
   Включается ключом конфига compare:{enabled:true}; без ключа модуль не грузится. Нужен движок с frame() (api 28, features.frame); без него модуль молчит.
   Вход запоминает вид (capture) и набор видимых тел (visibleSetState: ids, keepOnScope — capture их не хранит); «Вернуть вид», Esc или ошибка — возврат.
   На время сравнения кадр закрывает холст и не пропускает щелчки и жесты: камера не уходит от кадров.
   1.2 (перенос пилота Codex МУ 23 в общий модуль): пара доступна только если все её тела в текущей сцене (inScene) — иначе кнопки нет (сравнение из «Всего здания»,
   где тела «стало» не загружены, отклоняется); каждый кадр проверяет, что видны ровно тела стороны (setVisibleSet вернул их число) и что сцена загрузилась;
   «Вернуть вид» при той же камере и сечении не перестраивает вид (только выбор), сечение возвращается со своим keepOnScope; набор видимых тел пользователя — последним;
   отмена во время кадров (смена раздела) не трогает уже возвращённый вид; текст ошибки сохраняется после возврата.
   Без fetch/XHR, работает из file://. Образец — прототип Codex, ПОСТАВКИ_CODEX/_ядро/20261118_ATLAS_2_0_GRAPHICS_R1/сравнение. */
'use strict';
window.AtlasCompare = (() => {
  const CFG = (window.ATLAS_PROJECT || {}).compare;
  if (!CFG || typeof CFG !== 'object' || CFG.enabled === false) return null;
  const MAXN = 500, THR = 24, MARK = [214, 0, 110];
  /* 1.2 (пилот Codex МУ 23, ПОСТАВКИ_CODEX/20261122_ATLAS_2_0_COMPARE_TROITSK_PILOT/pilot-runtime.patch): на время кадров обе стороны окрашены одним нейтральным цветом —
     различие кадров даёт форма, а не разная окраска сторон (выбор, статус); исходная окраска возвращается сразу после кадра */
  const TINT_OWNER = 'compare', TINT = [122, 144, 156];
  let A = null, pairs = [], byMember = new Map();
  let cur = null, snap = null, vsSnap = null, frames = null, stats = null, view = '', busy = false, root = null, overlay = null, statusEl = null, wantFocus = '';

  const str = v => typeof v === 'string' && v.trim() ? v.trim() : '';
  function rid(id) { try { const r = A.get(id); return r && r.renderId ? r.renderId : null; } catch (e) { return null; } }
  function ids(list, name, pid) {
    if (!Array.isArray(list)) throw Error(name + ' не список');
    const out = [];
    for (const x of list) { const r = str(x) ? rid(str(x)) : null; if (!r) throw Error('тела ' + x + ' нет'); if (!out.includes(r)) out.push(r); }
    return out;
  }
  function readData(d) {
    pairs = []; byMember = new Map();
    if (!d || typeof d !== 'object' || !Array.isArray(d.pairs)) return;
    for (const p of d.pairs) {
      const id = p && str(p.id);
      try {
        if (!id) throw Error('нет id');
        const before = ids(p.before, 'before', id), after = ids(p.after, 'after', id), context = p.context == null ? [] : ids(p.context, 'context', id);
        if (!before.length || !after.length) throw Error('before или after пусты');
        if (before.length + after.length + context.length > MAXN) throw Error('больше ' + MAXN + ' тел');
        const pr = { id, label: str(p.label) || id, before, after, context };
        pairs.push(pr);
        for (const r of [...before, ...after]) if (!byMember.has(r)) byMember.set(r, pr);
      } catch (e) { console.warn('[compare] ' + (id || '?') + ': ' + e.message + ' — пара пропущена'); }
    }
  }
  function loadData() {
    return new Promise(res => {
      if (window.ATLAS_COMPARE) return res(window.ATLAS_COMPARE);
      const s = document.createElement('script');
      s.src = 'data/compare.js';
      s.onload = () => res(window.ATLAS_COMPARE || null);
      s.onerror = () => res(null);
      document.body.append(s);
    });
  }
  const pairFor = id => { const r = id ? rid(id) : null; return r ? byMember.get(r) || null : null; };
  function inScene(pr) {
    return !!pr && [...pr.before, ...pr.after, ...pr.context].every(id => A.inScene(id));
  }

  /* --- кадры и маска --- */
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const camKey = c => [c.az, c.el, c.scale, c.radius, ...(c.center || [])].map(x => Math.round(x * 1e6)).join(',');
  async function shoot(list, side, original) {
    const count = A.setVisibleSet(list, { keepOnScope: true });
    if (count !== new Set(list).size) throw Error('часть тел кадра скрыта либо в кадре есть другое наложение');
    const ready = await A.whenReady();
    if (ready?.error) throw Error('геометрия сцены не загрузилась');
    await nextFrame();
    if (snap !== original) return null;
    const v = A.capture();
    const palette = Object.fromEntries(side.map(id => [id, TINT]));
    A.setTint(TINT_OWNER, palette);
    try {
      const f = A.frame();
      if (!f || !f.width || !f.height) throw Error('кадр не получен');
      return { canvas: f, cam: camKey(v.camera), section: JSON.stringify(A.sectionState().section || null) };
    } finally {
      A.setTint(TINT_OWNER, null);
    }
  }
  function diff(a, b) {
    const w = a.width, h = a.height, ca = a.getContext('2d'), cb = b.getContext('2d');
    const da = ca.getImageData(0, 0, w, h).data, db = cb.getImageData(0, 0, w, h).data;
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const co = out.getContext('2d'), img = co.createImageData(w, h), o = img.data;
    let changed = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0, p = 0; i < da.length; i += 4, p++) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > THR) {
        changed++; o[i] = MARK[0]; o[i + 1] = MARK[1]; o[i + 2] = MARK[2]; o[i + 3] = 255;
        const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      } else { o[i] = db[i]; o[i + 1] = db[i + 1]; o[i + 2] = db[i + 2]; o[i + 3] = 255; }
    }
    // «стало» приглушено, изменившиеся пиксели — ярким цветом, без полупрозрачности (цвет дублируется подписью в строке статуса)
    for (let i = 0; i < o.length; i += 4) if (!(o[i] === MARK[0] && o[i + 1] === MARK[1] && o[i + 2] === MARK[2])) { o[i] = 255 - (255 - o[i]) * .45; o[i + 1] = 255 - (255 - o[i + 1]) * .45; o[i + 2] = 255 - (255 - o[i + 2]) * .45; }
    co.putImageData(img, 0, 0);
    return { canvas: out, changed, total: w * h, box: changed ? [x0, y0, x1, y1] : null };
  }
  function boundsDelta(pr) {
    const a = A.bounds(pr.before), b = A.bounds(pr.after);
    if (!a || !b) return null;
    const mm = v => Math.round(v * 1000);
    const size = i => mm((b[1][i] - b[0][i]) - (a[1][i] - a[0][i])), ctr = i => mm(((b[0][i] + b[1][i]) - (a[0][i] + a[1][i])) / 2);
    return { size: [size(0), size(1), size(2)], shift: [ctr(0), ctr(1), ctr(2)],
      before: [0, 1, 2].map(i => mm(a[1][i] - a[0][i])), after: [0, 1, 2].map(i => mm(b[1][i] - b[0][i])) };
  }
  const fmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ru-RU');
  function summary() {
    if (!stats) return '';
    const b = stats.bounds, sameBox = b && b.size.every(x => x === 0) && b.shift.every(x => x === 0);
    const box = !b ? 'габарит не определён' : sameBox ? 'внешний габарит не изменился (' + b.after.map(x => x.toLocaleString('ru-RU')).join(' × ') + ' мм)'
      : 'габарит ' + b.size.map(fmt).join(' / ') + ' мм, смещение центра ' + b.shift.map(fmt).join(' / ') + ' мм (X / Y / Z)';
    const px = stats.changed ? 'изменилось ' + stats.changed.toLocaleString('ru-RU') + ' пикс. на этом виде — отмечены малиновым' : 'на этом виде изменившихся пикселей нет';
    return box + '; ' + px + '. Один цвет для обеих сторон. «Вернуть вид» или Esc.';
  }

  /* --- панель и наложение --- */
  function css() {
    if (document.getElementById('atlasCompareCss')) return;
    const st = document.createElement('style'); st.id = 'atlasCompareCss';
    st.textContent = '#atlasCompare{position:fixed;z-index:58;display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;box-sizing:border-box;padding:8px 10px;border-radius:8px;' +
      'background:var(--c-surface,#fff);color:var(--c-text,#14202A);border:1px solid var(--c-line,#C9D2D9);box-shadow:0 2px 10px rgba(0,0,0,.12);font:14px/1.3 var(--font,system-ui,sans-serif)}' +
      '#atlasCompare[hidden],#atlasCompareView[hidden]{display:none}#atlasCompare h2{font:inherit;font-weight:600;margin:0 4px 0 0;flex:1 0 100%}' +
      '#atlasCompare button{font:inherit;min-height:32px;padding:4px 10px;border-radius:6px;border:1px solid var(--c-line,#C9D2D9);background:var(--c-surface,#fff);color:inherit;cursor:pointer;white-space:nowrap}' +
      '#atlasCompare button[aria-pressed=true]{background:var(--c-accent-weak,#DCEBF5);border-color:var(--c-accent,#1F6FA8)}#atlasCompare button:disabled{opacity:.5;cursor:default}' +
      '#atlasCompare button:focus-visible{outline:2px solid var(--c-accent,#1F6FA8);outline-offset:1px}#atlasCompare [role=status]{flex:1 0 100%;color:var(--c-text-2,#4A5A66);font-size:13px}' +
      '#atlasCompare [role=status]:empty{display:none}#atlasCompareView{position:fixed;z-index:57;pointer-events:auto;cursor:default;object-fit:fill;touch-action:none}' +
      '#atlasCompare.ac-narrow{padding:6px;gap:6px}#atlasCompare.ac-narrow button{min-height:44px;padding:4px 8px}#atlasCompare.ac-narrow [data-act=return]{order:-1}#atlasCompare.ac-narrow h2{order:-2;font-size:13px;line-height:1.3}';
    document.head.append(st);
  }
  function canvasRect() { const cv = document.getElementById('canvas'); return cv ? cv.getBoundingClientRect() : { top: 56, left: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight - 56 }; }
  function place() {
    const r = canvasRect();
    if (overlay && !overlay.hidden) { const s = overlay.style; s.left = r.left + 'px'; s.top = r.top + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px'; }
    if (!root || root.hidden) return;
    const narrow = innerWidth < 600, s = root.style;
    root.classList.toggle('ac-narrow', narrow);
    if (narrow) { s.top = Math.round(r.top + 64 + stackOffset()) + 'px'; s.left = Math.round(r.left + 12) + 'px'; s.right = Math.round(innerWidth - r.right + 64) + 'px'; s.bottom = ''; s.maxWidth = ''; s.transform = ''; }
    else { s.maxWidth = Math.max(240, Math.min(600, r.width - 48)) + 'px'; s.top = ''; s.right = ''; s.left = Math.round(r.left + r.width / 2) + 'px'; s.transform = 'translateX(-50%)'; s.bottom = Math.round(innerHeight - r.bottom + 92 + stackOffset()) + 'px'; }
  }
  const ME = 'compare', PANEL_ID = 'atlasCompare';
  /* Общие правила панелей режимов (разбор слоёв, сравнение): одна активная — другая скрыта и не перехватывает управление
     (body[data-atlas-tool]); видимые вместе — стопкой без наложения (порядок PANELS); смена — событие atlas:toolpanel */
  const PANELS = ['atlasLayers', 'atlasCompare'];
  function toolMode() { return document.body.dataset.atlasTool || ''; }
  function setTool(on) { if (on) document.body.dataset.atlasTool = ME; else if (toolMode() === ME) delete document.body.dataset.atlasTool; }
  function stackOffset() { let off = 0; for (const id of PANELS) { if (id === PANEL_ID) break; const e = document.getElementById(id); if (e && !e.hidden) off += e.offsetHeight + 8; } return off; }
  /* 1.2: панели-соседи перестраиваются в обработчике события синхронно (тихо, без ответного события) — после него своё место пересчитывается:
     выход из сравнения без перестройки вида (та же камера и сечение) возвращает панель слоёв, и стопка не должна накрывать её */
  function panelChanged() { document.dispatchEvent(new CustomEvent('atlas:toolpanel', { detail: { from: ME } })); place(); }
  function el(tag, attrs, text) { const e = document.createElement(tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
  function render(quiet) {
    if (!root) {
      css();
      root = el('section', { id: 'atlasCompare', 'aria-label': 'Сравнение редакций' }); root.hidden = true;
      overlay = el('img', { id: 'atlasCompareView', alt: '' }); overlay.hidden = true;
      document.body.append(overlay, root);
      addEventListener('resize', place);
      const cv = document.getElementById('canvas'); if (cv && window.ResizeObserver) new ResizeObserver(place).observe(cv);
    }
    const fa = document.activeElement;
    if (fa && root.contains(fa)) wantFocus = fa.dataset.view ? '[data-view="' + fa.dataset.view + '"]' : fa.dataset.act ? '[data-act="' + fa.dataset.act + '"]' : '';
    else if (fa && fa !== document.body) wantFocus = '';
    if (!cur || (toolMode() && toolMode() !== ME)) { root.hidden = true; root.replaceChildren(); overlay.hidden = true; if (quiet !== true) panelChanged(); return; }
    const out = [el('h2', null, 'Сравнение: ' + cur.label)];
    if (!snap) {
      const b = el('button', { type: 'button', 'data-act': 'open' }, 'Сравнить «было / стало»'); b.disabled = busy; b.onclick = () => open(cur.id); out.push(b);
    } else {
      for (const [k, t] of [['before', 'Было'], ['after', 'Стало'], ['diff', 'Различия']]) {
        const b = el('button', { type: 'button', 'data-view': k, 'aria-pressed': String(view === k) }, t); b.disabled = busy || !frames; b.onclick = () => show(k); out.push(b);
      }
      const r = el('button', { type: 'button', 'data-act': 'return' }, 'Вернуть вид'); r.disabled = busy; r.onclick = restore; out.push(r);
    }
    statusEl = el('span', { role: 'status', 'aria-live': 'polite' }, statusEl ? statusEl.textContent : '');
    out.push(statusEl);
    root.replaceChildren(...out); root.hidden = false;
    if (frames && view) { overlay.src = (view === 'diff' ? stats.diff : frames[view]).toDataURL('image/png'); overlay.alt = view === 'diff' ? 'Различия: изменившиеся места отмечены малиновым' : view === 'before' ? 'Было' : 'Стало'; overlay.hidden = false; }
    else overlay.hidden = true;
    place();
    if (wantFocus) { const b = root.querySelector(wantFocus); if (!b) wantFocus = ''; else if (!b.disabled) { b.focus({ preventScroll: true }); wantFocus = ''; } }
    if (quiet !== true) panelChanged();
  }
  function say(t) { if (statusEl) statusEl.textContent = t; }

  async function open(id) {
    const pr = pairs.find(p => p.id === id);
    if (!inScene(pr) || busy || snap || (toolMode() && toolMode() !== ME)) return null;
    cur = pr; setTool(true); busy = true; render();
    const vs = A.visibleSetState && A.visibleSetState();
    snap = A.capture(); vsSnap = vs ? { ids: vs.ids ? [...vs.ids] : null, keepOnScope: !!vs.keepOnScope } : null;
    if (snap.section) snap.section.keepOnScope = A.sectionState().keepOnScope;
    const original = snap;
    try {
      if (A.selection()) A.deselect();
      const fb = await shoot([...pr.before, ...pr.context], pr.before, original);
      if (!fb) return null;
      const fa = await shoot([...pr.after, ...pr.context], pr.after, original);
      if (!fa) return null;
      if (fb.cam !== fa.cam) throw Error('камера изменилась между кадрами');
      if (fb.section !== fa.section) throw Error('сечение изменилось между кадрами');
      if (fb.canvas.width !== fa.canvas.width || fb.canvas.height !== fa.canvas.height) throw Error('размер кадра изменился');
      const d = diff(fb.canvas, fa.canvas);
      frames = { before: fb.canvas, after: fa.canvas };
      stats = { diff: d.canvas, changed: d.changed, total: d.total, box: d.box, bounds: boundsDelta(pr), size: [fa.canvas.width, fa.canvas.height] };
      view = 'diff';
      if (wantFocus === '[data-act="open"]' || document.activeElement === document.body) wantFocus = '[data-view="diff"]';   // кнопки «Сравнить» больше нет — фокус на «Различия»
      busy = false; render(); say(summary());
      return api.state();
    } catch (e) {
      if (snap !== original) return null;
      busy = false; say('Сравнение не выполнено: ' + e.message + '. Вид возвращён.');
      await restore(true);
      return null;
    }
  }
  function show(k) { if (!frames || busy) return false; view = k; render(); say(k === 'diff' ? summary() : k === 'before' ? 'Было — та же камера и сечение' : 'Стало — та же камера и сечение'); return true; }
  async function restore(keepMsg) {
    if (!snap) return false;
    const v = snap, vs = vsSnap;
    const message = keepMsg === true ? statusEl?.textContent : '';
    busy = true; render();
    try {
      A.setVisibleSet(null);
      const now = A.capture();
      const { keepOnScope, ...section } = v.section || {};
      const same = JSON.stringify({ ...now, selection: null }) === JSON.stringify({
        ...v, selection: null, ...(v.section ? { section } : {})
      });
      const sameKeep = !v.section || keepOnScope === A.sectionState().keepOnScope;
      if (same && sameKeep) {
        if (v.selection) A.select(v.selection, { updateHash: false });
        else if (A.selection()) A.deselect();
      } else {
        if (!v.selection && A.selection()) A.deselect();
        await A.restoreView(v);
      }
    } finally {
      if (vs?.ids) A.setVisibleSet(vs.ids, { keepOnScope: vs.keepOnScope });
      snap = null; vsSnap = null; frames = null; stats = null; view = ''; busy = false; setTool(false);
      const pair = pairFor(A.selection());
      cur = inScene(pair) ? pair : null;
      render(); say(message || 'Исходный вид восстановлен');
    }
    return true;
  }
  function onSelection() {
    if (busy || snap) return;
    const pair = pairFor(A.selection()), p = inScene(pair) ? pair : null;
    if (p !== cur) { cur = p; if (statusEl) statusEl.textContent = ''; render(); }
  }
  /* Смена раздела во время сравнения: сравнение закрыто без возврата камеры (раздел и его камера — новые); временный набор видимых тел сравнения снят:
     исходный набор пользователя возвращается, только если он сам переживал смену раздела (keepOnScope), иначе — без набора, как сделал бы движок */
  function onScope() {
    if (snap) {
      const vs = vsSnap;
      snap = null; vsSnap = null; frames = null; stats = null; view = ''; busy = false; setTool(false);
      try { A.setVisibleSet(vs && vs.ids && vs.keepOnScope ? vs.ids : null, { keepOnScope: !!(vs && vs.ids && vs.keepOnScope) }); } catch (e) { /* набор недоступен — оставляем как есть */ }
    }
    if (busy) return;
    cur = null; render();
  }

  const api = {
    pairs: () => pairs.map(p => ({ id: p.id, label: p.label, before: p.before.slice(), after: p.after.slice(), context: p.context.slice() })),
    pairFor: id => { const p = pairFor(id); return p ? p.id : null; },
    open: id => open(id), show: k => show(k), restore: () => restore(),
    state: () => ({ pair: cur && cur.id, inside: !!snap, busy, view, changed: stats ? stats.changed : null, total: stats ? stats.total : null, box: stats ? stats.box : null,
      bounds: stats ? stats.bounds : null, size: stats ? stats.size : null, text: summary(), visible: !!(root && !root.hidden) })
  };

  async function start() {
    A = window.__ATLAS;
    if (!A || !A.features || !A.features.frame || typeof A.frame !== 'function') { console.warn('[compare] движок без frame() (нужен api 28) — сравнение выключено'); return; }
    readData(await loadData());
    await A.whenReady();
    document.addEventListener('atlas:selectionchange', onSelection);
    document.addEventListener('atlas:scope', onScope);
    document.addEventListener('atlas:toolpanel', e => { if (e.detail && e.detail.from !== ME && root) render(true); });
    addEventListener('atlas:escape', e => {
      const d = e.detail || {}, o = d.original, tg = o && o.target;
      if (!snap || e.defaultPrevented || d.modal || (o && o.defaultPrevented)) return;
      if ((tg && tg.closest && tg.closest('dialog')) || document.querySelector('dialog[open]')) return;
      e.preventDefault(); restore();
    }, true);
    onSelection();
    document.dispatchEvent(new CustomEvent('atlas:compareready', { detail: { pairs: pairs.length } }));
  }
  if (window.__ATLAS) start(); else document.addEventListener('atlas:ready', start, { once: true });
  return api;
})();
