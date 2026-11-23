/* 3D Атлас · основание значения — фрагмент листа (ядро 1.2, план 2.0, этап 4; условие готовности 5).
   У значения (поле паспорта, поле полевого комплекта) может быть ссылка на участок листа — fragment (объект или список):
     {source_key? | source_id?, document, file, revision, sha256, pdf_page, printed_sheet?, page_size?:[w,h] pt,
      rect?:[x0,y0,x1,y1] pt — участок листа (начало — левый верхний угол), mark?:[x0,y0,x1,y1] pt — место значения,
      image? — вырезка участка rect, image_size?:[w,h] px, image_sha256?, sheet_image? — весь лист растром,
      expected?:{value?, unit?, text?} — значение, напечатанное на листе (value:null — на листе значения нет), note?}
   Формат — DATA_CONTRACT §9.17, схема schemas/evidence.schema.json. Ядро ничего не додумывает: показывает только то, что дали данные.
   Сверка перед показом (verify): документ есть в реестре источников; SHA-256 и редакция совпадают с реестром; страница — из ссылок значения
   (или страница записи источника); значение и единица карточки совпадают с expected. Любое несовпадение — явный откат:
   вместо фрагмента «Весь лист» с причиной и ссылкой на страницу PDF; вырезка не показывается как основание.
   Реестр: по умолчанию albumSources движка (__FULL_ATLAS.sourceAvailability(), ключ source_key); модуль может передать свой (ctx.lookup).
   Без fetch/XHR, работает из file://; окно — <dialog>, Esc закрывает, фокус возвращается на кнопку. Нет данных — модуль молчит. */
