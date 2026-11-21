/* 3D Атлас · «Каталог типов» (п. 1.5.1). Данные — data/catalogue_library.js (без изменений),
   замечания — ATLAS_REMARKS (новые номера по полю packages), связь с моделью — ATLAS_ELEMENT_TYPES и слой «Размещено по РД». */
'use strict';
(async () => {
  const U = window.LibraryUtils, S = window.AtlasShell, make = S.make, fmt = S.fmt;
  const $ = id => document.getElementById(id);
  const D = await U.decode(window.ATLAS_CATALOGUE_GZIP);
  delete window.ATLAS_CATALOGUE_GZIP;
  // Порядок разделов — порядок данных spec0…spec14 (решение координатора 27.09).
  const SECTIONS = D.sections, secIndex = new Map(SECTIONS.map((s, i) => [s.id, i]));
  const secShort = id => ((SECTIONS.find(s => s.id === id) || {}).label || id).split(' — ')[0];
  SECTIONS.forEach(s => { const o = U.el('option', s.label); o.value = s.id; $('catalogueSection').append(o); });
  /* К1-B3: старые type_id → действующий (номер типа или type_id) — catalogue.type_aliases конфига объекта; нет ключа — алиасов нет */
  const TA = ((window.ATLAS_PROJECT || {}).catalogue || {}).type_aliases || {};
  const aliasHits = r => Object.keys(TA).filter(a => { const v = TA[a]; if (v == null) return false; if (typeof v === 'object') return v.package != null && String(v.package) === String(r.package_no); return v === r.id || String(v) === String(r.package_no); }); /* значение — действующий type_id или { package: N } (схема) */
  /* К1-B3: история цепочки типов — записи с history_only (данные); служебные — они же и catalogue.service_types конфига (номера типов); коды поиска «003» — из номеров; без данных — нет */
  const PCAT = (window.ATLAS_PROJECT || {}).catalogue || {}, HISTORY = new Set(D.objects.filter(o => o.history_only && o.package_no != null).map(o => o.package_no));
  const SERVICE = new Set([...[].concat(PCAT.service_types || []).map(Number).filter(Number.isFinite), ...HISTORY]), HQ = ['история', ...[...HISTORY].map(n => String(n).padStart(3, '0'))];
  const REM = (window.ATLAS_REMARKS && window.ATLAS_REMARKS.items) || [];
  const remByPkg = new Map();
  for (const r of REM) for (const p of r.packages || []) { if (!remByPkg.has(p)) remByPkg.set(p, []); remByPkg.get(p).push(r); }
  const T = window.ATLAS_ELEMENT_TYPES || { links: {} };
  const whereByPkg = new Map();
  for (const [id, l] of Object.entries(T.links || {})) { const n = Number(l.package); if (!whereByPkg.has(n)) whereByPkg.set(n, []); whereByPkg.get(n).push({ id, l }); }
  /* К1-B3: слой «размещено по РД» объекта — ATLAS_REVISIONS_META.layers (набор данных объекта): href, record_prefix, type_range | packages, texts.catalogue_item / catalogue_sub / member_sub; нет набора — пунктов слоя нет (без чисел в коде) */
  const LAYER = (((window.ATLAS_REVISIONS_META || {}).layers) || []).find(x => x && x.href && x.record_prefix) || null, LT = (LAYER && LAYER.texts) || {};
  const inLayer = n => !!LAYER && n != null && (Array.isArray(LAYER.packages) ? LAYER.packages.map(Number).includes(Number(n)) : Array.isArray(LAYER.type_range) && n >= LAYER.type_range[0] && n <= LAYER.type_range[1]);
  const fillT = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  const layerItem = (n, tail) => ({ href: LAYER.href + '&id=' + encodeURIComponent(LAYER.record_prefix + n) + tail, label: LT.catalogue_item ? fillT(LT.catalogue_item, { n }) : 'Тип № ' + n + ' · ' + (LAYER.label || 'слой'), sub: LT.catalogue_sub || '' });
  const memberItems = (mo, tail) => (LAYER && mo ? (mo.packages || []).map((pk, i) => ({ href: LAYER.href + '&id=' + encodeURIComponent((mo.render_ids || [])[i] || LAYER.record_prefix + pk) + tail, label: 'В составе пакета № ' + pk, sub: mo.basis || LT.member_sub || '' })) : []);
  const from = n => '&from=' + encodeURIComponent('Тип № ' + n);
  const where = n => { const all = whereByPkg.get(n) || []; const a = all.filter(({ l }) => !l.review_only).map(({ id, l }, i) => ({ href: 'index.html#scope=BUILDING&id=' + encodeURIComponent(id) + from(n), label: 'Место в здании ' + (i + 1), sub: [S.linkMethod(l.method), l.basis].filter(Boolean).join(' · ') }));
    // L · F5-4-07 / F5-4-08: связь только с проверочной сценой; тип в составе группового пакета «Размещено по РД».
    for (const { id } of all.filter(({ l }) => l.review_only)) a.push({ href: 'index.html#scope=ALL&id=' + encodeURIComponent(id) + from(n), label: 'Только проверочная сцена', sub: 'в здании не размещён · режим проверки' });
    const mo = (T.member_of || {})[String(n)];
    for (const x of memberItems(mo, from(n))) a.push(x); if (inLayer(n)) a.push(layerItem(n, from(n))); return a; };
  const coll = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
  const ALL = D.objects.slice().sort((a, b) => {
    const sa = SERVICE.has(a.package_no), sb = SERVICE.has(b.package_no);
    if (sa !== sb) return sa ? 1 : -1;
    if (sa) return a.package_no - b.package_no;
    return (secIndex.get(a.module) - secIndex.get(b.module)) || coll.compare(a.name || a.mark || '', b.name || b.mark || '');
  });
  /* К1-B3: «Происхождение геометрии» — пункты фильтра по данным (r.recovery, число записей); подписи и порядок — texts.catalogue.recovery_labels объекта, без подписи — значение;
     значений нет — фильтр скрыт. Строка режима проверки — texts.catalogue.recovery_notes (бывший ORIGIN). Тексты объекта — window.ATLAS_TEXTS (набор texts в config.plugins). */
  const TXC = ((window.ATLAS_TEXTS || {}).catalogue) || {}, RLAB = TXC.recovery_labels || {}, ORIGIN = TXC.recovery_notes || {};
  { const cnt = new Map(); for (const o of D.objects) if (o.recovery) cnt.set(o.recovery, (cnt.get(o.recovery) || 0) + 1);
    const sel = $('catalogueRecovery'), order = [...Object.keys(RLAB).filter(k => cnt.has(k)), ...[...cnt.keys()].filter(k => !Object.prototype.hasOwnProperty.call(RLAB, k))];
    if (sel) { for (const k of order) { const o = U.el('option', (RLAB[k] || k) + ' · ' + cnt.get(k)); o.value = k; sel.append(o); } if (!order.length) { sel.hidden = true; const lab = sel.closest('label'); if (lab) lab.hidden = true; } } }
  /* 1.0.1 (B2): плашка «Данные — <подпись candidate>: типов N из M» над сеткой — тот же признак и ключ, что у #candidateNote реестра
     (status.candidate записи; подпись — AtlasStatus.label('candidate'): status_labels объекта или нейтральная ядра). Признака нет — плашки нет.
     Фильтры «Владелец / Статус / Уровень» — значения из данных: owner (подпись — owner_label записи, owners конфига, иначе код),
     статус записи (пункты как у «Статуса» реестра), record_level (порядок — levels конфига; пусто — «уровень не указан»). Поля нет ни в одной записи — фильтра нет.
     Владелец везде равен разделу (module) — выбор раздела скрыт: его заменяет «Владелец» (два одинаковых списка не показываем). */
  const XF = [], PRJ = window.ATLAS_PROJECT || {}, ST = window.AtlasStatus, STL = k => (ST && ST.label ? ST.label(k) : k);
  const stOf = r => (r && r.status && typeof r.status === 'object' && !Array.isArray(r.status)) ? r.status : (r && r.data_status && typeof r.data_status === 'object' && !Array.isArray(r.data_status) ? r.data_status : null);
  { const n = D.objects.filter(r => (stOf(r) || {}).candidate).length; /* как в реестре — по истинности */
    if (n) $('catalogueCount').before(make('div', { id: 'catalogueCandidate', class: 'cand-note' }, 'Данные — ' + STL('candidate') + ': карточек каталога ' + fmt(n) + ' из ' + fmt(D.objects.length) + '.')); }
  function xFilter(id, aria, all, keysOf, rank, labelOf) {
    const cnt = new Map();
    for (const r of D.objects) for (const k of keysOf(r)) cnt.set(k, (cnt.get(k) || 0) + 1);
    if (!cnt.size) return null;
    const sel = make('select', { id, 'aria-label': aria });
    sel.append(new Option(all, 'all'));
    for (const k of [...cnt.keys()].sort((a, b) => rank(a) - rank(b) || coll.compare(labelOf(a), labelOf(b)))) sel.append(new Option(labelOf(k) + ' · ' + fmt(cnt.get(k)), k));
    sel.onchange = () => { page = 0; render(); };
    $('catalogueSection').parentNode.append(sel);
    XF.push({ sel, test: (r, v) => keysOf(r).includes(v) });
    return sel;
  }
  { const OWN = (Array.isArray(PRJ.owners) ? PRJ.owners : []).filter(o => o && o.code != null), OL = new Map();
    for (const r of D.objects) if (r.owner != null && r.owner !== '' && r.owner_label && !OL.has(String(r.owner))) OL.set(String(r.owner), String(r.owner_label));
    const ownKeys = r => (!('owner' in r) ? [] : [r.owner != null && r.owner !== '' ? String(r.owner) : '']);
    const oi = k => { const i = OWN.findIndex(o => String(o.code) === k); return k === '' ? 1e6 : i < 0 ? 1e5 : i; };
    const sel = xFilter('catalogueOwner', 'Владелец', 'Все владельцы', ownKeys, oi, k => (k === '' ? 'владелец не указан' : OL.get(k) || ((OWN.find(o => String(o.code) === k) || {}).label) || k));
    if (sel && D.objects.every(r => r.owner != null && String(r.owner) === String(r.module))) $('catalogueSection').hidden = true; }
  { const ORD = ['blocked', 'inventory_only', 'parameters_confirmed', 'local_geometry', 'placed_verified'];
    const stKeys = r => { const s = stOf(r); if (!s) return []; const ks = []; if (typeof s.readiness === 'string' && s.readiness) ks.push('r:' + s.readiness); if (s.geometry_accepted === false) ks.push('ga'); if (Number(s.unknown) > 0) ks.push('unk'); return ks; };
    const si = k => (k === 'ga' ? 900 : k === 'unk' ? 901 : (ORD.indexOf(k.slice(2)) + 1 || 99));
    xFilter('catalogueStatus', 'Статус', 'Все статусы', stKeys, si, k => (k === 'ga' ? STL('geometry_not_accepted') : k === 'unk' ? 'есть «' + STL('unknown') + '»' : STL(k.slice(2)))); }
  { const NONE = 'уровень не указан', LV = (Array.isArray(PRJ.levels) ? PRJ.levels : []).map(l => (l && typeof l === 'object' ? l.label : l)).filter(x => typeof x === 'string' && x);
    const lvKeys = r => (!('record_level' in r) ? [] : [r.record_level != null && String(r.record_level).trim() ? String(r.record_level).trim() : NONE]);
    const li = k => (k === NONE ? 1e6 : LV.indexOf(k) < 0 ? 1e5 : LV.indexOf(k));
    xFilter('catalogueLevel', 'Уровень', 'Все уровни', lvKeys, li, k => k); }
  let page = 0, filtered = [];
  /* 1.0.11: поиск и по отображаемому имени (display_titles) записи и её частей (render_ids, scene_render_ids); подпись записи не меняется, у найденной по имени части — строка «Найдено по имени части» */
  const DTN = k => (window.AtlasStatus && window.AtlasStatus.displayTitle) ? window.AtlasStatus.displayTitle(k) : null;
  const DHN = new Map(), byName = new Map();
  const dispOf = r => { if (!window.__ATLAS_DISPLAY__) return []; let a = DHN.get(r); if (!a) { a = [...new Set([r.id].concat(r.render_ids || [], r.scene_render_ids || []).map(DTN).filter(Boolean))]; DHN.set(r, a); } return a; };
  const norm = s => String(s || '').toLocaleLowerCase('ru').replace(/ё/g, 'е');
  function specLine(r) {
    const v = r.dimensions_verified_from_spec || (r.source_metadata && r.source_metadata.dimensions_verified_from_spec) || null;
    if (!v) return null;
    const pick = ['марка стали', 'стандарт', 'масса по спецификации', 'масса единицы', 'количество', 'расход'].map(k => v[k]).filter(Boolean);
    let t = pick.join(' · ');
    const mc = r.mass_computed_kg ?? (r.source_metadata && r.source_metadata.mass_computed_kg);
    if (typeof mc === 'number') t += (t ? ' · ' : '') + 'по геометрии ' + mc.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' кг';
    return t || null;
  }
  function render() {
    const q = norm($('catalogueSearch').value.trim()), section = $('catalogueSection').value, recovery = $('catalogueRecovery').value;
    byName.clear();
    filtered = ALL.filter(r => {
      if (q && HISTORY.has(r.package_no) && !HQ.includes(q)) return false;
      if (section !== 'all' && r.module !== section) return false;
      if (recovery !== 'all' && r.recovery !== recovery) return false;
      if (!XF.every(f => f.sel.value === 'all' || f.test(r, f.sel.value))) return false; /* 1.0.1 (B2): Владелец / Статус / Уровень */
      if (!q || (HISTORY.has(r.package_no) && HQ.includes(q))) return true;
      const aliases = aliasHits(r);
      if (norm([r.name, r.id, r.mark, r.block, r.owner_label, r.package_no, String(r.package_no).padStart(4, '0'), ...aliases].join(' ')).includes(q)) return true;
      const dt = dispOf(r).find(t => norm(t).includes(q)); if (dt) byName.set(r, dt);
      return !!dt;
    });
    const pages = Math.max(1, Math.ceil(filtered.length / 30));
    page = Math.min(page, pages - 1);
    const rows = $('catalogueRows');
    rows.replaceChildren();
    for (const r of filtered.slice(page * 30, page * 30 + 30)) {
      const card = make('article', { class: 'item type-card' }), txt = make('div', { class: 'type-text' }), acts = make('div', { class: 'actions type-actions' });
      txt.append(make('h2', { class: 'type-h' }, String((window.AtlasStatus && window.AtlasStatus.displayTitle && window.AtlasStatus.displayTitle(r.id)) /* 1.0.9 */ || r.name || r.mark || (r.package_no != null ? 'Тип № ' + r.package_no : r.id)).replace(/[\u2300\u2205]/g, 'Ø')));
      const meta = make('p', { class: 'type-meta' });
      if (r.mark && r.mark !== r.name) meta.append(make('span', { class: 'type-mark' }, r.mark));
      /* К1-B3: без номера типа (данные объекта) — владелец (owner_label / owners конфига / раздел), без «Тип № null» */
      meta.append(make('span', {}, r.package_no != null ? 'Тип № ' + r.package_no + ' · ' + secShort(r.module) : (r.owner_label || ((((window.ATLAS_PROJECT || {}).owners || []).find(x => x && x.code === (r.owner || r.module)) || {}).label) || secShort(r.module))));
      if (SERVICE.has(r.package_no)) meta.append(make('span', { class: 'type-service' }, HISTORY.has(r.package_no) ? 'служебная запись · история цепочки типов' : 'служебная запись'));
      txt.append(meta);
      { const nt = byName.get(r); if (nt && nt !== DTN(r.id)) txt.append(make('p', { class: 'type-meta' }, 'Найдено по имени части: ' + nt)); }   /* 1.0.11 */
      if (window.AtlasStatus) { const sl = window.AtlasStatus.of(r); if (sl.length) txt.append(window.AtlasStatus.chips(sl)); } /* К1-B3: чипы статусов данных */
      const rs = remByPkg.get(r.package_no) || [];
      if (rs.length) {
        const rl = make('p', { class: 'type-remarks' });
        rl.append(make('span', { class: 'count' }, 'Замечания · ' + rs.length));
        rs.forEach(x => { rl.append(document.createTextNode(' ')); rl.append(make('a', { class: 'mono', href: 'RD_REMARKS.html#id=' + encodeURIComponent(x.id) }, x.id)); });
        txt.append(rl);
      }
      const sl = specLine(r);
      if (sl) txt.append(make('p', { class: 'type-spec' }, 'По спецификации: ' + sl));
      const tech = make('p', { class: 'type-tech review-only' }, [ORIGIN[r.recovery] || r.recovery, r.block, r.id].filter(Boolean).join(' · '));
      txt.append(tech);
      acts.append(make('a', { class: 'pbtn pbtn--sm pbtn--outline', href: 'catalogue-model.html#key/' + encodeURIComponent(r.viewer_key) }, 'Открыть тип в 3D (отдельно от здания)'));   /* 1.0.19a М-9: просмотр типа — не место в здании */
      const w = where(r.package_no);
      if (w.length === 1) acts.append(make('a', { class: 'pbtn pbtn--sm', href: w[0].href, 'aria-label': 'Где в здании — ' + w[0].label }, /^Место в здании/.test(w[0].label) ? 'Где в здании' : w[0].label));
      else if (w.length) { const b = make('button', { type: 'button', class: 'pbtn pbtn--sm' }, 'Где в здании · ' + w.length); S.popover(b, w); acts.append(b); }
      else acts.append(make('span', { class: 'type-nolink' }, window.AtlasStatus && window.AtlasStatus.local(r) ? 'Локальная система координат' : 'Не размещён в здании')); /* К1-B3 (D §3); 1.0.19a М-9 */
      if (r.original_glb && PCAT.original_glb_dir) acts.append(make('a', { class: 'review-only', href: PCAT.original_glb_dir + r.original_glb }, r.v9_glb ? 'Архивный GLB ↗' : 'Исходный GLB ↗'));
      if (r.v9_glb) acts.append(make('a', { class: 'review-only', href: r.v9_glb }, 'Исправленный GLB ↗'));
      card.append(txt, acts);
      rows.append(card);
    }
    const line = fmt(filtered.length) + ' ' + S.plural(filtered.length, 'карточка каталога', 'карточки каталога', 'карточек каталога') + ' · страница ' + (page + 1) + ' из ' + pages;
    $('catalogueCount').textContent = line;
    if (!filtered.length) { rows.append(make('p', { class: 'rempty' }, 'Ничего не найдено по «' + $('catalogueSearch').value.trim() + '». Попробуйте марку без дефиса или номер типа. ')); const b = make('button', { type: 'button', class: 'pbtn pbtn--sm' }, 'Сбросить'); b.onclick = () => { $('catalogueSearch').value = ''; $('catalogueSection').value = 'all'; XF.forEach(f => { f.sel.value = 'all'; }); page = 0; render(); $('catalogueSearch').focus(); }; rows.lastChild.append(b); }
    // V12.0b · 13: строка «N типов · страница …» — одна, над списком; верхняя не дублирует её
    $('catalogueCountTop').textContent = ''; $('catalogueCountTop').hidden = true;
    $('catPrevious').disabled = page === 0;
    $('catNext').disabled = page * 30 + 30 >= filtered.length;
  }
  $('catalogueSearch').oninput = () => { page = 0; render(); };
  $('catalogueSection').onchange = $('catalogueRecovery').onchange = () => { page = 0; render(); };
  $('catPrevious').onclick = () => { page--; render(); scrollTo(0, 0); };
  $('catNext').onclick = () => { page++; render(); scrollTo(0, 0); };
  const hq = new URLSearchParams(location.hash.slice(1)).get('q'); if (hq) $('catalogueSearch').value = hq;
  window.__CATALOGUE = { state: () => ({ total: D.objects.length, filtered: filtered.length, page, counts: D.counts }), records: () => D.objects };
  render();
})().catch(e => { const d = document.getElementById('catalogueError'); d.hidden = false; d.textContent = e.message; });
