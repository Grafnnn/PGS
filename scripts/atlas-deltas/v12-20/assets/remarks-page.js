/* 3D Атлас · страница «Замечания к РД» (п. 1.3.2). Строится из window.ATLAS_REMARKS (data/rd_remarks_final.js).
   Адрес хранит состояние: RD_REMARKS.html#id=АС2-23&sec=АС2&pri=Средняя&cat=…&st=…&q=…&el=… */
'use strict';
(() => {
  const S = window.AtlasShell, make = S.make, fmt = S.fmt;
  const DATA = window.ATLAS_REMARKS || { edition: {}, items: [] };
  const ED = DATA.edition || {}, ITEMS = DATA.items || [];
  const $ = id => document.getElementById(id);
  // 1.0.4: места в здании записи — building_links и тела пар collision.pairs (пары — не больше 40 тел)
  const LK = new Map();
  const links = r => {
    let L = LK.get(r); if (L) return L;
    L = (r.building_links || []).slice(); const seen = new Set(L.map(l => l && l.id)); let n = 0;
    for (const q of ((r.collision && r.collision.pairs) || [])) for (const id of [q && q.a, q && q.b]) if (id && !seen.has(id) && n < 40) { seen.add(id); n++; L.push({ id, name: id, method: 'пара коллизии' }); }
    LK.set(r, L); return L;
  };
  const SEC_LABEL = {}; for (const x of (((window.ATLAS_PROJECT || {}).search || {}).rd_sections || [])) if (x && x.code && x.label) SEC_LABEL[x.code] = x.label;   // К1: подписи разделов — search.rd_sections
  const secLabel = c => SEC_LABEL[c] || c;
  const SIGS = ['Высокая', 'Средняя', 'Низкая'];
  const CATS = ['Противоречие', 'Недостающие данные', 'Ошибка', 'Расхождение с сортаментом', 'Коллизия', 'Дублирование'];
  const STATUSES = ['Открыто', 'Ответ получен', 'Закрыто'];
  const SECTIONS = Object.keys(ED.by_section || {}).length ? Object.keys(ED.by_section) : [...new Set(ITEMS.map(r => r.section_code))];
  const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е');
  const hay = new Map(ITEMS.map(r => [r.id, norm([r.id, r.prev_id, r.what, r.printed, r.should, r.todo, r.sheet, (r.sheets || []).join(' '), r.section, r.section_group,
    r.category, (r.packages || []).join(' '), links(r).map(l => l.name + ' ' + l.id).join(' ')].join(' \u0001 '))]));

  /* ---------- состояние в адресе ---------- */
  let st = read();
  function read() {
    const h = new URLSearchParams(location.hash.slice(1));
    return { id: h.get('id') || '', sec: h.get('sec') || '', pri: h.get('pri') || '', cat: h.get('cat') || '', st: h.get('st') || '', q: h.get('q') || '', el: h.get('el') || '' };
  }
  function write(push) {
    const h = new URLSearchParams();
    for (const k of ['id', 'sec', 'pri', 'cat', 'st', 'q', 'el']) if (st[k]) h.set(k, st[k]);
    const url = '#' + h.toString();
    if (url === location.hash || (url === '#' && !location.hash)) return;
    if (push) history.pushState(null, '', url); else history.replaceState(null, '', url);
  }
  function set(patch, push = true) { Object.assign(st, patch); write(push); render(); }
  window.addEventListener('popstate', () => { st = read(); syncInputs(); render(); });
  window.addEventListener('hashchange', () => { st = read(); syncInputs(); render(); });

  /* ---------- фильтрация ---------- */
  const match = (r, skip) => (skip === 'sec' || !st.sec || r.section_code === st.sec)
    && (skip === 'pri' || !st.pri || r.significance === st.pri)
    && (skip === 'cat' || !st.cat || r.category === st.cat)
    && (skip === 'st' || !st.st || r.status === st.st)
    && (!st.el || links(r).some(l => l.id === st.el))
    && (!st.q || norm(st.q).split(/\s+/).filter(Boolean).every(w => hay.get(r.id).includes(w)));
  const count = (pred) => ITEMS.filter(pred).length;

  /* ---------- шапка страницы ---------- */
  const [y, m, d] = String(ED.date || '').split('-');
  { const ex = ((window.ATLAS_TEXTS || {}).remarks || {}).search_example; if (typeof ex === 'string' && ex && $('q')) $('q').placeholder = 'Лист, марка, текст — например «' + ex + '»'; }   // К1: пример — тексты объекта
  if (!ITEMS.length && !ED.date) $('edition').textContent = 'Замечаний к рабочей документации в данных объекта нет'; else
  $('edition').textContent = 'Итоговая редакция для проектировщика от ' + (d ? d + '.' + m + '.' + y : '—') + ' · ' + fmt(ED.count || ITEMS.length) + ' ' + S.plural(ED.count || ITEMS.length, 'замечание', 'замечания', 'замечаний') + ', из них ' + fmt((ED.by_significance || {})['Высокая'] || count(r => r.significance === 'Высокая')) + ' высокой значимости';
  const files = ED.files || {};
  // К1: кнопка файла — только если файл есть в edition.files данных (папка — edition.files.dir, иначе rd_remarks_final/); нет — кнопки нет
  const fileLink = (key, label) => { const a = $(key); if (!a) return; const f = files[key.replace('file_', '')]; if (!f) { a.remove(); return; } a.href = (files.dir || 'rd_remarks_final') + '/' + f; a.hidden = false; a.lastChild.textContent = label; };
  fileLink('file_xlsx', 'Скачать реестр (XLSX)');   // 1.0.19a (словарь, строка 8): глагол и формат в скобках
  { const pp = files.pdf_pages || ((window.ATLAS_TEXTS || {}).remarks || {}).pdf_pages; fileLink('file_pdf', 'PDF' + (pp ? ' · ' + fmt(pp) + ' стр.' : '')); }   // К1: число страниц — данные или тексты объекта
  fileLink('file_appendix1', 'Приложение 1 · пересечения по осям');
  // V12.2 · M4: вход в «Замечания на модели» (адрес — СТАТУС_B2, «нужно от B»). Число — тем же правилом, что легенда atlas-issues.js: замечания с building_links.
  (() => {
    const acts = document.querySelector('.page-head .page-actions'); if (!acts) return;
    const n = ITEMS.filter(r => links(r).length).length; if (!n) return;
    const tot = ED.count || ITEMS.length, rest = Math.max(0, tot - n);   /* 1.0.19a М-2: одна подпись везде — «На модели · 83 из 136»; в подсказке — «ещё 53 не привязаны к элементам» */
    const a = make('a', { class: 'pbtn pbtn--outline', id: 'toIssues', href: 'index.html#issues', title: 'Показать на модели: ' + fmt(n) + ' из ' + fmt(tot) + ' ' + S.plural(tot, 'замечания', 'замечаний', 'замечаний') + (rest ? ' · ещё ' + fmt(rest) + ' не ' + S.plural(rest, 'привязано', 'привязаны', 'привязаны') + ' к элементам' : '') });
    a.append(document.createTextNode('На модели · ' + fmt(n) + ' из ' + fmt(tot))); a.insertAdjacentHTML('afterbegin', S.icon('model', 'icon--16'));
    acts.prepend(a);
  })();

  /* ---------- фильтры ---------- */
  const secChips = $('secChips'), priChips = $('priChips'), catSel = $('cat'), stSel = $('status'), q = $('q');
  function chip(label, n, pressed, onClick, dot) {
    const b = make('button', { type: 'button', class: 'chip' + (pressed ? ' is-on' : ''), 'aria-pressed': String(pressed) });
    if (dot) b.append(make('span', { class: 'dot dot--' + dot, 'aria-hidden': 'true' }));
    b.append(make('span', {}, label), make('span', { class: 'chip-n' }, fmt(n)));
    b.onclick = onClick;
    return b;
  }
  function renderFilters() {
    secChips.replaceChildren(chip('Все', ITEMS.length, !st.sec, () => set({ sec: '', id: '' })),
      ...SECTIONS.map(c => chip(secLabel(c), count(r => r.section_code === c), st.sec === c, () => set({ sec: st.sec === c ? '' : c, id: '' }))));
    const inSec = r => match(r, 'pri');
    // V12.0 · 1.3: значимость — один сегмент-переключатель «Все · Высокая · Средняя · Низкая»
    const segBtn = (label, n, on, fn) => { const b = make('button', { type: 'button', class: 'seg-b' + (on ? ' is-on' : ''), 'aria-pressed': String(on) }); b.append(make('span', {}, label), make('span', { class: 'chip-n' }, fmt(n))); b.onclick = fn; return b; };
    priChips.replaceChildren(segBtn('Все', count(inSec), !st.pri, () => set({ pri: '', id: '' })),
      ...SIGS.map(s => segBtn(s, count(r => inSec(r) && r.significance === s), st.pri === s, () => set({ pri: st.pri === s ? '' : s, id: '' }))));
    const inCat = r => match(r, 'cat');
    catSel.replaceChildren(new Option('все · ' + fmt(count(inCat)), ''), ...CATS.map(c => new Option(c + ' · ' + fmt(count(r => inCat(r) && r.category === c)), c)));
    catSel.value = st.cat;
    const inSt = r => match(r, 'st');
    stSel.replaceChildren(new Option('все · ' + fmt(count(inSt)), ''), ...STATUSES.map(s => new Option(s.toLowerCase() + ' · ' + fmt(count(r => inSt(r) && r.status === s)), s)));
    stSel.value = st.st;
    const el = $('elFilter');
    el.hidden = !st.el;
    if (st.el) el.querySelector('span').textContent = 'Элемент модели: ' + ((ITEMS.flatMap(r => links(r)).find(l => l.id === st.el) || {}).name || st.el);
  }
  catSel.onchange = () => set({ cat: catSel.value, id: '' });
  stSel.onchange = () => set({ st: stSel.value, id: '' });
  let qTimer = 0;
  q.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => set({ q: q.value.trim() }, false), 120); });
  $('elFilter').querySelector('button').onclick = () => set({ el: '' });
  function syncInputs() { if (q.value.trim() !== st.q) q.value = st.q; }

  /* ---------- список ---------- */
  const rows = $('rows');
  let focusRow = false, listScroll = 0, backToList = false;
  // R3-05: значимость — значок-форма из спрайта (треугольник / ромб / круг), не точка
  function sig(s) { const e = make('span', { class: S.sigClass(s) + ' sig--icon' }); e.innerHTML = S.icon({ 'Высокая': 'sig-high', 'Средняя': 'sig-mid' }[s] || 'sig-low', 'icon--16'); e.append(document.createTextNode(s)); return e; }
  function renderList(list) {
    rows.replaceChildren();
    if (!list.length) {
      // 1.0.19a к2: при пустом результате — «Сбросить» (поиск и все фильтры, как на library; открытое замечание остаётся); без фильтров пусто только у объекта без замечаний
      const busy = ['sec', 'pri', 'cat', 'st', 'q', 'el'].some(k => st[k]);
      const p = make('p', { class: 'rempty' + (busy ? ' rempty--reset' : '') }, busy ? 'Ничего не найдено. Измените фильтры или запрос.' : 'Замечаний в данных объекта нет.');
      if (busy) {
        const b = make('button', { type: 'button', class: 'pbtn pbtn--sm' }, 'Сбросить');
        b.onclick = () => { clearTimeout(qTimer); q.value = ''; set({ sec: '', pri: '', cat: '', st: '', q: '', el: '' }); q.focus(); };
        p.append(b);
      }
      rows.append(p); return;
    }
    const frag = document.createDocumentFragment();
    for (const r of list) {
      const b = make('button', { type: 'button', class: 'rrow', 'aria-pressed': String(r.id === st.id), 'data-id': r.id, tabindex: '-1' });
      const txt = make('span', { class: 'rtext' });
      txt.append(make('span', { class: 'rwhat' }, r.what), make('span', { class: 'rmeta' }, (r.section || secLabel(r.section_code)) + ' · ' + r.category));
      const sigCell = make('span', { class: 'rsig' }); sigCell.append(sig(r.significance));
      b.append(make('span', { class: 'rid mono' }, r.id), sigCell, txt, make('span', { class: 'rsheet' }, r.sheet || '—'));
      b.onclick = () => { focusRow = true; listScroll = scrollY; set({ id: r.id }); };
      b.addEventListener('focus', () => { for (const x of rows.querySelectorAll('.rrow[tabindex="0"]')) if (x !== b) x.tabIndex = -1; b.tabIndex = 0; });
      frag.append(b);
    }
    rows.append(frag);
    const tab = rows.querySelector('[aria-pressed="true"]') || rows.querySelector('.rrow');
    if (tab) tab.tabIndex = 0;
    const cur = rows.querySelector('[aria-pressed="true"]');
    // V12.0 · 0.5: выбранная строка (в том числе по ссылке #id=…) — в середину списка, если её не видно.
    if (cur && !isInView(cur)) cur.scrollIntoView({ block: 'center' });
  }
  // Видна ли строка и в списке, и в окне (список может уходить ниже края окна).
  const isInView = el => { const a = el.getBoundingClientRect(), b = rows.getBoundingClientRect(); return a.top >= Math.max(b.top, 0) && a.bottom <= Math.min(b.bottom, innerHeight); };

  const ISSUE_CROP = !!(((window.ATLAS_PROJECT || {}).view || {}).issue_crop);   // 1.0.11: вырез у замечания включён у объекта
  const TXR = (k, d) => { const t = ((window.ATLAS_TEXTS || {}).issues || {})[k]; return typeof t === 'string' && t ? t : d; };
  /* ---------- карточка замечания ---------- */
  const detail = $('detail');
  function linkButton(label, cls, items, empty, icon) {
    const wrap = make('div', { class: 'lbtn' });
    if (!items.length) {
      // Причина неактивности — видимым текстом.
      wrap.append(make('span', { class: 'pbtn ' + cls, 'aria-disabled': 'true', role: 'note' }, empty));
      return wrap;
    }
    if (items.length === 1) {
      const a = make('a', { class: 'pbtn ' + cls, href: items[0].href, 'aria-label': label + ' — ' + items[0].label }, label === 'Тип' ? items[0].label : label);
      if (items[0].blank) { a.target = '_blank'; a.rel = 'noopener'; }
      if (icon) a.insertAdjacentHTML('afterbegin', icon);
      wrap.append(a);
      return wrap;
    }
    const b = make('button', { type: 'button', class: 'pbtn ' + cls }, label + ' · ' + items.length);
    if (icon) b.insertAdjacentHTML('afterbegin', icon);
    S.popover(b, items);
    wrap.append(b);
    return wrap;
  }
  // значки — из общего спрайта (V12.0 · 0.6)
  const IC = { get sheet() { return S.icon('sheet', 'icon--16'); }, get type() { return S.icon('catalogue', 'icon--16'); }, get home() { return S.icon('model', 'icon--16'); } };
  function sheetItems(r) {
    const fromQ = '&from=' + encodeURIComponent(r.id);
    const out = (r.sheet_links || []).map(l => ({ href: /^library\.html#/.test(l.href) ? l.href + fromQ : l.href, label: l.title || (l.sheet ? 'Лист ' + l.sheet : 'PDF альбома' + (r.album ? ' ' + r.album : '')), sub: l.method || null, blank: /\.pdf/i.test(l.href), sheet: l.sheet }));
    if (!out.length && r.album_pdf) out.push({ href: r.album_pdf, label: 'PDF альбома ' + (r.album || ''), blank: true });
    return out;
  }
  function renderDetail(r) {
    detail.replaceChildren();
    document.body.classList.toggle('has-detail', !!r);
    if (!r) { document.title = 'Замечания к РД · 3D Атлас'; detail.append(make('p', { class: 'rempty' }, 'Выберите замечание в списке.')); return; }
    const back = make('button', { type: 'button', class: 'rback' }, '← К списку');
    back.onclick = () => { backToList = r.id; set({ id: '' }); };
    const head = make('div', { class: 'dhead' });
    head.append(make('h2', { class: 'did mono', id: 'remarkTitle', tabindex: '-1' }, r.id), sig(r.significance), make('span', { class: 'dpill' }, r.category), (() => { const stt = r.status || 'Открыто', e = make('span', { class: 'dstatus', title: 'Статус замечания' }); e.innerHTML = S.icon(/Закрыт|Ответ/.test(stt) ? 'status-done' : 'status-open'); e.append(document.createTextNode(stt)); return e; })()); // V12.0 · 1.3: статус крупно
    const grid = make('div', { class: 'dgrid' });
    const cell = (label, value) => { const c = make('div'); c.append(make('span', { class: 'dlabel' }, label), make('span', { class: 'dvalue' }, value)); return c; };
    grid.append(cell('Раздел', r.section || secLabel(r.section_code)), cell('Лист', r.sheet || '—'));
    const block = (label, text, cls) => { const b = make('div', { class: 'dblock ' + (cls || '') }); b.append(make('span', { class: 'dlabel' }, label), make('span', { class: 'dtext' }, text || '—')); return b; };
    const buttons = make('div', { class: 'dbtns' });
    const sheets = sheetItems(r);
    const sheetLabel = sheets.length === 1 ? (sheets[0].sheet ? 'Лист ' + sheets[0].sheet : 'PDF альбома') : 'Листы';
    // V12.0 · 0.5: вместо трёх пунктирных кнопок «нет …» — одна строка о том, чего нет (РД-01: «Нет листа, типа и места в здании»).
    const typeItems = (r.catalogue_links || []).map(l => ({ href: 'catalogue-model.html#package/' + l.package, label: 'Тип № ' + l.package, sub: '3D-просмотр типа и данные спецификации' }));
    const missing = [];
    if (!sheets.length) missing.push('листа'); if (!typeItems.length) missing.push('типа'); if (!links(r).length) missing.push('места в здании');
    // V12.0 · 1.3: «Показать на модели» — главная кнопка (ведёт на index.html#scope=…&id=…&from=<№>), затем лист и тип
    // 1.0.11: у объекта с вырезом (view.issue_crop) «На модели» ведёт в «Замечания на модели» сразу к замечанию — index.html#issues=1&issue=<ID>
    if (links(r).length && ISSUE_CROP) buttons.append(linkButton('На модели', 'pbtn--primary', [{ href: 'index.html#issues=1&issue=' + encodeURIComponent(r.id), label: TXR('on_model', 'Замечание на модели') }], '', IC.home));
    else if (links(r).length) buttons.append(linkButton('На модели', 'pbtn--primary', links(r).map(l => ({ href: 'index.html#' + (l.review_package != null ? 'layer=' + l.review_package : 'scope=' + (l.scope || 'BUILDING'))   /* К1: ссылка на слой — по номеру пакета слоя в данных */ + '&id=' + encodeURIComponent(l.id) + '&from=' + encodeURIComponent(r.id), label: S.humanName(l.name || l.id), sub: S.linkMethod(l.method) + (l.layer ? ' · слой «' + l.layer + '»' : '') })), 'Нет привязки к месту в здании', IC.home));
    if (sheets.length) buttons.append(linkButton(sheetLabel, 'pbtn--outline', sheets, '', IC.sheet));
    if (typeItems.length) buttons.append(linkButton('Тип', 'pbtn--outline', typeItems, '', IC.type));
    if (missing.length) buttons.append(make('p', { class: 'dnone', role: 'note' }, 'Нет ' + (missing.length > 1 ? missing.slice(0, -1).join(', ') + ' и ' + missing[missing.length - 1] : missing[0]) + '.'));
    const foot = make('div', { class: 'dfoot' });
    if ((r.packages || []).length) {
      const p = make('div');
      p.append(document.createTextNode('Связанные типы: '));
      r.packages.forEach((n, i) => { if (i) p.append(document.createTextNode(', ')); p.append(make('a', { class: 'mono', href: 'catalogue-model.html#block/C' + String(n).padStart(4, '0') }, String(n))); });
      foot.append(p);
    }
    if (r.prev_id) foot.append(make('div', {}, 'Прежний номер: ' + r.prev_id));
    if (r.answer) foot.append(make('div', {}, 'Ответ проектировщика' + (r.answer_date ? ' от ' + r.answer_date : '') + ': ' + r.answer));
    document.title = r.id + ' · Замечания к РД · 3D Атлас';
    detail.append(back, head, make('div', { class: 'dwhat' }, r.what), grid,
      block('Напечатано в документе', r.printed), block('Должно быть · расчёт', r.should), block('Что сделать', r.todo, 'dtodo'), buttons, foot);
  }
  document.addEventListener('keydown', e => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.classList && e.target.classList.contains('rrow')) {
      e.preventDefault();
      const all = [...rows.querySelectorAll('.rrow')], i = all.indexOf(e.target);
      const next = all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) next.focus();
    }
  });

  function render() {
    renderFilters();
    const list = ITEMS.filter(r => match(r));
    $('shown').textContent = 'Показано ' + fmt(list.length) + ' из ' + fmt(ITEMS.length);
    renderList(list);
    renderDetail(ITEMS.find(r => r.id === st.id) || null);
    const f = rows.querySelector('[aria-pressed="true"]');
    if (focusRow && document.getElementById('remarkTitle')) document.getElementById('remarkTitle').focus({ preventScroll: innerWidth > 850 });
    focusRow = false;
    if (backToList) { const row = rows.querySelector('[data-id="' + CSS.escape(backToList) + '"]'); scrollTo(0, listScroll); if (row) { row.tabIndex = 0; row.focus({ preventScroll: true }); } backToList = false; }
  }
  // По умолчанию на широком экране открыто первое замечание списка (как в макете); на телефоне — только список.
  if (!st.id && innerWidth > 850) { const first = ITEMS.find(r => match(r)); if (first) { st.id = first.id; write(false); } }
  // Телефон: «Скачать ▾» вместо трёх кнопок, «Фильтры (N)» для значимости, вида и статуса.
  {
    const acts = document.querySelector('.page-actions');
    const dl = make('button', { type: 'button', class: 'pbtn phone-only dl-btn' }, 'Скачать ▾');
    S.popover(dl, [...acts.querySelectorAll('a.pbtn')].map(a => ({ href: a.getAttribute('href'), label: a.textContent.trim(), blank: a.target === '_blank' })));
    acts.append(dl);
    const row2 = $('filtersMore');
    const fb = make('button', { type: 'button', class: 'pbtn phone-only filters-btn', 'aria-expanded': 'false', 'aria-controls': 'filtersMore' });
    row2.before(fb);
    const fsync = () => { const n = ['cat', 'st'].filter(k => st[k]).length; fb.textContent = 'Фильтры' + (n ? ' (' + n + ')' : ''); };
    fb.onclick = () => { const open = !row2.classList.contains('open'); row2.classList.toggle('open', open); fb.setAttribute('aria-expanded', String(open)); };
    document.addEventListener('click', () => setTimeout(fsync, 0)); fsync();
    const shownPhone = make('p', { class: 'phone-only shown-phone', 'aria-hidden': 'true' });
    document.querySelector('.rgrid').before(shownPhone);
    new MutationObserver(() => { shownPhone.textContent = $('shown').textContent; }).observe($('shown'), { childList: true, characterData: true, subtree: true });
  }
  syncInputs();
  render();
  window.AtlasRemarksPage = { state: () => ({ ...st }), shown: () => ITEMS.filter(r => match(r)).map(r => r.id) };
})();
