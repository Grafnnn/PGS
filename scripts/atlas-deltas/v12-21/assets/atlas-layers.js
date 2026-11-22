/* 3D Атлас · разбор слоёв (1.1.x, план 2.0, этап 2).
   Выбранная сборка из нескольких тел (стена «панель — утеплитель — облицовка», шахта «кладка — утеплитель — покрытие» …) открывается по слоям:
   один слой на экране, остальные скрыты изоляцией; сечение группы; «Вернуть вид» — камера, выбор (в том числе пустой), изоляция и сечение как до входа.
   Состав — только из данных объекта, в коде значений объекта нет:
     1) набор data/layers.js → window.ATLAS_LAYERS = {version:1, groups:[{id, label, members:[{id, label?, tint?:[r,g,b]}], section?:{axis:'x'|'y'|'z', value, flip?}}]};
     2) нет набора или тела в нём нет — соседи по полю parent записи (2…24 тела в сцене), если не выключено layers.by_parent:false.
   Сборка без разбивки открывается целиком: панели нет.
   Включается ключом конфига layers:{enabled:true}; без ключа модуль не грузится (страница подключает его после atlas:ready).
   Только публичный API движка (ENGINE_API.md, api 27): get, objects, inScene, capture, restoreView, isolate, select, deselect, selection, setSection, setTint, whenReady.
   Без fetch/XHR: набор — <script src>, работает из file://. Прототип — Codex, ПОСТАВКИ_CODEX/_ядро/20261118_ATLAS_2_0_GRAPHICS_R1/демо/project/layers.js. */
