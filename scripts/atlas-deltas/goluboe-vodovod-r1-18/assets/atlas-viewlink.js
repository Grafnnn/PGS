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
    if (typeof v.dims === 'string' && /^(g|l|gl)$/.test(v.dims)) out.dims = v.dims;   // 1.3.0 · этап 1, п. 8: режим «Размеры» (g — габарит, l — отметки) — в ссылке на вид
    { const RL = (window.ATLAS_RELEASE || {}).release_label; if (RL) out.rel = String(RL); }   // 1.3.0 · план п. 8: редакция, в которой сделана ссылка
    isoPick(v, out);
    return out;
  }
  /* 1.1.1 B1: изоляция и скрытые — в ссылке (ключи isolated, isolatedIds, hidden: так их читает restoreView движка; старые ссылки без ключей — как раньше).
     Одиночная изоляция (выбранный элемент) — флаг; набор — до ISO_MAX id; скрытые вручную — до HID_MAX id. Больше — не передаётся, limits() говорит, что именно. */
  /* Больше ISO_MAX / HID_MAX — сжатая форма {u, h, r}: номера в упорядоченном списке тел сцены раздела (sceneObjects, по renderId; изоляцию и скрытые движок
     и так берёт только из сцены) отрезками; u и h (число и FNV-1a списка) сверяются при открытии, когда раздел загружен, — другой состав: выборка не применяется,
     сообщение. Сжатая строка длиннее RUN_MAX символов — предел (что не вошло — словами). */
  const ISO_MAX = 200, HID_MAX = 200, RUN_MAX = 6000;
  function uni() {   // без кэша: таблица и её FNV — по фактическим renderId сцены в момент кодирования и разбора (замечание Codex: кэш scope+число мог взять старый список)
    const A = window.__ATLAS, W = (A && A.sceneObjects && A.sceneObjects()) || [];
    const ids = [...new Set(W.map(o => String(o.renderId)))].sort(), at = new Map(ids.map((id, i) => [id, i]));
    let h = 0x811c9dc5; for (const id of ids) { for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= 10; h = Math.imul(h, 16777619) >>> 0; }
    return { ids, at, u: ids.length, h: h.toString(36) };
  }
  const b64u = bytes => { let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { const b = String(str).replace(/-/g, '+').replace(/_/g, '/'); return Uint8Array.from(atob(b + '==='.slice((b.length + 3) % 4)), c => c.charCodeAt(0)); };
  function runsEnc(list) {
    const U = uni(); if (!U.u) return null; const ix = []; for (const id of list) { const i = U.at.get(String(id)); if (i != null) ix.push(i); }   // не из сцены — движок их и так не покажет
    ix.sort((a, b) => a - b); const out = [], vi = n => { while (n > 127) { out.push((n & 127) | 128); n >>>= 7; } out.push(n); };
    let last = 0; for (let k = 0; k < ix.length;) { let j = k; while (j + 1 < ix.length && ix[j + 1] <= ix[j] + 1) j++; vi(ix[k] - last); vi(ix[j] - ix[k]); last = ix[j] + 1; k = j + 1; }
    return { u: U.u, h: U.h, n: ix.length, r: b64u(out) };
  }
  function runsDec(o) {
    if (!o || typeof o.r !== 'string' || o.r.length > RUN_MAX || !/^[A-Za-z0-9_-]*$/.test(o.r)) return null;
    const U = uni(); if (U.u !== o.u || U.h !== o.h) return null;
    // проверка: не больше RUN_MAX отрезков, числа — целые (varint не длиннее 5 байт), каждый отрезок целиком в таблице; иначе — выборка неверна (null → сообщение)
    try { const b = unb64u(o.r), res = []; let p = 0, last = 0, runs = 0;
      const vi = () => { let n = 0, sh = 0, c, k = 0; do { if (p >= b.length || ++k > 5) throw Error('varint'); c = b[p++]; n += (c & 127) * 2 ** sh; sh += 7; } while (c & 128); return n; };
      while (p < b.length) { if (++runs > RUN_MAX) return null; const st = last + vi(), len = vi(); if (!Number.isSafeInteger(st) || st + len >= U.ids.length) return null; for (let i = st; i <= st + len; i++) res.push(U.ids[i]); last = st + len + 1; }
      return Number.isSafeInteger(o.n) && res.length !== o.n ? null : res; } catch (e) { return null; }   // неполная выборка — не применяется
  }
  function isoPick(v, out) {
    const lim = [], ids = Array.isArray(v.isolatedIds) ? v.isolatedIds : null, hid = Array.isArray(v.hidden) ? v.hidden : [];
    if (v.isolated) {
      if (ids && ids.length) {
        if (ids.length <= ISO_MAX) { out.isolated = 1; out.isolatedIds = ids.map(String); }
        else { const z = runsEnc(ids); if (z && z.r.length <= RUN_MAX) { out.isolated = 1; out.iso = z; } else lim.push({ k: 'iso', n: ids.length, max: ISO_MAX }); }
      } else if (v.selection) out.isolated = 1;
    }
    if (hid.length) {
      if (hid.length <= HID_MAX) out.hidden = hid.map(String);
      else { const z = runsEnc(hid); if (z && z.r.length <= RUN_MAX) out.hid = z; else lim.push({ k: 'hidden', n: hid.length, max: HID_MAX }); }
    }
    pick.lim = lim;
  }
  // при открытии: сжатая форма → списки движка; другой состав модели — выборка не применяется, сообщение
  function isoUnpack(v) {
    const miss = [];
    if (v.iso && !Array.isArray(v.isolatedIds)) { const l = runsDec(v.iso); if (l && l.length) v.isolatedIds = l; else { v.isolated = false; miss.push('изоляция'); } }
    if (v.hid && !Array.isArray(v.hidden)) { const l = runsDec(v.hid); if (l) v.hidden = l; else miss.push('скрытые элементы'); }
    delete v.iso; delete v.hid;
    if (miss.length) toast('Вид по ссылке открыт без части выборки (' + miss.join(', ') + '): состав модели отличается от того, где ссылку создали, или ссылка повреждена; показан раздел целиком с тем же выбором и камерой. Что делать: попросите обновить ссылку.', false, true);
    return v;
  }
  const fmtN = n => Number(n).toLocaleString('ru-RU');
  function limitText(lim) {
    if (!lim || !lim.length) return '';
    const what = lim.map(x => (x.k === 'iso' ? 'изоляция ' : 'скрытые вручную ') + fmtN(x.n) + ' эл.').join('; ');
    return ' В ссылку не вошло (ограничение длины ссылки): ' + what + ' — получатель увидит раздел целиком с тем же выбором, камерой и сечением. Для точной выборки отправьте «Снимок».';
  }
  // base64url поверх UTF-8 (id элементов бывают с кириллицей: «L1_Фп-1»)
  function encode(view) {
    pick.lim = [];
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
  function toast(t, bad, stay) {
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
      if (bad || stay) { const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Закрыть'; b.style.cssText = 'min-height:' + (innerWidth <= 850 ? 48 : 36) + 'px;padding:0 12px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:600 14px/1 var(--font,system-ui,sans-serif);cursor:pointer'; b.addEventListener('click', () => { el.hidden = true; el.style.display = 'none'; }); el.append(b); }   // круг 4: на телефоне (≤ 850 px) «Закрыть» — 48 px, как кнопки сообщений хода работ
      el.style.setProperty('--avl-low', innerWidth <= 850 ? '52px' : '0px');
      el.dataset.bad = bad || stay ? '1' : '';   /* 1.1.1 B1: сообщение о пределе ссылки — до «Закрыть» */
      el.hidden = false; el.style.display = 'flex'; clearTimeout(toastT); if (!bad && !stay) arm(el);
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
  // узел, набор разделов, группы «По РД», часть — к захвату вида (ссылка и 1.1.1 B2 — история шагов)
  function extras(v) {
    try { const st = window.AtlasNodes && window.AtlasNodes.state(); if (st && st.k) { v.node = st.k; v.rebar = !!st.rebar; } } catch (e) { /* узлов нет */ }
    // V12.4 · P1: набор — в любом разделе, где он действует (во «Всём здании», на уровне, в узле); на уровне — с подписью уровня
    try { const si = window.AtlasNodes && window.AtlasNodes.sections && window.AtlasNodes.sections(); if (si && si.on) { v.sections = si.keys; if (si.level) { v.setLevel = si.level; if (si.levelNode) v.setNode = si.levelNode; } } } catch (e) { /* */ }   // V12.5 · Q8: и узел «на уровне» (якорь и тела поверх набора)
    try { const pi = window.AtlasNodes && window.AtlasNodes.placed && window.AtlasNodes.placed(); if (pi && pi.on) v.placed = pi.ids.slice(); } catch (e) { /* */ }   // 1.0.15 B3-15
    try { const ps = window.__ATLAS && window.__ATLAS.partSelection && window.__ATLAS.partSelection(); if (ps && ps.id === v.selection) v.part = ps.part; } catch (e) { /* */ }   /* 1.0.16 B3-3 */
    try { const dc = window.AtlasDims && window.AtlasDims.code && window.AtlasDims.code(); if (dc && dc !== '0') v.dims = dc; } catch (e) { /* модуля размеров нет */ }   /* 1.3.0 */
    return v;
  }
  async function copy() {
    const pu = progressUrl();
    const a = api(); if (!a && !pu) return false;
    let v = null; if (a) { try { v = a.capture(); } catch (e) { if (!pu) return false; } }
    extras(v);
    pick.lim = []; const iu = issuesUrl(), url = iu || pu || urlFor(v);
    let ok = false;
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); ok = true; } } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement('textarea'); ta.value = url; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    const what = pu && url === pu ? 'Ссылка на этап «Хода работ» скопирована' : 'Ссылка на вид скопирована';
    const lt = iu || (pu && url === pu) ? '' : limitText(pick.lim);   // 1.1.1 B1: предел ссылки — словами
    toast(ok ? what + '.' + lt + (FILE() ? LOCAL : '') : 'Не удалось скопировать ссылку. Что делать: скопируйте её из адресной строки.' + lt + (FILE() ? LOCAL : ''), !ok, !!lt);
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
    { const now = (window.ATLAS_RELEASE || {}).release_label; if (typeof v.rel === 'string' && v.rel && now && v.rel !== String(now)) toast('Ссылка сделана в редакции ' + v.rel + '. Открыта редакция ' + now + ': элементы, размеры и листы могли измениться.', false, true); }   // 1.3.0 · план п. 8
    const packed = !!(v.iso || v.hid);   // 1.1.1 B1: сжатая выборка — после загрузки раздела (второй проход restoreView)
    const full = Object.assign({ hidden: [], isolated: false }, v, { slice: Object.assign({ axis: 'none', value: 100, flip: false }, v.slice || {}) });
    if (packed) { delete full.iso; delete full.hid; if (v.iso && !Array.isArray(v.isolatedIds)) full.isolated = false; }
    const unpack = async () => {   // 1.1.1 B1
      if (!packed) return; await waitReady(20000); isoUnpack(v);
      if (!Array.isArray(v.isolatedIds) && !Array.isArray(v.hidden)) return;
      const f2 = Object.assign({}, window.__R24.capture(), { isolated: !!v.isolated, isolatedIds: v.isolatedIds, hidden: Array.isArray(v.hidden) ? v.hidden : [], camera: full.camera, schema: full.schema, __again: true });
      delete f2.preferences; try { a.restoreView(f2); } catch (e) { /* */ }
    };
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
      await unpack();
      document.dispatchEvent(new CustomEvent('atlas:viewlink', { detail: { dims: typeof v.dims === 'string' ? v.dims : '', scope: full.scope, selection: v.selection || null, node: v.node } }));
      return true;
    }
    if (E15()) {
      try { await window.__ATLAS.restoreView(full); } catch (e) { restorePrev(); toast('Вид по ссылке не открыт: ' + e.message + '. Что делать: откройте модель и найдите элемент поиском; ссылку попросите обновить.', true); return false; }
      await sectionsTo(setsOf(v), v);
      if (v.selection) { selectIf(v.selection); partTo(v); }
      await unpack();
      document.dispatchEvent(new CustomEvent('atlas:viewlink', { detail: { dims: typeof v.dims === 'string' ? v.dims : '', scope: v.scope, selection: v.selection || null } }));
      return true;
    }
    try { a.restoreView(full); } catch (e) { restorePrev(); toast('Вид по ссылке не открыт: ' + e.message + '. Что делать: откройте модель и найдите элемент поиском; ссылку попросите обновить.', true); return false; }
    await sectionsTo(setsOf(v), v);   // V12.2b: при загрузке AtlasNodes — ещё заглушка, setSections — после whenReady; без второго restoreView
    if (late(v.scope)) { await waitReady(20000); try { a.restoreView(full); } catch (e) { /* раздел уже открыт */ } }
    if (v.selection) { await waitReady(8000); try { window.__ATLAS.select(v.selection); } catch (e) { /* элемента нет в разделе */ } partTo(v); }
    await unpack();
    document.dispatchEvent(new CustomEvent('atlas:viewlink', { detail: { dims: typeof v.dims === 'string' ? v.dims : '', scope: v.scope, selection: v.selection || null } }));
    return true;
  }
  const fromHash = () => new URLSearchParams(location.hash.slice(1)).get('view');
  let ready = false;
  function handle() { const s = fromHash(); if (s && ready) apply(s); }
  document.addEventListener('atlas:ready', () => { ready = true; setTimeout(handle, 0); });
  window.addEventListener('hashchange', handle);
  /* ---------- 1.1.1 B2: шаги вида в истории браузера, «Предыдущий вид» ----------
     Шаг — выбор, часть, изоляция, скрытые, сечение (API и срез), раздел и уровень, узел, набор разделов, «вписать»/ракурс. Шаг пишется pushState (тот же адрес),
     вид шага — в памяти (и sessionStorage), в history.state только {atlasStep, d}. Вращение и масштаб шагом не считаются: камера запоминается с шагом —
     захват перед каждым нажатием (pointerdown/keydown) и при уходе с записи. «Назад» (браузер, телефон, кнопка) — popstate → вид записи через apply() без перезагрузки.
     Телефон (≤ 850 px): «Назад» сначала закрывает открытое окно/шторку (окно справки, лист, «Инструменты», поиск, «Состав», карточка), вид не меняется;
     первое касание добавляет запись-упор, чтобы «Назад» на первом виде закрыл шторку, а не страницу. Чужие replaceState(null) не стирают {atlasStep}. */
  const H = (() => {
    const phone = () => innerWidth <= 850, SKEY = 'atlasSteps:' + location.pathname;
    const snaps = new Map(), urls = new Map(); let seq = 0, armed = false, restoring = false, timer = 0, tFirst = 0, pre = null, camStep = false, viaBtn = false, ignorePop = 0, padDone = false, btn = null;
    try { const j = JSON.parse(sessionStorage.getItem(SKEY) || 'null'); if (j && Array.isArray(j.s)) { seq = j.seq | 0; for (const [k, v] of j.s) snaps.set(k, v); } } catch (e) { /* без хранилища */ }
    const RS = History.prototype.replaceState;
    try {
      history.replaceState = function (st, t, u) {
        try { const c = history.state; if (c && typeof c === 'object' && (st == null || typeof st === 'object')) { const k = {}; for (const x of ['atlasStep', 'd', 'pad', 'atlasSearch']) if (c[x] !== undefined && !(st && x in st)) k[x] = c[x]; if (Object.keys(k).length) st = Object.assign({}, st || {}, k); } } catch (e) { /* */ }   // и позиция поиска (B3)
        const r = RS.call(this, st, t, u); lastHash = location.hash; return r;
      };
    } catch (e) { /* без обёртки */ }
    const cur = () => { const s = history.state; return s && s.atlasStep != null ? s : null; };
    // переход по записям шагов: hashchange, где поменялись только ключи движка (scope, id, level, part, layer), не отдаём модулям — вид ставит restore()
    let lastHash = location.hash, swallow = 0;
    const OWN = new Set(['scope', 'id', 'level', 'part', 'layer']);
    const ownOnly = (a, b) => { const A = new URLSearchParams(String(a).slice(1)), B = new URLSearchParams(String(b).slice(1)); for (const k of new Set([...A.keys(), ...B.keys()])) if (!OWN.has(k) && A.get(k) !== B.get(k)) return false; return true; };
    addEventListener('hashchange', e => { if (swallow && performance.now() - swallow < 400 && ownOnly(lastHash, location.hash)) e.stopImmediatePropagation(); swallow = 0; lastHash = location.hash; }, true);
    function cap() { const a = api(); if (!a) return null; let v; try { v = a.capture(); } catch (e) { return null; } delete v.preferences; return extras(v); }
    const sig = v => v ? JSON.stringify([v.scope, v.level || '', v.selection || null, v.part == null ? null : String(v.part), !!v.isolated, v.isolatedIds || null, (v.hidden || []).length, (v.hidden || []).slice(0, 50), v.section || null,
      v.slice && v.slice.axis !== 'none' ? [v.slice.axis, v.slice.value, !!v.slice.flip] : null, v.node || null, !!v.rebar, v.sections || null, v.setLevel || null, v.placed || null]) : '';
    const camFar = (a, b) => { if (!a || !b) return false; const ca = a.camera, cb = b.camera, d = Math.hypot(...ca.center.map((x, i) => x - cb.center[i])); return Math.abs(ca.az - cb.az) > .05 || Math.abs(ca.el - cb.el) > .05 || d > .02 * Math.max(1, ca.radius) || Math.abs(Math.log(ca.scale / cb.scale)) > .1; };
    function save() { try { const keep = [...snaps].slice(-40).filter(([, v]) => (v.hidden || []).length <= 5000); sessionStorage.setItem(SKEY, JSON.stringify({ seq, s: keep })); } catch (e) { /* */ } }
    function put(id, v) { snaps.set(id, v); if (snaps.size > 100) snaps.delete(snaps.keys().next().value); }
    function prevSync() {
      const c = cur(), on = !!c && (c.d | 0) > 0 && armed;
      if (!btn) return; btn.hidden = !on; btn.classList.toggle('is-needed', on); btn.disabled = !on;
    }
    function commit() {
      timer = 0; tFirst = 0; if (!armed || restoring) return;
      const v = cap(); if (!v) return;
      const c = cur(); if (!c) { const id = ++seq; put(id, v); RS.call(history, Object.assign({}, history.state || {}, { atlasStep: id, d: 0 }), ''); save(); prevSync(); return; }
      const was = snaps.get(c.atlasStep), same = sig(was) === sig(v);
      const cs = camStep; camStep = false;
      if (same && !(cs && camFar(pre && pre.v || was, v))) { if (was) { was.camera = v.camera; } return; }   // камера без шага — запоминается в текущей записи
      if (pre && pre.id === c.atlasStep && sig(pre.v) === sig(was)) put(c.atlasStep, pre.v);   // вид перед шагом — с камерой до нажатия
      pre = null;
      const id = ++seq; put(id, v);
      { const u0 = urls.get(c.atlasStep); if (u0 && u0 !== location.href) RS.call(history, history.state, '', u0); }   // адрес прежней записи — как на её шаге (движок уже переписал его под новый выбор)
      urls.set(id, location.href);
      history.pushState({ atlasStep: id, d: (c.d | 0) + 1 }, '', urls.get(id)); H.id = id; H.d = (c.d | 0) + 1;
      save(); prevSync();
    }
    function step(cam) {
      if (!armed || restoring) return;
      if (cam) camStep = true;
      clearTimeout(timer); const now = performance.now(); if (!tFirst) tFirst = now;
      timer = setTimeout(commit, now - tFirst > 1200 ? 0 : 350);   // серия событий одного действия — один шаг
    }
    function before(e) {
      if (!armed || restoring || !e.isTrusted) return;
      if (phone() && !padDone) pad();
      const c = cur(); if (!c || timer) return;   // во время серии — не перезаписывать «до»
      const v = cap(); if (v) pre = { id: c.atlasStep, v };
    }
    function pad() {   // телефон: упор под первым видом (первое касание — активация пользователем, запись не пропускается браузером)
      padDone = true; const c = cur(); if (!c || (c.d | 0) !== 0 || c.pad) return;
      RS.call(history, Object.assign({}, history.state, { pad: 1, d: -1 }), '');
      history.pushState({ atlasStep: c.atlasStep, d: 0 }, '', location.href);
    }
    // открытые окна и шторки (телефон) — закрыть верхнее; true — закрыто
    function closeTop() {
      const $ = id => document.getElementById(id), vis = e => !!e && !e.hidden && e.offsetParent !== null;
      const dlg = [...document.querySelectorAll('dialog[open]')].pop(); if (dlg) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } return true; }
      const m = $('modal'); if (m && m.classList.contains('open')) { const b = $('closeDrawing'); if (b) b.click(); else m.classList.remove('open'); return true; }
      const vs = $('viewSettings'); if (vs && !vs.hidden && vs.offsetParent !== null) { const b = $('closeViewSettings'); if (b) b.click(); else vs.hidden = true; return true; }
      const sp = $('searchPopover'), sh = document.querySelector('.atlas-shell.as-search-open'); if ((sp && vis(sp)) || sh) { const i = $('search'); if (i) i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); if (sp) sp.hidden = true; if (sh) sh.classList.remove('as-search-open'); return true; }
      const l = $('left'); if (l && l.classList.contains('open')) { l.classList.remove('open'); return true; }
      const r = $('right'); if (r && r.classList.contains('open')) { r.classList.remove('open'); return true; }
      return false;
    }
    async function restore(id) {
      const v = snaps.get(id); if (!v) return;
      restoring = true; clearTimeout(timer); timer = 0; tFirst = 0; camStep = false; pre = null;
      try {
        const A = window.__ATLAS, N = window.AtlasNodes;
        try { const st = N && N.state && N.state(); if (st && st.k && st.k !== v.node && N.close) await N.close(); } catch (e) { /* */ }
        try { if (!v.selection && A.selection && A.selection()) A.deselect(); } catch (e) { /* */ }
        await apply(JSON.parse(JSON.stringify(v)));
      } catch (e) { /* вид не восстановлен — остаётся текущий */ }
      setTimeout(() => { restoring = false; const now = cap(), c = cur(); if (now && c && c.atlasStep === id) { const was = snaps.get(id); if (was && sig(was) !== sig(now)) put(id, Object.assign(now, { camera: was.camera })); } prevSync(); }, 450);
    }
    addEventListener('popstate', e => {
      const st = e.state;
      if (ignorePop) { ignorePop--; if (location.hash !== lastHash) swallow = performance.now(); prevSync(); return; }
      if (!armed || !st || st.atlasStep == null) { lastHash = location.hash; prevSync(); return; }
      if (location.hash !== lastHash) swallow = performance.now();
      const back = !!st.pad || (st.d | 0) < (H.d | 0);
      if (back && phone() && !viaBtn && closeTop()) { ignorePop++; history.forward(); return; }   // «Назад» на телефоне — сначала окно
      viaBtn = false;
      if (st.pad) { if (!restoring) { ignorePop++; history.back(); } return; }   // упор: окон нет — «Назад» уходит со страницы
      const from = H.id; if (from != null && from !== st.atlasStep && !restoring) { const now = cap(); if (now) put(from, now); }
      H.id = st.atlasStep; H.d = st.d | 0; if (!urls.has(st.atlasStep)) urls.set(st.atlasStep, location.href);
      if (snaps.has(st.atlasStep)) setTimeout(() => restore(st.atlasStep), 0);   // после hashchange-обработчиков: вид записи — последним
      prevSync();
    });
    function arm() {
      if (armed) return; const v = cap(); if (!v) return;
      const c = cur();
      if (c && snaps.has(c.atlasStep)) { put(c.atlasStep, v); }   // перезагрузка: запись та же, вид — нынешний
      else { const id = ++seq; put(id, v); RS.call(history, Object.assign({}, history.state || {}, { atlasStep: id, d: 0 }), ''); }
      armed = true; const k = cur(); H.id = k.atlasStep; H.d = k.d | 0; urls.set(k.atlasStep, location.href); save(); prevSync();
    }
    function button() {
      const home = document.getElementById('quickHome'); if (btn || !home) return;
      btn = document.createElement('button'); btn.type = 'button'; btn.id = 'quickPrev'; btn.className = 'ui-button'; btn.textContent = 'Предыдущий вид'; btn.hidden = true;
      btn.title = 'Предыдущий вид: выбор, изоляция, сечение, раздел и камера шага назад (то же, что «Назад» браузера)';
      btn.setAttribute('aria-label', 'Предыдущий вид');
      btn.addEventListener('click', () => { const c = cur(); if (!c || (c.d | 0) <= 0) return; viaBtn = true; history.back(); });
      home.after(btn);
      try { if (window.AtlasToolbar && window.AtlasToolbar.layout) window.AtlasToolbar.layout(); } catch (e) { /* */ }
    }
    for (const ev of ['atlas:selectionchange', 'atlas:isolate', 'atlas:section', 'atlas:scope', 'atlas:visibility', 'atlas:sections', 'atlas:node', 'atlas:part', 'atlas:viewlink']) document.addEventListener(ev, () => step(false));
    document.addEventListener('atlas:focus', e => { if (e.detail && e.detail.status === 'done') step(true); });
    document.addEventListener('click', e => { if (!e.isTrusted) return; const t = e.target && e.target.closest && e.target.closest('[data-view], #fit, #focusSelected, #fitElement, #atbCameraMenu [role="menuitem"], #quickHome, #quickRestore'); if (t && t.id !== 'quickPrev') step(true); }, true);
    document.addEventListener('change', e => { const t = e.target; if (t && /^(sliceAxis|sliceValue|r23SliceFlip)$/.test(t.id || '')) step(false); }, true);
    document.addEventListener('pointerdown', before, true); document.addEventListener('keydown', before, true);
    // камера текущей записи — после вращения, сдвига, масштаба (отпускание, колесо, клавиши), не во время шага
    let camT = 0; const camNow = () => { clearTimeout(camT); camT = setTimeout(() => { if (!armed || restoring || timer) return; const c = cur(), was = c && snaps.get(c.atlasStep), a = api(); if (!was || !a) return; try { was.camera = a.capture().camera; if (pre && pre.id === c.atlasStep) pre.v.camera = was.camera; } catch (e) { /* */ } }, 250); };
    for (const ev of ['pointerup', 'wheel', 'keyup', 'atlas:camera']) document.addEventListener(ev, camNow, { capture: true, passive: true });
    document.addEventListener('atlas:ready', () => {
      button();
      const go = () => setTimeout(arm, 600), A = window.__ATLAS;
      if (fromHash()) document.addEventListener('atlas:viewlink', () => setTimeout(go, 300), { once: true });
      else if (A && typeof A.whenReady === 'function') A.whenReady().then(go, go); else go();
      setTimeout(() => { if (!armed) arm(); }, 20000);
    }, { once: true });
    return { id: null, d: 0, back: () => { const c = cur(); if (c && (c.d | 0) > 0) { viaBtn = true; history.back(); return true; } return false; }, state: () => ({ armed, step: cur(), steps: snaps.size, restoring }), closeTop };
  })();
  return { ready: true, encode, decode, copy, apply, progressUrl, history: H, limits: () => (pick.lim || []).slice(), limitText: () => limitText(pick.lim) };
})();
