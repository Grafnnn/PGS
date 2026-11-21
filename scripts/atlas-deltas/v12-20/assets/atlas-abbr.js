/* 3D Атлас · ядро 1.0.19a · сокращения с расшифровкой в подсказке (решение владельца 24.10.2026, п. 13; словарь подписей, строка 23).
   В видимом тексте карточки, замечаний, каталога и реестра «КС-2», «КС-3», «RFI», «PGS» оборачиваются в <abbr title="…">.
   «ТС» — без расшифровки и без подсказки (владелец 24.10: ТС = техническое свидетельство, пишется просто «ТС»).
   Одиночное «КС» в текстах данных не трогаем: в данных объектов так пишутся марки изделий (кольца колодцев, косоуры лестниц),
   а не формы актов (примеры — в словаре подписей, раздел 4). Подписи «для КС» в «Ходе работ» — у B.
   Текст узлов не меняется (textContent тот же), атрибуты, поля ввода, <pre>/<code> и уже готовые <abbr> не трогаются.
   Подключение: на страницах C — <script defer src="assets/atlas-abbr.js"> и атрибут data-atlas-abbr у контейнеров;
   на главной (index.html — файл A) файл подгружают atlas-card.js и atlas-issues.js. Без fetch/XHR: работает из file://. */
'use strict';
(() => {
  if (window.AtlasAbbr) return;
  const TITLES = {
    'КС-2': 'КС-2 — акт о приёмке выполненных работ (унифицированная форма)',
    'КС-3': 'КС-3 — справка о стоимости выполненных работ и затрат (унифицированная форма)',
    RFI: 'RFI — запрос информации (Request for Information): вопрос проектировщику с просьбой уточнить проект',
    PGS: 'PGS — сайт, где ведутся общий журнал и роли'
  };
  // Граница слова — вручную (без просмотра назад): до сокращения не буква, не цифра и не «_» (OPEN_SOURCE_RFI — код, не текст);
  // после — не буква и не «_»; цифры после RFI допустимы (RFI-01, RFI91), после «КС-2» — нет (КС-25 не форма).
  const RE = /(^|[^0-9A-Za-zА-Яа-яЁё_])(КС-[23](?![0-9])|RFI|PGS)(?=$|[^A-Za-zА-Яа-яЁё_])/g;
  const QUICK = /RFI|PGS|КС-[23]/;
  const SKIP = 'abbr,script,style,textarea,input,select,option,pre,code,svg,[contenteditable],[data-no-abbr]';

  // Текст → части: строки и {abbr, title}. Без совпадений — null.
  function split(text) {
    if (!text || !QUICK.test(text)) return null;
    const out = []; let last = 0, m; RE.lastIndex = 0;
    while ((m = RE.exec(text))) {
      const at = m.index + m[1].length;
      if (at > last) out.push(text.slice(last, at));
      out.push({ abbr: m[2], title: TITLES[m[2]] });
      last = at + m[2].length;
      RE.lastIndex = last;
    }
    if (!out.length) return null;
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  // Расшифровка с клавиатуры и касанием (как у «Хода работ»): tabindex=0 и подсказка по фокусу; внутри кнопки или ссылки — только title.
  const INTER = 'button,a,summary,label,[role="button"],[role="link"],[role="tab"],[role="menuitem"]';
  function tip(e) {
    let t = document.getElementById('atlasAbbrTip');
    if (e.type === 'blur') { if (t) t.hidden = true; return; }
    if (!t) {
      t = document.createElement('div'); t.id = 'atlasAbbrTip'; t.setAttribute('role', 'tooltip');
      const s = t.style;
      s.position = 'fixed'; s.zIndex = '95'; s.maxWidth = 'min(360px, calc(100vw - 16px))'; s.boxSizing = 'border-box';
      s.padding = '8px 12px'; s.borderRadius = '6px'; s.background = 'var(--c-text, #1f2328)'; s.color = 'var(--c-surface, #fff)';
      s.font = '14px/1.4 var(--font, system-ui, sans-serif)'; s.pointerEvents = 'none';
      document.body.append(t);
    }
    const a = e.currentTarget, r = a.getBoundingClientRect();
    t.textContent = a.title; t.hidden = false;
    t.style.left = Math.max(8, Math.min(r.left, innerWidth - t.offsetWidth - 8)) + 'px';
    t.style.top = (r.bottom + 6 + t.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - 6 - t.offsetHeight) : r.bottom + 6) + 'px';
  }
  function make(p, host) {
    const a = document.createElement('abbr');
    a.className = 'atlas-abbr';
    a.title = p.title;
    a.textContent = p.abbr;
    // через CSSOM — без правки чужих CSS и без встроенных <style> (CSP хостинга)
    a.style.textDecoration = 'underline dotted';
    a.style.textUnderlineOffset = '0.15em';
    a.style.cursor = 'help';
    if (!(host && host.closest(INTER))) { a.tabIndex = 0; a.addEventListener('focus', tip); a.addEventListener('blur', tip); }
    return a;
  }
  function textNode(t) {
    const host = t.parentElement;
    if (!host || host.closest(SKIP)) return 0;
    const parts = split(t.nodeValue);
    if (!parts) return 0;
    const frag = document.createDocumentFragment();
    let n = 0;
    for (const p of parts) { if (typeof p === 'string') frag.append(p); else { frag.append(make(p, host)); n++; } }
    t.replaceWith(frag);
    return n;
  }
  // Один проход по узлу (элемент или текст); возвращает число новых <abbr>.
  function apply(root) {
    if (!root) return 0;
    if (root.nodeType === 3) return textNode(root);
    if (root.nodeType !== 1 && root.nodeType !== 11) return 0;
    if (root.nodeType === 1 && root.closest(SKIP)) return 0;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => QUICK.test(t.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const list = []; while (w.nextNode()) list.push(w.currentNode);
    let n = 0; for (const t of list) n += textNode(t);
    return n;
  }
  // Следить за контейнером: всё, что в него дорисуют, проходит apply. Обработка — в той же микрозадаче, что и отрисовка
  // (до кадра и до обновления дерева доступности), поэтому живые области не объявляют текст дважды.
  const watched = new WeakSet();
  function watch(root) {
    if (!root || watched.has(root) || typeof MutationObserver !== 'function') return false;
    watched.add(root);
    apply(root);
    const mo = new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === 'characterData') apply(r.target);
        else for (const x of r.addedNodes) if (x.isConnected) apply(x);
      }
      mo.takeRecords();   // свои же замены — не обрабатывать повторно
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return true;
  }
  window.AtlasAbbr = Object.freeze({ TITLES: Object.freeze(Object.assign({}, TITLES)), split, apply, watch });
  const auto = () => { for (const el of document.querySelectorAll('[data-atlas-abbr]')) watch(el); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto, { once: true }); else auto();
})();
