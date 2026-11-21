/* 3D Атлас · ядро · страница «Требует решения» (UNPLACED.html; К1-B2): модели без подтверждённого места в здании — из набора данных объекта.
   Набор — window.ATLAS_UNPLACED = { note: [строка | { review: строка }], items: [{ title, type_no | type_label, place, reason, href }], csv: { href, label } | null }
   (подключается config.plugins объекта на этой странице). Нет набора или он пуст — страница говорит, что таких моделей нет; пункт меню скрывает шапка (ключ выпуска unplaced). */
'use strict';
(function () {
  const S = window.AtlasShell, main = document.getElementById('unplacedMain');
  if (!main) return;
  const U = window.ATLAS_UNPLACED || null, items = U && Array.isArray(U.items) ? U.items.filter(x => x && typeof x.title === 'string') : [];
  const el = (tag, attrs, text) => { const e = document.createElement(tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  const fmt = n => (S && S.fmt ? S.fmt(n) : String(n)), plural = (n, a, b, c) => (S && S.plural ? S.plural(n, a, b, c) : c);
  const rel = () => { const s = el('span', { 'data-release': 'unplaced' }); s.textContent = fmt(items.length); return s; };
  if (!items.length) {
    main.append(el('h1', null, 'Без подтверждённого места в здании'), el('p', null, 'Моделей без подтверждённого места в здании в данных объекта нет.'));   /* 1.0.19a М-9 (вопрос 3): имя очереди */
    return;
  }
  const h1 = el('h1'); h1.append('Без подтверждённого места в здании · ', rel());   /* 1.0.19a М-9 (вопрос 3): «Без подтверждённого места в здании · 47» */
  const p = el('p'); p.append(rel(), ' ' + plural(items.length, 'модель', 'модели', 'моделей') + ' в очереди размещения. Наличие геометрии не подтверждает её проектное положение.');
  main.append(h1, p);
  /* 1.0.19a М-9: остальные типы каталога вне здания — «Ещё N типов каталога в здании не показаны по другим причинам». N — по данным каталога (data/catalogue_library.js, <script src>, без fetch):
     типы с worldAllowed:false минус типы этой очереди; набора или распаковки (DecompressionStream) нет, или N = 0 — строки нет. */
  const other = el('p', { class: 'unplaced-other', hidden: '' }); main.append(other);
  (function otherTypes() {
    const go = () => {
      const s = window.ATLAS_CATALOGUE_GZIP; if (typeof s !== 'string' || typeof DecompressionStream === 'undefined') return;
      let b; try { b = Uint8Array.from(atob(s), c => c.charCodeAt(0)); } catch (e) { return; }
      new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(t => {
        const objs = (JSON.parse(t) || {}).objects || [], q = new Set(items.map(x => x.type_no).filter(v => v != null).map(String)), seen = new Set();
        for (const o of objs) if (o && o.worldAllowed === false) { const k = o.package_no != null ? String(o.package_no) : 'key:' + o.key; if (!q.has(k)) seen.add(k); }
        const n = seen.size; if (!n) return;
        other.replaceChildren('Ещё ' + fmt(n) + ' ' + plural(n, 'тип', 'типа', 'типов') + ' каталога в здании не ' + plural(n, 'показан', 'показаны', 'показаны') + ' по другим причинам. ', el('a', { href: 'catalogue.html' }, 'Каталог типов'));
        other.dataset.n = String(n); other.hidden = false;
      }, () => {});
    };
    if (typeof window.ATLAS_CATALOGUE_GZIP === 'string') { go(); return; }
    const sc = document.createElement('script'); sc.src = 'data/catalogue_library.js'; sc.onload = go; sc.onerror = () => { sc.remove(); }; document.head.append(sc);
  })();
  const note = Array.isArray(U.note) ? U.note : [];
  if (note.length) {
    const d = el('div', { class: 'note' });
    for (const x of note) if (typeof x === 'string') d.append(x); else if (x && typeof x.review === 'string') d.append(el('span', { class: 'review-only' }, x.review));
    main.append(d);
  }
  const inp = el('input', { id: 'queueSearch', type: 'search', placeholder: 'Название элемента или номер типа' });
  const cnt = el('p', { id: 'queueCount', role: 'status' }, fmt(items.length) + ' ' + plural(items.length, 'модель', 'модели', 'моделей'));
  main.append(el('label', { for: 'queueSearch' }, 'Найти по названию, номеру типа или помещению'), inp, cnt);
  const sec = el('section');
  for (const x of items) {
    const a = el('article'), d = el('div');
    d.append(el('h2', null, x.title), el('p', null, x.type_no != null ? 'Тип № ' + x.type_no : (x.type_label || '')), el('p', null, x.place || ''), el('small', null, x.reason || ''));
    a.append(d);
    if (x.href) a.append(el('a', { href: x.href }, /catalogue-model\.html/.test(x.href) ? 'Открыть тип в 3D (отдельно от здания)' : 'Открыть модель →'));   /* 1.0.19a М-9: просмотр типа — не место в здании */
    sec.append(a);
  }
  main.append(sec);
  if (U.csv && U.csv.href) { const q = el('p'); q.append(el('a', { href: U.csv.href }, U.csv.label || 'Скачать реестр CSV')); main.append(q); }
  const rows = [...sec.children];
  inp.oninput = e => {
    const q = e.target.value.toLocaleLowerCase('ru').trim();
    for (const r of rows) r.hidden = !r.textContent.toLocaleLowerCase('ru').includes(q);
    const n = rows.filter(r => !r.hidden).length;
    if (n) { cnt.textContent = fmt(n) + ' ' + plural(n, 'модель', 'модели', 'моделей'); return; }
    cnt.textContent = 'Ничего не найдено по «' + e.target.value.trim() + '». Попробуйте номер типа или номер помещения. ';
    const b = el('button', { type: 'button', class: 'pbtn pbtn--sm' }, 'Сбросить');
    b.onclick = () => { inp.value = ''; inp.dispatchEvent(new Event('input')); inp.focus(); };
    cnt.append(b);
  };
})();