'use strict';
window.AtlasEvidence = (() => {
  const HEX = /^[a-f0-9]{64}$/;
  const str = v => typeof v === 'string' && v.trim() ? v.trim() : '';
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const quad = v => Array.isArray(v) && v.length === 4 && v.every(num) && v[0] < v[2] && v[1] < v[3];
  const pair = v => Array.isArray(v) && v.length === 2 && v.every(x => num(x) && x > 0);
  /* путь в пакете: относительный, без схемы, без «..» и без абсолютного начала */
  const safe = p => !!str(p) && !/^[a-z][a-z0-9+.-]*:/i.test(p) && !/^[\\/]/.test(p) && !String(p).split(/[\\/]/).includes('..');
  const enc = p => String(p).split('/').map(encodeURIComponent).join('/');
  const REASON = {
    source: 'документа нет в реестре источников',
    sha: 'SHA-256 файла не совпадает с реестром',
    revision: 'редакция листа не совпадает с реестром',
    file: 'файл документа в реестре другой',
    page: 'страницы нет в ссылках значения',
    value: 'значение в карточке не совпадает со значением на листе',
    unit: 'единица в карточке не совпадает с листом',
    origin: 'значение получено не из документа'
  };
  const warned = new Set();
  function warn(t) { if (!warned.has(t)) { warned.add(t); console.warn('[evidence] ' + t); } }

  /* ---------- форма ---------- */
  function norm(f) {
    if (!f || typeof f !== 'object') return null;
    const why = !safe(f.file) ? 'нет file' : !(Number.isInteger(f.pdf_page) && f.pdf_page > 0) ? 'нет pdf_page' : !(typeof f.sha256 === 'string' && HEX.test(f.sha256)) ? 'нет sha256'
      : !str(f.revision) ? 'нет revision' : (f.image != null && !safe(f.image)) ? 'неверный image' : (f.image != null && !quad(f.rect)) ? 'image без rect'
      : (f.mark != null && !quad(f.mark)) ? 'неверный mark' : (f.sheet_image != null && !safe(f.sheet_image)) ? 'неверный sheet_image' : '';
    if (why) { warn('фрагмент пропущен: ' + why + ' (' + (str(f.document) || str(f.file) || '?') + ')'); return null; }
    const e = f.expected && typeof f.expected === 'object' ? f.expected : null;
    return {
      source_key: str(f.source_key) || null, source_id: str(f.source_id) || null, document: str(f.document) || str(f.file).split('/').pop(),
      file: f.file, revision: str(f.revision), sha256: f.sha256, pdf_page: f.pdf_page, printed_sheet: f.printed_sheet == null ? null : String(f.printed_sheet),
      page_size: pair(f.page_size) ? f.page_size.slice() : null, rect: quad(f.rect) ? f.rect.slice() : null, mark: quad(f.mark) ? f.mark.slice() : null,
      image: f.image || null, image_size: pair(f.image_size) ? f.image_size.slice() : null, sheet_image: f.sheet_image || null,
      expected: e ? { has: 'value' in e, value: e.value, unit: e.unit == null ? null : String(e.unit), text: str(e.text) || null } : null, note: str(f.note) || null
    };
  }
  /* фрагменты значения: v.fragment (объект или список) или v.fragments; неверные пропускаются по одному */
  function of(v) {
    if (!v || typeof v !== 'object') return [];
    const raw = v.fragments != null ? v.fragments : v.fragment;
    return (Array.isArray(raw) ? raw : raw ? [raw] : []).map(norm).filter(Boolean);
  }

  /* ---------- сверка ---------- */
  function defaultLookup(fr) {
    if (!fr.source_key) return null;
    try { const all = window.__FULL_ATLAS && window.__FULL_ATLAS.sourceAvailability && window.__FULL_ATLAS.sourceAvailability(); return all && all[fr.source_key] || null; } catch (e) { return null; }
  }
  const same = (a, b) => num(a) && num(b) ? Math.abs(a - b) < 1e-9 : (a == null && b == null) || String(a).trim() === String(b).trim();
  function verify(fr, ctx) {
    ctx = ctx || {};
    const reasons = [];
    const src = (ctx.lookup || defaultLookup)(fr);
    if (!src) reasons.push('source');
    else {
      if (src.sha256 !== fr.sha256) reasons.push('sha');
      if (str(src.revision) !== fr.revision) reasons.push('revision');
      const sf = str(src.file) || str(src.path);
      if (sf && sf !== fr.file) reasons.push('file');
      if (!Array.isArray(ctx.refs) && Number.isInteger(src.pdf_page) && src.pdf_page !== fr.pdf_page) reasons.push('page');
    }
    if (Array.isArray(ctx.refs)) {
      const id = fr.source_id || fr.source_key;
      if (!ctx.refs.some(r => r && r.source === id && r.pdf_page === fr.pdf_page)) reasons.push('page');
    }
    if (ctx.documentary === false) reasons.push('origin');
    if (fr.expected && fr.expected.has && 'value' in ctx && !same(fr.expected.value, ctx.value)) reasons.push('value');
    if (fr.expected && fr.expected.unit != null && ctx.unit != null && fr.expected.unit !== String(ctx.unit)) reasons.push('unit');
    return { ok: !reasons.length, reasons, text: reasons.map(r => REASON[r] + (r === 'revision' && src ? ' (фрагмент — ' + fr.revision + ', реестр — ' + (str(src.revision) || 'не указана') + ')' : '')) };
  }

  /* ---------- оформление ---------- */
  function css() {
    if (document.getElementById('atlasEvidenceCss')) return;
    const st = document.createElement('style'); st.id = 'atlasEvidenceCss';
    st.textContent =
      '.atlas-ev{display:inline-flex;flex-wrap:wrap;gap:4px 8px;margin-inline-start:8px;vertical-align:middle}' +
      '.atlas-ev button{font:inherit;font-size:13px;font-weight:600;min-height:28px;padding:2px 8px;border-radius:6px;cursor:pointer;border:1px solid var(--c-line,#C9D2D9);background:var(--c-surface,#fff);color:var(--c-accent,#1F6FA8)}' +
      '.atlas-ev button.atlas-ev-fallback{color:var(--c-warn-text,#8A4B00);border-color:var(--c-warn-line,#E0B46C);background:var(--c-warn-bg,#FFF6E5)}' +
      '.atlas-ev button.atlas-ev-none{color:var(--c-text-2,#4A5A66)}' +
      '.atlas-ev button:focus-visible{outline:2px solid var(--c-accent,#1F6FA8);outline-offset:2px}' +
      '@media(pointer:coarse),(max-width:600px){.atlas-ev button{min-height:44px}}' +
      '#atlasEvidence{box-sizing:border-box;width:min(970px,calc(100vw - 24px));max-height:calc(100vh - 24px);padding:0;border:1px solid var(--c-line,#C9D2D9);border-radius:12px;background:var(--c-bg,#F3F7FA);color:var(--c-text,#14202A);font:14px/1.45 var(--font,system-ui,sans-serif)}' +
      '#atlasEvidence::backdrop{background:rgba(20,32,42,.45)}#atlasEvidence *{box-sizing:border-box}' +
      '#atlasEvidence .atlas-ev-top{position:sticky;top:0;z-index:1;display:flex;gap:12px;align-items:flex-start;justify-content:space-between;padding:14px 16px 10px;background:var(--c-bg,#F3F7FA);border-bottom:1px solid var(--c-line,#C9D2D9)}' +
      '#atlasEvidence h2{margin:0;font-size:20px;line-height:1.2}#atlasEvidence .atlas-ev-sub{margin:4px 0 0;color:var(--c-text-2,#4A5A66)}' +
      '#atlasEvidence .atlas-ev-close{flex:0 0 auto;min-width:44px;min-height:44px;font:inherit;font-size:20px;border-radius:8px;border:1px solid var(--c-line,#C9D2D9);background:var(--c-surface,#fff);color:inherit;cursor:pointer}' +
      '#atlasEvidence .atlas-ev-body{padding:12px 16px 18px}' +
      '#atlasEvidence figure{margin:0 0 14px;padding:12px 14px 14px;border:1px solid var(--c-line,#D5E2E9);border-radius:10px;background:var(--c-surface,#fff)}' +
      '#atlasEvidence .atlas-ev-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 14px}' +
      '#atlasEvidence h3{margin:0;font-size:16px}#atlasEvidence .atlas-ev-where,#atlasEvidence .atlas-ev-rev{margin:2px 0 0;font-size:13px;color:var(--c-text-2,#405E6C)}' +
      '#atlasEvidence .atlas-ev-rev{margin-bottom:8px}#atlasEvidence a{color:var(--c-accent,#0B4F6C);font-weight:600;text-underline-offset:3px}' +
      '#atlasEvidence .atlas-ev-orig{display:inline-flex;align-items:center;min-height:44px}' +
      '#atlasEvidence .atlas-ev-crop{position:relative;display:block;border:1px solid var(--c-line,#BFCFD8);overflow:hidden;background:#fff}' +
      '#atlasEvidence .atlas-ev-crop img,#atlasEvidence .atlas-ev-sheetimg{width:100%;height:auto;display:block}' +
      '#atlasEvidence .atlas-ev-mark{position:absolute;outline:2px solid var(--c-accent,#06668A);outline-offset:-1px;pointer-events:none}' +
      '#atlasEvidence .atlas-ev-warn{margin:6px 0 8px;padding:8px 10px;border-radius:8px;border:1px solid var(--c-warn-line,#E0B46C);background:var(--c-warn-bg,#FFF6E5);color:var(--c-warn-text,#6B3B00)}' +
      '#atlasEvidence .atlas-ev-sheet{display:inline-flex;align-items:center;min-height:44px}#atlasEvidence .atlas-ev-note{margin:8px 0 0;font-size:13px;color:var(--c-text-2,#405E6C)}' +
      '@media(max-width:560px){#atlasEvidence{width:100vw;max-width:100vw;max-height:100vh;height:100vh;border-radius:0;margin:0}#atlasEvidence .atlas-ev-top{padding:10px 12px 8px}#atlasEvidence h2{font-size:17px}' +
      '#atlasEvidence .atlas-ev-body{padding:10px 10px 16px}#atlasEvidence figure{padding:10px}#atlasEvidence .atlas-ev-head{display:block}}';
    document.head.append(st);
  }
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v; else e.setAttribute(k, v === true ? '' : v); }
    for (const x of kids.flat(Infinity)) if (x != null && x !== false) e.append(x.nodeType ? x : String(x));
    return e;
  }
  const pct = v => (Math.round(v * 1e4) / 1e2) + '%';
  const where = fr => [fr.printed_sheet ? 'Лист ' + fr.printed_sheet : null, 'страница PDF ' + fr.pdf_page].filter(Boolean).join(' · ');

  /* ---------- окно ---------- */
  let dlg = null, opener = null, openerKey = '';
  function figure(fr, chk, ctx) {
    const orig = el('a', { class: 'atlas-ev-orig', href: enc(fr.file) + '#page=' + fr.pdf_page, target: '_blank', rel: 'noopener' }, 'Открыть оригинал PDF');
    const f = el('figure', { class: 'atlas-ev-doc', 'data-state': chk.ok ? 'ok' : 'stale', 'data-reasons': chk.reasons.join(' ') || null },
      el('div', { class: 'atlas-ev-head' }, el('div', null, el('h3', null, fr.document), el('p', { class: 'atlas-ev-where' }, where(fr))), orig),
      el('p', { class: 'atlas-ev-rev' }, 'Редакция: ' + fr.revision));
    const exp = fr.expected ? (fr.expected.has && fr.expected.value == null ? 'На листе значения нет' : fr.expected.text ? 'На листе: ' + fr.expected.text : null) : null;
    if (chk.ok && fr.image) {
      const r = fr.rect, w = r[2] - r[0], hh = r[3] - r[1];
      const a = el('a', { class: 'atlas-ev-crop', href: enc(fr.image), target: '_blank', rel: 'noopener', 'aria-label': 'Открыть вырезку крупнее, ' + fr.document },
        el('img', { src: enc(fr.image), width: fr.image_size ? fr.image_size[0] : null, height: fr.image_size ? fr.image_size[1] : null,
          alt: [fr.document, where(fr), exp || (ctx.value != null ? 'значение ' + ctx.valueText : null)].filter(Boolean).join(', ') }));
      if (fr.mark) {
        const m = fr.mark, x0 = Math.max(m[0], r[0]), y0 = Math.max(m[1], r[1]), x1 = Math.min(m[2], r[2]), y1 = Math.min(m[3], r[3]);
        if (x1 > x0 && y1 > y0) a.append(el('span', { class: 'atlas-ev-mark', 'aria-hidden': 'true', style: 'left:' + pct((x0 - r[0]) / w) + ';top:' + pct((y0 - r[1]) / hh) + ';width:' + pct((x1 - x0) / w) + ';height:' + pct((y1 - y0) / hh) }));
      }
      f.append(a);
    } else {
      const why = chk.ok ? 'вырезки участка в данных нет' : chk.text.join('; ');
      f.append(el('p', { class: 'atlas-ev-warn', role: 'note' }, (chk.ok ? 'Фрагмента нет: ' : 'Фрагмент не подтверждён: ') + why + '. Открыт весь лист — сверьте значение по оригиналу.'),
        el('a', { class: 'atlas-ev-sheet', href: enc(fr.file) + '#page=' + fr.pdf_page, target: '_blank', rel: 'noopener' }, 'Весь лист: ' + where(fr)));
      if (fr.sheet_image) f.append(el('img', { class: 'atlas-ev-sheetimg', src: enc(fr.sheet_image), alt: 'Весь лист: ' + fr.document + ', ' + where(fr) }));
    }
    if (exp) f.append(el('p', { class: 'atlas-ev-note' }, exp + (fr.note ? '. ' + fr.note : '')));
    else if (fr.note) f.append(el('p', { class: 'atlas-ev-note' }, fr.note));
    return f;
  }
  function close() { if (dlg && dlg.open) dlg.close(); }
  function open(frs, ctx, from) {
    ctx = ctx || {};
    const list = (frs || []).filter(Boolean);
    if (!list.length) return null;
    css();
    if (!dlg) {
      dlg = el('dialog', { id: 'atlasEvidence', 'aria-labelledby': 'atlasEvidenceTitle' });
      dlg.addEventListener('close', () => {
        /* фокус — на кнопку открытия; карточка могла перестроиться за время окна — тогда на такую же кнопку (тот же ключ значения) */
        let o = opener; const key = openerKey; opener = null; openerKey = '';
        if (o && !o.isConnected && key) o = [...document.querySelectorAll('.atlas-ev button[data-ev-key]')].find(b => b.dataset.evKey === key) || null;
        if (o && o.isConnected) try { o.focus({ preventScroll: true }); } catch (e) { /* нет */ }
        document.dispatchEvent(new CustomEvent('atlas:evidence', { detail: { open: false } }));
      });
      dlg.addEventListener('keydown', e => { if (e.key === 'Escape') e.stopPropagation(); });   // Esc закрывает окно, а не карточку и не разбор под ним
      dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
      document.body.append(dlg);
    }
    opener = from || document.activeElement; openerKey = (opener && opener.dataset && opener.dataset.evKey) || '';
    const checks = list.map(fr => verify(fr, ctx));
    const stale = checks.some(c => !c.ok);
    const title = str(ctx.title) || 'Основание значения';
    const sub = stale ? 'Сверка не сошлась — фрагмент не показан как основание' : list.length > 1 ? 'Значение — на ' + list.length + ' листах' : 'Участок листа с этим значением';
    const x = el('button', { type: 'button', class: 'atlas-ev-close', 'aria-label': 'Закрыть' }, '×'); x.onclick = close;
    dlg.replaceChildren(el('div', { class: 'atlas-ev-top' }, el('div', null, el('h2', { id: 'atlasEvidenceTitle' }, title), el('p', { class: 'atlas-ev-sub' }, sub)), x),
      el('div', { class: 'atlas-ev-body' }, list.map((fr, i) => figure(fr, checks[i], ctx))));
    dlg.dataset.state = stale ? 'stale' : 'ok';
    if (!dlg.open) dlg.showModal();
    x.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('atlas:evidence', { detail: { open: true, state: dlg.dataset.state, count: list.length } }));
    return { state: dlg.dataset.state, checks };
  }

  /* ---------- кнопка у значения ---------- */
  /* control(frs, ctx) → <span class="atlas-ev"> или null (фрагментов нет).
     ctx: {title, label, value, unit, valueText, refs?:[{source, pdf_page}], documentary?, lookup?, caption?}.
     Сверилось — «Фрагмент листа» (.atlas-ev-link); нет — «Весь лист · не сверено» (.atlas-ev-fallback) с причиной в подсказке.
     На листе значения нет (expected.value:null) — «Лист: значения нет» (.atlas-ev-none). */
  function control(frs, ctx) {
    ctx = ctx || {};
    const list = (frs || []).filter(Boolean);
    if (!list.length) return null;
    css();
    const checks = list.map(fr => verify(fr, ctx)), ok = checks.every(c => c.ok);
    const none = ok && list.every(fr => fr.expected && fr.expected.has && fr.expected.value == null);
    const cap = str(ctx.caption);
    const text = !ok ? (cap ? cap + ' · ' : '') + 'Весь лист · не сверено' : none ? 'Лист: значения нет' : cap || 'Фрагмент листа';
    const what = [str(ctx.label), str(ctx.valueText)].filter(Boolean).join(', ');
    const b = el('button', { type: 'button', class: !ok ? 'atlas-ev-fallback' : none ? 'atlas-ev-none' : 'atlas-ev-link',
      'aria-label': (!ok ? 'Весь лист, фрагмент не сверен' : none ? 'Лист без значения' : 'Фрагмент листа') + (what ? ': ' + what : ''),
      title: !ok ? 'Фрагмент не подтверждён: ' + [...new Set(checks.flatMap(c => c.text))].join('; ') : list.map(fr => fr.document + ', ' + where(fr) + ', ' + fr.revision).join('\n') });
    b.textContent = text;
    b.dataset.evKey = [str(ctx.label), cap, str(ctx.valueText), list.map(fr => fr.file + '#' + fr.pdf_page).join(',')].join('|');
    b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(list, ctx, b); });
    return el('span', { class: 'atlas-ev', 'data-state': ok ? (none ? 'none' : 'ok') : 'stale' }, b);
  }
  /* поле паспорта: known/derived — фрагменты поля; conflict — у каждой версии свои (подпись — значение версии); unknown — где искали */
  function forPassportField(key, v, opts) {
    if (!v || typeof v !== 'object') return null;
    opts = opts || {};
    const fmt = x => x == null ? '' : num(x) ? x.toLocaleString('ru-RU') : typeof x === 'string' ? x : JSON.stringify(x);
    const UL = { mm: 'мм', m: 'м', m2: 'м²', m3: 'м³', kg: 'кг', pcs: 'шт.', 'шт': 'шт.' }, ul = u => u == null || u === '' ? '' : UL[u] || String(u);   /* подписи единиц — как в карточке (AtlasStatus) */
    const base = { title: opts.title, label: opts.label || key };
    if (v.status === 'conflict' && Array.isArray(v.versions)) {
      const box = el('span', { class: 'atlas-ev atlas-ev--versions' });
      v.versions.forEach((ver, i) => {
        const frs = of(ver); if (!frs.length) return;
        const vt = [fmt(ver && ver.value), ul(ver && ver.unit)].filter(Boolean).join(' ');
        const c = control(frs, Object.assign({}, base, { value: ver ? ver.value : undefined, unit: ver ? ver.unit : null, valueText: vt, caption: 'Версия ' + (i + 1) + (vt ? ': ' + vt : ''),
          title: base.label + ' · версия ' + (i + 1) + (vt ? ' — ' + vt : '') }));
        if (c) box.append(...c.childNodes);
      });
      return box.childNodes.length ? box : null;
    }
    const frs = of(v);
    if (!frs.length) return null;
    if (v.status === 'unknown' || v.status === 'not_in_source') return control(frs, Object.assign(base, { valueText: 'нет в источнике' }));
    const vt = [fmt(v.value), ul(v.unit)].filter(Boolean).join(' ');
    return control(frs, Object.assign(base, { value: v.value, unit: v.unit == null ? null : v.unit, valueText: vt, title: opts.title || (base.label + (vt ? ' ' + vt : '')) }));
  }

  if (window.AtlasShell && window.AtlasShell.registerWindow) window.AtlasShell.registerWindow(() => !!(dlg && dlg.open));
  return { of, norm, verify, control, open, close, forPassportField, isOpen: () => !!(dlg && dlg.open), REASON };
})();