'use strict';
window.AtlasLayers = (() => {
  const CFG = (window.ATLAS_PROJECT || {}).layers;
  if (!CFG || typeof CFG !== 'object' || CFG.enabled === false) return null;
  const OWNER = 'layers', MIN = 2, MAX = 24, AXES = ['x', 'y', 'z'];
  let A = null, groups = [], byMember = new Map(), parentIdx = null;
  let cur = null, snap = null, active = null, cutOn = false, busy = false, root = null, statusEl = null, wantFocus = '';
  let maskKey = '';
  const fieldCoversModel = () => innerWidth <= 600 && window.AtlasField?.isExpanded?.() === true;

  const str = v => typeof v === 'string' && v.trim() ? v.trim() : '';
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  function tint(t) {
    if (!Array.isArray(t) || t.length !== 3 || !t.every(x => num(x) !== null && x >= 0 && x <= 255)) return null;
    return t.slice();
  }
  function rid(id) { try { const r = A.get(id); return r && r.renderId ? r.renderId : null; } catch (e) { return null; } }
  function nameOf(r, id) { const g = A.get(r) || {}; return str(g.name) || id; }

  /* Набор данных: ошибки не роняют страницу — неверная группа пропускается с предупреждением в консоли */
  function readData(d) {
    groups = []; byMember = new Map();
    if (!d || typeof d !== 'object' || !Array.isArray(d.groups)) return;
    for (const g of d.groups) {
      const id = g && str(g.id);
      if (!id || !Array.isArray(g.members)) { console.warn('[layers] группа без id или members пропущена'); continue; }
      /* Группа принимается только целиком: неизвестное или повторное тело — вся группа пропущена (неполный состав под именем сборки вводит в заблуждение) */
      const members = [];
      let bad = '';
      for (const m of g.members) {
        const mid = m && str(m.id), r = mid ? rid(mid) : null;
        if (!r) { bad = 'тела ' + (mid || '?') + ' нет'; break; }
        if (members.some(x => x.rid === r)) { bad = 'тело ' + mid + ' повторяется'; break; }
        members.push({ id: mid, rid: r, label: str(m.label) || nameOf(r, mid), tint: tint(m.tint) });
      }
      if (!bad && (members.length < MIN || members.length > MAX)) bad = 'тел ' + members.length + ', нужно ' + MIN + '…' + MAX;
      if (bad) { console.warn('[layers] ' + id + ': ' + bad + ' — группа пропущена'); continue; }
      let section = null;
      const s = g.section;
      if (s && AXES.includes(s.axis) && num(s.value) !== null) section = { axis: s.axis, value: s.value, flip: !!s.flip };
      const grp = { id, label: str(g.label) || id, members, section, source: 'data' };
      groups.push(grp);
      for (const m of members) if (!byMember.has(m.rid)) byMember.set(m.rid, grp);
    }
  }
  function loadData() {
    return new Promise(res => {
      if (window.ATLAS_LAYERS) return res(window.ATLAS_LAYERS);
      const s = document.createElement('script');
      s.src = 'data/layers.js';
      s.onload = () => res(window.ATLAS_LAYERS || null);
      s.onerror = () => res(null);          // набора нет — только соседи по parent
      document.body.append(s);
    });
  }
  /* Соседи по parent — индекс строится один раз, при первом выборе тела без группы из набора */
  function parentGroup(r) {
    if (CFG.by_parent === false) return null;
    const rec = A.get(r), p = rec && str(rec.parent);
    if (!p) return null;
    if (!parentIdx) {
      parentIdx = new Map();
      for (const o of A.objects()) {
        const g = A.get(o.renderId), q = g && str(g.parent);
        if (!q) continue;
        if (!parentIdx.has(q)) parentIdx.set(q, []);
        parentIdx.get(q).push(o.renderId);
      }
    }
    const ids = (parentIdx.get(p) || []).filter(x => A.inScene(x));
    if (ids.length < MIN || ids.length > MAX) return null;
    const pr = A.get(p);
    return { id: 'parent:' + p, label: (pr && str(pr.name)) || p, section: null, source: 'parent',
      members: ids.map(x => ({ id: x, rid: x, label: nameOf(x, x), tint: null })) };
  }
  function groupFor(id) {
    const r = id ? rid(id) : null;
    if (!r) return null;
    return byMember.get(r) || parentGroup(r);
  }

  /* Разметка: панель над моделью; цвета — токены ядра с запасными значениями */
  function css() {
    if (document.getElementById('atlasLayersCss')) return;
    const st = document.createElement('style'); st.id = 'atlasLayersCss';
    st.textContent = '#atlasLayers{position:fixed;z-index:58;display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;box-sizing:border-box;padding:8px 10px;border-radius:8px;' +
      'background:var(--c-surface,#fff);color:var(--c-text,#14202A);border:1px solid var(--c-line,#C9D2D9);box-shadow:0 2px 10px rgba(0,0,0,.12);font:14px/1.3 var(--font,system-ui,sans-serif)}' +
      '#atlasLayers[hidden]{display:none}#atlasLayers h2{font:inherit;font-weight:600;margin:0 4px 0 0;flex:1 0 100%}' +
      '#atlasLayers button{font:inherit;min-height:32px;padding:4px 10px;border-radius:6px;border:1px solid var(--c-line,#C9D2D9);background:var(--c-surface,#fff);color:inherit;cursor:pointer;white-space:nowrap}' +
      '#atlasLayers button[aria-pressed=true]{background:var(--c-accent-weak,#DCEBF5);border-color:var(--c-accent,#1F6FA8)}' +
      '#atlasLayers button:disabled{opacity:.5;cursor:default}#atlasLayers button:focus-visible{outline:2px solid var(--c-accent,#1F6FA8);outline-offset:1px}' +
      '#atlasLayers i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}' +
      '#atlasLayers [role=status]{flex:1 0 100%;color:var(--c-text-2,#4A5A66);font-size:13px}#atlasLayers [role=status]:empty{display:none}' +
      '#atlasLayers.al-narrow{padding:6px;gap:6px}#atlasLayers.al-narrow button{min-height:36px;padding:4px 8px}#atlasLayers.al-narrow [data-act=return]{order:-1}' +
      '#atlasLayers.al-stacked:not([hidden]){display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}' +
      '#atlasLayers.al-stacked button{padding:4px 2px;min-height:44px;white-space:normal;font-size:13px;overflow-wrap:anywhere}' +
      '#atlasLayers.al-narrow h2,#atlasLayers.al-narrow [role=status]{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';
    document.head.append(st);
  }
  /* Место — над холстом модели, не на его кнопках: на компьютере — по центру холста над нижней панелью инструментов
     (вверху холста — путь раздела, ракурс, «3D / План»); на узком экране — под верхними кнопками, не заходя на правый столбец кнопок вида */
  function place() {
    if (!root || root.hidden) return;
    const cv = document.getElementById('canvas'), r = cv ? cv.getBoundingClientRect() : { top: 56, left: 0, right: innerWidth, bottom: innerHeight, width: innerWidth };
    const narrow = innerWidth < 600, s = root.style;
    const anchor = narrow && cv?.closest('.stage')?.querySelector('[data-atlas-layers-anchor]')?.getBoundingClientRect();
    const stackUnderAnchor = Boolean(anchor?.height);
    root.classList.toggle('al-narrow', narrow);
    root.classList.toggle('al-stacked', stackUnderAnchor);
    if (narrow) {
      const top = stackUnderAnchor ? Math.max(r.top + 64, anchor.bottom + 8) : r.top + 64;
      s.top = Math.round(top + stackOffset()) + 'px'; s.left = Math.round(r.left + 12) + 'px'; s.right = Math.round(innerWidth - r.right + 64) + 'px';
      s.bottom = ''; s.maxWidth = ''; s.transform = '';
    } else {
      const w = Math.max(240, Math.min(560, r.width - 48));
      s.maxWidth = w + 'px'; s.top = ''; s.right = '';
      s.left = Math.round(r.left + r.width / 2) + 'px'; s.transform = 'translateX(-50%)';
      s.bottom = Math.round(innerHeight - r.bottom + 92 + stackOffset()) + 'px';
    }
  }
  const ME = 'layers', PANEL_ID = 'atlasLayers';
  /* Общие правила панелей режимов (разбор слоёв, сравнение): одна активная — другая скрыта и не перехватывает управление
     (body[data-atlas-tool]); видимые вместе — стопкой без наложения (порядок PANELS); смена — событие atlas:toolpanel */
  const PANELS = ['atlasLayers', 'atlasCompare'];
  function toolMode() { return document.body.dataset.atlasTool || ''; }
  function setTool(on) { if (on) document.body.dataset.atlasTool = ME; else if (toolMode() === ME) delete document.body.dataset.atlasTool; }
  function stackOffset() { let off = 0; for (const id of PANELS) { if (id === PANEL_ID) break; const e = document.getElementById(id); if (e && !e.hidden) off += e.offsetHeight + 8; } return off; }
  function panelChanged() { document.dispatchEvent(new CustomEvent('atlas:toolpanel', { detail: { from: ME } })); }
  function el(tag, attrs, text) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function panelHidden() { return !cur || fieldCoversModel() || !!(toolMode() && toolMode() !== ME); }
  function render(quiet) {
    if (!root) {
      css();
      root = el('section', { id: 'atlasLayers', 'aria-label': 'Разбор слоёв' });
      root.hidden = true;
      document.body.append(root);
      addEventListener('resize', () => { if (root.hidden !== panelHidden()) render(true); else place(); });
      const cv = document.getElementById('canvas');
      if (cv && window.ResizeObserver) new ResizeObserver(place).observe(cv);
    }
    /* Фокус клавиатуры переживает перестройку кнопок: на время работы кнопки неактивны (фокус с них слетает на body),
       поэтому ключ кнопки помним до первой перестройки с активными кнопками; ушёл фокус в другое место страницы — не возвращаем */
    const fa = document.activeElement;
    if (fa && root.contains(fa)) wantFocus = fa.dataset.body ? '[data-body="' + fa.dataset.body + '"]' : fa.dataset.act ? '[data-act="' + fa.dataset.act + '"]' : '';
    else if (fa && fa !== document.body) wantFocus = '';
    if (panelHidden()) { root.hidden = true; root.replaceChildren(); if (quiet !== true) panelChanged(); return; }
    const h = el('h2', null, 'Слои: ' + cur.label);
    const visibleIds = A.visibleSetState?.()?.ids;
    const btns = cur.members.map(m => {
      const b = el('button', { type: 'button', 'aria-pressed': String(active === m.rid), 'data-body': m.rid });
      if (m.tint) { const i = el('i', { 'aria-hidden': 'true' }); i.style.background = 'rgb(' + m.tint.join(',') + ')'; b.append(i); }
      b.append(document.createTextNode(m.label));
      b.disabled = busy || !A.inScene(m.rid) || !!(visibleIds && !visibleIds.includes(m.rid));
      b.onclick = () => show(m.rid);
      return b;
    });
    const out = [h, ...btns];
    if (cur.section) {
      const c = el('button', { type: 'button', 'aria-pressed': String(cutOn), 'data-act': 'cut' }, 'Сечение');
      c.disabled = busy; c.onclick = cut; out.push(c);
    }
    const r = el('button', { type: 'button', 'data-act': 'return' }, 'Вернуть вид');
    r.disabled = busy || !snap; r.onclick = restore; out.push(r);
    statusEl = el('span', { role: 'status', 'aria-live': 'polite' }, statusEl ? statusEl.textContent : '');
    out.push(statusEl);
    root.replaceChildren(...out);
    root.hidden = false;
    place();
    if (wantFocus) { const b = root.querySelector(wantFocus); if (!b) wantFocus = ''; else if (!b.disabled) { b.focus({ preventScroll: true }); wantFocus = ''; } }
    if (quiet !== true) panelChanged();
  }
  function say(t) { if (statusEl) statusEl.textContent = t; }

  function enter() {
    if (snap) return;
    if (toolMode() && toolMode() !== ME) throw Error('открыт другой режим');
    setTool(true);
    snap = A.capture();
    const pal = {};
    for (const m of cur.members) if (m.tint) pal[m.rid] = m.tint;
    if (Object.keys(pal).length) A.setTint(OWNER, pal);
  }
  async function run(fn) {
    if (busy || !cur || fieldCoversModel()) return false;
    busy = true; render();
    try { await fn(); return true; }
    catch (e) { say('Не удалось переключить вид. Нажмите «Вернуть вид» и повторите.'); return false; }
    finally { busy = false; render(); }
  }
  function show(r) {
    return run(async () => {
      const visibleIds = A.visibleSetState?.()?.ids;
      if (!A.inScene(r) || (visibleIds && !visibleIds.includes(r))) throw Error('нет в текущем виде');
      enter();
      A.isolate([r], { fit: false });
      if (!A.select(r, { quiet: true, updateHash: false })) throw Error('не выбран');
      active = r;
      const m = cur.members.find(x => x.rid === r);
      say('Показан слой: ' + (m ? m.label : r));
    });
  }
  function cut() {
    return run(async () => {
      if (!cur.section) return;
      enter();
      if (!A.setSection(cutOn ? null : cur.section)) throw Error('сечение');
      cutOn = !cutOn;
      say(cutOn ? 'Сечение группы включено' : 'Сечение снято');
    });
  }
  function restore() {
    return run(async () => {
      if (!snap) return;
      const v = snap, visible = A.visibleSetState?.();
      if (!v.selection && A.selection()) A.deselect();
      A.setTint(OWNER, null);
      await A.restoreView(v);
      if (visible) A.setVisibleSet(visible.ids, { keepOnScope: visible.keepOnScope });
      snap = null; active = null; cutOn = false; setTool(false);
      cur = groupFor(A.selection());
      say('Исходный вид восстановлен');
    });
  }
  /* Выбор вне разбора — панель для группы выбранного тела; в разборе группа держится до «Вернуть вид» */
  function onSelection() {
    if (busy || snap) return;
    const g = groupFor(A.selection());
    if (g !== cur) { cur = g; active = null; if (statusEl) statusEl.textContent = ''; render(); }
  }
  /* Смена раздела пользователем — разбор закончен без восстановления: вид уже другой */
  function onScope() {
    if (busy) return;
    if (snap) { A.setTint(OWNER, null); snap = null; active = null; cutOn = false; setTool(false); }
    parentIdx = null;
    cur = null; render();
  }

  const api = {
    groups: () => groups.map(g => ({ id: g.id, label: g.label, members: g.members.map(m => m.rid), section: g.section })),
    groupFor: id => { const g = groupFor(id); return g ? { id: g.id, label: g.label, source: g.source, members: g.members.map(m => m.rid) } : null; },
    show: id => { const r = rid(id); if (!r) return Promise.resolve(false); if (!cur || !cur.members.some(m => m.rid === r)) { if (snap) return Promise.resolve(false); cur = groupFor(r); render(); } return show(r); },
    cut: () => cut(),
    restore: () => restore(),
    state: () => ({ group: cur && cur.id, active, cut: cutOn, inside: !!snap, busy, visible: !!(root && !root.hidden) })
  };

  async function start() {
    A = window.__ATLAS;
    if (!A) return;
    readData(await loadData());
    await A.whenReady();
    document.addEventListener('atlas:selectionchange', onSelection);
    document.addEventListener('atlas:scope', onScope);
    document.addEventListener('atlas:visibility', () => {
      const next = JSON.stringify(A.visibleSetState?.()?.ids ?? null);
      if (maskKey === next) return;
      maskKey = next;
      if (root && cur && !busy) render(true);
    });
    document.addEventListener('atlas:toolpanel', e => { if (e.detail && e.detail.from !== ME && root) render(true); });
    /* Esc в разборе — «Вернуть вид», где бы ни был фокус (холст, кнопка, body). Через отменяемое atlas:escape движка, в фазе захвата —
       раньше карточки (она иначе снимает выбор). Открытое окно чертежа (detail.modal), диалог или уже поглощённый Esc — не наши. */
    addEventListener('atlas:escape', e => {
      const d = e.detail || {}, o = d.original, tg = o && o.target;
      if (!snap || fieldCoversModel() || e.defaultPrevented || d.modal || (o && o.defaultPrevented)) return;
      if ((tg && tg.closest && tg.closest('dialog')) || document.querySelector('dialog[open]')) return;
      e.preventDefault(); if (o) o.preventDefault();
      restore();
    }, true);
    onSelection();
    document.dispatchEvent(new CustomEvent('atlas:layersready', { detail: { groups: groups.length } }));
  }
  if (window.__ATLAS) start(); else document.addEventListener('atlas:ready', start, { once: true });
  return api;
})();
