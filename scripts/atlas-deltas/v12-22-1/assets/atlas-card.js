/* 3D Атлас · карточка выбранного элемента (правая панель главной).
   Только чтение: паспорт элемента, связь «элемент → тип каталога», замечания к РД, источники чертежей.
   Ничего не вычисляет сверх правил п. 1.3.3–1.3.4: массу не считает, значения паспорта важнее значений типа. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const S = window.AtlasShell, make = S.make;
  const REBAR_UI = S.siteFeature('rebar');
  const atSite = S.siteText('at_site', 'в здании');
  /* Ядро К1-B3: объектное — из конфига объекта window.ATLAS_PROJECT (project/config.js, ЯДРО_ATLAS/СХЕМА_КОНФИГА_ОБЪЕКТА.md); нет конфига или ключа — нейтральное поведение ядра.
     card.strip_prefixes — убрать из текста источника (шифр комплекта); card.name_rules — правила названий (регулярка + замена или шаблон подписи) — данные объекта;
     card.id_prefix — служебная приставка id тела; card.album_pdf_label (+ album_pdf_short) — подпись PDF альбома; title.object / title.code / title.subtitle — сводка. */
  const PRJ = (S.project && S.project()) || window.ATLAS_PROJECT || {}, PCARD = PRJ.card || {}, PTITLE = PRJ.title || {}; /* конфиг объекта — общий доступ AtlasShell.project() (B2), иначе window.ATLAS_PROJECT */
  const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const STRIP = (Array.isArray(PCARD.strip_prefixes) ? PCARD.strip_prefixes : []).filter(x => typeof x === 'string' && x).map(x => new RegExp(reEsc(x), 'g'));
  /* name_rules (схема, черновик 2 + шаблон, К1-B3): [{ pattern, flags, replace | template, path_add, path_add_when, when: { field, pattern } }] — по порядку к имени элемента.
     replace — замена регуляркой (правила идут дальше); template — подпись из групп совпадения, первое такое правило даёт название: {N} — группа N, {N!nospace} — без пробелов,
     {elev:A,B} — отметка из целой (A) и дробной (B) групп: «+7,100»; path_add — добавить в путь (если path_add_when совпал с именем и в первом узле пути этого ещё нет). Всё — данные объекта, кода объекта в ядре нет. */
  const reOr = (p, f) => { try { return typeof p === 'string' ? new RegExp(p, f || '') : null; } catch (e) { return null; } };
  const NAME_RULES = (Array.isArray(PCARD.name_rules) ? PCARD.name_rules : []).filter(x => x && typeof x.pattern === 'string').map(x => { const re = reOr(x.pattern, x.flags); if (!re) return null; return { re, replace: typeof x.replace === 'string' ? x.replace : null, template: typeof x.template === 'string' ? x.template : null, path_add: Array.isArray(x.path_add) ? x.path_add.filter(y => typeof y === 'string') : [], path_add_when: reOr(x.path_add_when), when: x.when && typeof x.when.field === 'string' ? { field: x.when.field, re: reOr(x.when.pattern) } : null }; }).filter(Boolean);
  const ID_PREFIX = typeof PCARD.id_prefix === 'string' ? PCARD.id_prefix : '';
  const ALBUM_PDF = typeof PCARD.album_pdf_label === 'string' && PCARD.album_pdf_label ? PCARD.album_pdf_label : '';
  const ALBUM_PDF_RE = ALBUM_PDF ? new RegExp('^' + reEsc(ALBUM_PDF) + ' \\(листа .*\\) ↗$') : null, ALBUM_PDF_SHORT = (typeof PCARD.album_pdf_short === 'string' && PCARD.album_pdf_short) || ALBUM_PDF.replace(/\s+альбома\b/, '');
  const ST = () => window.AtlasStatus || null; /* статусы данных — assets/atlas-status.js (если подключён) */
  // V12.2 · E11: изоляция — isolateState().on (features.isolateSet); без него — по тексту кнопки движка «Вернуть окружение». Объявлено в начале: actsSync зовёт её при старте
  const isoOn = () => { const A = window.__ATLAS, f = (A && A.features) || {}; return f.isolateSet ? !!(A.isolateState() || {}).on : /Вернуть/.test((document.getElementById('isolate') || {}).textContent || ''); };
  const right = $('right');
  if (!right) return;
  right.classList.add('card-v12'); // V12.0: оформление — assets/atlas-card.css
  // Замечания и связи «элемент → тип» подключаются при первом открытии карточки (V11.1, п. 6).
  let REMARKS = [], TYPES = { links: {}, types: {} }, dataReady = null;
  const remarksByElement = new Map(), remarksByPackage = new Map();
  function ensureData() {
    if (dataReady) return dataReady;
    const load = n => (window.AtlasData ? window.AtlasData.load(n) : Promise.resolve()).catch(() => null);
    dataReady = Promise.all([load('remarks'), load('types')]).then(() => {
      REMARKS = (window.ATLAS_REMARKS && window.ATLAS_REMARKS.items) || [];
      TYPES = window.ATLAS_ELEMENT_TYPES || { links: {}, types: {} };
      for (const r of REMARKS) {
        for (const l of r.building_links || []) { if (!remarksByElement.has(l.id)) remarksByElement.set(l.id, []); remarksByElement.get(l.id).push(r); }
        /* Ядро 1.0.2 (D): тело только в collision.pairs (a/b) — тоже получает замечание */
        for (const q of ((r.collision && r.collision.pairs) || [])) for (const id of [q && q.a, q && q.b]) { if (!id) continue; if (!remarksByElement.has(id)) remarksByElement.set(id, []); const arr = remarksByElement.get(id); if (!arr.includes(r)) arr.push(r); }
        for (const p of r.packages || []) { if (!remarksByPackage.has(p)) remarksByPackage.set(p, []); remarksByPackage.get(p).push(r); }
      }
      if (window.__R23) window.__R23.request();
    });
    return dataReady;
  }
  const SIG_ORDER = { 'Высокая': 0, 'Средняя': 1, 'Низкая': 2 };
  /* V12.11 (итоговая проверка выпуска): адрес для window.open — через переадресацию пакета/сайта (assets/package-links.js: map(url) → { href } | null); без неё — как есть */
  const pkgUrl = u => { try { const m = window.AtlasPackageLinks && typeof window.AtlasPackageLinks.map === 'function' ? window.AtlasPackageLinks.map(u) : null; return (m && m.href) || u; } catch (e) { return u; } };

  /* ---------- форматирование ---------- */
  const nf = (v, d = 3) => Number(v).toLocaleString('ru-RU', { maximumFractionDigits: d }).replace(/[\u00a0 ]/g, '\u202f');
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const AE = () => window.AtlasEvidence || null;   /* 1.2: основание значения (atlas-evidence.js); нет модуля — карточка как прежде */
  const txt = v => { if (v && typeof v === 'object' && (v.status === 'known' || v.status === 'derived') && typeof v.value === 'string') v = v.value; return typeof v === 'string' && v.trim() ? v.trim() : null; }; /* 1.0.5 Пс2: поле паспорта со статусом known / derived — значением */
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const pad4 = n => String(n).padStart(4, '0');
  // Типографика без изменения смысла: пробелы между словом и числом, числом и единицей.
  const tidy = s => String(s)
    .replace(/([а-яё]{3,})(\d)/g, '$1 $2')
    .replace(/(\d)(мм|м³|м²|кг|м)(?![а-яёa-z0-9])/g, '$1 $2')
    .replace(/(^|[^а-яёА-ЯЁ])л\.(\d)/g, '$1л. $2')
    .replace(/\s{2,}/g, ' ').trim();
  // Коды этапов сборки убираются из текстов для заказчика (они остаются в «Технических сведениях»).
  /* К1-B3: коды этапов сборки объекта — card.strip_codes конфига (регулярки строками, по порядку); нет — текст как есть, только чистка пробелов и знаков */
  const STRIP_CODES = (Array.isArray(PCARD.strip_codes) ? PCARD.strip_codes : []).map(x => { try { return new RegExp(typeof x === 'string' ? x : x.pattern, (typeof x === 'string' ? '' : x.flags || '') + 'g'); } catch (e) { return null; } }).filter(Boolean);
  const stripCodes = s => STRIP_CODES.reduce((a, re) => a.replace(re, ''), String(s))
    .replace(/\s+([;,.])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[\s;,.]+/, '').trim();
  const level = v => {
    const r = Math.round(v / 0.005) * 0.005;
    const a = Math.abs(r).toFixed(3).replace('.', ',');
    return Math.abs(r) < 0.0005 ? '±0,000' : (r < 0 ? '−' : '+') + a;
  };
  const cleanSource = s => tidy(STRIP.reduce((a, re) => a.replace(re, ''), String(s)).replace(/\s*по штампу/g, '').replace(/\s+,/g, ',')); /* К1-B3: шифр комплекта — card.strip_prefixes */

  /* ---------- оси по сетке assets/building-axes.js ---------- */
  const AX = (window.AtlasBuildingAxes && window.AtlasBuildingAxes.axes) || null;
  /* К1-B3 (от E2): оси — из AtlasBuildingAxes.axes ([{ label, direction: 'X' | 'Y', metres }], источник — ATLAS_PROJECT.axes), читаются при первом обращении; осей нет — строки «Оси» нет */
  let axC = null;
  const axesNow = () => { if (axC) return axC; const A = window.AtlasBuildingAxes && window.AtlasBuildingAxes.axes; const list = d => (Array.isArray(A) ? A : []).filter(a => a && a.direction === d && Number.isFinite(Number(a.metres))).map(a => ({ l: String(a.label), m: Number(a.metres) })).sort((p, q) => p.m - q.m); const r = { X: list('X'), Y: list('Y') }; r.ok = r.X.length > 0 && r.Y.length > 0; if (Array.isArray(A)) axC = r; return r; };
  function axisRange(lo, hi, axes) {
    const first = axes[0], last = axes[axes.length - 1];
    if (hi < first.m) return { text: 'за осью ' + first.l + ' на ' + nf(first.m - hi, 2) + ' м', out: true };
    if (lo > last.m) return { text: 'за осью ' + last.l + ' на ' + nf(lo - last.m, 2) + ' м', out: true };
    let a = axes.filter(x => x.m <= lo + 1e-6).pop() || first;
    let b = axes.find(x => x.m >= hi - 1e-6) || last;
    if (a === b) { const i = axes.indexOf(a); b = axes[Math.min(axes.length - 1, i + 1)]; if (a === b) a = axes[i - 1]; }
    return { text: a.l + '–' + b.l, out: false };
  }
  function nearAxis(lo, hi, axes) {
    let best = null;
    for (const x of axes) {
      const d = x.m < lo ? lo - x.m : x.m > hi ? x.m - hi : 0;
      if (!best || d < best.d) best = { d, l: x.l };
    }
    return best;
  }
  function axesOf(b) {
    const AXN = axesNow(); if (!AXN.ok) return null; /* осей у объекта нет — нормальный случай (новый объект): null, без ошибки */
    const X_AXES = AXN.X, Y_AXES = AXN.Y;
    const x = axisRange(b[0][0], b[1][0], X_AXES), y = axisRange(b[0][1], b[1][1], Y_AXES);
    let text = x.text + ' / ' + y.text;
    const nx = nearAxis(b[0][0], b[1][0], X_AXES), ny = nearAxis(b[0][1], b[1][1], Y_AXES);
    const near = [nx, ny].filter(n => n && n.d > 0.0005 && n.d < 1).sort((p, q) => p.d - q.d)[0];
    if (near && !x.out && !y.out) text += ', ' + nf(near.d, 2) + ' м от оси ' + near.l;
    return text;
  }

  /* ---------- дерево разделов ---------- */
  let treePos = null;
  function treeLabels(o) {
    const H = window.__FULL_ATLAS && window.__FULL_ATLAS.tree();
    if (!H || !Number.isInteger(o.albumIndex)) return [];
    if (!treePos) { treePos = new Map(); H.order.forEach((idx, i) => treePos.set(idx, i)); }
    const at = treePos.get(o.albumIndex);
    if (at === undefined) return [];
    const out = [];
    let node = H.nodes.construction;
    for (let depth = 0; depth < 6 && node; depth++) {
      const next = (node.children || []).map(id => H.nodes[id]).find(n => n && n.span && at >= n.span[0] && at < n.span[1]);
      if (!next) break;
      out.push(next);
      node = next;
    }
    return out;
  }

  /* ---------- название ---------- */
  const MARKISH = /^[^\s]{1,14}$/;
  /* 1.0.16 B3-7 (A4): последняя часть имени — место («2 этаж», «подвал», «отм. +3,000») — это не описание, «A · B» не переставляется («Отопление · 2 этаж», не «2 этаж Отопление») */
  const LOC = /^(?:\d+(?:\s*[–-]\s*\d+)?\s*этаж(?:и|а|ей)?|этаж\s*\d+|подвал|кровля|чердак|техподполье|техэтаж|отм\.\s*[+−-]?\d[\d,.]*)$/i;
  // К1-B3: правила названий объекта — card.name_rules конфига (данные объекта); elev — общий форматтер отметки для шаблонов правил.
  const elev = (a, b) => { const v = Number(a + '.' + (b || '0')); return Number.isFinite(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(3).replace('.', ',') : null; };
  const fillTpl = (tpl, m) => tpl.replace(/\{(?:elev:(\d+)(?:,(\d+))?|(\d+)(!nospace)?)\}/g, (_, a, b, n, ns) => a ? (elev(m[a] || '0', b ? m[b] : undefined) || '') : (ns ? String(m[n] || '').replace(/\s+/g, '') : (m[n] || '')));
  function ruleTitle(name, nodes, o) {
    let t = name;
    for (const R of NAME_RULES) {
      if (R.when) { const v = o && (o[R.when.field] != null ? o[R.when.field] : (o.albumRecord || {})[R.when.field]); if (v == null || !R.when.re || !R.when.re.test(String(v))) continue; }
      R.re.lastIndex = 0; const m = R.re.exec(t); if (!m) continue;
      if (R.template != null) { const add = R.path_add.length && (!R.path_add_when || R.path_add_when.test(name)) ? R.path_add.filter(x => !(nodes[0] && String(nodes[0].label).includes(x))) : []; return { title: fillTpl(R.template, m), path_add: add }; }
      if (R.replace != null) { R.re.lastIndex = 0; t = t.replace(R.re, R.replace); }
    }
    return t !== name ? { title: t, path_add: [] } : null;
  }
  function human(o, typeMark) {
    const name = String(o.name || '').trim();
    const nodes = treeLabels(o);
    const section = nodes[0] ? nodes[0].label : '';
    const mono = ruleTitle(name, nodes, o);
    if (mono) return { title: mono.title, path: nodes.slice(0, 1).map(n => n.label).concat(mono.path_add).join(' · '), section };
    let parts = name.split(/\s+\/\s+/);
    if (parts.length < 2) parts = name.split(/\s+·\s*/);
    let title = name, pathParts = [];
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].split(';')[0].trim();
      // Размер в конце отрезается только отдельным словом или после строчной буквы («подготовка100мм»); марки «Н75», «МУ2», «М20», «С-1-1» не трогаются.
      const desc = last.replace(/(?:^|\s+|(?<=[а-яё]))(?:L\s*=\s*)?\d+(?:[.,]\d+)?\s*(?:м|мм)?(?:\s*[×x]\s*\d+(?:[.,]\d+)?)*\s*(?:м|мм)?$/, '').trim();
      const markPart = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      if (/[а-яё]{4,}/.test(desc) && MARKISH.test(markPart) && !LOC.test(desc)) {
        title = cap(desc) + (desc.includes(markPart) ? '' : ' ' + markPart);
        pathParts = parts.slice(0, parts.length >= 3 ? -1 : 0);
      }
    }
    const path = [];
    for (const n of nodes.slice(0, 1)) path.push(n.label);
    for (const p of pathParts) if (!path.some(x => x.includes(p))) path.push(p);
    const det = typeMark && (typeMark.match(/дет\.?\s*\d+[а-я]?/i) || [])[0];
    if (det) path.push(det.replace(/дет\.?\s*/i, 'дет. '));
    return { title, path: path.join(' · '), section };
  }

  /* ---------- метки ---------- */
  function badges(p, o) {
    const out = [];
    // L · F5-1-14: справочный образец узла (вспомогательный, «Локальный образец …») — не часть здания.
    if (o.albumRecord && o.albumRecord.bucket === 'aux' && /образец/i.test([o.albumRecord.warning, o.name].join(' '))) out.push(['Образец узла, не '+atSite, 'state']);
    const phase = [p.phase, p.category, o.name].filter(Boolean).join(' ');
    if (/демонтаж/i.test(phase)) out.push(['Демонтаж', 'state']);
    else if (/Существующ/i.test(p.phase || p.category || '')) out.push(['Существующий', 'state']);
    else if (/Проект/i.test(p.phase || '')) out.push(['Проектируемый', 'state']);
    const c = String(p.confidence || '');
    const p1 = /\bP1\b/.test(c), p2 = /\bP2\b/.test(c) || /привязк[аи]\s+(?:координационн|условн)/i.test(c);
    if (p1 && p2) out.push(['Размеры по РД · привязка условная']);
    else if (p1) out.push(['Размеры по РД']);
    else if (p2) out.push([/размер/i.test(c) && !/P1/.test(c) ? 'Размеры и привязка условные' : 'Привязка условная']);
    // L · F5-4-25: тело — условный габарит (флаг A conditional_extent), причина — в заметке карточки.
    if (o.albumRecord && o.albumRecord.conditional_extent) out.push(['Условный габарит']);
    out.push(['Не для изготовления']);
    return out;
  }

  /* ---------- тип каталога ---------- */
  function typeOf(o) {
    const link = (TYPES.links || {})[o.renderId];
    if (!link) return null;
    const t = (TYPES.types || {})[String(link.package)] || {};
    return Object.assign({ package: link.package, method: link.method }, t);
  }
  const V = t => (t && t.dimensions_verified_from_spec) || {};

  /* 1.1.1 A3: причина «нет в источнике», если данные её дают (reason / note / comment у поля со статусом); не додумывается */
  const whyOf = v => (v && typeof v === 'object' && !Array.isArray(v) ? ['reason', 'note', 'comment'].map(k => v[k]).find(x => typeof x === 'string' && x.trim()) : null) || null;
  /* 1.1.1 A3: строки «нет в источнике» (2 и больше) — одной строкой «Нет в источнике: тип, основа…», раскрытие — все поля и причина */
  function noSourceBox(list) {
    const names = list.map(r => r.raw ? r.label : r.label.charAt(0).toLowerCase() + r.label.slice(1));
    const d = make('details', { class: 'card-nosrc' }), sm = make('summary', { title: 'Нет в источнике (' + list.length + '): ' + names.join(', ') });
    sm.append(make('span', { class: 'card-nosrc-h' }, 'Нет в источнике:'), make('span', { class: 'card-nosrc-list' }, names.join(', ')));
    d.append(sm, make('p', { class: 'card-note' }, 'Значений этих полей нет в исходных документах объекта — атлас их не додумывает.' + (list.some(r => r.why) ? ' Причина из данных — у поля.' : '')));
    d.append(stampRows(list.map(r => Object.assign({}, r, { value: r.why ? r.value + ' — ' + r.why : r.value }))));
    return d;
  }
  /* ---------- характеристики ---------- */
  function characteristics(p, t) {
    const rows = [], used = new Set(), fromType = [];
    /* 1.0.7 К3: поле паспорта явно UNKNOWN — значение типа не подставляется (строка «нет в источнике» — ниже, из статусов) */
    const unk = k => !!(p && ((p[k] && typeof p[k] === 'object' && p[k].status === 'unknown') || (Array.isArray(p.unknown_fields) && p.unknown_fields.includes(k))));
    const add = (label, value, keys, typeUsed, extra) => {
      if (!value) return;
      const mk0 = ST() && ST().isModel ? (keys || []).find(k => ST().isModel(p[k])) : null;
      const evk = AE() ? (keys || []).find(k => AE().of(p && p[k]).length || (p && p[k] && Array.isArray(p[k].versions) && p[k].versions.some(x => AE().of(x).length))) : null;   /* 1.2: основание значения — фрагмент листа у поля паспорта */
      rows.push({ label, value, extra, model: !!mk0, prov: mk0 ? ((ST().field(p[mk0]) || {}).prov || '') : '', ev: evk ? AE().forPassportField(evk, p[evk], { label, title: label + ' ' + value }) : null }); /* 1.0.7: модельное решение и его источники */
      (keys || []).forEach(k => used.add(k));
      if (typeUsed) fromType.push(label.toLowerCase());
    };
    // Марка
    const mk = ['mark', 'assembly_mark', 'frame_mark', 'stand_mark'].find(k => txt(p[k]));
    if (mk) add('Марка', txt(p[mk]) + (txt(p.position) ? ', поз. ' + txt(p.position) : ''), [mk, 'position']);
    else if (!unk('mark') && t && txt(t.mark)) add('Марка', t.mark.replace(/дет\.(\d)/i, 'дет. $1'), [], true);
    // Материал
    if (txt(p.material)) add('Материал', txt(p.material), ['material']);
    else if (txt(p.steel_grade)) add('Материал', 'сталь ' + txt(p.steel_grade), ['steel_grade']);
    else if (txt(p.reinforcement_grade)) add('Материал', 'арматура ' + txt(p.reinforcement_grade), ['reinforcement_grade']);
    else if (txt(p.concrete_grade)) add('Материал', 'бетон ' + txt(p.concrete_grade), ['concrete_grade']);
    else if (!unk('material') && txt(V(t)['марка стали'])) add('Материал', (/^сталь/i.test(V(t)['марка стали']) ? '' : 'сталь ') + V(t)['марка стали'], [], true);
    // Стандарт
    if (txt(p.standard)) add('Стандарт', txt(p.standard), ['standard']);
    else if (!unk('standard') && txt(V(t)['стандарт'])) add('Стандарт', V(t)['стандарт'], [], true);
    // Профиль, сечение
    const pk = ['profile', 'nominal_profile', 'source_profile'].find(k => txt(p[k]));
    if (pk) add('Профиль', txt(p[pk]), [pk]);
    else if (isNum(p.bar_diameter_mm)) add('Сечение', 'Ø' + nf(p.bar_diameter_mm) + ' мм', ['bar_diameter_mm']);
    else if (isNum(p.thickness_mm)) add('Сечение', 'толщина ' + nf(p.thickness_mm) + ' мм', ['thickness_mm']);
    // Размеры
    const arr = k => Array.isArray(p[k]) && p[k].length && p[k].every(isNum);
    const dk = ['dimensions_mm', 'nominal_body_size_mm', 'opening_size_mm'].find(arr);
    if (dk) add('Размеры', p[dk].map(v => nf(v)).join(' × ') + ' мм', [dk]);
    else if (isNum(p.length_m)) add('Длина', nf(p.length_m * 1000, 1) + ' мм', ['length_m']);
    else {
      const lk = ['length_mm', 'bar_length_mm', 'source_length_mm'].find(k => isNum(p[k]));
      if (lk) add('Длина', nf(p[lk], 1) + ' мм', [lk]);
    }
    // Отверстия
    if (isNum(p.hole_count)) add('Отверстия', nf(p.hole_count) + (isNum(p.hole_d_mm) ? ' × Ø' + nf(p.hole_d_mm) : ''), ['hole_count', 'hole_d_mm']);
    // Диаметр
    if (isNum(p.diameter_mm)) add('Диаметр', 'Ø' + nf(p.diameter_mm) + ' мм', ['diameter_mm']);
    else if (isNum(p.outer_diameter_mm)) add('Диаметр', 'Ø' + nf(p.outer_diameter_mm) + (isNum(p.wall_thickness_mm) ? ' × ' + nf(p.wall_thickness_mm) : '') + ' мм', ['outer_diameter_mm', 'wall_thickness_mm']);
    // Количество
    const qk = ['quantity', 'model_quantity', 'bar_count', 'assembly_count'].find(k => isNum(p[k]));
    if (qk) add('Количество', nf(p[qk]) + ' ' + (txt(p.unit) || 'шт.'), [qk, 'unit']);
    else if (!unk('quantity') && txt(V(t)['количество'])) add('Количество', V(t)['количество'].replace(/(\s)шт$/, '$1шт.'), [], true);
    // Масса — только по РД, в атласе не вычисляется.
    const mkk = ['source_unit_mass_kg', 'mass_source_kg', 'source_mass_per_piece_kg', 'source_total_per_cage_kg'].find(k => isNum(p[k]));
    let massExtra = null;
    if (t && isNum(t.mass_computed_kg)) {
      const printed = txt(V(t)['масса по спецификации']) || txt(V(t)['масса единицы']);
      const printedKg = printed ? parseFloat(printed.replace(/\s/g, '').replace(',', '.')) : (isNum(t.mass_kg) ? t.mass_kg : null);
      if (isNum(printedKg) && Math.abs(printedKg - t.mass_computed_kg) > 0.01 * Math.max(printedKg, t.mass_computed_kg)) {
        const rs = (remarksByPackage.get(Number(t.package)) || []).slice().sort((a, b) => (SIG_ORDER[a.significance] ?? 3) - (SIG_ORDER[b.significance] ?? 3));
        massExtra = { text: 'по геометрии ' + nf(t.mass_computed_kg, 2) + ' кг', remark: rs[0] || null };
      }
    }
    if (mkk) add('Масса', nf(p[mkk], 3) + ' кг по спецификации', [mkk], false, massExtra);
    else if (!unk('mass_kg') && !unk('unit_mass') && t && (txt(V(t)['масса по спецификации']) || txt(V(t)['масса единицы']))) add('Масса', (m => /специфик/i.test(m) ? m : m + ' по спецификации')(String(V(t)['масса по спецификации'] || V(t)['масса единицы']).replace(/(\d)\.(\d)/g, '$1,$2')), [], true, massExtra);
    // Объём
    const vol = [];
    if (isNum(p.source_concrete_m3)) { vol.push(nf(p.source_concrete_m3) + ' м³ по ведомости'); used.add('source_concrete_m3'); }
    const steel = pk || txt(p.steel_grade);
    if (isNum(p.volume_geometry_m3) && !steel && p.volume_geometry_m3 >= 0.01) { vol.push(nf(p.volume_geometry_m3) + ' м³ по модели'); used.add('volume_geometry_m3'); }
    if (vol.length) add('Объём', vol.join(' · '), []);
    // Оборудование
    // V12.0b п. 5: служебный код типа (rebar, rod …) без русских букв оборудованием не показывать.
    const ek = ['equipment', 'element_type'].find(k => txt(p[k]) && (k === 'equipment' || /[а-яё]/i.test(p[k])));
    if (ek) add('Оборудование', txt(p[ek]), [ek]);
    // Категория — если марки нет
    if (!rows.some(r => r.label === 'Марка') && txt(p.category_label)) add('Категория', txt(p.category_label), ['category_label']);
    /* К1-B3: поля паспорта со статусом (вид D §3) — «нет в источнике» / «Конфликт: …»; у данных без статусов строк нет */
    if (ST()) {
      const FL = { mark: 'Марка', name: 'Название', material: 'Материал', spec_name: 'Наименование', standard: 'Стандарт', profile: 'Профиль', dimensions_mm: 'Размеры', length_mm: 'Длина', diameter_mm: 'Диаметр', quantity: 'Количество', owner: 'Владелец', owner_label: 'Владелец', level: 'Уровень' };
      /* 1.1.1 A3: русские подписи частых служебных ключей паспорта — нейтральный словарь ядра; подписи конфига (passport.labels) и паспорта — главнее (ниже), неизвестный ключ — как есть */
      const KL = { level_source: 'Источник уровня', quantity_basis: 'Основание количества', unit: 'Единица', elevation: 'Отметка', elevation_source: 'Источник отметки',
        absolute_elevations: 'Абсолютные отметки', world_placement: 'Положение в модели', site_placement: 'Положение на площадке', placement_source: 'Источник положения', geometry_source: 'Источник геометрии',
        installed_extent: 'Протяжённость в проекте', wall_geometry: 'Геометрия стенок', wall_mm: 'Толщина стенки', outer_diameter_mm: 'Наружный диаметр', inner_diameter_mm: 'Внутренний диаметр',
        clear_volume_after_equipment: 'Свободный объём за вычетом оборудования', final_casing_wall: 'Стенка футляра', slope: 'Уклон', depth_m: 'Глубина', length_m: 'Длина' };
      /* 1.0.1 (B3): ключ без подписи — как в паспорте (pp-key-raw: моно, --c-text-2, перенос overflow-wrap:anywhere — не наезжает на значение; подсказка RAW_HINT);
         «Конфликт в источнике (без разбора)» — подпись последним сегментом ключа, полный ключ — первой строкой подсказки; повтор — по ключу (у двух ключей бывает один последний сегмент) */
      const lab = k => FL[k] || (ST().fieldLabel ? ST().fieldLabel(k) : null) || KL[k] || null; /* подпись карточки, иначе паспорта (PLABEL, passport.labels) — такой ключ не raw; 1.1.1 A3: иначе словарь KL */
      const kRow = (k, f) => { if (lab(k)) return { label: lab(k) }; const sh = f && f.bare && ST().keyLabel ? ST().keyLabel(k) : k; return { key: k, label: sh, raw: true, title: ((sh !== k ? k + '\n' : '') + (ST().RAW_HINT || '')) || null }; };
      const has = k => rows.some(r => (lab(k) ? r.label === lab(k) : (r.key || r.label) === k));
      for (const [k, v] of Object.entries(p || {})) { if (ST().SKIP.has(k)) continue; const f = ST().field(v); if (f && !has(k)) { { const kr = kRow(k, f); rows.push(Object.assign(kr, { value: f.text, fs: f.fs, vtitle: f.title || null, model: !!f.model, prov: f.prov || '', ev: AE() ? AE().forPassportField(k, v, { label: kr.label, title: kr.label + ' ' + f.text }) : null })); }   /* 1.0.16 B3-9 (A6): подсказка — та же, что в реестре (полный текст, источник), не JSON */ used.add(k); } }
      for (const k of ST().unknownKeys(p)) if (!has(k)) { { const kr = kRow(k, null); rows.push(Object.assign(kr, { value: ST().NO_SOURCE, fs: 'unknown', why: whyOf(p[k]), ev: AE() ? AE().forPassportField(k, p[k], { label: kr.label, title: kr.label + ' — нет в источнике' }) : null })); } used.add(k); }
      if (ST().local(p)) rows.push({ label: 'Размещение', value: 'не задано (локальная система)' });
    }
    return { rows, used, fromType };
  }

  /* ---------- источники чертежей ---------- */
  function sheetsOfTitle(title) {
    const m = /л\.\s*([\d,–\-\s]+)\s*\/\s*PDF\s*([\d,–\-\s]+)/.exec(title || '');
    if (!m) return null;
    const expand = s => s.split(',').map(x => x.trim()).filter(Boolean).flatMap(x => {
      const r = x.split(/[–-]/).map(Number);
      if (r.length === 2 && r.every(Number.isFinite)) { const out = []; for (let i = r[0]; i <= r[1]; i++) out.push(i); return out; }
      return [Number(x)];
    });
    const sh = expand(m[1]), pdf = expand(m[2]);
    return sh.length === pdf.length ? sh.map((s, i) => [s, pdf[i]]) : null;
  }
  function drawingPlan(o, p, rs) {
    const all = (window.__FULL_ATLAS && window.__FULL_ATLAS.sourceAvailability()) || {};
    /* 1.1.1 долг (а): связи с листами — от движка (__FULL_ATLAS.sourceLinks: свои связи тела или восстановленные из набора source_recovery); старый движок — поле записи */
    const links = (window.__FULL_ATLAS && typeof window.__FULL_ATLAS.sourceLinks === 'function' ? window.__FULL_ATLAS.sourceLinks(o) || [] : ((o.albumRecord && o.albumRecord.sources) || [])).filter(l => all[l.key] && all[l.key].available);
    const firstSheet = (/л\.\s*(\d+)/.exec(p.source || '') || [])[1];
    // V12.11 · Z6: для источника на несколько листов (NAV) лист из паспорта — и «лист 55 по штампу» (у тел с таким паспортом), не только «л. 55»; размеры «лист 100×…» — не лист
    // V12.11 · предпроверка: листы паспорта по порядку — берётся первый, который есть в списке источника (D_ZERO_BRICK: «л.3 …; л.55» → 55)
    const sheetsNav = [...String(p.source || '').matchAll(/(?:^|[^А-Яа-яЁё])(?:л\s*\.|лист)\s*(\d+)(?![\d.]*\s*[×xх*]\s*\d)/gi)].map(m => m[1]);
    /* 1.0.4 · В1: изображений нет (available у всех ложно) — источник через AtlasStatus.resolveSource (только при passport.source_pdf; объект без ключа — как раньше):
       точный PDF — «Чертёж · л. N» (лист паспорта, если есть среди источников); иначе общий альбом раздела; нет — кнопка неактивна с причиной */
    let noneWhy = null;
    if (!links.length && ST() && ST().passportOn && ST().passportOn('source_pdf') && ST().resolveSource) {
      const rr = ((o.albumRecord && o.albumRecord.sources) || []).map(l => (all[l.key] ? ST().resolveSource(all[l.key]) : null)).filter(Boolean);
      const ex = rr.filter(r => r.kind === 'pdf' && r.href), al = rr.filter(r => r.kind === 'album' && r.href);
      const pick = (firstSheet && ex.find(r => r.sheet === firstSheet)) || ex[0] || null;
      if (pick) return { label: 'Открыть чертёж' + (pick.sheet ? ' · л. ' + pick.sheet : pick.page ? ' · ' + ((pick.code || '').split(/[-·\s]/).filter(Boolean).pop() || '') + ' стр. ' + pick.page : ''), href: pick.href, title: pick.label + (ex.length > 1 ? ' · ещё источников с PDF: ' + (ex.length - 1) : '') };
      if (al.length) return { label: 'Общий альбом раздела', href: al[0].href, title: al[0].label + (al[0].reason ? ' · ' + al[0].reason : '') };
      noneWhy = (rr.find(r => r.reason) || {}).reason || null;
      /* 1.0.6 п. 2–3: неактивная кнопка всегда с причиной — записи источника нет в атласе / источника в данных нет */
      if (!noneWhy) { const ks = (o.albumRecord && o.albumRecord.sources) || []; noneWhy = ks.length ? 'источник указан в данных, но его записи в атласе нет' : 'у элемента нет источника в данных'; }
    }
    if (links.length === 1) {
      const s = all[links[0].key], multi = sheetsOfTitle(s.title);
      if (!multi) return { label: 'Открыть чертёж' + (srcShort(s) ? ' · ' + srcShort(s) : ''), keys: [links[0].key] };
      let hit = null; for (const f of sheetsNav) { hit = multi.find(([sh]) => String(sh) === f); if (hit) break; }
      if (hit) return { label: 'Открыть чертёж · л. ' + hit[0], keys: [links[0].key], pdfPage: hit[1], source: s, hitSheet: hit[0] };
      return { label: 'Открыть чертёж · 1', list: links.map(l => l.key) };
    }
    if (links.length > 1) {
      // Если первый лист из паспорта совпадает с источником на один лист — открыть его.
      const exact = firstSheet && links.find(l => all[l.key].printed_sheet === firstSheet && !sheetsOfTitle(all[l.key].title));
      if (exact) return { label: 'Открыть чертёж · ' + (srcShort(all[exact.key]) || 'л. ' + firstSheet), keys: [exact.key] };
      /* 1.3.0 · план п. 6.2: основной лист — первый из связанных (порядок данных); остальные — в блоке «Листы» */
      const main = links.find(l => !sheetsOfTitle(all[l.key].title)) || null;
      if (main) return { label: 'Открыть чертёж · ' + (srcShort(all[main.key]) || all[main.key].title), keys: [main.key], title: 'Основной лист. Все листы элемента (' + links.length + ') — в блоке «Листы»' };
      return { label: 'Чертежи · ' + links.length, list: links.map(l => l.key) }; // L · F4-19
    }
    const r = rs.find(x => (x.sheet_links || []).length);
    // L · F5-4-06: PDF альбома без страницы при известной пометке «листа в атласе нет» не предлагать — честно сказать, что листа нет.
    const sn0 = o.albumRecord && o.albumRecord.source_note;
    if (sn0 && (!r || !/#page=/.test(r.sheet_links[0].href || ''))) return { label: 'Лист в атласе отсутствует', disabled: true, title: [].concat(sn0).join('; ') };
    if (r) { const l0 = r.sheet_links[0]; return { label: l0.sheet ? 'Открыть лист ' + l0.sheet + ' (по замечанию)' : 'Открыть PDF альбома', href: l0.href }; }
    // L · F5-4-06: у тела без открываемого листа — пометка A («… — лист в атласе отсутствует»).
    const sn = o.albumRecord && o.albumRecord.source_note;
    if (sn) return { label: 'Лист в атласе отсутствует', disabled: true, title: [].concat(sn).join('; ') };
    return { label: 'Чертёж не назначен', disabled: true, title: noneWhy || undefined };
  }
  function openSource(key, plan) {
    const s = plan && plan.source;
    window.__atlasDrawingHint = plan && plan.hitSheet ? { sheet: plan.hitSheet, pdf: plan.pdfPage } : null;
    if (s && plan.pdfPage && s.pdf_page && plan.pdfPage !== s.pdf_page && s.pdf_url) { window.__atlasDrawingHint = null; window.open(pkgUrl(s.pdf_url.split('#')[0] + '#page=' + plan.pdfPage), '_blank', 'noopener'); return; }   // V12.10 · Y12: подсказка — только для чертежа в атласе, иначе следующий чертёж получит чужую подпись
    window.__FULL_ATLAS.source(key);
  }

  /* 1.3.0 · план п. 6.3: «Откуда данные» простыми словами. Строки — только из данных (статус записи, размещение, факты «Размеров»); чего нет — строки нет. */
  const READY_PLAIN = { inventory_only: 'есть только в перечне, тела в модели нет', parameters_confirmed: 'параметры подтверждены документом', local_geometry: 'форма построена по документу, положение — по плану', placed_verified: 'положение проверено', blocked: 'запись заблокирована' };
  const BODY_PLAIN = { contour_2d: 'в документе только 2D-контур, тела нет', json_unsupported: 'формат тела не поддержан', format_unsupported: 'формат тела не поддержан' };
  const PLACE_PLAIN = { confirmed: 'по документу', derived: 'выведено по плану', none: 'не задано, тело стоит локально' };
  const srcShort = s => { if (!s) return ''; const code = String(s.section || s.source_code || '').split(/[-·\s]/).filter(Boolean).pop() || ''; return [code, s.printed_sheet ? 'л. ' + s.printed_sheet : s.pdf_page ? 'стр. ' + s.pdf_page : ''].filter(Boolean).join(' '); };
  function srcRender(o, p, DF, sl, nos) {
    const L = (window.ATLAS_PROJECT || {}).status_labels || {}, rows = [];
    const st = (o.albumRecord && o.albumRecord.status) || (p && p.status) || {};
    const pl = (o.albumRecord && o.albumRecord.placement) || null;
    const facts = (list, what) => {
      if (!list || !list.length) return null;
      const doc = list.filter(x => x.status === 'doc' || x.status === 'conflict'), mdl = list.filter(x => x.status === 'model');
      const srcs = [...new Set(doc.map(x => srcShort(x.doc && x.doc.src)).filter(Boolean))];
      const parts = [];
      if (doc.length) parts.push((doc.length === list.length ? '' : doc.map(x => ({ length: 'длина', width: 'ширина', height: 'высота', diameter: 'диаметр', bottom: 'низ', top: 'верх', axis: 'ось', invert: 'лоток' })[x.key]).join(', ') + ' — ') + 'по документу' + (srcs.length ? ' (' + srcs.join(', ') + ')' : ''));
      if (mdl.length) parts.push((mdl.length === list.length ? '' : mdl.map(x => ({ length: 'длина', width: 'ширина', height: 'высота', diameter: 'диаметр', bottom: 'низ', top: 'верх' })[x.key] || x.key).join(', ') + ' — ') + 'сняты с модели');
      if (list.some(x => x.status === 'conflict')) parts.push('документ и модель расходятся — показаны оба числа');
      return { label: what, value: parts.join('; ') };
    };
    if (DF) { const a = facts(DF.dims, 'Размеры'), b = facts(DF.levels, 'Отметки'); if (a) rows.push(a); if (b) rows.push(b); if (DF.frame && DF.frame.own && DF.dims.some(x => x.status !== 'doc')) rows.push({ label: 'Как измерено', value: 'повёрнутый элемент — по собственным осям' }); }
    if (pl && pl.status && PLACE_PLAIN[pl.status]) rows.push({ label: 'Место', value: PLACE_PLAIN[pl.status] });
    const model = [];
    const rk = typeof st.readiness === 'string' ? st.readiness : null;
    if (rk) model.push(typeof L[rk] === 'string' && L[rk] ? L[rk] : READY_PLAIN[rk] || rk);
    if (st.geometry_accepted === false) model.push(typeof L.geometry_not_accepted === 'string' && L.geometry_not_accepted ? L.geometry_not_accepted : 'геометрия ещё не принята');
    if (st.body && BODY_PLAIN[st.body]) model.push(BODY_PLAIN[st.body]);
    const og = (sl || []).find(x => /^origin_/.test(x.key || x.kind || ''));
    if (model.length) rows.push({ label: 'Модель', value: model.join('; '), title: og && og.title ? og.title : null });
    else if (og) rows.push({ label: 'Модель', value: og.text, title: og.title || null });
    srcBox.replaceChildren(make('h3', { id: 'cardSrcH' }, 'Откуда данные'));
    if (rows.length) { const g = make('dl', { class: 'card-grid card-stamp' }); dl(g, rows, true); srcBox.append(g); }
    if (nos && nos.length) srcBox.append(noSourceBox(nos));
    srcBox.hidden = !rows.length && !(nos && nos.length);
  }

  /* ---------- разметка карточки ---------- */
  // 1.0.19a (словарь, строка 20): подпись клавиши поиска — по платформе: ⌘K на Mac, Ctrl K на Windows и Linux
  const KEY_SEARCH = /Mac|iPhone|iPad|iPod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl K';
  // 1.0.19a М-3: однобуквенные клавиши — только когда фокус в сцене (AtlasShell.inScene, A-05); без него — запасная проверка на месте: фокус на холсте #canvas
  const inScene = e => { try { if (S && typeof S.inScene === 'function') return !!S.inScene(e); } catch (x) { /* */ } const t = e && e.target; return !!(t && t.closest && t.closest('#canvas')); };
  const ISO_T = 'Показать только это', ISO_S = 'Только это';   // 1.0.19a (словарь, строка 14): не «Изолировать»; на кнопке полосы действий — коротко (имя и подсказка — полностью)
  let announced = null;   // 1.0.19a К-3: renderId последнего объявленного выбора
  // V12.0 (B3): значки — общий набор AtlasIcons; «Сводка», пока ничего не выбрано; «Паспорт» — по макету D (карточка.html).
  const I = (name, cls) => (window.AtlasIcons ? window.AtlasIcons.use(name, null, cls) : '');
  const ic = (name, cls) => { const t = document.createElement('template'); t.innerHTML = I(name, cls); return t.content.firstChild || document.createTextNode(''); };
  const eyebrow = right.querySelector('.eyebrow');
  const closeBtn = right.querySelector('[data-close]');
  const head = make('div', { class: 'card-head' });
  const copyBtn = make('button', { type: 'button', class: 'card-icon', 'aria-label': 'Скопировать ссылку на элемент', title: 'Скопировать ссылку на элемент' });
  copyBtn.innerHTML = I('copy-link');
  closeBtn.classList.add('card-icon');
  closeBtn.innerHTML = I('close');
  closeBtn.setAttribute('aria-label', 'Закрыть карточку');
  const handle = make('button', { type: 'button', class: 'sheet-handle', 'aria-label': 'Развернуть карточку', 'aria-expanded': 'false' });
  // 1.0.13: свернуть правую панель (ПК, > 850 px) — кнопка в шапке; свёрнутая панель — вкладка у правого края (CSS D: #right.rp-collapsed, колонка 44 px)
  const foldBtn = make('button', { type: 'button', class: 'card-icon card-fold', 'aria-controls': 'right', 'aria-expanded': 'true', 'aria-label': 'Свернуть панель', title: 'Свернуть панель (\\)' });
  foldBtn.innerHTML = I('chevron-right');
  head.append(eyebrow, foldBtn, copyBtn, closeBtn);
  // «Сводка» (0.12): все числа — из ATLAS_RELEASE (data/release-info.js), в коде чисел нет.
  const empty = make('div', { class: 'card-empty' });
  {
    const R = S.release(), num = k => isNum(R[k]);
    // L · F5-4-07: ссылка #id=… на элемент, которого в атласе нет, — сказать об этом, а не показывать пустую карточку.
    empty.append(make('p', { class: 'card-note card-note--warn card-notfound', role: 'status', hidden: true }));
    const sum = make('section', { class: 'card-sum', 'aria-labelledby': 'cardSumH' });
    /* К1-B3: сводка — title.object, title.subtitle · title.code из конфига; шифра нет — «Шифр РД — нет в источнике» серым (вид D §1) */
    const tObj = typeof PTITLE.object === 'string' ? PTITLE.object : '', tCode = typeof PTITLE.code === 'string' ? PTITLE.code : '', tSub = typeof PTITLE.subtitle === 'string' ? PTITLE.subtitle : '';
    { const h2 = make('h2', { class: 'card-sum-h', id: 'cardSumH' }, tObj); h2.hidden = !tObj; sum.append(h2); } /* нет названия объекта — заголовка нет */
    if (tSub || tCode) sum.append(make('p', { class: 'card-sum-sub' }, [tSub, tCode].filter(Boolean).join(' · ')));
    if (!tCode && PRJ.project_id) sum.append(make('p', { class: 'card-sum-sub card-fs--unknown' }, 'Шифр РД — нет в источнике'));
    const tiles = make('div', { class: 'card-tiles card-tiles--sum' });
    /* К1-B3 · сводка: пустые наборы (замечания, листы и источники, «требует решения», тела каталога, записи реестра) — без плитки при 0; «элементов в модели» — и при 0 (вид D §2) (ревью D К1 п. 1) */
    const HIDE0 = new Set(['remarks', 'sources', 'unplaced', 'local_bodies', 'registry_records']);
    const TILE_GO = { 'catalogue.html': 'открыть каталог типов', 'library.html': 'открыть чертежи и реестр', 'RD_REMARKS.html': 'открыть все замечания', 'UNPLACED.html': 'открыть типы без подтверждённого места '+atSite };
    const tile = (k, words, href, warn, onClick) => {
      if (!num(k) || (HIDE0.has(k) && !(R[k] > 0))) return;
      const n = R[k], el = make(href ? 'a' : 'button', href ? { class: 'card-tile' + (warn ? ' card-tile--warn' : ''), href } : { type: 'button', class: 'card-tile' });
      el.append(make('b', {}, S.fmt(n)), make('span', {}, typeof words === 'function' ? words(n) : words));
      el.title = S.fmt(n) + ' ' + (typeof words === 'function' ? words(n) : words) + ' — ' + (TILE_GO[href] || (href ? 'открыть' : 'показать список элементов')); /* 1.0.19a К-6: подсказка у плитки — что откроется */
      if (onClick) el.addEventListener('click', onClick);
      tiles.append(el);
    };
    tile('elements', n => S.plural(n, 'элемент', 'элемента', 'элементов') + ' в модели', null, false, () => {
      const t = $('tabElements'); if (t) t.click();
      if (innerWidth <= 850 && !$('left').classList.contains('open')) $('menu')?.click();
    });
    /* К1-B3 (вид D §2): тела в своей системе координат — в каталоге; записи — в реестре. Ключей в release-info нет — плиток нет */
    const CDEF = !!R.counts_definitions; /* 1.0.5 С1: у выпуска с counts_definitions — «тел вне здания», «источников»; без них — как раньше */
    tile('local_bodies', n => S.plural(n, 'элемент', 'элемента', 'элементов') + ' ' + (CDEF ? S.siteText('outside_model', 'вне здания') : 'в каталоге'), 'catalogue.html');
    tile('registry_records', n => S.plural(n, 'запись', 'записи', 'записей') + ' в реестре', 'library.html');
    tile('remarks', n => S.plural(n, 'замечание', 'замечания', 'замечаний') + ' к РД', 'RD_REMARKS.html');
    tile('sources', n => CDEF ? S.plural(n, 'источник', 'источника', 'источников') : S.plural(n, 'лист и источник', 'листа и источника', 'листов и источников'), 'library.html');
    /* 1.0.19a к4: подпись — по тому же признаку ключа progress, что пункт меню (AtlasShell.unplacedName): без ключа «требует решения», как в 1.0.18; с ключом «без подтверждённого места» */
    { const un = (S.unplacedName && S.unplacedName()) || 'Требует решения'; tile('unplaced', un.charAt(0).toLowerCase() + un.slice(1), 'UNPLACED.html', true); }
    if (tiles.children.length) sum.append(tiles);
    /* К1-B3: полоса готовности записей — readiness_counts выпуска, подписи status_labels (assets/atlas-status.js); нет чисел — полосы нет */
    { const rb = ST() && typeof ST().bar === 'function' ? ST().bar(R.readiness_counts, 'Готовность записей') : null; if (rb) sum.append(rb); }
    // Полоса значимости и значки-формы: треугольник — высокая, ромб — средняя, круг — низкая.
    const bySig = R.remarks_by_significance || {};
    const sigs = Object.keys(S.SIG).filter(s => isNum(bySig[s]) && bySig[s] > 0);
    if (sigs.length) {
      const bar = make('div', { class: 'card-sigbar', 'aria-hidden': 'true' });
      for (const s of sigs) { const i = make('i', { class: 'card-sigbar--' + S.SIG[s] }); i.style.flex = String(bySig[s]); bar.append(i); }
      const legend = make('ul', { class: 'card-sum-legend', 'aria-label': 'Замечания по значимости' });   /* 1.0.19a К-2: список ul > li > a — у ссылок нет role=listitem */
      for (const s of sigs) {
        const a = make('a', { class: S.sigClass(s), href: 'RD_REMARKS.html#pri=' + encodeURIComponent(s), title: s + ' значимость: ' + S.fmt(bySig[s]) + ' ' + S.plural(bySig[s], 'замечание', 'замечания', 'замечаний') + ' — открыть список' });
        a.append(ic('sig-' + S.SIG[s]), document.createTextNode(s + ' · ' + S.fmt(bySig[s])));
        const li = make('li'); li.append(a); legend.append(li);
      }
      sum.append(bar, legend);
    }
    const hint = make('p', { class: 'card-sum-hint' });
    const ht = make('span');
    ht.append(document.createTextNode('Щёлкните элемент на модели или найдите марку '), make('kbd', {}, KEY_SEARCH), document.createTextNode(' — здесь откроется его карточка.'));
    hint.append(ic('element'), ht);
    sum.append(hint);
    empty.append(sum);
  }
  const body = make('div', { class: 'card-body' });
  const titleBox = make('div', { class: 'card-title' });
  const title = make('h2', { id: 'cardTitle', tabindex: '-1' });
  let focusTitle = false;
  document.addEventListener('atlas:focuscard', () => { focusTitle = true; });
  const path = make('div', { class: 'card-path' });
  const facts = make('div', { class: 'card-facts' });
  const ownBox = make('section', { class: 'card-block card-section card-own' });
  const ctxBox = make('section', { class: 'card-block card-section card-ctx' }); /* R248 п.4: parent_composition — контекст сборки, отдельно */
  const OWNK = [['material', 'Материал'], ['construction', 'Конструкция'], ['thickness', 'Толщина'], ['type', 'Тип']];
  /* R248: собственные поля из full.props — статус, единица, MODEL/UNKNOWN, квалификаторы; прочие ключи (кроме parent_composition) — по общим правилам паспорта */
  function ownRowsOf(dp) { const out = []; for (const [k, lab] of OWNK) { const v = dp[k]; if (v == null) continue; const f = ST().field(v) || { text: typeof v === 'string' ? v : String(v) }; out.push({ key: k, label: lab, value: f.text, fs: f.fs || null, model: !!f.model, prov: f.prov || '', quals: ST().quals(v) }); } const rest = {}; for (const [k, v] of Object.entries(dp)) if (!OWNK.some(x => x[0] === k) && k !== 'parent_composition') rest[k] = v; for (const x of ST().passportRows(rest)) out.push({ key: x.key, label: x.label, value: x.text, fs: x.fs, model: !!x.model, prov: '', quals: ST().quals(dp[x.key]) }); return out; } /* 1.0.9: собственные свойства (display_titles full.props) — только если есть */
  const gaBox = make('section', { class: 'card-block card-section card-ga' }); /* 1.0.7 К3: ограничения геометрии исходной записи — только если есть */
  const origBox = make('p', { class: 'card-part card-orig' }); /* 1.0.9: «Исходное имя» — только при отображаемом имени */
  const partBox = make('p', { class: 'card-part' }); /* 1.0.7: «Деталь записи <ID>» — только у части (render_id ≠ id), иначе в разметке нет */
  const statusBox = make('div', { class: 'card-status', hidden: true }); /* К1-B3: чипы статусов данных */
  const loadTag = make('p', { class: 'card-loading', role: 'status', hidden: '' }, 'Загрузка…');   // 1.0.12: признак загрузки паспорта рядом с названием (виден и в свёрнутой шторке)
  const idLine = make('p', { class: 'card-id mono', hidden: true });   /* 1.3.0 · план п. 6.1: ID элемента под названием */
  const srcBox = make('section', { class: 'card-block card-section card-src', 'aria-labelledby': 'cardSrcH', hidden: true });   /* 1.3.0 · план п. 6.3: «Откуда данные» */
  const footNote = make('p', { class: 'card-foot-note', hidden: true });   /* 1.3.0 · план п. 6.5: «Не для изготовления» — одной строкой внизу */
  titleBox.append(title, idLine, loadTag, path, facts); /* 1.0.1 (B3): statusBox — в DOM только с чипами (вставка при обновлении карточки) */ // V12.1: порядок V11.5 — название, путь (ПК) / строка фактов (телефон)
  // Строка узла (V12.1 п. 3) — «Узел МУ 29 · 12 элементов · армирование 35» / «В узле МУ 29 → Открыть узел».
  const nodeLine = make('div', { class: 'card-node card-section', hidden: true });
  // Оговорки одной строкой ⓘ: метка стадии, затем «Размеры по РД · привязка условная · не для изготовления».
  const badgeBox = make('div', { class: 'card-badges card-status card-section' });
  // M13 (замечание владельца 01.10): первым блоком — «Основные данные» (габарит, объём, материал, марка, масса, уровень, отметки).
  const mainBox = make('section', { class: 'card-block card-section card-main', 'aria-labelledby': 'cardMainH' });
  const chars = make('section', { class: 'card-block card-section', 'aria-labelledby': 'cardCharsH' });
  const where = make('section', { class: 'card-block card-section', 'aria-labelledby': 'cardWhereH' });
  // Дополнительный блок от модулей (AtlasCardExtra → block: {title, rows, legend, actions}) — например «Армирование и узлы МУ N».
  const extraBox = make('section', { class: 'card-block card-section card-xblock', 'aria-labelledby': 'cardXBlockH', hidden: true });
  const remarksBox = make('section', { class: 'card-remarks', 'aria-label': 'Замечания к элементу' });
  const drawBtn = make('button', { type: 'button', class: 'card-primary', id: 'cardDrawing' });
  const drawList = make('div', { class: 'card-drawlist', hidden: true });
  const mobileActions = make('div', { class: 'card-mobile-actions' });
  const mDraw = make('button', { type: 'button', class: 'card-primary' });
  const mIso = make('button', { type: 'button', class: 'card-btn card-btn--icon', 'aria-label': ISO_T, title: ISO_T });
  mIso.innerHTML = I('isolate');
  const mMore = make('button', { type: 'button', class: 'card-btn card-more card-btn--icon', 'aria-label': 'Все сведения об элементе', title: 'Все сведения об элементе' });
  mMore.innerHTML = I('more');
  mobileActions.append(mDraw, mIso, mMore);
  // Узлы B2 (prototype.js / view-settings.js / движок) остаются в DOM: .actions с #objectTransparency, #isolate, #hide, #fitElement.
  // Тексты #isolate и #hide переписывают движок и view-settings.js — поэтому видимы кнопки-посредники (card-acts).
  const actions = right.querySelector('.actions');
  actions.classList.add('card-actions-src');
  const oldDrawing = $('drawing');
  oldDrawing.hidden = true;
  /* 1.0.6 п. 2: «Источник не назначен» движка — неактивна с причиной (только при passport.source_pdf) */
  if (ST() && ST().passportOn && ST().passportOn('source_pdf')) { const why = () => { const t = oldDrawing.disabled ? 'у элемента нет источника с изображением листа; PDF — кнопка «Чертёж» карточки' : ''; if (oldDrawing.title !== t) oldDrawing.title = t; }; new MutationObserver(why).observe(oldDrawing, { attributes: true, attributeFilter: ['disabled'], childList: true }); why(); }
  const detail = $('detailDrawing');
  const det = (label, cls) => { const d = make('details', { class: 'card-details card-section ' + (cls || '') }); const s = make('summary', {}, label); d.append(s); return d; };
  const notesD = det('Ограничения и примечания');
  const specD = det('Спецификация и источник');
  const pairsD = det('Листы');
  const archiveD = right.querySelector('.r23-archive-links') || det('Архивные инженерные документы');
  archiveD.classList.add('card-details', 'card-section');
  /* 1.0.19a К-4: «Архивные инженерные документы» — только ссылки на файлы, которые есть в выпуске. Ссылка без href или с aria-disabled (её снимает переадресация сайта, package-links.js) — неактивна:
     такие не показываются, их число — строкой «… не входят в выпуск». Активных нет — блока нет. Переадресация меняет ссылки после вставки — пересчёт по наблюдателю. */
  function archSync() {
    const all = [...archiveD.querySelectorAll('a')], live = all.filter(a => a.hasAttribute('href') && a.getAttribute('aria-disabled') !== 'true'), off = all.length - live.length;
    for (const a of all) { const h = !live.includes(a); if (a.hidden !== h) a.hidden = h; }
    if (archiveD.hidden !== !live.length) archiveD.hidden = !live.length;
    const sm = archiveD.querySelector('summary'), st = 'Архивные инженерные документы · ' + S.fmt(live.length); if (sm && sm.textContent !== st) sm.textContent = st;
    const nt = off ? 'Ещё ' + S.fmt(off) + ' ' + S.plural(off, 'файл', 'файла', 'файлов') + ' ' + S.plural(off, 'не входит', 'не входят', 'не входят') + ' в выпуск.' : '';
    let note = archiveD.querySelector('.card-archive-note');
    if (!nt) { if (note) note.remove(); } else { if (!note && sm) { note = make('p', { class: 'card-archive-note' }); sm.after(note); } if (note && note.textContent !== nt) note.textContent = nt; }
  }
  new MutationObserver(archSync).observe(archiveD, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'aria-disabled'] });
  const techD = det('Технические сведения');
  const notesBody = make('div', { class: 'card-notes' });
  const extraNotes = make('div', { class: 'card-extra-notes' });
  notesBody.append($('objectWarning'), extraNotes);
  notesD.append(notesBody);
  const specBody = make('dl', { class: 'card-grid' });
  specD.append(specBody);
  pairsD.append($('pairHeading'), $('pairs'));
  const techGrid = make('dl', { class: 'card-grid' });
  const selectedIdEl = $('selectedId');
  techD.append(techGrid, selectedIdEl, $('props'));
  // V12.1 п. 4: полоса действий. Ряд А — «Открыть чертёж · л. N», «Показать армирование · N»;
  // ряд Б — «Прозрачность», «Скрыть», «Изолировать», «Ещё ▾» (посредники к узлам движка и view-settings.js).
  const acts = make('div', { class: 'card-acts', role: 'group', 'aria-label': 'Действия с элементом' });
  const act = (name, text, onClick, attrs) => {
    const b = make('button', Object.assign({ type: 'button', class: 'card-act' }, attrs || {}));
    b.append(ic(name), make('span', { class: 'card-act-t' }, text));
    if (!b.title) b.title = text; // полная подпись — на узкой колонке (851–1200) слово может сократиться
    b.addEventListener('click', onClick);
    acts.append(b);
    return b;
  };
  const moreMenu = make('div', { class: 'card-more-menu', id: 'cardMoreMenu', role: 'menu', 'aria-label': 'Ещё действия', hidden: true });
  const aXray = act('xray', 'Прозрачность', () => $('objectTransparency').click(), { 'aria-pressed': 'false' });
  const aHide = act('hide', 'Скрыть', () => $('hide').click());
  const aIso = act('isolate', ISO_S, () => isolateClick(), { title: ISO_T, 'aria-label': ISO_T });
  const aMore = act('more', 'Ещё ▾', () => moreOpen(moreMenu.hidden), { 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'cardMoreMenu', 'aria-label': 'Ещё действия', title: 'Ещё действия' });
  const menuItem = (name, text, onClick, keep) => { const b = make('button', { type: 'button', role: 'menuitem' }); b.append(ic(name), make('span', {}, text)); b.addEventListener('click', () => { moreOpen(false, keep); onClick(); }); moreMenu.append(b); return b; };
  // «Ещё» — не больше пяти пунктов; неприменимые скрыты (§5.1).
  // V12.2 · E12: «К элементу» — __ATLAS.focus(id) → 'done' | 'cancelled' (та же камера, что #focusSelected); без features.focusPromise — кнопка B2 #fitElement
  const mFit = menuItem('focus-element', 'К элементу', () => { if (FE().focusPromise && cur) return window.__ATLAS.focus(cur.o.renderId); $('fitElement')?.click(); });
  const mNode = menuItem('model', 'Открыть узел целиком', () => nodeAction && nodeAction());
  const mOpenSec = menuItem('rebar', 'Открыть в разделе армирования', () => openSec && openSec());
  // V12.4 P9: «Показать срезом» — __ATLAS.setSection({box}) при features.sectionApi
  let cutBox = null, cutOwn = null, cutPrev = null, cutSetting = false, cutSlider = null, cutKey = ''; // 1.0.12: и ползунок до среза (выключается при срезе) — вернуть при снятии, если раздел тот же // V12.4b: сечение до среза (например, «По этажу») — вернуть при снятии
  const cutRestore = () => {
    const p = cutPrev, sl = cutSlider; cutPrev = null; cutOwn = null; cutSlider = null;
    window.__ATLAS.setSection(p ? (p.box ? { box: p.box } : { axis: p.axis, value: p.value, flip: !!p.flip }) : null);
    const ax = $('sliceAxis');   // 1.0.12: ползунок Z (X, Y) — как до «Показать срезом»
    if (sl && sl.axis && ax && sl.scope === scopeNow()) { ax.value = String('xyz'.indexOf(sl.axis)); const v = $('sliceValue'); if (v) v.value = String(sl.value); const fl = $('r23SliceFlip'); if (fl) fl.checked = !!sl.flip; ax.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  const cutOn = () => { try { const st = window.__ATLAS.sectionState() || {}; return !!(cutOwn && st.section && st.section.box && JSON.stringify(st.section.box) === JSON.stringify(cutOwn)); } catch (e) { return false; } };
  const CUT_ON = 'Показать с вырезом', CUT_OFF = 'Убрать сечение'; // V12.5 Q9 (решение D): «Убрать сечение» — везде (Ещё, Инструменты, окно «Сечение»)
  // 1.0.14: габарит для среза — из карточки выбранного тела, а пока карточка не готова — из движка (__ATLAS.bounds): «Срез по телу» доступен сразу
  const cutBoxNow = () => { const s = selected(); if (!s) return null; if (cutBox && cur && s.renderId === cur.o.renderId) return cutBox; try { return window.__ATLAS.bounds ? window.__ATLAS.bounds([s.renderId]) : null; } catch (e) { return null; } };
  const cutForSel = () => !!cutBoxNow();
  function cutToggle() {
    const cb = cutBoxNow();
    if (!FE().sectionApi || (!cb && !cutOn())) return;
    if (cutOn()) { cutRestore(); cutSync(); return; }
    { const st = window.__ATLAS.sectionState() || {}; cutPrev = st.section || null; cutSlider = st.slider && st.slider.axis ? Object.assign({ scope: scopeNow() }, st.slider) : null; }
    // Q9: ползунок сечения — выключить, как «По этажу» (иначе он режет вместе с коробкой)
    const ax = $('sliceAxis'); if (ax && ax.value !== 'none') { ax.value = 'none'; const fl = $('r23SliceFlip'); if (fl) fl.checked = false; ax.dispatchEvent(new Event('change', { bubbles: true })); }
    const box = [cb[0].map(v => v - 1), cb[1].map(v => v + 1)];
    cutSetting = true; try { if (window.__ATLAS.setSection({ box })) cutOwn = window.__ATLAS.sectionState().section.box; } finally { cutSetting = false; } cutSync();   // 1.0.11: setSection синхронно шлёт atlas:section — без флага cutSync счёл бы срез «вернувшимся» и стёр cutPrev
  }
  const mCut = menuItem('section', CUT_ON, cutToggle);
  const mLink = menuItem('copy-link', 'Скопировать ссылку', () => { if (window.AtlasViewLink && window.AtlasViewLink.copy) window.AtlasViewLink.copy(); else copyBtn.click(); });
  const mTech = menuItem('info', 'Технические сведения', () => { techD.open = true; right.classList.add('expanded'); techD.scrollIntoView({ block: 'nearest' }); techD.querySelector('summary').focus(); }, true); // шторка остаётся развёрнутой
  let nodeAction = null, openSec = null;
  // P9: подпись пункта и «не больше пяти пунктов» (§5.1): лишние — «Скопировать ссылку» (есть кнопка в шапке, если она видна), затем «Технические сведения» (блок открывается в карточке)
  function cutSync() {
    mCut.hidden = !(FE().sectionApi && cutBox && cur);
    if (cutOwn && !cutOn()) cutOwn = null;
    // 1.0.11: в движке стоит ровно срез этого тела (вернул выход из «Замечаний на модели», где он был до входа) — срез снова свой, «Убрать сечение» снимает его
    if (!cutOwn && !cutSetting && cutBox && cur && FE().sectionApi) { try { const sb = ((window.__ATLAS.sectionState() || {}).section || {}).box, bx = [cutBox[0].map(v => v - 1), cutBox[1].map(v => v + 1)]; if (sb && [0, 1].every(i => [0, 1, 2].every(k => Math.abs(sb[i][k] - bx[i][k]) < 1e-9))) { cutOwn = sb; cutPrev = null; } } catch (e) { /* */ } }
    mCut.querySelector('span').textContent = cutOn() ? CUT_OFF : CUT_ON;
    { const k = String(!!(FE().sectionApi && cutBox && cur)) + '|' + cutOn(); if (k !== cutKey) { cutKey = k; document.dispatchEvent(new CustomEvent('atlas:cardcut', { detail: { ready: !!(FE().sectionApi && cutBox && cur), on: cutOn() } })); } }   // 1.0.12: «Срез по телу» в ряду выреза замечаний — готовность и состояние P9
    mLink.hidden = false; mTech.hidden = false;
    const vis = () => [...moreMenu.querySelectorAll('button')].filter(b => !b.hidden).length;
    // решение D: на 390 — ничего не прятать, если меню целиком помещается в развёрнутую шторку (85 % высоты, строки 44 px); «Показать срезом», «К элементу», «Открыть узел» — никогда
    const fitsPhone = innerWidth <= 850 && vis() * 44 + 160 <= innerHeight * 0.85;
    if (!fitsPhone && vis() > 5 && copyBtn.getClientRects().length && !copyBtn.hidden) mLink.hidden = true;
    if (!fitsPhone && vis() > 5) mTech.hidden = true;
  }
  document.addEventListener('atlas:section', cutSync);
  document.addEventListener('atlas:selectionchange', e => { if (cutOwn && cutOn() && !(cur && e.detail && e.detail.id === cur.o.renderId)) { cutRestore(); } cutSync(); }); // P9 (V12.4b — прежнее сечение возвращается): снятие или смена выбора — срез снимается, вид как был
  mNode.hidden = true; mOpenSec.hidden = true;
  // Ряд А: «Показать армирование» — состояния §5.4 (доступна · N / загрузка / включена / недоступна с причиной).
  const rebarBtn = make('button', { type: 'button', class: 'card-rebar', id: 'cardRebar' });
  const rebarWhy = make('p', { class: 'card-rebar-why', role: 'status', hidden: true });
  let menuExpanded = false; // шторку развернуло само меню «Ещё» (телефон)
  function moreOpen(yes, keep) {
    if (yes) cutSync(); // V12.4 P9: пункты «Ещё» — по состоянию на момент открытия
    // V12.1d п. 4: на телефоне в свёрнутой шторке меню не помещается — сначала развернуть шторку.
    if (yes && innerWidth <= 850 && !right.classList.contains('expanded')) { right.classList.add('expanded'); handle.setAttribute('aria-expanded', 'true'); menuExpanded = true; }
    // V12.1e п. 4: после выбора пункта (или закрытия меню) — вернуть шторку, как была: свёрнутую, чтобы сцена была видна.
    if (!yes && menuExpanded) { menuExpanded = false; if (!keep) { right.classList.remove('expanded'); handle.setAttribute('aria-expanded', 'false'); sheetSignal(); } } // V12.1g п. 8: высота шторки — движку сразу, до действия пункта
    moreMenu.hidden = !yes; aMore.setAttribute('aria-expanded', String(yes)); if (yes) { const f = [...moreMenu.querySelectorAll('button')].find(b => !b.hidden && !b.disabled); if (f) f.focus(); } }
  moreMenu.addEventListener('keydown', e => {
    const items = [...moreMenu.querySelectorAll('button')].filter(b => !b.hidden && !b.disabled), i = items.indexOf(document.activeElement); // V12.1c п. 9
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); moreOpen(false); aMore.focus(); }
  });
  // V12.1g п. 9: касание ручки при открытом «⋯» только закрывает меню и возвращает прежнее состояние шторки (без переключения).
  let handleSkip = false;
  document.addEventListener('pointerdown', e => { if (!moreMenu.hidden && !moreMenu.contains(e.target) && !aMore.contains(e.target)) { if (handle.contains(e.target)) handleSkip = true; moreOpen(false); } }, true);
  // Состояние посредников — по узлам движка (текст «Вернуть окружение», aria-pressed прозрачности, disabled).
  function actsSync() {
    const iso = $('isolate'), tr = $('objectTransparency'), hide = $('hide');
    if (iso) {
      const on = isoOn();
      aIso.querySelector('.card-act-t').textContent = on ? 'Вернуть' : ISO_S; aIso.setAttribute('aria-label', on ? 'Вернуть окружение' : ISO_T);
      aIso.title = on ? ((iso.textContent || '').trim() || 'Вернуть окружение') : ISO_T;   /* 1.0.19a: подсказка — по словарю, не текст узла движка */
      aIso.setAttribute('aria-pressed', String(on)); aIso.disabled = iso.disabled;
    }
    if (tr) { aXray.setAttribute('aria-pressed', tr.getAttribute('aria-pressed') === 'true' ? 'true' : 'false'); aXray.disabled = tr.disabled; aXray.title = (tr.textContent || '').trim(); }
    if (hide) { const t = (hide.textContent || 'Скрыть').trim(); aHide.querySelector('.card-act-t').textContent = /Показ/.test(t) ? 'Показать' : 'Скрыть'; aHide.title = t; aHide.disabled = hide.disabled; }
    const fit = $('fitElement'); if (fit) mFit.disabled = fit.disabled;
  }
  new MutationObserver(actsSync).observe(actions, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed'] });
  const dock = make('div', { class: 'card-dock' });
  const rowA = make('div', { class: 'card-row-a' });
  rowA.append(drawBtn);
  if (REBAR_UI) rowA.append(rebarBtn);
  else rowA.style.gridTemplateColumns = 'minmax(0, 1fr)';
  /* 1.3.0 · этап 1, п. 1: «Размеры» — и в карточке, рядом с кнопкой листа; состояние общее с панелью сцены (atlas-dimensions.js, событие atlas:dims) */
  const dimsBtn = make('button', { type: 'button', class: 'card-btn card-dims', id: 'cardDims', 'aria-pressed': 'false', title: 'Размеры выбранного элемента (D)', hidden: true });
  dimsBtn.append(ic('bbox'), make('span', {}, 'Размеры'));
  dimsBtn.addEventListener('click', () => { if (window.AtlasDims) window.AtlasDims.toggle(); });
  document.addEventListener('atlas:dims', e => dimsBtn.setAttribute('aria-pressed', String(!!(e.detail && e.detail.on))));
  const dimsMount = () => { if (!window.AtlasDims || dimsBtn.isConnected) return; rowA.append(dimsBtn); dimsBtn.hidden = false; rowA.style.gridTemplateColumns = REBAR_UI ? 'minmax(0, 1fr) minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto'; try { dimsBtn.setAttribute('aria-pressed', String(!!window.AtlasDims.state().on)); } catch (e) { /* */ } };
  document.addEventListener('atlas:ready', () => setTimeout(dimsMount, 0)); setTimeout(dimsMount, 0);
  const actsWrap = make('div', { class: 'card-acts-wrap' });
  actsWrap.append(acts, moreMenu);
  dock.append(rowA, rebarWhy, drawList, detail, actsWrap, actions);
  // V12.1 п. 1: порядок блоков V11.5; плиток фактов и дублирующей полосы телефона больше нет.
  const envBox = make('div', { id: 'cardEnv', class: 'card-env card-section', hidden: true }); // V12.2 · M3: окружение этажа Ку/Р
  body.append(titleBox, nodeLine, envBox, badgeBox, mainBox, srcBox, chars, extraBox, where, remarksBox, notesD, specD, pairsD, archiveD, techD, footNote);
  // Прежние контейнеры — вне видимой карточки, но в DOM (на них ссылается движок).
  const legacy = make('div', { class: 'card-legacy', hidden: true });
  legacy.append($('selectedName'), oldDrawing);
  for (const el of [...right.children]) if (el !== legacy && el.matches('.technical-details,.element-notes,.element-sources,.engineering-card,.engineering-placement,.element-context,section.element-notes')) legacy.append(el);
  right.replaceChildren(handle, head, empty, body, dock, legacy);
  actsSync();

  /* ---------- состояние ---------- */
  let current = null, generation = 0;
  const fieldsApi = window.AtlasEngineeringFields;
  // Инженерные значения — моно-шрифтом (V12.0): отметки «±0,000», оси «8–9 / А–Б», марки и размеры целиком.
  const MONO_PARTS = /([±−+-]\d+,\d{3}|[1-9](?:[–-][1-9])?\s*\/\s*[А-ЯЁ](?:[–-][А-ЯЁ])?(?![А-ЯЁа-яё]))/;
  // 1.0.19a К-1: объём «X м³ по ведомости · Y м³ по модели» — каждое значение своей строкой, «по ведомости» и «по модели» не переносятся внутри
  function volText(v, s) { for (const part of String(s).split(' · ')) { const ln = make('span', { class: 'card-vline' }), m = /^(.*?)\s+(по (?:ведомости|модели|спецификации))$/.exec(part); if (m) { monoText(ln, m[1], false); ln.append(' ', make('span', { class: 'nw' }, m[2])); } else monoText(ln, part, false); v.append(ln); } }
  function monoText(dd, text, whole) {
    if (whole) { dd.append(make('span', { class: 'mono' }, text)); return; }
    String(text).split(MONO_PARTS).forEach((part, i) => { if (part) dd.append(i % 2 ? make('span', { class: 'mono' }, part) : document.createTextNode(part)); });
  }
  // data-f — по ним сверяет тест координатора (сверка_чисел.py): level — уровень, axes — оси, marks — отметки, size — размеры.
  const F_OF = { 'Уровень': 'level', 'Оси': 'axes', 'Отметки': 'marks', 'Размеры': 'size' };
  const MONO_WHOLE = /^(Марка|Размеры|Отверстия|Профиль|Сечение|Длина|Диаметр|Лист РД|Тип)$/;
  function dl(target, rows, stamp) {
    target.replaceChildren();
    for (const r of rows) {
      const dt = make('dt', {}, r.label), dd = make('dd');
      if (r.node) dd.append(r.node);
      else if (stamp && r.value != null) monoText(dd, r.value, MONO_WHOLE.test(r.label));
      else dd.textContent = r.value;
      if (r.mono) dd.classList.add('mono');
      if (r.fs) dd.classList.add('card-fs--' + r.fs); /* К1-B3: статус поля */
      if (stamp && F_OF[r.label]) dd.dataset.f = F_OF[r.label];
      target.append(dt, dd);
    }
  }
  function sigBadge(s) { const k = (S.SIG && S.SIG[s]) || 'none'; const b = make('span', { class: 'sig sig--' + k }); b.append(ic(k === 'none' ? 'info' : 'sig-' + k), document.createTextNode(s || 'Не оценена')); return b; }   /* Ядро 1.0.2 (D): значимость вне трёх — один класс none */
  function short(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function remarkSheet(r) {
    const l = (r.sheet_links || [])[0];
    if (l) return { href: /^library\.html#/.test(l.href) ? l.href + '&from=' + encodeURIComponent(r.id) : l.href, label: l.sheet ? 'Лист ' + l.sheet : 'PDF альбома' };
    if (r.album_pdf) return { href: r.album_pdf, label: (r.sheets && r.sheets[0]) ? 'Лист ' + r.sheets[0] : 'PDF альбома' };
    return null;
  }
  function renderRemarks(o, extraIds) {
    /* Ядро 1.0.2 (D): замечания к телу — и по ID записи: `<ID>::<часть>` → ID (тело записи из частей); ownKey — по какому ключу найдены (для ссылки «Все замечания») */
    const ownRef = { key: null };
    const own = (() => { const seen = new Set(), out = []; let k = o.renderId; for (;;) { for (const r of (remarksByElement.get(k) || [])) if (!seen.has(r.id)) { seen.add(r.id); out.push(r); if (ownRef.key == null) ownRef.key = k; } const i = k.lastIndexOf('::'); if (i <= 0) break; k = k.slice(0, i); } return out; })();
    const byId = new Set(own.map(r => r.id));
    const extra = (extraIds || []).filter(id => !byId.has(id)).map(id => REMARKS.find(r => r.id === id)).filter(Boolean);
    const rs = own.concat(extra).slice().sort((a, b) => (SIG_ORDER[a.significance] ?? 3) - (SIG_ORDER[b.significance] ?? 3));
    remarksBox.replaceChildren();
    remarksBox.hidden = !rs.length;
    right.classList.toggle('has-remarks', rs.length > 0);
    if (!rs.length) return rs;
    rs.slice(0, 2).forEach((r, i) => {
      const item = make('article', { class: 'card-remark card-remark--' + (S.SIG[r.significance] || 'none') + (i ? ' card-remark--more' : '') });
      const line = make('div', { class: 'card-remark-line' });
      line.append(make('span', { class: 'mono card-remark-id' }, r.id), sigBadge(r.significance), make('span', { class: 'card-muted' }, r.category));
      if (r.atlas_fix && r.atlas_fix.kind) line.append(make('span', { class: 'card-fixchip', title: r.atlas_fix.done || '' }, String(r.atlas_fix.kind).toLowerCase() === 'допроектировано' ? 'Допроектировано атласом' : 'Исправлено атласом'));
      item.append(line, make('p', { class: 'card-remark-what' }, r.what));
      const btns = make('div', { class: 'card-remark-links' });
      const open = make('a', { href: 'RD_REMARKS.html#id=' + encodeURIComponent(r.id) }, 'Открыть замечание →');
      btns.append(open);
      const sh = remarkSheet(r);
      if (sh) { const a = make('a', { href: sh.href, target: /\.pdf/i.test(sh.href) ? '_blank' : null, rel: /\.pdf/i.test(sh.href) ? 'noopener' : null }); a.append(ic('sheet'), document.createTextNode(sh.label)); btns.append(a); }
      item.append(btns);
      remarksBox.append(item);
    });
    if (rs.length > 2) remarksBox.append(make('a', { class: 'card-remarks-all', href: byId.size ? 'RD_REMARKS.html#el=' + encodeURIComponent(ownRef.key || o.renderId) : 'RD_REMARKS.html#id=' + encodeURIComponent(rs[0].id) }, 'Все замечания к элементу · ' + rs.length + ' →'));
    return rs;
  }
  /* ---------- V12.1: «Показать армирование», строка узла, «Изолировать» при армировании ---------- */
  let cur = null; // {o, p}
  // Раздел — __ATLAS.scope() (API движка).
  const FE = () => (window.__ATLAS && window.__ATLAS.features) || {};
  const scopeNow = () => { try { return (window.__ATLAS && typeof window.__ATLAS.scope === 'function' ? window.__ATLAS.scope() : '') || ''; } catch (e) { return ''; } }; /* К1-B3: только API движка (без запасного пути ревизий) */
  const N = () => (window.AtlasNodes && typeof window.AtlasNodes.ready === 'function' && window.AtlasNodes.ready() ? window.AtlasNodes : null);
  const extrasOf = (o, p) => (window.AtlasCardExtra || []).map(f => { try { return f(o, p) || null; } catch (e) { return null; } }).filter(Boolean);
  const NO_REBAR = 'Для этого элемента армирование в данных не задано';
  /* V12.9 W4: модуль atlas-nodes.js не загрузился, а заглушка (prototype.js) признака ошибки не даёт — ловим ошибку загрузки скрипта сами; запасной признак — как в index.html (заглушка без _R, заготовка #nodeTree убрана) */
  let nodesScriptFailed = false;
  addEventListener('error', e => { const t = e.target; if (t && t.tagName === 'SCRIPT' && /assets\/atlas-nodes\.js(?:$|\?)/.test(t.src || '')) { nodesScriptFailed = true; try { rebarRefresh(); } catch (er) { /* до карточки */ } } }, true);
  /* V12.9 W4: тела с армированием по data/nodes.js — узел с ролью «Армирование», телами «по щелчку» (od) или МУ (mu); null — читается, false — данных нет */
  let nodesArm = null, nodesArmStarted = false;
  function nodesArmSet() {
    if (nodesArmStarted) return nodesArm;
    nodesArmStarted = true;
    const go = async () => {
      try {
        const g = window.ATLAS_NODES_GZIP, x = g ? await window.AtlasChunks.decode(g) : (window.ATLAS_NODES || null);
        if (!x) { nodesArm = false; return; }
        const byAi = new Map(); try { for (const w of window.__FULL_ATLAS.allWorld()) if (w.albumIndex != null) byAi.set(w.albumIndex, w.renderId); } catch (e) { /* */ }
        const set = new Set();
        for (const n of x.nodes || []) {
          const r = n.roles || {}; if (!((r['Армирование'] || []).length || n.od || n.mu != null)) continue;
          for (const id of (n.anchors || []).concat(...Object.values(r))) { const rid = typeof id === 'number' ? byAi.get(id) : id; if (rid) set.add(rid); }
        }
        nodesArm = set;
      } catch (e) { nodesArm = false; }
      finally { try { rebarRefresh(); } catch (e) { /* */ } }
    };
    if (window.ATLAS_NODES_GZIP || window.ATLAS_NODES) go();
    else if (document.querySelector('script[src$="data/nodes.js"]')) { nodesArm = false; }   // V12.9b: тег данных уже был (модуль узлов его вставил и не прочитал) — второй раз не вставлять
    else { const s = document.createElement('script'); s.src = 'data/nodes.js'; s.dataset.state = 'loading'; s.onload = () => { s.dataset.state = 'done'; go(); }; s.onerror = () => { s.dataset.state = 'error'; nodesArm = false; try { rebarRefresh(); } catch (e) { /* */ } }; document.head.append(s); }   /* V12.10 · Y6: состояние тега — для модуля узлов, если он придёт позже */
    return nodesArm;
  }
  const nodesFailed = () => { const AN = window.AtlasNodes; if (AN && !AN.stub && AN.failed) return !!AN.failed(); /* V12.10 · Y6: модуль загружен — его признак главный (как вид) */ if (window.__ATLAS_NODES_FAILED) return true; if (!AN) return false; if (AN.failed && AN.failed()) return true; return nodesScriptFailed || (!!AN.stub && !AN._R && !!document.querySelector('script[src$="assets/atlas-nodes.js"]') && !document.getElementById('nodeTree') && !document.body.classList.contains('nt-on')); };
  // Состояние кнопки: AtlasNodes.rebarInfo (B2), пока API нет — описание связи от atlas-rebar.js (block.rebar).
  function rebarInfo(o, extras, stale) {
    const A = N();
    // V12.8c: реестр узлов не загрузился (AtlasNodes.failed) — «недоступно» с причиной вместо вечной «Загрузки…»
    /* V12.9 W4: реестр узлов не загрузился — причина только у тел с армированием по данным (связь atlas-rebar.js); у прочих — обычное «не задано» */
    if (!A && nodesFailed()) { const ex = extras && extras.length ? extras : extrasOf(o, {}), x0 = ex.find(e => e.rebar), xr = x0 && x0.rebar; let l = null; try { l = window.__ATLAS && window.__ATLAS.rebarLinkOf ? window.__ATLAS.rebarLinkOf(o.renderId) : null; } catch (e) { l = null; }
      if ((xr && xr.available) || (l && !l.no_rebar)) return { available: false, reason: 'Реестр узлов не загрузился' };
      if ((xr && xr.reason) || (l && l.no_rebar)) return { available: false, reason: (xr && xr.reason) || null };
      // V12.9 W4 (B2 за B3): у тел узлов армирование задано в data/nodes.js, а не в связях — читаем данные сами (модуля узлов нет)
      const arm = nodesArmSet();
      if (arm === null) return { available: true, loading: true };                        // данные узлов читаются — кратко «Загрузка…»
      if (arm instanceof Set && arm.has(o.renderId)) return { available: false, reason: 'Реестр узлов не загрузился' };
      if (arm instanceof Set) return { available: false };                                 // по данным армирования нет — «не задано»
      return { available: false, reason: 'Реестр узлов не загрузился' }; } /* V12.9b: данных узлов нет — причина, как в 8c (не «Показать армирование» в подсказке) */
    if (stale && !A) return { available: true, loading: true }; /* V12.8 U4: карточка устарела, реестр узлов не готов — «Загрузка…», неактивна (не «недоступно» для нового тела) */
    if (A && A.rebarInfo) {
      const i = A.rebarInfo(o.renderId) || {}, st = (A.state && A.state()) || {};
      // §5.5 без Д1: при изоляции армирование скрыто движком — кнопка «выкл.», нажатие возвращает окружение (армирование снова видно).
      const hid = !FE().isolateSet && d1 === false && isoOn(); // E11: при isolateSet армирование изолируется вместе с телом — не скрыто
      // Число — только rebarInfo().count (B2 считает и виртуальные тела МУ по mu_rebar.js) — чтобы меню и кнопка не расходились (R1-05).
      // V12.1c: включено — строго rebarInfo(id).on (B2); перенос и снятие чужого наложения ведёт AtlasNodes.
      return { available: !!i.available, count: i.count, label: roleLabel(i), reason: i.reason || null, loading: !!(i.loading || st.loading), on: !hid && !!(i.available && (i.on != null ? i.on : st.rebar)),
        toggle: on => (hid && st.rebar ? ($('isolate').click(), null) : A.rebar(on, { id: o.renderId })) };
    }
    const x = extras.find(e => e.rebar);
    const r = x ? x.rebar : { available: false };
    // Реестр узлов ещё не загружен: связь есть — «Загрузка армирования…», загрузку запустить (наложение ведёт только AtlasNodes).
    // V12.8b (D V128-R1-01, за B3): реестр узлов ещё не готов (паспорт пришёл раньше) — «Загрузка…», а не «недоступно»; после atlas:nodes карточка перерисуется
    if (window.AtlasNodes && !A) { if (window.AtlasNodes.whenReady) window.AtlasNodes.whenReady(); return { available: true, loading: true, count: r.available ? r.count : undefined }; }
    return Object.assign({}, r, { on: typeof r.on === 'function' ? !!r.on() : !!r.on });
  }
  // V12.1c п. 2: подпись по ролям — готовая от B2 (label) или по разбивке roles {роль: число}:
  // только «Армирование» — «Армирование»; одна другая роль — её имя («Обвязка»); армирование и ещё одна — «Армирование и покрытие»; больше — «Армирование и детали».
  function roleLabel(i) {
    if (i && typeof i.label === 'string' && i.label) return i.label;
    const r = i && i.roles && typeof i.roles === 'object' ? Object.keys(i.roles).filter(k => i.roles[k] > 0) : [];
    if (!r.length) return 'Армирование';
    const arm = r.includes('Армирование'), other = r.filter(k => k !== 'Армирование');
    if (!other.length) return 'Армирование';
    if (!arm && other.length === 1) return other[0];
    if (arm && other.length === 1) return 'Армирование и ' + other[0].toLowerCase();
    return arm ? 'Армирование и детали' : 'Детали';
  }
  function rebarRender(o, extras, stale) {
    if (!REBAR_UI) return null;
    const r = rebarInfo(o, extras, stale);
    const n = r.available && r.count ? ' · ' + S.fmt(r.count) : '';
    const word = r.label || 'Армирование', low = word.charAt(0).toLowerCase() + word.slice(1);
    const label = r.loading ? 'Загрузка армирования…' : (r.on ? 'Скрыть' : 'Показать') + (word === 'Армирование' ? ' ' + low : ': ' + low) + n; // aria-label: «Показать армирование · 35», «Показать: обвязка · 137»
    const short = r.loading ? 'Загрузка…' : (r.on ? '✓ ' : '') + word + n;                       // видимая — коротко, одной строкой (макет D)
    rebarBtn.replaceChildren(make('span', { class: 'nw' }, short));
    rebarBtn.setAttribute('aria-label', label);
    rebarBtn.setAttribute('aria-pressed', String(!!r.on));
    if (r.loading) rebarBtn.setAttribute('aria-busy', 'true'); else rebarBtn.removeAttribute('aria-busy');
    const why = r.available || r.unknown ? '' : (r.reason || NO_REBAR); /* V12.9 W4: unknown — без причины */
    if (why || r.unknown || (r.loading && (stale || !N()))) rebarBtn.setAttribute('aria-disabled', 'true'); /* V12.9 W4: «Загрузка…» без реестра узлов — тоже неактивна */ else rebarBtn.removeAttribute('aria-disabled'); /* V12.8 U4; V12.8b: неактивна при загрузке только у устаревшей карточки; щелчок при загрузке и так ничего не делает */
    rebarBtn.title = why || label;
    if (why) rebarBtn.setAttribute('aria-label', /недоступно/i.test(why) ? why : 'Армирование недоступно: ' + why.charAt(0).toLowerCase() + why.slice(1)); /* V12.9 W4: без «недоступно … недоступно» */ else if (r.unknown) rebarBtn.setAttribute('aria-label', 'Армирование недоступно');
    if (why && !r.loading) rebarBtn.append(make('small', { class: 'card-rebar-sub', 'aria-hidden': 'true' }, why === NO_REBAR ? 'не задано' : 'недоступно'));   /* 1.0.19a К-1: причина под словом, без наведения; полный текст — в aria-label и title */
    rebarWhy.textContent = why; if (!why) rebarWhy.hidden = true;
    rebarBtn.hidden = why === NO_REBAR && !r.loading;   /* 1.1.1 A3: армирования у элемента по данным нет — кнопки в главном ряду нет (была пунктирная «не задано»); с армированием, «Загрузка…» и «недоступно» с причиной — как прежде */
    return r;
  }
  /* V12.7 S7: тело для кнопки армирования — выбранное; карточка устарела (выбор ≠ cur) — данные из AtlasNodes.rebarInfo, паспорт не нужен */
  const rebarTarget = () => { const s = selected(); if (cur && (!s || s.renderId === cur.o.renderId)) return { o: cur.o, extras: extrasOf(cur.o, cur.p) }; return s ? { o: s, extras: [], stale: true } : null; };
  const rebarRefresh = () => { const tg = rebarTarget(); if (tg) rebarRender(tg.o, tg.extras, tg.stale); };
  new MutationObserver(() => { if (!FE().isolateSet && d1 === false) rebarRefresh(); }).observe($('isolate'), { childList: true, characterData: true, subtree: true }); // изоляция меняет вид кнопки (§5.5); запасной путь
  document.addEventListener('atlas:isolate', () => { actsSync(); rebarRefresh(); }); // E11
  rebarBtn.addEventListener('click', () => {
    const tg = rebarTarget(); if (!tg) return; /* V12.7 S7: не прежнее тело */
    const r = rebarInfo(tg.o, tg.extras, tg.stale);
    if (!r.available) { rebarWhy.hidden = !rebarWhy.hidden || !rebarWhy.textContent; return; } // причина — строкой под рядом (телефон)
    if (r.loading || !r.toggle) return;
    const res = r.toggle(!r.on);
    rebarRender(tg.o, tg.extras, tg.stale);
    if (res && res.then) res.then(rebarRefresh, rebarRefresh);
  });
  for (const ev of ['atlas:rebarod', 'atlas:rebarlinks']) document.addEventListener(ev, rebarRefresh);
// состояние наложения — по atlas:node (§3.3)
  // Реестр узлов и смена узла меняют строку узла и «Состав» — карточку перерисовать (не чаще раза в кадр).
  // V12.2 (сбой уровень_выкл): событие узлов во время перерисовки (cur ещё null после снятия выбора в showLevel) не теряется —
  // кнопка армирования перечитывает rebarInfo() после каждой перерисовки и по каждому событию узлов и наложения.
  for (const ev of ['atlas:nodes', 'atlas:node', 'atlas:nodesfailed']) document.addEventListener(ev, () => { if (cur) { current = null; schedule(); rebarRefresh(); } });
  document.addEventListener('atlas:overlay', () => { if (cur) rebarRefresh(); });
  // §5.5: изоляция при включённом армировании. Без правки движка Д1 изоляция прячет армирование:
  // вне узла — открыть узел с армированием; в узле — изоляция и сообщение.
  let d1 = null; // null — неизвестно; true/false — по первой пробе
  function isolateClick() {
    const iso = $('isolate'); if (!iso) return;
    const tg = rebarTarget(), r = tg ? rebarInfo(tg.o, tg.extras, tg.stale) : null; /* V12.7 S7 */
    const isolating = !isoOn();
    // E11: армирование включено — изолировать набор «тело + наложение армирования» (видно в изоляции); проба Д1 не нужна
    if (FE().isolateSet && isolating && r && r.on) { const ov = (window.__ATLAS.overlayState('rebar') || {}).ids || []; window.__ATLAS.isolate([tg.o.renderId, ...ov]); return; }   /* 1.0.16 B3-5 (A2): только слой армирования, не все наложения («По РД») */
    if (!isolating || !r || !r.on || d1 === true) { iso.click(); return; }
    const A = N(), k = A && A.of ? A.of(tg.o.renderId) : null, st = A && A.state ? A.state() : {};
    if (d1 === false && A && k && st.k !== k) { A.open(k, { rebar: true, select: tg.o.renderId }); return; }
    iso.click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let vis = 2; try { vis = window.__R23.summary().visible; } catch (e) { /* нет данных */ }
      d1 = vis > 1;
      if (!d1) window.AtlasViewSettings && window.AtlasViewSettings.toast('При изоляции элемента армирование скрывается — ограничение движка');
      rebarRefresh();
    }));
  }
  // V12.2 · M3 (макет D V12_2_КуР): окружение этажа у узлов Ку/Р — только через API B2 AtlasNodes.context(k) / contextState().
  // Во «Всём здании» — кнопка «Окружение видно на уровне N ›» (переход на уровень + наложение), на уровне — «Окружение этажа · вкл/выкл»;
  // ctx = [] — «Пакета этажа нет — показа нет» с причиной из данных. Связь с конкретным проёмом не показываем — её нет в данных.
  const envTag = make('div', { class: 'card-envtag', hidden: true, role: 'status' });
  let envBusy = false;
  // V12.3 · E16: тело по id — __ATLAS.get (копия полей); без features.objectGet — поиск по allWorld()
  const objGet = id => (FE().objectGet ? window.__ATLAS.get(id) : ((window.__FULL_ATLAS && window.__FULL_ATLAS.allWorld()) || []).find(y => y.renderId === id) || null);
  /* К1-B3: тела окружения — id из AtlasNodes.contextState().ids; номер пакета — id без приставки слоя (ATLAS_REVISIONS_META.layers[].record_prefix набора объекта), название — по полному id */
  const layerPrefixes = () => ((((window.ATLAS_REVISIONS_META || {}).layers) || []).map(x => x && x.record_prefix).filter(Boolean));
  const stripLayer = id => { const s0 = String(id), p = layerPrefixes().find(x => s0.startsWith(x)); return p ? s0.slice(p.length) : s0.replace(/^[^:]+::/, ''); }; /* без набора слоёв — общая форма id «<набор>::<номер>» */
  const ctxName = id => { const x = objGet(id); return x && x.name ? x.name.split(/,\s*\d\s*этаж|\s+—\s+/)[0].trim() : ''; }; // название пакета из модели, без «, N этаж — размещение …»
  function envRender(o) {
    envBox.hidden = true; envBox.replaceChildren(); envBox.className = 'card-env card-section'; right.classList.remove('has-env');
    const A = N(), k = o && A && A.of ? A.of(o.renderId) : null, n = k && A.get ? A.get(k) || {} : {};
    const cs = A && A.contextState ? A.contextState() || {} : {}, sc = scopeNow();
    envTagSync(cs, sc, k ? n : null);
    if (!k || !A.context || !Array.isArray(n.ctx)) return;
    envBox.hidden = false;
    let ls = null; try { ls = A.levelScope ? A.levelScope(k) : null; } catch (e) { ls = null; }
    if (!n.ctx.length || !ls) {
      envBox.classList.add('card-env--none');
      const t = make('span'); t.append(make('b', {}, 'Пакета этажа нет — показа нет.'), document.createTextNode(n.ctx.length ? ' Уровень узла не найден.' : n.ctx_why && !/^пакета этажа нет[\s—-]*показа нет\.?$/i.test(n.ctx_why.trim()) ? ' ' + n.ctx_why : n.lev ? ' Уровень: ' + n.lev + '.' : ''));
      envBox.append(ic('info', 'icon--16'), t);
      return;
    }
    const lev = n.lev || '', onLevel = sc === ls, on = onLevel && !!cs.on && cs.scope === sc;
    const btn = make('button', { type: 'button', class: 'card-envb' });
    if (envBusy) btn.setAttribute('aria-busy', 'true');
    // Свёрнутая шторка 390 — короткая подпись «Окружение» в строке заголовка (≤ 230 px), полная — в aria-label и в развёрнутой.
    const full = !onLevel ? 'Окружение видно на уровне ' + lev : 'Окружение этажа' + (on ? ' · вкл' : '');
    btn.setAttribute('aria-label', !onLevel ? full + ' — перейти на уровень' : full);
    if (!onLevel) btn.append(ic('layers'), make('span', { class: 'card-envb-full' }, full), make('span', { class: 'card-envb-short' }, 'Окружение'), ic('chevron-right', 'icon--16 card-envb-full'));
    else { btn.setAttribute('aria-pressed', String(on)); btn.append(ic('layers'), make('span', { class: 'card-envb-full' }, full), make('span', { class: 'card-envb-short' }, 'Окружение' + (on ? ' ✓' : ''))); }
    right.classList.add('has-env');
    btn.onclick = () => {
      if (envBusy) return; envBusy = true; btn.setAttribute('aria-busy', 'true');
      Promise.resolve(on ? A.context(null) : A.context(k)).then(r => {
        envBusy = false;
        if (r && r.ok === false) { const why = make('p', { class: 'card-note card-note--warn' }, r.reason || 'Показ недоступен'); envRender(cur && cur.o); envBox.append(why); return; }
        envRender(cur && cur.o);
      }, () => { envBusy = false; envRender(cur && cur.o); });
    };
    const pk = n.ctx.join(', ');
    envBox.append(btn, make('p', {}, !onLevel
      ? 'Переход на уровень «' + lev + '»: узел, перегородки и двери этажа — полупрозрачно. Выбор и армирование сохраняются.'
      : lev + ': пакеты «По РД» ' + pk + ' — полупрозрачно, выбор и армирование не меняются. Выход — «Всё здание» или повторное нажатие.'));
  }
  // Подпись на сцене при включённом окружении: «Окружение · <уровень>» и пакеты с названиями из модели.
  function envTagSync(cs, sc, n) {
    const on = !!(cs && cs.on && cs.scope === sc);
    if (!on) { envTag.hidden = true; return; }
    const st = document.querySelector('.stage'); if (st && envTag.parentElement !== st) st.append(envTag);
    const ids = (cs.ids || []).map(String);
    envTag.replaceChildren(ic('layers', 'icon--16'), make('b', {}, 'Окружение' + (n && n.lev ? ' · ' + n.lev : '')));
    const list = make('span'); ids.forEach((p, i) => { if (i) list.append(make('br')); list.append(document.createTextNode(stripLayer(p) + (ctxName(p) ? ' — ' + ctxName(p) : ''))); });
    envTag.append(list); envTag.hidden = false;
  }
  document.addEventListener('atlas:context', () => { envRender(cur && cur.o); });
  function nodeRender(o) {
    const A = N();
    nodeAction = null; mNode.hidden = true; nodeLine.hidden = true; nodeLine.replaceChildren();
    if (!A || !A.of) return;
    const k = A.of(o.renderId); if (!k) return;
    const n = (A.get && A.get(k)) || {}, st = (A.state && A.state()) || {}, label = n.l || k;
    // Узел открыт — по AtlasNodes.state() или по разделу дерева узла (переход из меню / по ссылке TREE:n:<k>).
    const sc = scopeNow();
    const open = st.k === k || (!!n.tree && sc === 'TREE:' + n.tree), anchor = (n.anchors || []).includes(o.renderId);
    // V12.1c п. 4: число армирования в строке узла — то же, что на кнопке: rebarInfo(k).count
    const ri = (() => { try { return A.rebarInfo ? A.rebarInfo(k) || {} : {}; } catch (e) { return {}; } })(), rbc = ri.available && ri.count > 0 ? ri.count : 0, rbl = roleLabel(ri);
    const go = (text, fn) => { const b = make('button', { type: 'button', class: 'card-link card-node-go' }, text); b.onclick = fn; return b; };
    if (open && anchor) nodeLine.append(document.createTextNode('Узел ' + label + (Number.isFinite(n.n) ? ' · ' + S.fmt(n.n) + ' ' + S.plural(n.n, 'элемент', 'элемента', 'элементов') : '') + (rbc ? ' · ' + (rbl || 'армирование').toLowerCase() + ' ' + S.fmt(rbc) : '')));
    else if (open) {
      const c = st.count || {}, total = c.scene || n.n || 0; // count.scene уже включает армирование
      nodeLine.append(document.createTextNode('В узле ' + label + (total ? ' · ' + S.fmt(total) + ' ' + S.plural(total, 'элемент', 'элемента', 'элементов') + ' ' : ' ')), go('→ К узлу', () => A.open(k, { select: (n.anchors || [])[0] })));
    } else {
      nodeLine.append(document.createTextNode('В узле ' + label + ' '), go('→ Открыть узел', () => A.open(k, { select: o.renderId })));
      nodeAction = () => A.open(k, { select: o.renderId }); mNode.querySelector('span').textContent = 'Открыть узел целиком'; mNode.hidden = false;
    }
    // R2-01 (§5.1): у открытого узла — «Показать на уровне <уровень>»: группа уровня в дереве (предок группы узла), выбран якорь; армирование держит AtlasNodes.
    // R2-01 / V12.1c п. 5: у открытого узла — «Показать на уровне <уровень>»: один вызов AtlasNodes.showLevel(k) (B2) —
    // раздел уровня, якорь, армирование сохраняется; пункт — только если levelScope(k) не null.
    if (open && A.showLevel && A.levelScope) {
      let ls = null; try { ls = A.levelScope(k); } catch (e) { ls = null; }
      if (ls) { nodeAction = () => A.showLevel(k); mNode.querySelector('span').textContent = 'Показать на уровне ' + (n.lev || ''); mNode.hidden = false; }
    }
    const conflicts = (window.ATLAS_NODES_DATA && window.ATLAS_NODES_DATA.conflicts) || (A.conflicts && A.conflicts()) || [];
    if (conflicts.some && conflicts.some(c => c && c.id === o.renderId)) nodeLine.append(make('span', { class: 'card-node-warn' }, ' · Привязка спорная'));
    const txtBox = make('span', { class: 'card-node-t' }); txtBox.append(...nodeLine.childNodes);
    nodeLine.append(ic('node'), txtBox);
    nodeLine.hidden = false;
  }
  // V12.1d п. 2: число тел роли — как counter() в atlas-nodes.js (B2): обычные тела — по одному; тело армирования — n.bars или bars_total,
  // узел армирования — count из данных армирования (иначе 1).
  function roleCount(ids, n) {
    /* К1-B3: тела армирования и узлов — по составу данных армирования объекта (AtlasRebar.data(): bodies / nodes), без приставок id */
    const M = (window.AtlasRebar && window.AtlasRebar.data && window.AtlasRebar.data()) || {};
    const B = new Map((M.bodies || []).map(x => [x.renderId, x])), NN = new Map((M.nodes || []).map(x => [x.renderId, x]));
    const reb = ids.filter(id => B.has(id));
    let c = ids.filter(id => !B.has(id) && !NN.has(id)).length;
    if (reb.length) c += n && n.bars != null ? +n.bars : reb.reduce((s, id) => s + ((B.get(id) || {}).bars_total || 1), 0);
    for (const id of ids.filter(x => NN.has(x))) { const v = NN.get(id); c += v && Number.isFinite(v.count) ? v.count : 1; }
    return c;
  }
  // п. 3: «Состав узла» — роли с числами из реестра (AtlasNodes.get(k).roles); щелчок — первое тело роли, «×N» — список.
  function compositionRender(o) {
    const A = N(), k = A && A.of ? A.of(o.renderId) : null, n = k && A.get ? A.get(k) : null;
    const roles = n && n.roles ? Object.entries(n.roles).filter(([, ids]) => ids && ids.length) : [];
    if (!roles.length) return;
    const box = make('div', { class: 'card-comp' });
    // R1-04 (ревью D): строки ролей — подпись роли (ссылка — первое тело), справа число; «×N» раскрывает список тел.
    box.append(make('p', { class: 'card-comp-h' }, 'Состав узла ' + (n.l || k)));
    const g = make('div', { class: 'card-comp-rows', role: 'list' });
    const nameOf = id => { try { const x = objGet(id); return x ? (human(x).title || x.name) : (ID_PREFIX && id.startsWith(ID_PREFIX) ? id.slice(ID_PREFIX.length) : id); } /* К1-B3: card.id_prefix */ catch (e) { return id; } };
    const pick = (role, id) => {
      const inScene = (() => { try { return FE().objectGet ? window.__ATLAS.inScene(id) : (window.__ATLAS.sceneObjects() || []).some(x => x.renderId === id); } catch (e) { return false; } })();
      if (inScene) { try { window.__ATLAS.select(id); } catch (e) { /* нет */ } }
      else A.open(k, { rebar: role === 'Армирование', select: id });
    };
    for (const [role, ids] of roles) {
      const cnt = roleCount(ids, n); // V12.1d п. 2: тела роли, как counter() у B2 (виртуальные МУ — по данным)
      // R2-02: строка роли — одна цель: одно тело — выбрать его; несколько — раскрыть список тел (в нём — выбор).
      const list = make('div', { class: 'card-comp-list', hidden: true });
      const row = make('button', { type: 'button', class: 'card-comp-row', 'aria-label': role + ' · ' + S.fmt(cnt) + (ids.length > 1 ? ' — показать список' : ' — выбрать') });
      row.append(make('span', { class: 'card-comp-role' }, role), make('span', { class: 'card-comp-n' }, (cnt > 1 ? '×' : '') + S.fmt(cnt)));
      if (ids.length > 1) {
        row.setAttribute('aria-expanded', 'false');
        row.onclick = () => {
          const open = list.hidden; list.hidden = !open; row.setAttribute('aria-expanded', String(open));
          if (open && !list.children.length) list.append(...ids.slice(0, 60).map(id => { const b = make('button', { type: 'button', class: 'card-link' }, nameOf(id)); b.onclick = () => pick(role, id); return b; }));
        };
      } else row.onclick = () => pick(role, ids[0]);
      g.append(row, list);
    }
    box.append(g);
    const conflicts = (A._R && A._R.conflicts) || [];
    if (conflicts.some(c => c && c.id === o.renderId)) box.append(make('p', { class: 'card-note card-note--warn' }, 'Привязка спорная'));
    if (extraBox.hidden) { box.querySelector('.card-comp-h').remove(); extraBox.replaceChildren(make('h3', { id: 'cardXBlockH' }, 'Состав узла ' + (n.l || k))); extraBox.hidden = false; extraBox.append(box); }
    else extraBox.querySelector('h3').after(box);
  }
  /* 1.0.7: метка «модельное решение» (значения derived / model_only) */
  const modelChip = pv => make('span', { class: 'card-model', title: [(ST() && ST().MODEL_HINT) || '', pv || ''].filter(Boolean).join('\n') }, 'модельное решение');
  function stampRows(rows) {
    const g = make('dl', { class: 'card-grid card-stamp' });
    for (const r of rows) {
      const dd = make('dd');
      if (F_OF[r.label]) dd.dataset.f = F_OF[r.label];
      if (r.fs) dd.classList.add('card-fs--' + r.fs); /* К1-B3: статус поля */
      if (r.vtitle) dd.title = r.vtitle; /* 1.0.1 п. 8: значение-объект — полный JSON в подсказке */
      const whole = MONO_WHOLE.test(r.label);
      if (r.node) dd.append(r.node);
      else if (r.href) dd.append(make('a', { class: whole ? 'mono' : null, href: r.href, target: /\.pdf/i.test(r.href) ? '_blank' : null, rel: /\.pdf/i.test(r.href) ? 'noopener' : null }, r.value)); else if (Array.isArray(r.lines)) for (const t of r.lines) dd.append(make('span', { class: 'card-line' }, t)); else monoText(dd, r.value, whole);
      if (r.ev) dd.append(r.ev);   /* 1.2: основание значения — кнопка фрагмента листа (AtlasEvidence) */
      if (r.model) dd.append(modelChip(r.prov)); /* 1.0.7: метка «модельное решение» после значения; К3 — источники в подсказке */
      if (Array.isArray(r.quals)) for (const q of r.quals) dd.append(make('small', { class: 'card-qual' }, q)); /* R248 п.5 */
      if (r.extra) {
        const x = make('span', { class: 'card-extra' });
        { const k = S.SIG[r.extra.remark && r.extra.remark.significance] || 'low'; x.append(ic('sig-' + k, 'card-extra--' + k), document.createTextNode(r.extra.text)); }
        if (r.extra.remark) { x.append(document.createTextNode(' · ')); x.append(make('a', { class: 'mono', href: 'RD_REMARKS.html#id=' + encodeURIComponent(r.extra.remark.id) }, r.extra.remark.id)); }
        dd.append(x);
      }
      { const dt = make('dt', { title: r.title || null, class: r.raw ? 'pp-key-raw' : null }, r.label); if (r.raw) (e=>{const t=e.textContent;if(t.indexOf('_')<0)return;const a=t.split('_');e.replaceChildren();a.forEach((s,i)=>{e.append(s+(i<a.length-1?'_':''));if(i<a.length-1)e.append(document.createElement('wbr'));});})(dt); g.append(dt, dd); } /* 1.0.1 (B3): ключ без подписи — перенос в своей колонке; 1.0.15 B3-7: перенос после «_» */
    }
    return g;
  }
  // M13: габарит модели — длина × ширина × высота, м: высота — по вертикальной оси модели (Z), длина — большая из горизонтальных (X, Y), ширина — меньшая.
  const dimText = bb => { const d = [0, 1, 2].map(k => bb[1][k] - bb[0][k]), L = Math.max(d[0], d[1]), W = Math.min(d[0], d[1]), f = v => nf(v, v < 1 ? 3 : 2); return f(L) + ' × ' + f(W) + ' × ' + f(d[2]) + ' м'; };
  // V12.2 · D4 (2): тела отделки и слоёв A отвела на 3–6 мм; исходные границы — в поле bounds_rd (метаданные тела или паспорт).
  // Габарит и отметки «по модели» — по ним, если они есть; иначе — по габаритной коробке геометрии.
  const rdB = x => (x && (x.bounds_rd || (x.albumRecord || {}).bounds_rd)) || null; // исходные границы — в метаданных тела (albumRecord), в паспорте их нет
  const okB = bb => Array.isArray(bb) && bb.length === 2 && bb.every(r => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite));
  let drawingOwner = null, drawingDisabled = true;
  function syncDrawingSelection(renderId) {
    const stale = renderId !== drawingOwner;
    for (const button of [drawBtn, mDraw]) button.disabled = stale || drawingDisabled;
    if (!stale || drawList.hidden) return;
    drawList.hidden = true;
    for (const button of [drawBtn, mDraw]) button.setAttribute('aria-expanded', 'false');
  }
  function setDrawing(plan, renderId) {
    drawingOwner = renderId;
    drawingDisabled = !!plan.disabled;
    const canOpen = () => !plan.disabled && selected()?.renderId === renderId;
    for (const b of [drawBtn, mDraw]) {
      const label = (ALBUM_PDF_RE ? plan.label.replace(ALBUM_PDF_RE, ALBUM_PDF_SHORT + ' ↗') : plan.label).replace(/^Открыть чертёж/, 'Чертёж'); /* К1-B3: card.album_pdf_label */ // V12.1: коротко (макет D)
      b.replaceChildren(ic(plan.disabled ? 'info' : 'sheet'), make('span', {}, label));
      b.setAttribute('aria-label', plan.label); if (!b.title) b.title = plan.label;
      b.disabled = !!plan.disabled;
      b.title = plan.title || '';
      if (plan.list) b.setAttribute('aria-expanded', 'false'); else b.removeAttribute('aria-expanded'); // V121d-02
      b.onclick = () => {
        if (!canOpen()) return;
        if (plan.href) { if (/\.pdf(#|$)/i.test(plan.href)) window.open(pkgUrl(plan.href), '_blank', 'noopener'); else location.href = plan.href; return; }
        if (plan.keys) { openSource(plan.keys[0], plan); return; }
        if (plan.list) {
          const open = drawList.hidden; drawList.hidden = !open;
          for (const x of [drawBtn, mDraw]) x.setAttribute('aria-expanded', String(open));
          // V12.1e п. 5: на телефоне свёрнутая шторка прячет список — развернуть её до списка.
          if (open && innerWidth <= 850 && !right.classList.contains('expanded')) { right.classList.add('expanded'); handle.setAttribute('aria-expanded', 'true'); requestAnimationFrame(() => drawList.scrollIntoView({ block: 'nearest' })); }
        }
      };
    }
    drawList.replaceChildren();
    drawList.hidden = true;
    if (plan.list) {
      const all = window.__FULL_ATLAS.sourceAvailability();
      for (const k of plan.list) {
        const s = all[k];
        const b = make('button', { type: 'button', class: 'card-drawitem' }, s.title);
        b.append(make('small', {}, (s.printed_sheet ? 'лист ' + s.printed_sheet : 'лист не указан') + (s.pdf_page ? ' · PDF ' + s.pdf_page : '')));
        b.onclick = () => { if (canOpen()) window.__FULL_ATLAS.source(k); };
        drawList.append(b);
      }
    }
  }
  // id из адреса запоминается сразу: снятие выбора при старте убирает его из адреса (replaceState).
  const hashId = () => new URLSearchParams(location.hash.slice(1)).get('id');
  let wantedId = hashId(), atlasReady = false, autoJumped = null; /* 1.0.6 п. 1: autoJumped — #id уже переведён в свой раздел */
  function notFoundSync() {
    const box = empty.querySelector('.card-notfound');
    const id = wantedId;
    if (!id) { if (!box.hidden) box.hidden = true; return; } // обычный запуск без #id — ничего не делать
    const ready = atlasReady; // не __ATLAS.state(): это полный опрос сцены (≈1 с процессора на телефоне ×4)
    let missing = false, hit = null;
    if (ready && !selected()) {
      missing = true;
      // Есть ли объект вообще — дёшево (project → null, если id нет); роль — только для редкого случая «объект есть, но не в здании».
      try { if (window.__ATLAS.project(id)) hit = (window.__ATLAS.objects() || []).find(x => x.renderId === id) || null; } catch (e) { hit = null; }
    }
    box.hidden = !missing;
    box.replaceChildren();
    if (!missing) return;
    // Объект есть, но не в здании (роль не album_world) — только в проверочной сцене; есть в здании, но не в этом разделе — переход к нему.
    if (hit && hit.role === 'album_world') {
      /* 1.0.6 п. 1: элемент есть в здании, но в другом разделе (проёмы-пустоты в HELPERS) — переход в его раздел сразу, один раз; не вышло — строка с кнопкой, как раньше */
      if (autoJumped !== id && window.__R23 && typeof window.__R23.jump === 'function') { autoJumped = id; box.hidden = true; try { window.__R23.jump(id); return; } catch (e) { box.hidden = false; } }
      box.append(document.createTextNode('Элемент «' + id + '» не входит в текущий раздел. '));
      const go = make('button', { type: 'button', class: 'card-btn card-btn--outline' }, 'Показать элемент');
      go.onclick = () => { if (window.__R23 && window.__R23.jump) window.__R23.jump(id); };
      box.append(go);
    } else box.textContent = 'Элемент «' + id + '» '+atSite+' не найден' + (hit ? ': он есть только в проверочной сцене (режим проверки).' : '.');
    if (missing) { right.classList.add('open'); }
  }
  // E2: «не найден» — когда сцена раздела готова (whenReady / atlas:sceneready); без них — прежние 400 мс.
  const afterScene = () => { if (!wantedId) return; if (FE().whenReady) { const go = () => window.__ATLAS.whenReady().then(r => (r && r.cancelled && !FE().whenReadyLatest ? go() : wantedId && notFoundSync())); go(); } /* E2b: whenReadyLatest — без повтора */ else setTimeout(notFoundSync, 400); };
  window.addEventListener('hashchange', () => { wantedId = hashId(); afterScene(); });
  document.addEventListener('atlas:sceneready', e => { if (wantedId && !(e.detail && e.detail.partial)) notFoundSync(); });
  document.addEventListener('atlas:deselect', () => { if (wantedId && !FE().selectionChange) setTimeout(notFoundSync, 0); }); // §3: при selectionChange — только по нему (иначе дважды)
  document.addEventListener('atlas:selectionchange', e => { if (wantedId && e.detail && e.detail.id == null) setTimeout(notFoundSync, 0); }); // E8: B2 не шлёт atlas:deselect при features.selectionChange
  document.addEventListener('atlas:ready', () => { atlasReady = true; afterScene(); });
  function renderEmpty() {
    right.classList.remove('is-loading'); right.removeAttribute('aria-busy'); loadTag.hidden = true;
    delete right.dataset.cardFor; // «Сводка» — метки нет
    generation++;
    current = null;
    if (wantedId) setTimeout(notFoundSync, 0);
    right.classList.add('is-empty');
    cur = null;
    envBox.hidden = true; envBox.replaceChildren(); right.classList.remove('has-env'); envTagSync(N() && N().contextState ? N().contextState() : {}, scopeNow(), null);
    // V12.2 S2: выбора нет — скрытая кнопка армирования сброшена (после автовыключения не остаётся «✓ … · N», pressed=true).
    rebarBtn.replaceChildren(make('span', { class: 'nw' }, 'Армирование')); rebarBtn.setAttribute('aria-pressed', 'false');
    rebarBtn.removeAttribute('aria-busy'); rebarBtn.removeAttribute('aria-disabled'); rebarBtn.setAttribute('aria-label', 'Показать армирование'); rebarBtn.title = '';
    rebarWhy.hidden = true;
    right.classList.remove('has-remarks', 'expanded');
    copyBtn.disabled = true;
    // «Сводка»: закрывать нечего — «ссылка» и «×» скрыты.
    eyebrow.textContent = 'Сводка'; announceSel(null);
    copyBtn.hidden = true; closeBtn.hidden = true;
    moreOpen(false);
  }
  /* 1.0.9: файл имён пришёл после отрисовки — открытая карточка перерисовывается (прежняя не показывается: generation в render) */
  document.addEventListener('atlas:display', () => { if (current) render(current, true); });   // 1.0.12: имена пришли после первого кадра — перерисовка «мягкая»: тело карточки не очищается, «Загрузка…» не показывается (регресс 1.0.11, r1_check М3 / Фс2)
  // 1.0.19a (владелец 24.10, п. 13): КС-2/КС-3, RFI, PGS в тексте карточки — с расшифровкой в подсказке, assets/atlas-abbr.js.
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
  async function render(o, soft) {
    const my = ++generation;
    if (!abbrOn) { abbrOn = true; abbrWatch(right); }   // 1.0.19a: при первой карточке, не в первом кадре
    soft = !!soft && current === o;   // мягкая перерисовка — только того же тела
    if (!soft) { delete right.dataset.cardFor; cutBox = null; cutSync(); } // V12.2: метка готовности — снята, пока карточка не отрисована для нового тела; V12.5 Q9: «Показать срезом» прошлого тела не доступен, пока новое не отрисовано
    current = o;
    syncDrawingSelection(o.renderId);
    try { rebarRender(o, [], true); } catch (e) { /* после паспорта */ } /* V12.8 U4: и без реестра узлов — «Загрузка…», не кнопка прежнего тела */ /* V12.7 S7: кнопка армирования — сразу для нового тела */
    wantedId = null; // выбран элемент — прежний запрос по адресу больше не актуален
    empty.querySelector('.card-notfound').hidden = true;
    right.classList.remove('is-empty');
    copyBtn.disabled = false;
    right.classList.remove('is-loading'); right.removeAttribute('aria-busy'); // V12.4 P6: состояние «загрузка» прошлого выбора не переносится
    eyebrow.textContent = 'Карточка элемента'; // V12.1: шапка как в V11.5
    copyBtn.hidden = false; closeBtn.hidden = false;
    let p = {}, cur_sl = [];
    if (!soft && ST() && ST().displayTitle && window.__ATLAS_DISPLAY__) { for (const b of [ownBox, ctxBox, gaBox, origBox]) if (b.parentNode) b.remove(); facts.replaceChildren(); chars.replaceChildren(); mainBox.replaceChildren(); } /* R248 п.2: прежние свои поля, контекст и факты не видны, пока ждём паспорт */
    // V12.3: паспорт нового тела не пришёл за 120 мс — «Загрузка…» и приглушённое тело карточки (прежние числа не выдаются за новые); быстро — без мигания
    // U2: название нового тела — сразу (TYPES загружены — итоговое совпадёт, без мигания); числа — после паспорта
    if (TYPES) { try { title.textContent = (ST() && ST().displayTitle && ST().displayTitle(o.renderId)) || human(o, (typeOf(o) || {}).mark).title; } catch (e) { /* после паспорта */ } } /* 1.0.9: отображаемое имя — сразу */
    announceSel(o, TYPES ? title.textContent : '');   /* 1.0.19a К-3: объявление выбора — сразу, до паспорта (поля — из метаданных тела) */
    const busyT = soft ? 0 : setTimeout(() => { if (my === generation) { right.classList.add('is-loading'); right.setAttribute('aria-busy', 'true'); eyebrow.textContent = 'Загрузка…'; loadTag.hidden = false; } }, 120);   // 1.0.12: и пометка у названия — видна в свёрнутой шторке (390)
    try { [p] = await Promise.all([window.AtlasPassports.get(o).then(x => x || {}), ensureData()]); } catch (e) { p = {}; await ensureData(); }
    clearTimeout(busyT);
    if (my === generation) { right.classList.remove('is-loading'); right.removeAttribute('aria-busy'); eyebrow.textContent = 'Карточка элемента'; loadTag.hidden = true; }
    if (my !== generation) return;
    const PS0 = window.__ATLAS && window.__ATLAS.partSelection ? window.__ATLAS.partSelection() : null, PSEL = PS0 && PS0.id === o.renderId ? PS0 : null;   /* 1.0.16 B3-1 (A1): выбрана часть внутри тела (движок, partSelection) */
    let t = typeOf(o);
    if (!t && p.dimensions_verified_from_spec) t = { own: true, mark: null, dimensions_verified_from_spec: p.dimensions_verified_from_spec, mass_kg: p.mass_kg, mass_computed_kg: p.mass_computed_kg };
    const h = human(o, t && t.mark);
    const extras = (window.AtlasCardExtra || []).map(f => { try { return f(o, p) || null; } catch (e) { return null; } }).filter(Boolean);
    const xPath = (extras.find(x => x.path) || {}).path; // путь и метка вида от модуля (например, «<раздел армирования> · <уровень>»)
    title.textContent = h.title;
    /* 1.0.9: отображаемое имя (display_titles) — последним; исходное — строкой «Исходное имя» (ID, марка, авторское имя) */
    { const dt = ST() && ST().displayTitle ? ST().displayTitle(o.renderId) : null; if (dt) { title.textContent = dt; const mk = [p.mark, t && t.mark].find(x => typeof x === 'string' && x.trim()); origBox.replaceChildren(document.createTextNode('Исходное имя: '), make('span', { class: 'mono' }, o.renderId), document.createTextNode([mk ? ' · ' + mk : '', h.title && h.title !== dt ? ' · ' + h.title : ''].join(''))); if (origBox.parentNode !== titleBox) title.after(origBox); } else if (origBox.parentNode) origBox.remove(); }
    idLine.textContent = o.renderId; idLine.hidden = !!(origBox.parentNode && origBox.textContent.includes(o.renderId));
    const parentTitle = title.textContent; if (PSEL) title.textContent = PSEL.title || PSEL.part;   /* 1.0.16 B3-1: заголовок — имя части; имя сети — в плашке */
    path.textContent = xPath || h.path;
    path.hidden = !path.textContent;
    /* 1.0.7: часть записи (паспорт части = поля записи-родителя + свои render_id, geometry): плашка со ссылкой на родителя, поля родителя — «Контекст записи» */
    const PART = PSEL ? (p && typeof p.id === 'string' && p.id ? p.id : o.renderId) : (p && typeof p.id === 'string' && typeof p.render_id === 'string' && p.render_id !== p.id ? p.id : null);
    if (PSEL) { const a = make('a', { href: '#', class: 'card-part-parent', title: 'Вернуться к записи целиком' }, parentTitle || o.renderId); a.onclick = ev => { ev.preventDefault(); try { window.__ATLAS.selectPart(o.renderId, null); } catch (e) { /* */ } }; partBox.replaceChildren(document.createTextNode('Деталь записи '), a, document.createTextNode(' · часть ' + (PSEL.index + 1) + ' из ' + PSEL.count)); if (partBox.parentNode !== titleBox) path.after(partBox); }   /* 1.0.16 B3-1: ссылка — к сети (часть снимается) */
    else if (PART) {
      const inWorld = (() => { try { return ((window.__FULL_ATLAS && window.__FULL_ATLAS.allWorld()) || []).some(x => x.renderId === PART); } catch (e) { return false; } })();
      const a = make('a', { class: 'mono', href: inWorld ? '#id=' + encodeURIComponent(PART) : 'library.html#q=' + encodeURIComponent(PART) }, PART);
      const role = p.render_id.indexOf('::') > 0 ? p.render_id.slice(p.render_id.indexOf('::') + 2) : '';
      partBox.replaceChildren(document.createTextNode('Деталь записи '), a, document.createTextNode(role ? ' · ' + role : ''));
      const g = p.geometry && typeof p.geometry === 'object' && !Array.isArray(p.geometry) ? p.geometry : {};
      if (/derived/i.test(String((g.asset || {}).body_kind || '')) || (Array.isArray(g.obj_header) && g.obj_header.some(x => /representation:\s*DERIVED/i.test(String(x)))) || /DERIVED/.test(p.render_id)) partBox.append(modelChip());
      if (partBox.parentNode !== titleBox) path.after(partBox);
    } else if (partBox.parentNode) partBox.remove();
    { const og = ST() && ST().origin ? ST().origin(o.albumRecord, p) : null; /* 1.0 · происхождение геометрии — первым */ const sl = (og ? [og] : []).concat(ST() ? ST().of(o.albumRecord, p) : []); statusBox.replaceChildren(); statusBox.hidden = true; statusBox.remove(); cur_sl = sl; }   /* 1.3.0 · план п. 6.3: чипы «локальная геометрия», «геометрия не принята» — строками блока «Откуда данные» */ /* К1-B3 */
    // Метки
    badgeBox.replaceChildren();
    const bl = o.role === 'album_world' ? badges(p, o) : [];
    const tags = extras.filter(x => x.tag).map(x => x.tag).concat(bl.filter(x => x[1] === 'state').map(x => x[0]));
    for (const label of tags) badgeBox.append(make('span', { class: 'card-badge card-badge--state' }, label));
    badgeBox.classList.toggle('card-status--tag', tags.length > 0);
    const NFM = bl.some(x => /^не для изготовления$/i.test(x[0]));   /* 1.3.0 · план п. 6.5 */
    footNote.textContent = NFM ? 'Не для изготовления. Модель — для просмотра и сверки с документацией.' : ''; footNote.hidden = !NFM;
    const rest = bl.filter(x => x[1] !== 'state' && !/^не для изготовления$/i.test(x[0])).map(x => x[0]);
    if (rest.length) {
      const info = make('button', { type: 'button', class: 'card-info', 'aria-label': 'Ограничения и примечания', title: 'Ограничения и примечания' });
      info.append(ic('info'));
      info.onclick = () => { notesD.open = true; right.classList.add('expanded'); notesD.scrollIntoView({ block: 'nearest' }); };
      const t = rest.map((x, i) => i ? x.charAt(0).toLowerCase() + x.slice(1) : x).reduce((a, x, i) => !i ? x : a + (/^не для изготовления$/i.test(x) ? ' — ' : ' · ') + x, '');   /* 1.0.19a К-1: «Привязка условная — не для изготовления», строкой целиком (atlas-card.css) */
      badgeBox.append(make('span', { class: 'card-status-t', title: t }, t), info);
    }
    badgeBox.hidden = !badgeBox.children.length;
    // Характеристики
    const c = characteristics(p, t);
    const DP = PSEL ? {} : (ST() && ST().displayProps ? ST().displayProps(o.renderId, p) : null), OWN = PSEL ? (PSEL.rows || []).map(r => ({ key: r[0] === 'Материал' ? 'material' : r[0], label: r[0], value: String(r[1]), fs: r[2] === 'unknown' ? 'unknown' : null, model: r[2] === 'model', prov: '', quals: [] })) : (DP ? ownRowsOf(DP) : []),   /* 1.0.16 B3-1: «Свойства части» — строки части (данные parts) */ ownMat = OWN.find(r => r.key === 'material') || null; /* R248 */
    if (DP && !PART) for (const r of OWN) { const i = c.rows.findIndex(x => x.label === r.label); if (i >= 0) c.rows[i] = r; } /* запись со своими свойствами — свои поверх данных */
    for (const x of extras) for (const r of (x.rows || []).slice().reverse()) c.rows.unshift(r);
    chars.replaceChildren(make('h3', { id: 'cardCharsH' }, PART ? 'Контекст записи' : 'Характеристики'));
    if (PART) chars.append(make('p', { class: 'card-note' }, 'Поля записи ' + PART + ': тип, материал и спецификация относятся к записи целиком, не к этой детали.'));
    // M13 (макет D): объём, материал, марка, масса — в «Основных данных», в «Характеристиках» не повторяются.
    const allRows = c.rows.slice();
    if (PART && ownMat) { const i = allRows.findIndex(r => r.label === 'Материал'); if (i >= 0) allRows[i] = ownMat; else allRows.push(ownMat); } /* R248 п.3: факты — свой материал части */
    const MAIN = ['Объём', 'Материал', 'Марка', 'Масса'];
    // V122-R1-01: «Марка» — только из полей марки; если в поле марки лежит начало названия элемента («Лоток ВК 300×675 · оси 3–4 / А–В») — это не марка, ячейки нет.
    const nameAsMark = r => r.label === 'Марка' && typeof r.value === 'string' && /·|\bоси\b/.test(r.value) && String(o.name || '').startsWith(r.value.replace(/, поз\..*$/, ''));
    c.rows = c.rows.filter(r => !nameAsMark(r));
    const mainFromChars = PART ? (ownMat ? [ownMat] : []) : MAIN.map(l => c.rows.find(r => r.label === l)).filter(Boolean); /* 1.0.7: у части поля записи — в «Контексте записи» */
    if (!PART) c.rows = c.rows.filter(r => !MAIN.includes(r.label));
    let srcNos = null;
    { const nos = c.rows.filter(r => r.fs === 'unknown');   /* 1.1.1 A3: «нет в источнике» — одной строкой с раскрытием (одна такая строка — как прежде) */
      if (nos.length < 2) { if (c.rows.length) chars.append(stampRows(c.rows)); }
      else { const known = c.rows.filter(r => r.fs !== 'unknown'); if (known.length) chars.append(stampRows(known)); srcNos = nos; } }
    // §3: примечание о происхождении из типа — в блоке, где стоят эти значения (все — в «Основных данных» → там; иначе — в «Характеристиках»)
    let typeNote = null;
    const typeNoteMain = c.fromType.length > 0 && c.fromType.every(l => MAIN.some(m => m.toLowerCase() === l));
    if (c.fromType.length && t && t.own) typeNote = make('p', { class: 'card-note' }, cap(c.fromType.join(', ')) + ' — по спецификации пакета');
    if (c.fromType.length && t && !t.own) {
      typeNote = make('p', { class: 'card-note' });
      const list = c.fromType.join(', ');
      typeNote.append(document.createTextNode(cap(list.replace(/, ([^,]*)$/, ' и $1')) + ' — по типу '), make('a', { href: 'catalogue-model.html#block/C' + pad4(t.package) }, '№ ' + t.package + ' в каталоге'));
    }
    if (typeNote && !typeNoteMain) chars.append(typeNote);
    for (const x of extras) if (x.note) chars.append(make('p', { class: 'card-note card-note--warn' }, x.note));
    // решение координатора (б): строки «Прочие характеристики … не заданы» нет — примечание или «Основные данные» уже говорят, чего нет
    chars.hidden = chars.children.length <= 1; // нет строк и примечаний — блока нет
    const xb = extras.find(x => x.block);
    extraBox.replaceChildren(); extraBox.hidden = !xb;
    if (xb) {
      const B = xb.block;
      extraBox.append(make('h3', { id: 'cardXBlockH' }, B.title));
      const g = make('dl', { class: 'card-grid card-stamp' });
      for (const r of B.rows || []) {
        const dd = make('dd');
        if (Array.isArray(r.lines)) for (const t of r.lines) dd.append(make('span', { class: 'card-line' }, t)); else monoText(dd, r.value, MONO_WHOLE.test(r.label));
        // V12.1 §4.2: длинная строка связи (> 2 строк) — свёрнута до двух, «Подробнее» раскрывает; текст данных не сокращается.
        const len = Array.isArray(r.lines) ? r.lines.join(' ').length + r.lines.length * 30 : String(r.value || '').length;
        if (len > 75) { // ≈ 2 строки в колонке значения 1440 (≈ 38 знаков)
          const clamp = make('span', { class: 'card-clamp' }); clamp.append(...dd.childNodes);
          const more = make('button', { type: 'button', class: 'card-link', 'aria-expanded': 'false' }, 'Подробнее');
          more.onclick = () => { const o2 = clamp.classList.toggle('open'); more.textContent = o2 ? 'Свернуть' : 'Подробнее'; more.setAttribute('aria-expanded', String(o2)); };
          dd.append(clamp, more);
        }
        g.append(make('dt', {}, r.label), dd);
      }
      if ((B.rows || []).length) extraBox.append(g);
      for (const l of B.legend || []) extraBox.append(make('p', { class: 'card-note' }, l));
      const btns = make('div', { class: 'card-remark-btns card-xblock-btns' });
      for (const a of (B.actions || []).filter(a => !a.menu)) {
        const el = a.href ? make('a', { class: 'card-btn' + (a.primary ? ' card-btn--outline' : ''), href: a.href }, a.label) : make('button', { type: 'button', class: 'card-btn' + (a.primary ? ' card-btn--outline' : ''), 'aria-pressed': a.pressed == null ? null : String(!!a.pressed) }, a.label);
        if (a.onClick) el.addEventListener('click', e => a.onClick(e, el));
        btns.append(el);
      }
      if (btns.children.length) extraBox.append(btns);
    }
    // Где находится
    const w = [];
    const rec = o.albumRecord || {};
    if (S.siteFeature('levels') && txt(rec.level)) w.push({ label: 'Уровень', value: rec.level });
    const b = PSEL && okB(PSEL.bounds) ? PSEL.bounds : (okB(rdB(o)) ? rdB(o) : o.bounds);   /* 1.0.16 B3-1 (Н1): габарит, оси и отметки — по вершинам части, не всей сети */
    const hasB = Array.isArray(b) && b.length === 2 && b.every(r => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite));
    if (txt(rec.axis) && !PSEL) w.push({ label: 'Оси', value: rec.axis });
    else if (hasB && (o.role === 'album_world' || PSEL) && axesNow().ok) w.push({ label: 'Оси', value: axesOf(b) + ' · по модели' }); /* К1-B3: нет осей — нет строки */
    /* 1.3.0 · этап 1, пп. 2, 3, 5: размеры и отметки карточки — те же, что на выносках (AtlasDims.facts): собственные оси, статус «по документу / по модели», «требует уточнения» */
    const DF = (() => { try { return window.AtlasDims && window.AtlasDims.facts && (o.role === 'album_world' || PSEL) ? window.AtlasDims.facts(o, PSEL) : null; } catch (e) { return null; } })();
    const dfSub = list => { const s = new Set(list.map(x => x.status)), out = []; if (s.has('doc') || s.has('conflict')) out.push('по документу'); if (s.has('model') || s.has('conflict')) out.push('≈ по модели'); return out.join(' · ') + (s.has('conflict') ? ' · есть расхождение' : ''); };
    const dfQ = keys => (DF ? DF.unresolved.filter(u => keys.includes(u.what)).map(u => ({ label: { length: 'Длина', width: 'Ширина', height: 'Высота', diameter: 'Диаметр', bottom: 'Низ', top: 'Верх', axis: 'Ось', invert: 'Лоток' }[u.what], note: u.note })) : []);
    const top = PSEL ? null : ['top_level_m', 'plate_top_m'].find(k => isNum(p[k])), bot = PSEL ? null : ['bottom_level_m', 'plate_bottom_m'].find(k => isNum(p[k]));
    const cond = rec.elevations_conditional === true;
    if (top || bot) w.push({ label: 'Отметки', value: [bot ? 'низ ' + level(p[bot]) : '', top ? 'верх ' + level(p[top]) : ''].filter(Boolean).join(' · ') });
    else if (DF && (DF.levels.length || dfQ(['bottom', 'top', 'axis', 'invert']).length)) {
      const SH = { bottom: 'низ', top: 'верх', axis: 'ось', invert: 'лоток' }, uq = dfQ(['bottom', 'top', 'axis', 'invert']);
      w.push({ label: 'Отметки, м', value: DF.levels.map(l => SH[l.key] + ' ' + l.text).join(' · ') || 'требует уточнения', sub: DF.levels.length ? dfSub(DF.levels) : null, quals: uq.map(u => u.label + ': требует уточнения' + (u.note ? ' — ' + u.note : '')) });
    }
    else if (hasB && (o.role === 'album_world' || PSEL)) w.push({ label: 'Отметки', value: 'низ ' + level(b[0][2]) + ' · верх ' + level(b[1][2]) + ' · по модели' });
    if (cond) { const r0 = w.find(x => /^Отметки/.test(x.label)); if (r0) r0.value += ' · отметки условные'; }
    if (txt(p.source)) w.push({ label: 'Источник', value: cleanSource(p.source) });
    if (txt(p.placement_note)) {
      const node = make('span', { class: 'card-clamp' }, tidy(stripCodes(p.placement_note)));
      const more = make('button', { type: 'button', class: 'card-link' }, 'Подробнее');
      more.onclick = () => { node.classList.toggle('open'); more.textContent = node.classList.contains('open') ? 'Свернуть' : 'Подробнее'; };
      const wrap = make('span'); wrap.append(node, more);
      w.push({ label: 'Привязка', node: wrap });
    }
    // M13 (макет D V12_2_основные_данные): сетка 3 колонки, подпись над значением. Габарит, Масса, Отметки — во всю ширину;
    // Объём модели · Материал · Марка — в один ряд. Нет значения — нет ячейки. Уровень остаётся в «Где находится».
    const main = [];
    let pendingVol = null; // асинхронная сумма объёма узла — метка готовности после неё
    let nodeAll = null;
    {
      // Узел открыт и выбран якорь — габарит по всем телам узла, объём — сумма по модели, материал не показываем.
      const A = N(), k = A && A.of ? A.of(o.renderId) : null, n = k && A.get ? A.get(k) : null, st = A && A.state ? A.state() || {} : {};
      const mem = (n && (n.memberIds || n.all)) || []; // элементы узла без армирования (как «12 элементов · армирование 35» в строке узла)
      if (n && st.k === k && (n.anchors || []).includes(o.renderId) && mem.length > 1) {
        const ids = new Set(mem), lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; nodeAll = [];
        for (const x of (window.__FULL_ATLAS && window.__FULL_ATLAS.allWorld()) || []) if (ids.has(x.renderId) && okB(x.bounds)) { const xb = okB(rdB(x)) ? rdB(x) : x.bounds; nodeAll.push(x); for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], xb[0][i]); hi[i] = Math.max(hi[i], xb[1][i]); } }
        if (nodeAll.length > 1) main.push({ key: 'gabarit', label: 'Габарит узла, Д × Ш × В', title: 'Д — большая из горизонтальных, Ш — меньшая, В — по вертикали модели', value: dimText([lo, hi]), sub: 'по всем ' + S.fmt(nodeAll.length) + ' ' + S.plural(nodeAll.length, 'элементу', 'элементам', 'элементам'), wide: true, mono: true, box: [lo, hi] });
        else nodeAll = null;
      }
    }
    const dimsOk = bb => [0, 1, 2].every(k => bb[1][k] - bb[0][k] > 0); // §3: нулевой размер по оси (плоское тело) — габарит не показываем
    const dfDims = !nodeAll && DF ? DF.dims : [], dfUq = !nodeAll ? dfQ(['length', 'width', 'height', 'diameter']) : [];
    if (dfDims.length || dfUq.length) {
      const NM = { length: 'Д', width: 'Ш', height: 'В', diameter: '' };
      main.push({ key: 'gabarit', label: DF.symbolic ? 'Размеры по документу, мм' : 'Размеры, мм', title: 'Д — длина, Ш — ширина, В — высота. Число без знака — по документу, со знаком ≈ — снято с модели. ' + (DF.frame.own ? 'Повёрнутый в плане элемент измерен по собственным осям.' : 'Измерено по осям модели.'),
        value: dfDims.map(d => (NM[d.key] ? NM[d.key] + ' ' : '') + d.text).join(' · ') || 'требует уточнения', sub: dfDims.length ? dfSub(dfDims) + (DF.frame.own && dfDims.some(d => d.status !== 'doc') ? ' · по собственным осям' : '') : null,
        quals: dfUq.map(u => u.label + ': требует уточнения' + (u.note ? ' — ' + u.note : '')), wide: true, mono: true, box: b });
    } else
    if (!nodeAll && hasB && dimsOk(b)) main.push({ key: 'gabarit', label: 'Габарит, Д × Ш × В', title: 'Габарит модели по осям модели: Д — большая из горизонтальных, Ш — меньшая, В — по вертикали. У элементов, повёрнутых в плане, больше фактического размера', value: dimText(b), wide: true, mono: true, box: b });
    const posV = v => isNum(v) && v > 0; // V12.2b п. 4: отрицательный/нулевой объём геометрии (12 шпилек Рм7: −3e-05) — не показывать
    // V12.4 P3: у тела с условным габаритом (albumRecord.conditional_extent — модельный бокс) объёма модели нет: значение ничего не значит; объём «по ведомости» — из данных, остаётся
    const condExt = !!(o.albumRecord && o.albumRecord.conditional_extent);
    const vm0 = condExt ? null : posV(p.model_volume_m3) ? p.model_volume_m3 : posV(p.volume_geometry_m3) ? p.volume_geometry_m3 : null;
    let volC = mainFromChars.find(r => r.label === 'Объём');
    if (volC && condExt) { const v = String(volC.value).split(' · ').filter(x => !/по модели/.test(x)).join(' · '); volC = v ? Object.assign({}, volC, { value: v }) : null; } // объём из «Характеристик» (с пометкой источника) — вместо объёма модели
    const m3 = v => Number(v.toPrecision(3)).toLocaleString('ru-RU', { maximumFractionDigits: 6 }) + ' м³';
    // V12.2b п. 5: объём из «Характеристик» с «по ведомости» — подпись «Объём» (это не только объём модели)
    if (!nodeAll) { if (volC) main.push(Object.assign({}, volC, { label: /ведомост/.test(String(volC.value)) ? 'Объём' : 'Объём модели' })); else if (vm0 !== null) main.push({ label: 'Объём модели', value: m3(vm0) }); }
    // V12.2b п. 6: у узла марка и масса — якоря (габарит и объём — по всем телам): подпись «(якорь)»; материал у узла не показываем
    for (const r of mainFromChars) if (r.label !== 'Объём' && !(nodeAll && r.label === 'Материал')) main.push(Object.assign({}, r, { label: nodeAll ? r.label + ' (якорь)' : r.label, wide: r.label === 'Масса' || (r.label === 'Материал' && String(r.value == null ? '' : r.value).length > 40) /* 1.0.15 B3-7 (L7): длинный материал — на всю ширину */, mono: r.label === 'Марка' }));
    { const i = w.findIndex(r => /^Отметки/.test(r.label)); if (i >= 0) main.push(Object.assign(w.splice(i, 1)[0], { wide: true })); }
    { const og = ST() && ST().origin ? ST().origin(o.albumRecord, p) : null; if (og) main.push({ label: 'Геометрия', value: og.text, title: og.title, key: 'geometry_origin' }); } /* 1.0 · происхождение геометрии (D 08.10) */
    mainBox.replaceChildren(make('h3', { id: 'cardMainH' }, 'Основные данные'));
    const mainGrid = make('div', { class: 'card-basic' });
    const cell = r => {
      const v = make('b');
      if (F_OF[r.label]) v.dataset.f = F_OF[r.label]; else if (r.key) v.dataset.f = r.key;
      if (r.mono) v.append(make('span', { class: 'mono' }, r.value)); else if (/^Объём/.test(r.label) && /\sпо (ведомости|модели)(\s·|$)/.test(String(r.value))) volText(v, r.value); else monoText(v, r.value, false);
      if (r.sub) v.append(make('small', {}, r.sub));
      if (r.fs) v.classList.add('card-fs--' + r.fs); /* К1-B3: статус поля */
      if (r.model) v.append(modelChip(r.prov)); /* 1.0.7; К3 — источники в подсказке */
      if (Array.isArray(r.quals)) for (const q of r.quals) v.append(make('small', { class: 'card-qual' }, q)); /* R248 п.5 */
      if (r.extra) {
        const x = make('small', { class: 'card-extra' });
        { const k = S.SIG[r.extra.remark && r.extra.remark.significance] || 'low'; x.append(ic('sig-' + k, 'card-extra--' + k), document.createTextNode(r.extra.text)); }
        if (r.extra.remark) { x.append(document.createTextNode(' · ')); x.append(make('a', { class: 'mono', href: 'RD_REMARKS.html#id=' + encodeURIComponent(r.extra.remark.id) }, r.extra.remark.id)); }
        v.append(x);
      }
      const d = make('div', { class: 'card-bc' + (r.half ? ' card-bc--h' : r.wide ? ' card-bc--w' : '') });
      d.append(make('span', { title: r.title || null }, r.label), v);
      return d;
    };
    { // решение координатора: «Масса» и «Отметки» — в один ряд, две колонки
      const ms = main.find(r => r.label === 'Масса'), mk = main.find(r => r.label === 'Отметки');   /* «Отметки, м» (1.3.0) — всегда во всю ширину */
      if (ms && mk) ms.half = mk.half = true; // одна — во всю ширину: «низ … · верх … · по модели» в половине ряда — 2–3 строки
    }
    for (const r of main) mainGrid.append(cell(r));
    mainBox.append(mainGrid);
    if (main.some(r => r.key === 'gabarit') && !nodeAll && !PART /* 1.0.7: у части поля записи — в «Контексте записи» */ && !main.some(r => /^(Объём( модели)?|Материал|Марка)$/.test(r.label)) /* V12.2c: «Объём» (по ведомости) — тоже объём */) mainBox.append(make('p', { class: 'card-muted' }, 'Объём, материал, марка — в исходных данных не заданы.'));
    if (typeNote && typeNoteMain) mainBox.append(typeNote);
    mainBox.hidden = !main.length;
    { const gl = ST() && ST().gaLimits ? ST().gaLimits(p) : []; if (gl.length) { const ul = make('ul'); for (const x of gl) ul.append(make('li', {}, x)); gaBox.replaceChildren(make('h3', {}, 'Ограничения геометрии'), make('p', { class: 'card-note' }, 'Из исходной записи (geometry_asset): геометрия не означает изделие или монтаж.'), ul); if (gaBox.previousElementSibling !== mainBox) mainBox.after(gaBox); } else if (gaBox.parentNode) gaBox.remove(); } /* 1.0.7 К3 */
    /* R248: «Свойства части» (свои 4 поля + прочие) и «Контекст сборки» (parent_composition) — только при подтверждённых props этого ключа */
    { let at = gaBox.parentNode ? gaBox : mainBox;
      if (DP && OWN.length) { ownBox.replaceChildren(make('h3', {}, PART ? 'Свойства части' : 'Собственные свойства'), make('p', { class: 'card-note' }, PART ? 'Собственные свойства выбранной части; поля записи-родителя — в «Контексте записи».' : 'Уточнены для этого элемента; заменяют значения тех же полей из данных.'), stampRows(OWN)); at.after(ownBox); at = ownBox; } else if (ownBox.parentNode) ownBox.remove();
      const pc = DP && DP.parent_composition && typeof DP.parent_composition === 'object' ? DP.parent_composition : null;
      if (pc) { const f = ST().field(pc), lim = pc.contextual_limit && typeof pc.contextual_limit === 'object' ? pc.contextual_limit : null; const q = ST().quals(pc); if (lim) q.push('ограничение: ' + [lim.status, lim.note, lim.qualification].filter(x => typeof x === 'string' && x).join(' — '));
        ctxBox.replaceChildren(make('h3', {}, 'Контекст сборки'), make('p', { class: 'card-note' }, 'Состав сборки, в которую входит часть; не собственный материал, тип или спецификация части.'), stampRows([{ label: (typeof pc.label === 'string' && pc.label) || 'Состав сборки', value: f ? f.text : String(pc.value == null ? '' : pc.value), fs: f ? f.fs : null, model: !!(f && f.model), prov: (f && f.prov) || '', quals: q }])); at.after(ctxBox); } else if (ctxBox.parentNode) ctxBox.remove(); }
    if (nodeAll && nodeAll.length > 400) mainBox.append(make('p', { class: 'card-muted' }, 'Объём узла не считается: в узле ' + S.fmt(nodeAll.length) + ' ' + S.plural(nodeAll.length, 'элемент', 'элемента', 'элементов') + ' (больше 400).'));
    if (nodeAll && nodeAll.length <= 400 && window.AtlasPassports) {
      // Объём узла — сумма положительных объёмов тел по модели: у всех есть — «сумма N тел», у части — «сумма K из N тел», ни у одного — ячейки нет.
      pendingVol = Promise.all(nodeAll.map(x => (x.albumRecord && x.albumRecord.conditional_extent) ? Promise.resolve({}) : window.AtlasPassports.get(x).then(q => q || {}, () => ({})))).then(ps => { // V12.4 P3: условный габарит — без объёма
        if (my !== generation) return;
        // V122-R1-02: частичная сумма — честно «сумма K из N тел по модели»; K = 0 — ячейки нет.
        const vs = ps.map(q => posV(q.model_volume_m3) ? q.model_volume_m3 : posV(q.volume_geometry_m3) ? q.volume_geometry_m3 : null).filter(v => v !== null);
        if (!vs.length) return;
        const c1 = cell({ label: 'Объём модели', value: m3(vs.reduce((a, v) => a + v, 0)), sub: vs.length === ps.length ? 'сумма ' + S.fmt(vs.length) + ' ' + S.plural(vs.length, 'элемента', 'элементов', 'элементов') + ' по модели' : 'сумма ' + S.fmt(vs.length) + ' из ' + S.fmt(ps.length) + ' ' + S.plural(ps.length, 'элемента', 'элементов', 'элементов') + ' по модели' }); // V12.4 P6: «из 21 тела»
        mainGrid.firstChild ? mainGrid.firstChild.after(c1) : mainGrid.append(c1);
      });
    }
    where.replaceChildren(make('h3', { id: 'cardWhereH' }, 'Где находится'));
    const wg = make('dl', { class: 'card-grid card-stamp' });
    dl(wg, w, true);
    where.append(wg);
    where.hidden = !w.length;
    srcRender(o, p, DF, cur_sl, srcNos);
    // Замечания
    const rs = renderRemarks(o, extras.flatMap(x => x.remarks || []));
    // Чертёж
    const xd = extras.find(x => x.drawing);
    setDrawing(xd ? xd.drawing : drawingPlan(o, p, rs), o.renderId);
    // Ограничения и примечания
    extraNotes.replaceChildren();
    const fd = fieldsApi ? fieldsApi.fields(p, o) : null;
    const seen = new Set([($('objectWarning').textContent || '').trim()]);
    if (fd && fd.fabricationIncomplete) extraNotes.append(make('p', {}, 'Геометрия неполная. Не использовать для изготовления.'));
    for (const n of [p.note].filter(Boolean)) { const s2 = tidy(stripCodes(n)); if (![...seen].some(x => x.includes(s2))) { extraNotes.append(make('p', {}, s2)); seen.add(s2); } }
    const TXC = (k, d) => { const t = ((window.ATLAS_TEXTS || {}).card || {})[k]; return typeof t === 'string' && t ? t : d; };
    // 1.0.12: пояснения к наложению (паспорт atlas_overlay_data: parameters, notes, observations_free, source — импортёр) — ключ и значение как есть, без своих подписей; нет блока — ничего
    { const od = p && p.atlas_overlay_data;
      if (od && typeof od === 'object') {
        const box = make('div', { class: 'card-od' }), txt = v => v == null ? '' : typeof v === 'string' ? v : (typeof v === 'number' || typeof v === 'boolean') ? String(v) : JSON.stringify(v);
        const line = (k, v) => { const r = make('p', { class: 'card-od-row' }); r.append(make('code', { class: 'card-od-k' }, k), document.createTextNode(': ' + txt(v))); box.append(r); };
        const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
        for (const sec of ['parameters', 'notes', 'observations_free']) {
          const v = od[sec]; if (empty(v)) continue;
          if (Array.isArray(v)) v.forEach((x, i) => line(sec + (v.length > 1 ? ' ' + (i + 1) : ''), x));
          else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) line(sec + '.' + k, x);
          else line(sec, v);
        }
        for (const [k, v] of Object.entries(od)) if (!['parameters', 'notes', 'observations_free', 'source'].includes(k) && !empty(v)) line(k, v);   // прочие ключи блока — тоже как есть
        if (!empty(od.source)) line('source', typeof od.source === 'object' && !Array.isArray(od.source) ? Object.entries(od.source).map(([k, x]) => k + ' ' + txt(x)).join(' · ') : od.source);
        if (box.children.length) extraNotes.append(box);
      }
      // раунд 4: секция свёрнута — число пояснений в заголовке («· пояснения N»)
      const odn = extraNotes.querySelectorAll('.card-od-row').length, sm = notesD.querySelector('summary');
      if (sm) sm.textContent = 'Ограничения и примечания' + (odn ? ' · ' + TXC('od_count', 'пояснения') + ' ' + odn : ''); }
    // Спецификация и источник — всё из fields(), что не попало в «Характеристики» и «Где находится».
    const shownWhere = new Set(['source', 'placement_note', 'top_level_m', 'bottom_level_m', 'albumRecord.axis']);
    const TECH_FIELDS = new Set(['revision_added', 'parent_id']);
    const specAll = fd ? [...fd.materials, ...fd.dimensions, ...fd.specification, ...fd.position].filter(r => !c.used.has(r.field) && !shownWhere.has(r.field)) : [];
    const spec = specAll.filter(r => !TECH_FIELDS.has(r.field));
    const techExtra = specAll.filter(r => TECH_FIELDS.has(r.field));
    dl(specBody, spec.map(r => ({ label: r.label.replace(/ \(length_mm?\)$/, ''), value: tidy(stripCodes(r.value)) || r.value })));
    specD.hidden = !spec.length;
    // Связанные чертежи
    const n = $('pairs').querySelectorAll('.album-source').length;
    pairsD.querySelector('summary').textContent = 'Листы' + (n ? ' · ' + n : '');
    pairsD.hidden = !$('pairs').textContent.trim();
    /* К1-B3: ссылок в разметке нет — из набора данных объекта (ATLAS_REVIEW_SECTIONS.right_panel.links.items: kind link {href, label, target, rel} | br); нет и данных — блок скрыт, без «· 0» */
    if (!archiveD.querySelector('a')) { const L = (((window.ATLAS_REVIEW_SECTIONS || {}).right_panel || {}).links || {}).items; if (Array.isArray(L) && L.some(x => x && x.kind === 'link' && x.href)) { const box = make('div', { class: 'links card-archive-links' }); for (const x of L) { if (!x) continue; if (x.kind === 'br') box.append(document.createElement('br')); else if (x.kind === 'link' && x.href) box.append(make('a', { href: x.href, target: x.target || null, rel: x.rel || null }, x.label || x.href)); } archiveD.append(box); } }
    archSync();   /* 1.0.19a К-4: блок — только при файлах, которые есть в выпуске */
    // Технические сведения
    const tech = [{ label: 'Название в модели', value: o.name }];
    // M13: «Габарит модели» и «Объём модели» — в «Основных данных».
    if (txt(p.phase)) tech.push({ label: 'Стадия по данным', value: p.phase });
    if (txt(p.confidence)) tech.push({ label: 'Достоверность', value: p.confidence });
    if (t && !t.own && t.package != null) tech.push({ label: 'Тип каталога', value: '№ ' + t.package + ' · связь ' + (t.method || 'не указана') });   /* 1.0.16 B3-10 (A7): свой тип (по спецификации пакета) — без «№ undefined» */
    for (const r of techExtra) tech.push({ label: r.label, value: r.value });
    dl(techGrid, tech);
    const idDd = make('dd', { class: 'mono' });
    idDd.append(selectedIdEl);
    techGrid.prepend(make('dt', {}, 'ID'), idDd);
    // Телефон: строка ключевых фактов «раздел · материал · размеры · оси»
    const get = l => (c.rows.find(r => r.label === l) || {}).value;
    const ax = (w.find(r => r.label === 'Оси') || {}).value;
    // ПК и развёрнутая шторка — как в V12.1 «раздел · материал · размеры · оси»; M13: свёрнутая шторка — «материал · габарит».
    const getA = l => (allRows.find(r => r.label === l) || {}).value;
    const sz = main.find(r => r.key === 'gabarit');
    facts.replaceChildren(
      make('span', { class: 'card-facts-pc' }, [h.section, getA('Материал'), getA('Размеры') || getA('Профиль'), ax ? 'оси ' + ax.split(', ')[0].replace(' · по модели', '') : ''].filter(Boolean).join(' · ')),
      make('span', { class: 'card-facts-ph' }, [nodeAll ? '' : getA('Материал'), sz ? sz.value : ''].filter(Boolean).join(' · ') || [h.section, ax ? 'оси ' + ax.split(', ')[0].replace(' · по модели', '') : ''].filter(Boolean).join(' · ')));
    cur = { o, p };
    const oa = extras.map(x => x.block && (x.block.actions || []).find(a => a.menu)).find(Boolean) || null;
    openSec = oa ? () => { let prevented = false; const ev = { preventDefault() { prevented = true; } }; if (oa.onClick) oa.onClick(ev); if (!prevented && oa.href) location.href = oa.href; } : null;
    mOpenSec.hidden = !oa;
    cutBox = (main.find(r => r.key === 'gabarit') || {}).box || (hasB ? b : null); cutSync(); // P9
    rebarRender(o, extras);
    if (window.__b3Occl) window.__b3Occl.soon(); // V12.5 Q5
    // V12.2: data-card-for — все блоки (включая асинхронные) отрисованы для этого тела; по ней ждёт сверка_чисел
    Promise.resolve(pendingVol).then(() => { if (my === generation) right.dataset.cardFor = o.renderId; }, () => { if (my === generation) right.dataset.cardFor = o.renderId; });
    requestAnimationFrame(() => { if (my === generation) rebarRefresh(); }); // состояние, пришедшее во время перерисовки
    nodeRender(o);
    envRender(o);
    cutSync(); // V12.4 P9: пункты «Ещё» — после строки узла (она открывает «Открыть узел» / «Показать на уровне»)
    compositionRender(o);
    document.dispatchEvent(new CustomEvent('atlas:card', { detail: { renderId: o.renderId, remarks: rs.length } }));
    if (focusTitle) { focusTitle = false; title.focus({ preventScroll: false }); }
  }

  /* ---------- события ---------- */
  function selected() { return window.__FULL_ATLAS && window.__FULL_ATLAS.selected(); }
  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const o = selected();
      if (!o) { renderEmpty(); return; }
      if (o !== current) render(o);
    });
  }
  document.addEventListener('atlas:selection', schedule);
  document.addEventListener('atlas:part', () => requestAnimationFrame(() => { const o = selected(); if (o) render(o); }));   /* 1.0.16 B3-1: часть выбрана или снята — карточка заново (то же тело schedule не перерисовывает) */
  document.addEventListener('atlas:ready', schedule);
  document.addEventListener('atlas:deselect', schedule);
  document.addEventListener('atlas:geometrychanged', () => { current = null; schedule(); });
  // V12.2 · E8: выбор — событие движка atlas:selectionchange {id, prev, source}; наблюдатель за #selectedName — запасной (движок без features.selectionChange)
  document.addEventListener('atlas:selectionchange', schedule);
  document.addEventListener('atlas:selectionchange', e => { if (e.detail && e.detail.id == null && !selected() && current) renderEmpty(); });
  // 1.0.12: новое тело выбрано, паспорта ещё нет в кэше — «Загрузка…» сразу (не через кадр и 120 мс): прежнее тело карточки не читается как новое
  document.addEventListener('atlas:selectionchange', e => {
    const o = selected();
    syncDrawingSelection(o?.renderId ?? null);
    if (!o || o === current || !e.detail || e.detail.id == null) return;
    try { const PP = window.AtlasPassports; if (!PP || !PP.peek || o._passportChunk === undefined || PP.peek(o) !== undefined) return; } catch (x) { return; }
    right.classList.add('is-loading'); right.setAttribute('aria-busy', 'true'); eyebrow.textContent = 'Загрузка…'; loadTag.hidden = false; delete right.dataset.cardFor;
  });   // 1.0.12: выбор снят — «Сводка» сразу, без ожидания кадра
  new MutationObserver(() => { if (!FE().selectionChange) schedule(); }).observe($('selectedName'), { childList: true, characterData: true, subtree: true });
  function humanPairs() {
    for (const sm of $('pairs').querySelectorAll('.album-source small:not([data-h])')) {
      const m = /^(.*?) · метод: (.*?) · (PDF.*)$/.exec(sm.textContent);
      if (!m) continue;
      sm.dataset.h = '1';
      sm.replaceChildren(make('span', { class: 'review-only' }, m[1] + ' · метод: ' + m[2] + ' · '), document.createTextNode(m[3]));
    }
  }
  new MutationObserver(() => {
    humanPairs();
    const n = $('pairs').querySelectorAll('.album-source').length;
    pairsD.querySelector('summary').textContent = 'Листы' + (n ? ' · ' + n : '');
    pairsD.hidden = !$('pairs').textContent.trim();
  }).observe($('pairs'), { childList: true });
  copyBtn.addEventListener('click', async () => {
    const o = selected();
    if (!o) return;
    const bucket = o.albumRecord && o.albumRecord.bucket;
    const scope = bucket === 'history' ? 'HISTORY' : bucket === 'active' || !bucket ? 'BUILDING' : 'HELPERS';
    const layer = bucket === 'placed' ? (window.AtlasWorldRevisionData && window.AtlasWorldRevisionData.placedLayer || {}).package_no : null;
    const url = location.href.split('#')[0] + (layer ? '#layer=' + layer : '#scope=' + scope) + '&id=' + encodeURIComponent(o.renderId || o.id);
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
      const ta = make('textarea'); ta.value = url; document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    window.AtlasViewSettings && window.AtlasViewSettings.toast(ok ? 'Ссылка на элемент скопирована' : url);
  });
  mIso.addEventListener('click', () => $('isolate').click());
  // R3-01 (ревью D №3): на ПК «×» и Esc снимают выбор, панель остаётся и показывает «Сводку».
  // Снятие выбора — deselect() из prototype.js (B2, window.AtlasPrototype.deselect); пока его нет — прежнее поведение движка.
  // E8: AtlasPrototype.deselect (B2: заголовок, крошки, atlas:deselect) — если есть; иначе __ATLAS.deselect() движка (features.deselect).
  const deselectFn = () => (window.AtlasPrototype && typeof window.AtlasPrototype.deselect === 'function' ? window.AtlasPrototype.deselect : FE().deselect ? () => { window.__ATLAS.deselect(); document.dispatchEvent(new Event('atlas:deselect')); } : null); // atlas:deselect — для совместимости до V12.3 (решение координатора)
  function toSummary() {
    const f = deselectFn(); if (!f) return false;
    // V12.0b п. 2: при изоляции сначала вернуть окружение — иначе после снятия выбора сцена пустая.
    // E8: deselect() движка сам снимает изоляцию; иначе (B2 или старый движок) — вернуть окружение щелчком
    // выбор снимает AtlasPrototype.deselect (B2) — изоляцию снимаем здесь (isolate(null) при isolateSet, иначе щелчок по #isolate); снимает движок (__ATLAS.deselect) — он снимет её сам
    const viaEngine = !(window.AtlasPrototype && typeof window.AtlasPrototype.deselect === 'function') && FE().deselect;
    const iso = $('isolate'); if (!viaEngine && iso && isoOn()) { if (FE().isolateSet) window.__ATLAS.isolate(null); else iso.click(); }
    f(); right.classList.add('open'); schedule(); return true;
  }
  // V12.3 · E17: «×» и Esc — отменяемые события движка atlas:close / atlas:escape (features.cancelableClose); перехват в фазе захвата — запасной путь
  const closeWanted = () => (innerWidth > 850 || isoOn()) && !!deselectFn();
  const escWanted = k => {
    if (innerWidth <= 850 || (k && k.defaultPrevented) || !deselectFn() || !right.classList.contains('open')) return false;
    if (document.body.classList.contains('measure-on') || $('quickMeasure')?.getAttribute('aria-pressed') === 'true') return false;
    const t = k && k.target; if (t && (/INPUT|SELECT|TEXTAREA/.test(t.tagName) || t.isContentEditable)) return false;
    if (document.querySelector('#modal.open, dialog[open], .atb-pop:not([hidden])') || !moreMenu.hidden) return false;
    const sp = $('searchPopover'); if (sp && !sp.hidden) return false;
    const vs = $('viewSettings'); if (vs && !vs.hidden) return false;
    return true;
  };
  // V12.5 Q7 (решение D): строка «<имя> ⌃ ×» вместо скрытия шторки на 390
  const miniBar = make('div', { class: 'card-mini-bar', hidden: true });
  const miniName = make('button', { type: 'button', class: 'card-mini-name' });
  const miniUp = make('button', { type: 'button', class: 'card-mini-up', 'aria-label': 'Развернуть карточку' }); miniUp.append(ic('chevron-up'));
  const miniX = make('button', { type: 'button', class: 'card-mini-x', 'aria-label': 'Снять выбор' }); miniX.append(ic('close'));
  miniBar.append(miniName, miniUp, miniX); right.prepend(miniBar);
  const miniOff = () => { if (!right.classList.contains('card-mini')) return; right.classList.remove('card-mini'); miniBar.hidden = true; sheetSignal(); };
  const miniOn = () => { miniName.textContent = title.textContent; miniName.setAttribute('aria-label', 'Развернуть карточку: ' + title.textContent); right.classList.add('card-mini'); right.classList.remove('expanded'); handle.setAttribute('aria-expanded', 'false'); miniBar.hidden = false; sheetSignal(); };
  miniName.onclick = miniOff; miniUp.onclick = miniOff;
  miniX.onclick = () => { const f = deselectFn(); miniOff(); if (f) f(); };
  { let y0 = null; miniBar.addEventListener('pointerdown', e => { y0 = e.clientY; try { miniBar.setPointerCapture(e.pointerId); } catch (x) { /* */ } }); /* V12.5b: захват указателя — как у ручки шторки */ miniBar.addEventListener('pointerup', e => { if (y0 != null && y0 - e.clientY > 24) miniOff(); y0 = null; }); } // свайп вверх
  document.addEventListener('atlas:selectionchange', miniOff);
  matchMedia('(max-width: 850px)').addEventListener('change', e => { if (!e.matches) miniOff(); }); // V12.5b: поворот / ширина > 850 — обычная карточка
  document.addEventListener('atlas:issues', e => { if (e.detail && e.detail.on && right.classList.contains('card-mini')) { miniOff(); right.classList.remove('open'); } }); // вход в M4 — строки нет
  document.addEventListener('atlas:close', e => {
    if (FE().cancelableClose && e.detail && e.detail.pane === 'right' && innerWidth <= 850 && !isoOn() && cur && !e.defaultPrevented && !document.body.classList.contains('iss-on')) { e.preventDefault(); miniOn(); return; } // V12.5b: в M4 — строки нет
    if (!FE().cancelableClose || !e.detail || e.detail.pane !== 'right' || !closeWanted()) return;
    e.preventDefault(); toSummary(); title.blur(); (document.querySelector('.card-tile') || right).focus?.();
  });
  document.addEventListener('atlas:escape', e => {
    // договорённость с B2: «Инструменты» перехватывают Esc в фазе захвата (сюда событие не дойдёт), поиск — отменяет atlas:escape раньше нас
    // V12.3b: Esc уже поглощён (меню «Ещё» шапки закрылось по preventDefault) — на ПК панель карточки не прятать
    if (FE().cancelableClose && !e.defaultPrevented && e.detail && !e.detail.modal && e.detail.original && e.detail.original.defaultPrevented && innerWidth > 850 && right.classList.contains('open')) { e.preventDefault(); return; }
    if (!FE().cancelableClose || e.defaultPrevented || !e.detail || e.detail.modal || !escWanted(e.detail.original)) return;
    e.preventDefault(); if (!right.classList.contains('is-empty')) toSummary();
  });
  document.addEventListener('click', e => {
    if (FE().cancelableClose) return; // V12.4 P2: «×» одним путём — atlas:close движка (B2 больше не заменяет onclick кнопки); перехват — запасной путь
    // V12.2 R3-01: на 390 «×» при изоляции — как Esc на ПК (снять выбор, вернуть окружение); без изоляции — прежнее закрытие шторки
    const isoNow = isoOn();
    if ((innerWidth <= 850 && !isoNow) || !e.target.closest || !closeBtn.contains(e.target) || !deselectFn()) return;
    e.stopPropagation(); e.preventDefault(); // обработчик движка [data-close] спрятал бы панель целиком
    toSummary();
    title.blur(); (document.querySelector('.card-tile') || right).focus?.();
  }, true);
  document.addEventListener('keydown', e => {
    if (FE().cancelableClose) return; // E17
    if (e.key !== 'Escape' || innerWidth <= 850 || e.defaultPrevented || !deselectFn() || !right.classList.contains('open')) return;
    // V12.0b п. 1: пока включена линейка, Esc — её (снять точку / выключить), выбор не трогать.
    if (document.body.classList.contains('measure-on') || $('quickMeasure')?.getAttribute('aria-pressed') === 'true') return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (document.querySelector('#modal.open, dialog[open], .atb-pop:not([hidden])') || !moreMenu.hidden) return;
    const sp = $('searchPopover'); if (sp && !sp.hidden) return;
    const vs = $('viewSettings'); if (vs && !vs.hidden) return;
    e.stopPropagation(); // Esc движка спрятал бы «Сводку»
    if (!right.classList.contains('is-empty')) toSummary();
  }, true);
  // «Ещё» в полосе шторки: свёрнута — развернуть; развёрнута — к четырём действиям внизу паспорта.
  mMore.addEventListener('click', () => {
    if (!right.classList.contains('expanded')) { right.classList.add('expanded'); handle.setAttribute('aria-expanded', 'true'); return; }
    acts.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); aIso.focus({ preventScroll: true });
  });
  // Шторка на телефоне: перетаскивание ручки с остановками 30 % и 85 %, касание — переключение.
  let drag = null;
  const shellH = () => (right.parentElement ? right.parentElement.getBoundingClientRect().height : innerHeight);
  handle.addEventListener('pointerdown', e => { drag = { y: e.clientY, h: right.getBoundingClientRect().height, moved: false }; handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', e => {
    if (!drag || handleSkip) return; // V12.1h п. 6: касание ручки закрыло «⋯» — шторку не тянуть
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    const h = Math.max(80, Math.min(shellH() * 0.9, drag.h - dy));
    right.classList.add('dragging');
    right.style.height = h + 'px'; right.style.maxHeight = h + 'px';
  });
  const endDrag = (e, cancelled) => {
    if (handleSkip) { handleSkip = false; right.classList.remove('dragging'); right.style.height = ''; right.style.maxHeight = ''; drag = null; return; }
    if (!drag) return;
    const moved = drag.moved;
    if (cancelled && !moved) { right.classList.remove('dragging'); right.style.height = ''; right.style.maxHeight = ''; drag = null; return; }
    const frac = right.getBoundingClientRect().height / Math.max(1, shellH());
    right.classList.remove('dragging'); right.style.height = ''; right.style.maxHeight = '';
    if (!moved) right.classList.toggle('expanded');
    else if (frac < 0.18) { right.classList.remove('expanded', 'open'); }
    else right.classList.toggle('expanded', frac > 0.55);
    handle.setAttribute('aria-expanded', String(right.classList.contains('expanded')));
    drag = null;
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', e => endDrag(e, true));
  handle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); right.classList.toggle('expanded'); handle.setAttribute('aria-expanded', String(right.classList.contains('expanded'))); } });
  // Для подписи на холсте (движок, сессия D): то же человеческое название, что в карточке.
  window.atlasDisplayName = obj => { try { if (!obj || !obj.name) return null; const t = human(obj).title; return t && t !== obj.name ? t : null; } catch (e) { return null; } };
  // Для движка (сдвиг сцены над шторкой): высота шторки над сценой в px и её состояние.
  // Событие document 'atlas:sheet' {height, state: 'closed'|'collapsed'|'expanded'} и CSS-переменная --sheet-h на <html>.
  let lastSheet = '';
  const PHONE_MQ = matchMedia('(max-width: 850px)');
  function sheetSignal() {
    const phone = PHONE_MQ.matches, open = right.classList.contains('open'); // matchMedia: без пересчёта раскладки (профиль V12, п. 2)
    // «Сводка» свёрнутой шторкой (R3-04) сцену не сдвигает: модель остаётся по центру, как в V11.5 (касание по центру выбирает элемент).
    const state = !phone || !open || right.classList.contains('is-empty') ? 'closed' : right.classList.contains('expanded') ? 'expanded' : 'collapsed';
    const height = state === 'closed' ? 0 : Math.round(right.getBoundingClientRect().height);
    const key = state + ':' + height;
    if (key === lastSheet || right.classList.contains('dragging')) return;
    lastSheet = key;
    document.documentElement.style.setProperty('--sheet-h', height + 'px');
    window.AtlasSheet = { height, state };
    document.dispatchEvent(new CustomEvent('atlas:sheet', { detail: { height, state } }));
  }
  new ResizeObserver(sheetSignal).observe(right);
  new MutationObserver(sheetSignal).observe(right, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', sheetSignal);
  // «ВК л. 2 — лист в атласе отсутствует; ВК л. 3 — …» → «Листов ВК л. 2, 3 в атласе нет.»
  function sheetNote(sn) {
    const rx = /^(.*?)\s*л\.\s*([\d.,–-]+)\s*—\s*лист в атласе отсутствует\.?$/;
    const m = sn.map(x => rx.exec(String(x).trim()));
    if (sn.length > 1 && m.every(Boolean) && m.every(x => x[1] === m[0][1])) return 'Листов ' + (m[0][1] ? m[0][1] + ' ' : '') + 'л. ' + m.map(x => x[2]).join(', ') + ' в атласе нет.';
    return (sn.length > 1 ? 'Листы: ' : 'Лист: ') + sn.join('; ').replace(/\.$/, '') + '.';
  }
  // L · F5-4-25, F5-3-17, F5-4-06 — пояснения из данных A строкой в карточке.
  (window.AtlasCardExtra = window.AtlasCardExtra || []).push(o => {
    const a = o && o.albumRecord; if (!a) return null;
    const notes = [];
    if (a.conditional_extent) notes.push('Условный габарит' + (a.conditional_reason ? ': ' + String(a.conditional_reason).replace(/\.$/, '') : '') + '.');
    const d = a.draft_remark;
    if (d && (d.id || d.text)) notes.push('Черновик замечания ' + (d.id || '') + ' (проектировщику не отправлен)' + (d.text ? ': ' + String(d.text).replace(/\.$/, '') : '') + '.');
    if (a.source_note && !(a.sources || []).length) notes.push(sheetNote([].concat(a.source_note)));
    return notes.length ? { note: notes.join(' ') } : null;
  });
  document.addEventListener('atlas:ready', () => setTimeout(() => {
    if (innerWidth <= 850 && !selected() && !wantedId && !$('left').classList.contains('open')) right.classList.add('open');
  }, 60));
  /* ---------- 1.0.13: сворачивание правой панели ----------
     ПК (> 850 px): «Свернуть панель» в шапке → #right.rp-collapsed (CSS D — колонка 44 px), внутри — вкладка .rp-tab «‹ Панель» и имя выбранного тела.
     Выбор тела панель не раскрывает (имя — на вкладке). Состояние — AtlasShell.globalKey('right-collapsed') (ошибки хранилища гасятся). ≤ 850 px — шторка, кнопки нет, класс снят.
     Клавиша \ (Backslash, без модификаторов, не в поле ввода). Фокус: свернуть → вкладка, развернуть → кнопка в шапке. Событие atlas:rightpanel {collapsed}. */
  const RP_MQ = matchMedia('(max-width: 850px)');
  const rpKey = () => { try { return S && S.globalKey ? S.globalKey('right-collapsed') : 'atlas:global:right-collapsed'; } catch (e) { return null; } };
  const rpTab = make('button', { type: 'button', class: 'rp-tab', 'aria-controls': 'right', 'aria-expanded': 'false', title: 'Развернуть панель (\\)', hidden: '' });
  rpTab.append(ic('chevron-left', 'icon--16'), make('span', { class: 'rp-tab-t' }, 'Панель'), make('span', { class: 'rp-tab-n' }, ''));
  right.prepend(rpTab);
  let rpWant = false; try { const k = rpKey(); rpWant = !!k && localStorage.getItem(k) === '1'; } catch (e) { rpWant = false; }
  function rpName() {
    const o = selected(); let n = '';
    if (o) { try { n = (ST() && ST().displayTitle && ST().displayTitle(o.renderId)) || human(o, (typeOf(o) || {}).mark).title || o.name || o.renderId; } catch (e) { n = o.name || o.renderId || ''; } }
    rpTab.querySelector('.rp-tab-n').textContent = n || 'Сводка';
    rpTab.setAttribute('aria-label', 'Развернуть панель' + (n ? ': ' + n : ''));
  }
  function rpApply(focus) {
    const on = rpWant && !RP_MQ.matches, was = right.classList.contains('rp-collapsed');
    right.classList.toggle('rp-collapsed', on); rpTab.hidden = !on;
    foldBtn.hidden = RP_MQ.matches; foldBtn.setAttribute('aria-expanded', String(!on));
    if (on) rpName();
    if (focus) try { (on ? rpTab : foldBtn).focus({ preventScroll: true }); } catch (e) { /* */ }
    if (was !== on) document.dispatchEvent(new CustomEvent('atlas:rightpanel', { detail: { collapsed: on } }));
  }
  function rpSet(v, focus) {
    rpWant = !!v; try { const k = rpKey(); if (k) localStorage.setItem(k, rpWant ? '1' : '0'); } catch (e) { /* */ }
    if (!rpWant && !right.classList.contains('open')) right.classList.add('open');   // развернуть — панель видна
    rpApply(focus);
  }
  foldBtn.addEventListener('click', () => rpSet(true, true));
  rpTab.addEventListener('click', () => rpSet(false, true));
  RP_MQ.addEventListener('change', () => rpApply(false));
  document.addEventListener('atlas:selectionchange', () => { if (right.classList.contains('rp-collapsed')) rpName(); });
  document.addEventListener('keydown', e => {
    if (e.code !== 'Backslash' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || RP_MQ.matches) return;
    const t = e.target; if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!inScene(e) && !(t && t.closest && t.closest('#right'))) return;   /* 1.0.19a М-3 (WCAG 2.1.4): клавиша-символ — только в сцене или в самой панели (вкладка и кнопка свёртки — внутри #right) */
    e.preventDefault(); rpSet(!rpWant, true);
  });
  rpApply(false);
  /* 1.0.19a К-3 (WCAG 4.1.3): выбор объявляется вежливой live-областью — «Выбран: <имя> · <уровень> · <оси>», только поля, которые есть в данных
     (уровень — albumRecord.level, оси — albumRecord.axis или по сетке осей, как в «Где находится»). Кнопка «К карточке» (видна при фокусе, сразу после холста) ставит фокус на заголовок карточки. */
  const announce = make('div', { class: 'card-sr', id: 'cardAnnounce', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  document.body.append(announce);
  function announceSel(o, nameHint) {
    if (!o) { announced = null; return; }
    if (announced === o.renderId) return; announced = o.renderId;
    const rec = o.albumRecord || {}, parts = [];
    let nm = String(nameHint || '').trim(); if (!nm) { try { nm = human(o, (typeOf(o) || {}).mark).title || ''; } catch (e) { nm = ''; } } if (!nm) nm = o.name || '';
    if (nm) parts.push(nm);
    if (S.siteFeature('levels') && txt(rec.level)) parts.push(txt(rec.level));
    let ax = txt(rec.axis); if (!ax) { const b = okB(rdB(o)) ? rdB(o) : o.bounds; if (okB(b) && o.role === 'album_world' && axesNow().ok) { try { ax = axesOf(b); } catch (e) { ax = null; } } }
    if (ax) parts.push('оси ' + ax);
    if (parts.length) announce.textContent = 'Выбран: ' + parts.join(' · ');
  }
  const skip = make('button', { type: 'button', class: 'card-skip' }, 'К карточке');
  skip.addEventListener('click', () => {
    if (right.classList.contains('rp-collapsed')) rpSet(false, false);
    right.classList.add('open');
    const sumH = $('cardSumH'), h = (cur && !right.classList.contains('is-empty')) || !sumH || sumH.hidden ? title : sumH;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    try { h.focus({ preventScroll: false }); } catch (e) { /* */ }
  });
  { const cv = $('canvas'); if (cv && cv.parentElement) cv.after(skip); else { const st = document.querySelector('.stage'); if (st) st.append(skip); } }

  window.AtlasCard = { refresh: () => { current = null; schedule(); }, remarksFor: id => remarksByElement.get(id) || [], human, axesOf, level,
    rightPanel: v => { if (typeof v === 'boolean') rpSet(v, false); return { collapsed: right.classList.contains('rp-collapsed'), want: rpWant }; },   // 1.0.13
    cut: () => { if (cutOn() || cutForSel()) cutToggle(); }, cutOn: () => cutOn(), cutReady: () => !!(FE().sectionApi && cutForSel()) };   // 1.0.12: срез — только для тела, выбранного сейчас (карточка могла ещё не смениться)   // 1.0.12: «Срез по телу» из ряда выреза замечаний — тот же P9
  renderEmpty();
  schedule();
  // V12.5 Q5 (решение D): плашка над моделью слева сверху (как «← К замечанию»; на 390 — ниже чипа «Замечания»): «<имя> закрыт окружением» · «Показать срезом» · «×».
  // Закрытость — __ATLAS.isOccluded(id).occluded (E1, правило D: видно < 2 из 5 точек тела); порог сами не считаем.
  // Когда спрашивать: камера встала (+300 мс), после «К элементу», после отрисовки карточки. Не показываем: изоляция, M4, включено сечение, открыт узел целиком, «×» для этого тела (до конца сеанса).
  (function () {
    const stage = document.querySelector('.stage'); if (!stage) return;
    const box = make('div', { class: 'card-occl', role: 'status', hidden: true });
    // V12.5b R1-01 (D): «Закрыт окружением: <имя>» — многоточие режет имя, суть видна; aria — полный текст
    const txt = make('span', { class: 'card-occl-t' }), txtK = make('span', { class: 'card-occl-k' }, 'Закрыт окружением'), txtN = make('span', { class: 'card-occl-n' });
    txt.append(txtK, txtN);
    const go = make('button', { type: 'button', class: 'card-occl-go' }, CUT_ON);
    const x = make('button', { type: 'button', class: 'card-occl-x', 'aria-label': 'Скрыть подсказку', title: 'Скрыть подсказку' }); x.append(ic('close'));
    box.append(txt, go, x); stage.append(box);
    const shut = new Set(); let t = 0;
    const hide = () => { box.hidden = true; };
    const sectionOn = () => { try { const A = window.__ATLAS, ax = $('sliceAxis'); return !!((A.sectionState && (A.sectionState() || {}).section) || (ax && ax.value !== 'none')); } catch (e) { return false; } };
    const nodeWhole = () => { try { const N0 = N(), st = N0 && N0.state ? N0.state() || {} : {}; return !!st.k; } catch (e) { return false; } };
    function check() {
      const A = window.__ATLAS;
      if (!A || typeof A.isOccluded !== 'function' || !cur) return hide(); // без функции в движке (V12.4) — плашки нет
      const id = cur.o.renderId;
      if (shut.has(id) || isoOn() || document.body.classList.contains('iss-on') || sectionOn() || nodeWhole() || right.dataset.cardFor !== id) return hide();
      let r = null; try { r = A.isOccluded(id); } catch (e) { r = null; } // E1 по правилу D: 5 точек тела, occluded = total > 0 && visible < 2
      if (!r || !r.occluded) return hide();
      const nm = (title.textContent || '').trim(), full = nm ? 'Закрыт окружением: ' + nm : 'Закрыт окружением'; /* V12.6b: без названия — одна строка, без «элемент» */ txtN.textContent = nm; txtN.hidden = !nm; txtN.removeAttribute('title'); box.title = full; /* V12.6b (D): полное название — подсказкой у всей плашки */ box.setAttribute('aria-label', full); go.textContent = CUT_ON; go.setAttribute('aria-label', nm ? CUT_ON + ': ' + nm : CUT_ON); go.title = nm ? CUT_ON + ': ' + nm : CUT_ON; /* V12.6 R7 (D) */ box.hidden = false; place();
    }
    // V12.5b: место — под строкой вида (D), под баннером «← К замечанию», если он виден (координатор), на 390 — под чипом «Замечания»; зазор 8 px
    function place() {
      if (box.hidden) return;
      const st = stage.getBoundingClientRect(); let top = innerWidth > 850 ? 106 : 108;
      for (const el of [document.querySelector('.atb-view'), document.querySelector('.from-banner'), innerWidth <= 850 ? document.getElementById('atbIssues') : null]) {
        if (!el || el.hidden || !el.getClientRects().length || getComputedStyle(el).position === 'static' && el.id === 'atbIssues' && !el.classList.contains('iss-chip')) continue;
        const r = el.getBoundingClientRect(); if (r.height && r.bottom > st.top) top = Math.max(top, Math.round(r.bottom - st.top + 8));
      }
      box.style.top = top + 'px';
    }
    addEventListener('resize', place);
    new MutationObserver(place).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
    const soon = () => { clearTimeout(t); t = setTimeout(check, 300); };
    go.onclick = () => { cutToggle(); hide(); };
    x.onclick = () => { if (cur) shut.add(cur.o.renderId); hide(); };
    document.addEventListener('atlas:camera', soon);
    document.addEventListener('atlas:focus', e => { if (e.detail && e.detail.status === 'done') soon(); });
    document.addEventListener('atlas:occludedchange', soon);
    let vq = 0;   /* 1.0.16 B3-11 (A8): скрыли или вернули тела, изоляция — чип пересчитать сразу, до кадра canvas; B3-11b: без таймера, несколько событий в одном такте — один повторный пересчёт в конце такта */
    document.addEventListener('atlas:visibility', () => { clearTimeout(t); if (vq) { vq = 2; return; } vq = 1; check(); queueMicrotask(() => { const again = vq === 2; vq = 0; if (again) check(); }); });
    for (const ev of ['atlas:selectionchange', 'atlas:isolate', 'atlas:section', 'atlas:issues', 'atlas:node', 'atlas:scope']) document.addEventListener(ev, () => { hide(); soon(); });
    window.__b3Occl = { soon, check, sync() {} };
  })();
})();
