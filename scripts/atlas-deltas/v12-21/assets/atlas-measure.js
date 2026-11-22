/* 3D Атлас · «Линейка» (V11.1, задача H, интерфейс). Работает на API движка (задача A):
   __ATLAS.pickSurface(x, y, {snap, radiusPx}) → {point, id, snap, normal} | null,
   __ATLAS.projectToScreen(p) → [sx, sy, visible], __ATLAS.setMeasurements([{points, label}]),
   __ATLAS.setMeasureCursor({point, snap} | null), __ATLAS.setToolMode('measure' | null).
   Пока линейка выключена, обработчики на холсте не установлены — скорость запуска не меняется. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = window.AtlasShell, make = S.make;
  const canvas = $('canvas'), stage = document.querySelector('.stage');
  if (!canvas || !stage) return;
  const A = () => window.__ATLAS || {};
  const ready = () => ['pickSurface', 'projectToScreen', 'setMeasurements', 'setMeasureCursor', 'setToolMode'].every(k => typeof A()[k] === 'function');
  const SNAP_ICON = { vertex: '●', edge: '◆', face: '▲' };
  const SNAP_NAME = { vertex: 'вершина', edge: 'ребро', face: 'грань' };
  const NOTE = 'Измерение по геометрии модели, точность около ±1 мм (сжатие координат). Это не размер по РД.';
  const phone = () => innerWidth <= 850;

  /* ---------- числа ---------- */
  const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const lenOf = pts => pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  const mm = m => Math.round(m * 1000);
  function fmtLen(m) {
    const v = mm(m);
    const s = S.fmt(v) + ' мм';
    return v >= 10000 ? s + ' (' + (v / 1000).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' м)' : s;
  }
  const spoken = m => S.fmt(mm(m)).replace(/ /g, ' ') + ' ' + S.plural(mm(m), 'миллиметр', 'миллиметра', 'миллиметров');
  const deltas = pts => { const a = pts[0], b = pts[pts.length - 1]; return [0, 1, 2].map(k => mm(Math.abs(b[k] - a[k]))); };

  /* ---------- названия деталей ---------- */
  let objIndex = null;
  function nameOf(id) {
    if (!id) return null;
    if (!objIndex) { objIndex = new Map(); for (const o of (window.__FULL_ATLAS && window.__FULL_ATLAS.allWorld()) || []) objIndex.set(o.renderId, o); }
    const idp = (((window.ATLAS_PROJECT || {}).card || {}).id_prefix) || ''; /* К1-B3: служебная приставка id тела — card.id_prefix конфига; нет — без неё */
    const o = objIndex.get(id) || (idp ? objIndex.get(idp + id) : null);
    if (!o) return id;
    try { return (window.AtlasCard && window.AtlasCard.human(o).title) || o.name; } catch (e) { return o.name; }
  }

  /* ---------- состояние ---------- */
  let on = false, snap = true, chain = false;
  const done = [];            // [{points, ids, n}]
  let cur = null;             // {points, ids}
  let hover = null;           // результат pickSurface под курсором
  let seq = 0;

  /* ---------- разметка: кнопка, панель, живая область ---------- */
  const RULER = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>';
  const btn = make('button', { type: 'button', id: 'quickMeasure', 'aria-pressed': 'false', 'aria-label': 'Линейка', title: 'Линейка (L)' });
  btn.innerHTML = RULER; btn.append(make('span', {}, 'Линейка'));
  btn.hidden = true;
  const live = make('p', { class: 'sr-only', 'aria-live': 'polite', id: 'measureLive' });
  const panel = make('section', { class: 'measure-panel', id: 'measurePanel', 'aria-label': 'Линейка', hidden: true });
  const head = make('div', { class: 'mp-head' });
  const title = make('h2', { class: 'mp-title' }, 'Линейка');
  const collapse = make('button', { type: 'button', class: 'mp-collapse', 'aria-expanded': 'true', 'aria-controls': 'mpBody', 'aria-label': 'Свернуть панель замеров' }, '▾');
  const exit = make('button', { type: 'button', class: 'mp-exit', 'aria-label': 'Выключить линейку' }, 'Готово');
  head.append(title, collapse, exit);
  const bodyEl = make('div', { class: 'mp-body', id: 'mpBody' });
  const opts = make('div', { class: 'mp-opts' });
  const snapLab = make('label', { class: 'mp-opt' }); const snapBox = make('input', { type: 'checkbox', checked: true }); snapLab.append(snapBox, document.createTextNode(' Привязка'));
  const chainLab = make('label', { class: 'mp-opt' }); const chainBox = make('input', { type: 'checkbox' }); chainLab.append(chainBox, document.createTextNode(' Цепочка'));
  const finishBtn = make('button', { type: 'button', class: 'mp-btn mp-finish', hidden: true }, 'Закончить цепочку');
  opts.append(snapLab, chainLab, finishBtn);
  finishBtn.onclick = () => finish();
  const hint = make('p', { class: 'mp-hint' });
  const listEl = make('ol', { class: 'mp-list', 'aria-label': 'Замеры' });
  const foot = make('div', { class: 'mp-foot' });
  const copyBtn = make('button', { type: 'button', class: 'mp-btn' }, 'Скопировать');
  const clearBtn = make('button', { type: 'button', class: 'mp-btn' }, 'Очистить всё');
  foot.append(copyBtn, clearBtn);
  const note = make('p', { class: 'mp-note' }, NOTE);
  bodyEl.append(opts, hint, listEl, foot, note);
  panel.append(head, bodyEl, live);
  stage.append(panel);
  const marker = make('div', { class: 'mp-marker', 'aria-hidden': 'true', hidden: true });
  stage.append(marker);

  function hintText() {
    if (!cur) return phone() ? 'Коснитесь модели — точка A.' : 'Щёлкните модель — точка A. Перетаскивание вращает модель.';
    if (chain) return 'Добавляйте точки. Закончить — ' + (phone() ? 'кнопка «Готово цепочку»' : 'Enter или двойной щелчок') + '.';
    return phone() ? 'Коснитесь — точка B.' : 'Щёлкните — точка B.';
  }
  function labelFor(m) {
    const L = lenOf(m.points);
    return (m.points.length > 2 ? 'Σ ' : '') + fmtLen(L);
  }
  function push() {
    const list = done.map(m => ({ points: m.points, label: labelFor(m) }));
    if (cur) {
      const pts = hover && hover.point ? [...cur.points, hover.point] : cur.points;
      if (pts.length >= 1) list.push({ points: pts, label: pts.length > 1 ? labelFor({ points: pts }) : '' });
    }
    try { A().setMeasurements(list); } catch (e) { /* движок без линейки */ }
  }
  // V12.0 · 0.17б: место панели — от реальных узлов сцены (раскладка B3): не перекрывать панель инструментов, «+ / − / Вписать» и значок осей.
  // ПК: справа внизу над панелью инструментов. Телефон: под верхним рядом кнопок, левее столбца «Линейка / Вписать», выше значка осей.
  function layoutPanel() {
    const ps = panel.style;
    if (panel.hidden) return;
    const anchor = innerWidth < 600 && stage.querySelector('[data-atlas-layers-anchor]');
    // В короткой мобильной панели прокручивается весь .mp-body, включая список.
    listEl.style.flexShrink = anchor ? '0' : '';
    const st = stage.getBoundingClientRect(), vis = el => el && el.offsetParent && el.getBoundingClientRect().width ? el.getBoundingClientRect() : null;
    const zr = vis(document.querySelector('.zoom-controls')), ar = vis($('axisCanvas')), tr = vis(document.querySelector('.tools'));
    const upper = [document.querySelector('.stage-actions'), document.querySelector('.tools')].map(vis).filter(r => r && r.top < st.top + st.height / 2);
    const top = Math.round(Math.max(st.top + 8, ...upper.map(r => r.bottom + 8)) - st.top);
    const right = zr && zr.left > st.left + st.width / 2 ? Math.ceil(st.right - zr.left + 8) : 8;
    if (!phone()) {
      let bottom = tr && tr.top > st.top + st.height / 2 ? Math.ceil(st.bottom - tr.top + 8) : 20;
      const pl = st.right - Math.max(16, right) - Math.min(320, st.width - 32);   // левый край панели
      if (ar && ar.right > pl) bottom = Math.max(bottom, Math.ceil(st.bottom - ar.top + 8));   // узкая сцена: выше значка осей
      ps.left = ps.top = 'auto'; ps.right = Math.max(16, right) + 'px'; ps.bottom = bottom + 'px';
      ps.maxHeight = Math.max(200, st.height - bottom - top) + 'px';
      return;
    }
    const upstream = anchor ? [anchor, $('atlasLayers')].map(e => e?.getBoundingClientRect()).filter(r => r?.height) : [];
    const mobileTop = upstream.length ? Math.ceil(Math.max(st.top + top, ...upstream.map(r => r.bottom + 8)) - st.top) : top;
    const lim = ar ? ar.top - st.top - 8 : st.height - 8;
    // 1.1.1 C3: «Линейка / + / − / Вписать» на телефоне — строкой над шторкой (ниже верха значка осей): панели не мешает — отступ справа только при пересечении по высоте
    const zHit = zr && zr.top - st.top < lim;
    ps.top = mobileTop + 'px'; ps.bottom = 'auto'; ps.left = '8px'; ps.right = (zHit ? right : 8) + 'px';
    ps.maxHeight = Math.max(upstream.length ? head.offsetHeight + 48 : 200, lim - mobileTop) + 'px';
  }
  const deferPanelLayout = () => { if (!panel.hidden) requestAnimationFrame(layoutPanel); };
  addEventListener('resize', deferPanelLayout);
  document.addEventListener('atlas:toolpanel', deferPanelLayout);
  function renderList() {
    listEl.replaceChildren();
    for (const m of done) {
      const li = make('li', { class: 'mp-item' });
      const L = lenOf(m.points), d = deltas(m.points);
      const names = [...new Set(m.ids.map(nameOf).filter(Boolean))];
      const t = make('div', { class: 'mp-item-t' });
      t.append(make('b', {}, '№ ' + m.n + ' · ' + labelFor(m)));
      t.append(make('span', { class: 'mp-d' }, (m.points.length > 2 ? m.points.length - 1 + ' ' + S.plural(m.points.length - 1, 'отрезок', 'отрезка', 'отрезков') + ' · ' : '') + 'ΔX ' + S.fmt(d[0]) + ' · ΔY ' + S.fmt(d[1]) + ' · ΔZ ' + S.fmt(d[2]) + ' мм'));
      if (names.length) t.append(make('span', { class: 'mp-on' }, 'на: ' + names.join(' → ')));
      const del = make('button', { type: 'button', class: 'mp-del', 'aria-label': 'Удалить замер № ' + m.n }, 'Удалить');
      del.onclick = () => { done.splice(done.indexOf(m), 1); renderList(); push(); live.textContent = 'Замер ' + m.n + ' удалён'; };
      li.append(t, del);
      listEl.append(li);
    }
    listEl.hidden = !done.length;
    foot.hidden = !done.length;
    hint.textContent = hintText();
    finishBtn.hidden = !(cur && cur.points.length >= 2);
    title.textContent = 'Линейка' + (done.length ? ' · ' + done.length : '');
  }
  function finish() {
    if (!cur || cur.points.length < 2) { cur = null; push(); renderList(); return; }
    const m = { points: cur.points, ids: cur.ids, n: ++seq };
    done.push(m); cur = null;
    const L = lenOf(m.points);
    live.textContent = (m.points.length > 2 ? 'Цепочка ' : 'Отрезок ') + m.n + ': ' + spoken(L);
    push(); renderList();
  }
  function addPoint(hit, withShift) {
    if (!hit || !hit.point) return;
    if (!cur) cur = { points: [], ids: [] };
    cur.points.push(hit.point.slice()); cur.ids.push(hit.id);
    const chaining = chain || withShift;
    if (!chaining && cur.points.length >= 2) finish();
    else { push(); renderList(); }
  }

  /* ---------- холст: только в режиме линейки ---------- */
  let down = null, raf = 0, lastMove = null;
  function pick(x, y) {
    let h = null; try { h = A().pickSurface(x, y, { snap, radiusPx: phone() ? 24 : 10 }); } catch (e) { return null; }
    return boxed(h, x, y);
  }
  // 1.0.11 (ENGINE_API, E1): при сечении-коробке (вырез у замечания, P9) прилипание к ребру/вершине может дать точку на отрезанной части — тогда точка грани ({snap:false}), она внутри коробки
  function boxed(h, x, y) {
    if (!h || !h.point) return h;
    try { const b = ((A().sectionState && A().sectionState()) || {}).section; if (b && b.box && ![0, 1, 2].every(k => h.point[k] >= b.box[0][k] - 1e-6 && h.point[k] <= b.box[1][k] + 1e-6)) return A().pickSurface(x, y, { snap: false, radiusPx: phone() ? 24 : 10 }); } catch (e) { /* */ }
    return h;
  }
  function showMarker(h, x, y, touch) {
    if (!h) { marker.hidden = true; return; }
    const r = stage.getBoundingClientRect();
    let sx = x, sy = y;
    try { const s = A().projectToScreen(h.point); if (s && s[2] !== false) { sx = s[0]; sy = s[1]; } } catch (e) { /* нет проекции */ }
    marker.hidden = false;
    marker.textContent = SNAP_ICON[h.snap] || '▲';
    marker.title = SNAP_NAME[h.snap] || '';
    marker.dataset.snap = h.snap || 'face';
    // На телефоне маркер — над пальцем, чтобы палец не закрывал точку.
    marker.style.left = (sx - r.left) + 'px';
    marker.style.top = (sy - r.top - (touch ? 64 : 0)) + 'px';
    marker.classList.toggle('mp-marker--touch', !!touch);
  }
  function onMove(e) {
    lastMove = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const ev = lastMove;
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 5) down.moved = true;
      if (down && down.moved && ev.pointerType !== 'touch') { marker.hidden = true; return; }
      hover = pick(ev.clientX, ev.clientY);
      try { A().setMeasureCursor(hover ? { point: hover.point, snap: hover.snap } : null); } catch (err) { /* */ }
      showMarker(hover, ev.clientX, ev.clientY, ev.pointerType === 'touch');
      if (cur) push();
    });
  }
  function onDown(e) { down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, shift: e.shiftKey, touch: e.pointerType === 'touch' }; if (e.pointerType === 'touch') onMove(e); }
  function onUp(e) {
    const d = down; down = null;
    if (!d || d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || performance.now() - d.t > 2500) { if (d && d.touch) marker.hidden = true; return; }
    const h = pick(e.clientX, e.clientY);
    addPoint(h, d.shift || e.shiftKey);
    if (d.touch) setTimeout(() => { marker.hidden = true; }, 600);
  }
  function onDbl(e) { if (cur) { e.preventDefault(); finish(); } }
  function onLeave() { hover = null; marker.hidden = true; try { A().setMeasureCursor(null); } catch (e) { /* */ } if (cur) push(); }

  // События движка (H): наведение и короткий щелчок уже с результатом выбора поверхности.
  const useEvents = () => typeof A().toolMode === 'function';
  function onHover(e) {
    const d = e.detail || {};
    hover = snap ? boxed(d.hit, d.clientX, d.clientY) : (d.hit ? pick(d.clientX, d.clientY) : null);
    try { A().setMeasureCursor(hover ? { point: hover.point, snap: hover.snap } : null); } catch (err) { /* */ }
    if (lastTouch) showMarker(hover, d.clientX, d.clientY, true);
    if (cur) push();
  }
  let lastTouch = false;
  function onPoint(e) {
    const d = e.detail || {};
    lastTouch = d.pointerType === 'touch';
    const h = snap ? boxed(d.hit, d.clientX, d.clientY) : pick(d.clientX, d.clientY);
    if (lastTouch) { showMarker(h, d.clientX, d.clientY, true); setTimeout(() => { marker.hidden = true; }, 700); }
    addPoint(h, d.shiftKey);
  }
  function onTouchStart(e) { if (e.pointerType !== 'touch') return; lastTouch = true; const h = pick(e.clientX, e.clientY); showMarker(h, e.clientX, e.clientY, true); }
  function setOn(v) {
    if (v === on || (v && !ready())) return;
    on = v;
    btn.setAttribute('aria-pressed', String(on)); if (toolsBtn) toolsBtn.setAttribute('aria-pressed', String(on));
    panel.hidden = !on;
    if (on) layoutPanel();
    document.body.classList.toggle('measure-on', on);
    try { A().setToolMode(on ? 'measure' : null); } catch (e) { /* */ }
    if (on) {
      if (useEvents()) {
        document.addEventListener('atlas:measurehover', onHover);
        document.addEventListener('atlas:measurepoint', onPoint);
        canvas.addEventListener('pointerdown', onTouchStart);
      } else {
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerup', onUp);
      }
      canvas.addEventListener('dblclick', onDbl);
      canvas.addEventListener('pointerleave', onLeave);
      const c = phone() || stage.getBoundingClientRect().width < 1000; panel.classList.toggle('collapsed', c);   // 1.0.15 B3-13 (L8): узкая сцена ПК — свёрнута, подпись замера не под панелью
      collapse.setAttribute('aria-expanded', String(!c)); collapse.textContent = c ? '▴' : '▾'; collapse.setAttribute('aria-label', c ? 'Развернуть панель замеров' : 'Свернуть панель замеров');
      renderList(); push();
      live.textContent = 'Линейка включена. ' + NOTE;
    } else {
      document.removeEventListener('atlas:measurehover', onHover);
      document.removeEventListener('atlas:measurepoint', onPoint);
      canvas.removeEventListener('pointerdown', onTouchStart);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('pointerleave', onLeave);
      cur = null; hover = null; marker.hidden = true;
      try { A().setMeasureCursor(null); A().setMeasurements([]); } catch (e) { /* */ }
      live.textContent = 'Линейка выключена';
    }
  }
  btn.onclick = () => setOn(!on);
  exit.onclick = () => { setOn(false); btn.focus(); };
  collapse.onclick = () => { const c = !panel.classList.contains('collapsed'); panel.classList.toggle('collapsed', c); collapse.setAttribute('aria-expanded', String(!c)); collapse.textContent = c ? '▴' : '▾'; collapse.setAttribute('aria-label', c ? 'Развернуть панель замеров' : 'Свернуть панель замеров'); };
  snapBox.onchange = () => { snap = snapBox.checked; };
  chainBox.onchange = () => { chain = chainBox.checked; if (!chain && cur && cur.points.length >= 2) finish(); hint.textContent = hintText(); };
  clearBtn.onclick = () => { done.length = 0; cur = null; renderList(); push(); live.textContent = 'Все замеры удалены'; };
  copyBtn.onclick = async () => {
    const text = done.map(m => { const d = deltas(m.points); const names = [...new Set(m.ids.map(nameOf).filter(Boolean))]; return '№ ' + m.n + ': ' + labelFor(m).replace(/ /g, ' ') + '; ΔX ' + d[0] + ', ΔY ' + d[1] + ', ΔZ ' + d[2] + ' мм' + (names.length ? '; ' + names.join(' → ') : ''); }).join('\n') + '\n' + NOTE;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { const ta = make('textarea'); ta.value = text; document.body.append(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e2) { ok = false; } ta.remove(); }
    live.textContent = ok ? 'Замеры скопированы' : 'Не удалось скопировать';
    window.AtlasViewSettings && window.AtlasViewSettings.toast(ok ? 'Замеры скопированы' : 'Не удалось скопировать');
  };
  // Клавиши: L / Д — вкл/выкл, Esc — выход (или отмена начатого замера), Enter — закончить цепочку, Delete — удалить последний замер.
  document.addEventListener('keydown', e => {
    const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable;
    // 1.0.19a A-05 (WCAG 2.1.4): L / Д — только в сцене (фокус на холсте или в панели сцены; AtlasShell.inScene)
    const inScene = window.AtlasShell && window.AtlasShell.inScene ? window.AtlasShell.inScene(e) : (!typing && !!(e.target.closest && e.target.closest('.stage')));
    if (inScene && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'l' || e.key === 'L' || e.key === 'д' || e.key === 'Д')) { if (ready()) { e.preventDefault(); setOn(!on); } return; }
    if (!on) return;
    if (e.key === 'Escape' && !document.querySelector('#modal.open, dialog[open]')) { e.preventDefault(); e.stopImmediatePropagation(); if (cur) { cur = null; push(); renderList(); } else setOn(false); }
    if (e.key === 'Enter' && cur && !typing && !e.target.closest('button,a')) { e.preventDefault(); finish(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && done.length) { e.preventDefault(); const m = done.pop(); renderList(); push(); live.textContent = 'Замер ' + m.n + ' удалён'; }
  }, true);

  /* ---------- кнопка в панели сцены и пункт в «Инструментах» ---------- */
  let toolsBtn = null;
  function mount() {
    if (!ready()) return false;
    const group = document.querySelector('.tools .r23-quality-group');
    const labels = $('quickLabels');
    // На телефоне — в столбце над «Вписать» (не отнимает места у крошки), на компьютере — в панели сцены после «Подписи».
    // V12.0: раскладку панели ведёт B3 (window.AtlasToolbar) — только вставить узел, не переставлять.
    const place = () => { if (window.AtlasToolbar) { if (!btn.isConnected) { if (labels) labels.after(btn); else if (group) group.append(btn); } return; } const zc = document.querySelector('.zoom-controls'); if (phone() && zc) { if (btn.parentElement !== zc) zc.prepend(btn); } else if (labels) { if (btn.previousElementSibling !== labels) labels.after(btn); } else if (group && btn.parentElement !== group) group.append(btn); };
    place(); addEventListener('resize', place);
    btn.hidden = false;
    const vs = $('viewSettings');
    if (vs && !toolsBtn) {
      const d = make('details', { class: 'mp-tools' });
      d.append(make('summary', {}, 'Линейка'));
      toolsBtn = make('button', { type: 'button', 'aria-pressed': 'false' }, 'Измерить расстояние (L)');
      toolsBtn.onclick = () => { setOn(!on); };
      d.append(toolsBtn, make('p', { class: 'r23-note' }, 'Щёлкните две точки модели. Shift — цепочка точек. ' + NOTE));
      const intro = vs.querySelector('.tool-intro');
      (intro || vs.firstChild).after(d);
    }
    const help = $('atlasHelp');
    if (help && !help.querySelector('.help-measure')) {
      const p = make('p', { class: 'help-measure' }, 'Линейка (L): щёлкните две точки модели; с Shift — цепочка, Enter — закончить, Delete — удалить последний замер, Esc — выход. ' + NOTE);
      const k = help.querySelector('.help-keyboard'); if (k) k.after(p); else help.append(p);   // 1.0.19a к2: строка клавиш — первой (A-14), линейка — после неё
    }
    return true;
  }
  document.addEventListener('atlas:ready', () => setTimeout(mount, 0));
  if (window.__ATLAS) setTimeout(mount, 0);
  window.AtlasMeasure = { pending: () => (cur ? cur.points.length : 0), on: () => on, set: setOn, list: () => done.map(m => ({ n: m.n, mm: mm(lenOf(m.points)), points: m.points, ids: m.ids })), addPoint, finish, ready };
})();
