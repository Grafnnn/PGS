/* 3D Атлас · ссылка на вид (V12.0, п. 0.16).
   #view=<base64url JSON> — {schema, scope, level, camera, selection, slice} из __R24.capture(); настройки отображения (preferences) не входят.
   AtlasViewLink.encode(view) → строка; decode(str) → вид или null; copy() — скопировать адрес текущего вида; apply(view) — показать вид.
   Разбор адреса — на atlas:ready и hashchange. Выбор restoreView не восстанавливает — его ставит __ATLAS.select.
   Разделы, которые догружаются (PLACED:*, MU_REBAR, REBAR_OD:*), — повторный restoreView, когда сцена готова.
   Старые ссылки #scope=…&id=… не трогаются. Без fetch/XHR, работает из file://.
   1.0.19a: Б4 — в режиме «Ход работ» ссылка на этап и захватку (#progress=1&stage=&lot=&date=, по образцу issuesUrl); М-11 — в file:// сообщение честно
   говорит, что ссылка работает только на этом компьютере, и предлагает «Снимок»; О-12 — сообщения модуля: ошибки висят до «Закрыть», остальные ≥ 6 с. */
'use strict';
window.AtlasViewLink = (() => {
  // К1: схема ссылки на вид — view.schema конфига; нет — '<project_id>-view-1'; без конфига — 'atlas-view-1' (ссылки другого объекта не применяются)
  const PJV = window.ATLAS_PROJECT || {}, SCHEMA = (PJV.view && PJV.view.schema) || ((PJV.project_id ? PJV.project_id : 'atlas') + '-view-1');
  const r = (x, n) => Math.round(x * 10 ** n) / 10 ** n;
  function pick(v) {
    if (!v || !v.camera) return null;
    const c = v.camera, s = v.slice || {};
    const out = { schema: SCHEMA, scope: v.scope || 'BUILDING', level: v.level || '',
      camera: { az: r(c.az, 4), el: r(c.el, 4), center: (c.center || []).map(x => r(x, 3)), scale: r(c.scale, 4), radius: r(c.radius, 3) } };
    if (v.selection) out.selection = v.selection;
    if (v.selection && v.part != null && v.part !== '') out.part = String(v.part);   /* 1.0.16 B3-3 (A1): часть внутри выбранного тела; старые ядра ключ пропускают */
    if (s.axis && s.axis !== 'none') out.slice = { axis: s.axis, value: s.value, flip: !!s.flip };
    { const q = v.section; if (q && Array.isArray(q.box) && q.box.length === 2) out.section = { box: q.box.map(a => a.map(x => r(x, 3))) }; else if (q && q.axis) out.section = { axis: q.axis, value: r(q.value, 3), flip: !!q.flip }; }   // 1.0.15 B3-9 (S8): сечение API (куб, «По этажу», срез по телу) — в ссылке; restoreView его ставит и шлёт atlas:section (E1-2)
    if (Array.isArray(v.placed) && v.placed.length) out.placed = v.placed.map(String);   // 1.0.15 B3-15: группы «По РД» вместе со зданием
    if (v.node) { out.node = v.node; if (v.rebar) out.rebar = 1; }                // V12.1: открытый узел и армирование
    if (Array.isArray(v.sections) && v.sections.length) { out.sections = v.sections.slice(); if (v.setLevel) out.setLevel = String(v.setLevel); if (v.setNode) out.setNode = String(v.setNode); }   // V12.2 · M15: набор разделов; V12.4 · P1 — и подпись уровня
    return out;
  }
  // base64url поверх UTF-8 (id элементов бывают с кириллицей: «L1_Фп-1»)
  function encode(view) {
    const v = pick(view); if (!v) return '';
    const bytes = new TextEncoder().encode(JSON.stringify(v));
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode(str) {
    try {
      const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
      const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
      return v && v.schema === SCHEMA && v.camera ? v : null;
    } catch (e) { return null; }
  }
  const api = () => window.__R24 && typeof window.__R24.capture === 'function' ? window.__R24 : null;
  /* 1.0.19a, О-12: своё сообщение (общий r23Toast гаснет за 3,8 с): ошибка — до «Закрыть» (role=alert), остальное — 6,5 с, при наведении не гаснет.
     Стили — в строке (на главной без ключа progress таблицы стилей хода нет); цвета — токены с запасными значениями. */
  let toastT = 0;
  function toast(t, bad) {
    try {
      let el = document.getElementById('avlToast');
      if (!el) {
        el = document.createElement('div'); el.id = 'avlToast';
        el.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + var(--avl-low, 0px));transform:translateX(-50%);z-index:75;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;max-width:min(560px,calc(100vw - 32px));box-sizing:border-box;padding:10px 16px;border-radius:8px;background:var(--c-text,#14202A);color:var(--c-surface,#FFFFFF);font:14px/1.4 var(--font,system-ui,sans-serif);box-shadow:0 4px 16px rgba(0,0,0,.25)';
        el.addEventListener('mouseenter', () => clearTimeout(toastT));
        el.addEventListener('mouseleave', () => { if (el.dataset.bad !== '1') arm(el); });
        document.body.append(el);
      }
      el.textContent = '';
      const m = document.createElement('span'); m.textContent = t; m.style.flex = '1 1 240px'; el.append(m);
      el.dataset.bad = bad ? '1' : ''; el.setAttribute('role', bad ? 'alert' : 'status'); el.setAttribute('aria-live', bad ? 'assertive' : 'polite');
      el.style.background = bad ? 'var(--c-sig-high-text,#8C1D18)' : 'var(--c-text,#14202A)';
      if (bad) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Закрыть'; b.style.cssText = 'min-height:' + (innerWidth <= 850 ? 48 : 36) + 'px;padding:0 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:600 14px/1 var(--font,system-ui,sans-serif);cursor:pointer'; b.addEventListener('click', () => { el.hidden = true; el.style.display = 'none'; }); el.append(b); }   // круг 4: на телефоне (≤ 850 px) «Закрыть» — 48 px, как кнопки сообщений хода работ
      el.style.setProperty('--avl-low', innerWidth <= 850 ? '52px' : '0px');
      el.hidden = false; el.style.display = 'flex'; clearTimeout(toastT); if (!bad) arm(el);
    } catch (e) { /* без сообщения */ }
  }
  const arm = el => { clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; el.style.display = 'none'; }, 6500); };
  const FILE = () => location.protocol === 'file:';
  const LOCAL = ' Ссылка открывается только на этом компьютере (атлас открыт из файла) — коллеге отправьте «Снимок».';
  function urlFor(v) {
    const base = location.href.split('#')[0];
    return base + '#view=' + encode(v);
  }
  // 1.0.19a, Б4: в режиме «Ход работ» — ссылка на этап, захватку и дату (если выбрана не сегодняшняя): #progress=1&stage=&lot=&date=; камера — у модуля хода (fitIds этапа)
  function progressUrl() { try { const T = window.AtlasProgressTab; if (!T || !T.on || !T.on()) return null; const s = T.state() || {}, p = new URLSearchParams({ progress: '1' }); if (s.stage) { p.set('stage', s.stage); if (s.lot) p.set('lot', s.lot); } if (s.pinnedDate) p.set('date', s.pinnedDate); return location.href.split('#')[0] + '#' + p.toString(); } catch (e) { return null; } }
  // 1.0.15 B3-9 (S8, решение координатора): в режиме «Замечания на модели» ссылка — на замечание (#issues=1&issue=…&pair|place): куб выреза, контур и обход — у модуля замечаний
  function issuesUrl() { try { const I = window.AtlasIssues; if (!I || !I.on || !I.on()) return null; const s = I.state(), p = new URLSearchParams({ issues: '1' }); if (s && s.id) { p.set('issue', s.id); if (s.pairIdx >= 0) p.set('pair', String(s.pairIdx + 1)); if (s.placeIdx >= 0) p.set('place', String(s.placeIdx + 1)); } return location.href.split('#')[0] + '#' + p.toString(); } catch (e) { return null; } }
  async function copy() {
    const pu = progressUrl();
    const a = api(); if (!a && !pu) return false;
    let v = null; if (a) { try { v = a.capture(); } catch (e) { if (!pu) return false; } }
    try { const st = window.AtlasNodes && window.AtlasNodes.state(); if (st && st.k) { v.node = st.k; v.rebar = !!st.rebar; } } catch (e) { /* узлов нет */ }
    // V12.4 · P1: набор — в любом разделе, где он действует (во «Всём здании», на уровне, в узле); на уровне — с подписью уровня
    try { const si = window.AtlasNodes && window.AtlasNodes.sections && window.AtlasNodes.sections(); if (si && si.on) { v.sections = si.keys; if (si.level) { v.setLevel = si.level; if (si.levelNode) v.setNode = si.levelNode; } } } catch (e) { /* */ }   // V12.5 · Q8: и узел «на уровне» (якорь и тела поверх набора)
    try { const pi = window.AtlasNodes && window.AtlasNodes.placed && window.AtlasNodes.placed(); if (pi && pi.on) v.placed = pi.ids.slice(); } catch (e) { /* */ }   // 1.0.15 B3-15
    try { const ps = window.__ATLAS && window.__ATLAS.partSelection && window.__ATLAS.partSelection(); if (ps && ps.id === v.selection) v.part = ps.part; } catch (e) { /* */ }   /* 1.0.16 B3-3 */
    const url = issuesUrl() || pu || urlFor(v);
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); ok = true; } } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    const what = pu && url === pu ? 'Ссылка на этап «Хода работ» скопирована' : 'Ссылка на вид скопирована';
    toast(ok ? what + '.' + (FILE() ? LOCAL : '') : 'Не удалось скопировать ссылку. Что делать: скопируйте её из адресной строки.' + (FILE() ? LOCAL : ''), !ok);
    if (!ok) { try { history.replaceState(null, '', url); } catch (e) { /* file:// без истории */ } }
    return ok;
  }
  const RB_SCOPE = ((window.ATLAS_PROJECT || {}).rebar || {}).scope || null;   // К1: раздел армирования объекта — rebar.scope конфига
  const late = s => /^(PLACED:|REBAR_OD)/.test(String(s || '')) || (!!RB_SCOPE && s === RB_SCOPE);
  function waitReady(ms) {
    // V12.2 · E2: готовность сцены — __ATLAS.whenReady(); без E2 — опрос state().ready раз в 150 мс
    const A = window.__ATLAS;
    if (A && A.features && A.features.whenReady && typeof A.whenReady === 'function') return Promise.race([A.whenReady().then(r => !(r && r.cancelled)), new Promise(r => setTimeout(() => r(A.ready()), ms))]);
    return new Promise(res => {
      const t0 = performance.now();
      (function tick() {
        let ready = false; try { ready = window.__ATLAS.state().ready; } catch (e) { ready = true; }
        if (ready || performance.now() - t0 > ms) res(ready); else setTimeout(tick, 150);
      })();
    });
  }
  // V12.3 · E15: __ATLAS.restoreView → Promise (раздел вида, готовность сцены, повтор камеры и выбора — в движке); без E15 — прежний путь
  const E15 = () => { const A = window.__ATLAS; return !!(A && A.features && A.features.restoreViewPromise && typeof A.restoreView === 'function'); };
  /* 1.0.16 B3-3: часть из ссылки — после выбора тела (движок ждёт блок частей сам) */
  const partTo = v => { try { const A = window.__ATLAS; if (v && v.part != null && v.selection && A && A.selectPart) A.selectPart(v.selection, String(v.part)); } catch (e) { /* */ } };
  const selectIf = id => { try { const o = window.__FULL_ATLAS && window.__FULL_ATLAS.selected(); if (!o || o.renderId !== id) window.__ATLAS.select(id); } catch (e) { /* элемента нет в разделе */ } };
  // V12.3 · U1: набор разделов сохраняется при смене раздела (keepOnScope) — вид без набора снимает прежний
  // V12.4 · P1: вид на уровне / в узле — набор ставится в разделе вида (stay), выбор вида виден поверх набора
  async function sectionsTo(keys, v) {
    const N = window.AtlasNodes; if (!N || !N.whenReady) return;
    try {
      if (keys && keys.length) { await N.whenReady(); const NN = window.AtlasNodes; if (NN && NN.setSections) NN.setSections(keys, v ? { stay: true, level: v.setLevel || null, node: v.setNode || null, pins: v.selection ? [v.selection] : [] } : undefined); }
      else if (N.sections && N.sections().on) N.setSections(null);
    } catch (e) { /* */ }
    // 1.0.15 B3-15: группы «По РД» из ссылки — во «Всём здании» (в разделе вида с набором — тоже); нет в ссылке — снять
    try { const pk = v && Array.isArray(v.placed) ? v.placed : null, NN = window.AtlasNodes; if (pk && pk.length) { await N.whenReady(); const M = window.AtlasNodes; if (M && M.setPlaced) M.setPlaced(pk); } else if (NN && NN.placed && NN.placed().on) NN.setPlaced(null); } catch (e) { /* */ }
  }
  const setsOf = v => Array.isArray(v.sections) ? v.sections : null;
  async function apply(view) {
    const a = api(), v = view && view.schema ? view : decode(view);
    if (!a || !v) return false;
    const full = Object.assign({ hidden: [], isolated: false }, v, { slice: Object.assign({ axis: 'none', value: 100, flip: false }, v.slice || {}) });
    // V12.1: вид с узлом — сначала узел (раздел, наложение, выбор), затем камера того же раздела
    const N = window.AtlasNodes;
    // V12.5 · Q8: открытие ссылки в открытом атласе — прежний набор снимается тихо до смены раздела (иначе ложная подсказка «Набор разделов снят»; набор вида ставится ниже).
    // V12.5b: вид не открылся (restoreView отклонён, узел не открылся) — прежний набор возвращается (с уровнем и узлом «на уровне»), без подсказки
    let prev = null; try { const si = N && N.sections && N.sections(); if (si && si.on) { prev = { keys: si.keys.slice(), level: si.level || null, node: si.levelNode || null }; N.setSections(null); } } catch (e) { /* */ }
    const restorePrev = () => { if (!prev) return; try { window.AtlasNodes.setSections(prev.keys, { stay: true, level: prev.level, node: prev.node }); } catch (e) { /* */ } };
    // узла из ссылки нет в реестре — открыть как обычный вид (камера, раздел, выбор)
    if (v.node && N) { try { await N.whenReady(); if (!(window.AtlasNodes.get && window.AtlasNodes.get(v.node))) { delete full.node; v.node = null; } } catch (e) { /* */ } }
    if (v.node && N) {
      try { await N.open(v.node, { rebar: !!v.rebar, select: !v.selection }); full.scope = window.__ATLAS.scope();   /* К1 § 2 */ full.level = ''; if (E15()) await window.__ATLAS.restoreView(full); else a.restoreView(full); await sectionsTo(setsOf(v), v); } catch (e) { restorePrev(); toast('Вид по ссылке не открыт: ' + (e && e.message || e) + '. Что делать: откройте модель и найдите элемент поиском; ссылку попросите обновить.', true); return false; }
      if (v.selection) { if (E15()) selectIf(v.selection); else { await waitReady(8000); try { window.__ATLAS.select(v.selection); } catch (e) { /* */ } } partTo(v); }
      document.dispatchEvent(new CustomEvent('atlas:viewlink', { detail: { scope: full.scope, selection: v.selection || null, node: v.node } }));
      return true;
    }
    if (E15()) {
      try { await window.__ATLAS.restoreView(full); } catch (e) { restorePrev(); toast('Вид по ссылке не открыт: ' + e.message + '. Что делать: откройте модель и найдите элемент поиском; ссылку попросите обновить.', true); return false; }
      await sectionsTo(setsOf(v), v);
      if (v.selection) { selectIf(v.selection); partTo(v); }
      document.dispatchEvent(new CustomEvent('atlas:viewlink', { detail: { scope: v.scope, selection: v.selection || null } }));
      return true;
    }
    try { a.restoreView(full); } catch (e) { restorePrev(); toast('Вид по ссылке не открыт: ' + e.message + '. Что делать: откройте модель и найдите элемент поиском; ссылку попросите обновить.', true); return false; }
    await sectionsTo(setsOf(v), v);   // V12.2b: при загрузке AtlasNodes — ещё заглушка, setSections — после whenReady; без второго restoreView
    if (late(v.scope)) { await waitReady(20000); try { a.restoreView(full); } catch (e) { /* раздел уже открыт */ } }
    if (v.selection) { await waitReady(8000); try { window.__ATLAS.select(v.selection); } catch (e) { /* элемента нет в разделе */ } partTo(v); }
    document.dispatchEvent(new CustomEvent('atlas:viewlink', { detail: { scope: v.scope, selection: v.selection || null } }));
    return true;
  }
  const fromHash = () => new URLSearchParams(location.hash.slice(1)).get('view');
  let ready = false;
  function handle() { const s = fromHash(); if (s && ready) apply(s); }
  document.addEventListener('atlas:ready', () => { ready = true; setTimeout(handle, 0); });
  window.addEventListener('hashchange', handle);
  return { ready: true, encode, decode, copy, apply, progressUrl };
})();
