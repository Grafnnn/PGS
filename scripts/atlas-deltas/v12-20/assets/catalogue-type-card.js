/* 3D Атлас · шапка карточки типа в «3D-просмотре типа» (п. 1.5.2): № и раздел, замечания с новыми номерами,
   «Где в здании», проверенные данные спецификации пакета (если есть в записи каталога). */
'use strict';
window.AtlasTypeCard = (() => {
  const S = window.AtlasShell, make = S.make;
  const REM = (window.ATLAS_REMARKS && window.ATLAS_REMARKS.items) || [];
  const byPkg = new Map();
  for (const r of REM) for (const p of r.packages || []) { if (!byPkg.has(p)) byPkg.set(p, []); byPkg.get(p).push(r); }
  const T = window.ATLAS_ELEMENT_TYPES || { links: {} };
  /* К1-B3: разделы каталога — catalogue.sections конфига объекта (черновик 2: [{ id, label, range, match }]); нет — код модуля как есть */
  const SECS = (() => { const c = ((window.ATLAS_PROJECT || {}).catalogue || {}).sections; return (Array.isArray(c) ? c : []).filter(x => x && (x.id || x.label)).map(x => { let re = null; try { re = x.match && typeof x.match.pattern === 'string' ? new RegExp(x.match.pattern) : null; } catch (e) { re = null; } return { id: x.id, label: x.label || x.id, range: Array.isArray(x.range) && x.range.length === 2 ? x.range.map(Number) : null, field: x.match && x.match.field, re }; }); })();
  const secOf = r => { const n = Number(r.package_no); const s = SECS.find(x => (x.range && r.package_no != null && n >= x.range[0] && n <= x.range[1]) || (x.re && x.field && r[x.field] != null && x.re.test(String(r[x.field]))) || (!x.range && !x.re && x.id === r.module)); return s ? s.label : null; };
  function where(n) {
    const f = '&from=' + encodeURIComponent('Тип № ' + n);
    // L · F5-4-07: связь только с проверочной сценой — отдельной строкой и в режиме проверки (#scope=ALL), а не «Место в здании».
    const ls = Object.entries(T.links || {}).filter(([, l]) => Number(l.package) === n);
    const out = ls.filter(([, l]) => !l.review_only).map(([id, l], i) => ({ href: 'index.html#scope=BUILDING&id=' + encodeURIComponent(id) + f, label: 'Место в здании ' + (i + 1), sub: [S.linkMethod(l.method), l.basis].filter(Boolean).join(' · ') }));
    for (const [id, l] of ls.filter(([, x]) => x.review_only)) out.push({ href: 'index.html#scope=ALL&id=' + encodeURIComponent(id) + f, label: 'Только проверочная сцена', sub: 'в здании не размещён · режим проверки' });
    // L · F5-4-08: тип входит в групповой пакет «Размещено по РД».
    const mo = (T.member_of || {})[String(n)];
  /* К1-B3: слой «размещено по РД» объекта — ATLAS_REVISIONS_META.layers (набор данных объекта): href, record_prefix, type_range | packages, texts.catalogue_item / catalogue_sub / member_sub; нет набора — пунктов слоя нет (без чисел в коде) */
  const LAYER = (((window.ATLAS_REVISIONS_META || {}).layers) || []).find(x => x && x.href && x.record_prefix) || null, LT = (LAYER && LAYER.texts) || {};
  const inLayer = n => !!LAYER && n != null && (Array.isArray(LAYER.packages) ? LAYER.packages.map(Number).includes(Number(n)) : Array.isArray(LAYER.type_range) && n >= LAYER.type_range[0] && n <= LAYER.type_range[1]);
  const fillT = (t, v) => String(t || '').replace(/\{(\w+)\}/g, (_, k) => (v[k] != null ? v[k] : ''));
  const layerItem = (n, tail) => ({ href: LAYER.href + '&id=' + encodeURIComponent(LAYER.record_prefix + n) + tail, label: LT.catalogue_item ? fillT(LT.catalogue_item, { n }) : 'Тип № ' + n + ' · ' + (LAYER.label || 'слой'), sub: LT.catalogue_sub || '' });
  const memberItems = (mo, tail) => (LAYER && mo ? (mo.packages || []).map((pk, i) => ({ href: LAYER.href + '&id=' + encodeURIComponent((mo.render_ids || [])[i] || LAYER.record_prefix + pk) + tail, label: 'В составе пакета № ' + pk, sub: mo.basis || LT.member_sub || '' })) : []);
    for (const x of memberItems(mo, f)) out.push(x);
    if (inLayer(n)) out.push(layerItem(n, f));
    return out;
  }
  function head(r) {
    const box = make('div', { class: 'type-head' });
    const line = make('p', { class: 'type-line' });
    if (r.mark && r.mark !== r.name) line.append(make('strong', {}, r.mark), document.createTextNode(' · '));
    /* К1-B3: записи без номера типа (данные объекта) — владелец (owner_label / owners конфига / раздел), без «Тип № null» */
    const own = r.owner_label || ((((window.ATLAS_PROJECT || {}).owners || []).find(x => x && x.code === (r.owner || r.module)) || {}).label) || secOf(r) || r.module;
    line.append(document.createTextNode(r.package_no != null ? 'Тип № ' + r.package_no + ' · ' + (secOf(r) || r.module) : own || ''));
    box.append(line);
    /* К1-B3: чипы статусов данных записи каталога и строка размещения (вид D §3); у данных без status — ничего */
    if (window.AtlasStatus) { const og = window.AtlasStatus.origin ? window.AtlasStatus.origin(r) : null; /* 1.0 · происхождение геометрии — первым (D 08.10) */ const sl = (og ? [og] : []).concat(window.AtlasStatus.of(r)); if (sl.length) box.append(window.AtlasStatus.chips(sl)); if (og) box.append(make('p', { class: 'type-line', title: og.title }, 'Геометрия: ' + og.text)); if (window.AtlasStatus.local(r)) box.append(make('p', { class: 'type-line' }, 'Размещение: не задано (локальная система)')); }
    const rs = byPkg.get(r.package_no) || [];
    if (rs.length) {
      const p = make('p', { class: 'type-rem' });
      p.append(make('span', { class: 'count' }, 'Замечания · ' + rs.length));
      for (const x of rs) { p.append(document.createTextNode(' ')); p.append(make('a', { class: 'mono', href: 'RD_REMARKS.html#id=' + encodeURIComponent(x.id) }, x.id)); }
      box.append(p);
    }
    const w = where(r.package_no);
    if (w.length === 1) box.append(make('a', { class: 'pbtn pbtn--sm pbtn--outline', href: w[0].href }, /^Место в здании/.test(w[0].label) ? 'Где в здании' : w[0].label));
    else if (w.length) { const b = make('button', { type: 'button', class: 'pbtn pbtn--sm pbtn--outline' }, 'Где в здании · ' + w.length); S.popover(b, w); box.append(b); }
    else if (!(window.AtlasStatus && window.AtlasStatus.local(r))) box.append(make('span', { class: 'type-nolink' }, 'Не размещён в здании'));   /* 1.0.19a М-9 */ /* К1-B3: локальное тело — строка «Размещение» выше */
    const v = r.dimensions_verified_from_spec || (r.source_metadata && r.source_metadata.dimensions_verified_from_spec);
    if (v && typeof v === 'object') {
      box.append(make('h3', { class: 'type-spec-h' }, 'По спецификации'));
      const d = make('dl', { class: 'type-spec-dl' });
      for (const [k, val] of Object.entries(v)) d.append(make('dt', {}, k), make('dd', {}, String(val)));
      const mc = r.mass_computed_kg ?? (r.source_metadata && r.source_metadata.mass_computed_kg);
      if (typeof mc === 'number') d.append(make('dt', {}, 'масса по геометрии'), make('dd', {}, mc.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' кг'));
      const disc = r.document_discrepancy || (r.source_metadata && r.source_metadata.document_discrepancy);
      if (disc) d.append(make('dt', {}, 'расхождение в документе'), make('dd', {}, disc));
      box.append(d);
    }
    return box;
  }
  return { head };
})();
