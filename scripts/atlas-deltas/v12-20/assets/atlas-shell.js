/* 3D Атлас · общая шапка, меню «Ещё», режим проверки и нижняя панель телефона.
   Подключается в <head> после assets/tokens.css и assets/atlas-data.js (без defer).
   Страница указывает активный пункт: <body data-nav="model|remarks|docs|catalogue|unplaced">.
   Логотип прежний: assets/atlas-mark-v3.png + надпись «3D Атлас». */
'use strict';
(function () {
  /* К1 · ядро универсальное: всё объектное — из window.ATLAS_PROJECT (project/config.js, грузится первым в <head>); нет конфига или ключа — нейтрально. */
  const P = () => window.ATLAS_PROJECT || {};
  const T = () => P().title || {};
  // Хранилище: состояние объекта — storage.prefix (нет — 'atlas:<project_id>:' / 'atlas:default:'); предпочтения пользователя — 'atlas:global:' (общие для всех объектов).
  // storage.legacy_keys {имя: старый ключ}: нового ключа нет — значение копируется из старого (старый не удаляется).
  const GLOBAL_PREFIX = 'atlas:global:';
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const objPrefix = () => { const p = P(), s = p.storage || {}; return typeof s.prefix === 'string' && s.prefix ? s.prefix : 'atlas:' + (/^[a-z0-9-]+$/.test(p.project_id || '') ? p.project_id : 'default') + ':'; };
  const migrate = (key, legacy, suffix) => { if (!legacy || lsGet(key) !== null) return key; const old = ((P().storage || {}).legacy_keys || {})[legacy]; if (!old) return key; const v = lsGet(old + (suffix || '')); if (v !== null) lsSet(key, v); return key; };
  const storageKey = (name, legacy, suffix) => migrate(objPrefix() + name, legacy, suffix);
  const globalKey = (name, legacy, suffix) => migrate(GLOBAL_PREFIX + name, legacy, suffix);
  // Заголовок страницы модели: «3D Атлас · <title.short>», без конфига — «3D Атлас»
  const pageTitle = () => '3D Атлас' + (T().short ? ' · ' + T().short : '');
  if (document.title === '3D Атлас') document.title = pageTitle();
  // 1.0.19a A-13 (часть О-3): режим проверки не запоминается между визитами — флаг только в sessionStorage этой вкладки;
  // прежний ключ localStorage ('<префикс объекта>review') стирается при запуске. Ключ — без переноса из storage.legacy_keys (миграция вернула бы значение).
  const REVIEW_KEY = objPrefix() + 'review';
  try { localStorage.removeItem(REVIEW_KEY); } catch (e) { /* хранилище недоступно */ }
  // К1: свёртка для поиска. Ядро: NFKC, строчные, все дефисы и тире → «-», ё → е (как atlasFold движка без объектных правил); объект — search.fold_rules:
  // пара [из, в] — замена везде; { pattern, flags, to } — регулярка. Пробелы не трогаем: от них зависит индекс движка.
  const FOLD_RULES = (() => { const out = []; for (const r of (((P().search || {}).fold_rules) || [])) { if (Array.isArray(r) && r.length === 2) out.push(s => s.split(String(r[0]).toLowerCase()).join(String(r[1]))); else if (r && r.pattern) { try { const re = new RegExp(r.pattern, String(r.flags || '').includes('g') ? r.flags : (r.flags || '') + 'g'); out.push(s => s.replace(re, r.to == null ? '' : String(r.to))); } catch (e) { /* неверная регулярка в конфиге — правило пропускаем */ } } } return out; })();
  // 1.0.19a A-04 (О-6): латинские двойники кириллицы (таблица LAT, прежде только в atlas-nodes.js) и «АС.2» ≡ «АС2» (точка между шифром из 2+ букв и цифрой) — в общей свёртке.
  // Свёртку берёт поиск движка (atlasFold → AtlasShell.fold — и индекс, и запрос), поэтому «AP-01» = «АР-01», «BШ19» = «ВШ19» без правки движка.
  // После правил объекта (search.fold_rules) латиница сводится ещё раз: правила вида «пр → pr» (ДОУ) дают тот же итог для «ПР-12» и «PR-12».
  const LAT = Object.freeze({ a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', u: 'у' });
  const latFold = s => String(s == null ? '' : s).replace(/[a-z]/g, ch => LAT[ch] || ch).replace(/([a-zа-я]{2,})\.(?=\d)/g, '$1');
  const foldCore = s => latFold(String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/[\u2010-\u2015\u2212\u2043\uFE58\uFE63\uFF0D-]/g, '-').replace(/ё/g, 'е'));
  const fold = s => FOLD_RULES.length ? latFold(FOLD_RULES.reduce((v, f) => f(v), foldCore(s))) : foldCore(s);
  const root = document.documentElement;
  const R = () => window.ATLAS_RELEASE || {};
  // Разряды — узкий неразрывный пробел U+202F (п. 2а).
  const fmt = n => (typeof n === 'number' && Number.isFinite(n)) ? n.toLocaleString('ru-RU').replace(/[\u00a0 ]/g, '\u202f') : '—';
  const plural = (n, one, few, many) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  };
  // Числа выпуска (<… data-release="elements"></…>, в разметке пустые) подставляются из ATLAS_RELEASE по мере разбора страницы —
  // до первой отрисовки, без зашитых в HTML чисел. data-release-init — только начальное значение (дальше элемент ведёт движок).
  const fillRelease = el => { const v = R()[el.dataset.release || el.dataset.releaseInit]; if (v !== undefined) el.textContent = typeof v === 'number' ? fmt(v) : v; };
  if (document.readyState === 'loading') {
    const mo = new MutationObserver(recs => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) { if (n.dataset.release || n.dataset.releaseInit) fillRelease(n); for (const x of n.querySelectorAll('[data-release],[data-release-init]')) fillRelease(x); } });
    mo.observe(root, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => mo.disconnect());
  }
  const SIG = { 'Высокая': 'high', 'Средняя': 'mid', 'Низкая': 'low' };
  const make = (tag, attrs, text) => {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
    }
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };
  // V12.0 · 0.6: значки — из общего спрайта assets/icons-sprite.js (AtlasIcons). Оболочка подключает его сама на всех страницах,
  // путём от своего src (работает и в packages/…/auxiliary/). Разметка <use href="#i-…"> оживает, когда спрайт вставлен, — порядок загрузки не важен.
  (function loadSprite() {
    if (window.AtlasIcons || document.querySelector('script[src*="icons-sprite.js"]')) return;
    const me = document.currentScript && document.currentScript.src;
    const src = me ? me.replace(/atlas-shell\.js(\?.*)?$/, 'icons-sprite.js') : 'assets/icons-sprite.js';
    // Асинхронно: спрайт не задерживает первую отрисовку; <use href="#i-…"> оживает, когда он вставлен.
    // Проверка — после разбора страницы: тег спрайта в разметке (главная, B2) ещё не прочитан, когда выполняется оболочка → без двойной загрузки.
    const add = () => { if (window.AtlasIcons || document.querySelector('script[src*="icons-sprite.js"]')) return; const t = document.createElement('script'); t.src = src; t.async = true; document.head.append(t); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
  })();
  const icon = (name, cls, label) => (window.AtlasIcons ? window.AtlasIcons.use(name, label || null, cls || null)
    : '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#i-' + name + '"/></svg>');
  // Прежние ключи ICONS сохранены (ими пользуются другие модули, например S.icons.more в карточке).
  const ICONS = {
    get search() { return icon('search', 'icon--16'); },
    get searchBig() { return icon('search', 'icon--24'); },
    get help() { return icon('help'); },
    get chevron() { return icon('chevron-down', 'icon--16'); },
    get model() { return icon('model', 'icon--24'); },
    get remarks() { return icon('remarks', 'icon--24'); },
    get docs() { return icon('drawings', 'icon--24'); },
    get catalogue() { return icon('catalogue', 'icon--24'); },
    get more() { return icon('more', 'icon--24'); }
  };

  /* ---------- режим проверки ---------- */
  // 1.0.20 реш. 6: переключателя в «Ещё» нет (для всех объектов); режим включается ссылкой …#review=1 (и прежними хэшами сборщика),
  // выключается полосой «Выключить» — она же убирает review=1 из адреса (history.replaceState: без перезагрузки и без новой записи истории).
  function storedReview() { try { return sessionStorage.getItem(REVIEW_KEY) === '1'; } catch (e) { return false; } }
  function hashWantsReview() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('review') === '1') return true;
    const scope = h.get('scope');
    if (scope && scope !== 'BUILDING' && scope !== 'WORLD_REVIEW' && !scope.startsWith('TREE:') && !scope.startsWith('PLACED:') && scope !== ((window.ATLAS_PROJECT || {}).rebar || {}).scope && !scope.startsWith('REBAR_OD')) return true;   /* К1: раздел армирования — rebar.scope конфига */
    return ['parent', 'beam', 'room', 'rows'].some(k => h.has(k));
  }
  let review = storedReview() || hashWantsReview();
  root.classList.toggle('review-mode', review);
  function setReview(on, persist) {
    review = !!on;
    root.classList.toggle('review-mode', review);
    if (persist !== false) { try { if (review) sessionStorage.setItem(REVIEW_KEY, '1'); else sessionStorage.removeItem(REVIEW_KEY); } catch (e) { /* хранилище недоступно */ } }
    if (!review) dropReviewHash();
    reviewBarSync();
    document.dispatchEvent(new CustomEvent('atlas:reviewmode', { detail: { on: review } }));
  }
  // 1.0.20 реш. 6: «review=1» уходит из адреса; остальные части хэша — побайтно как были (без перекодирования URLSearchParams)
  function dropReviewHash() {
    const parts = location.hash.slice(1).split('&'), rest = parts.filter(p => !/^review(=|$)/.test(p));
    if (rest.length === parts.length) return;
    try { history.replaceState(history.state, '', location.pathname + location.search + (rest.filter(Boolean).length ? '#' + rest.join('&') : '')); } catch (e) { /* адрес не меняется (песочница) — режим всё равно выключен */ }
  }
  window.addEventListener('hashchange', () => { if (!review && hashWantsReview()) setReview(true, false); });
  // 1.0.19a A-13: пока режим включён — плашка «Режим проверки включён · Выключить» (выключение — 1 нажатие, sessionStorage очищается)
  let reviewBar = null;
  function reviewBarSync() {
    if (!document.body) return;
    if (!review) { if (reviewBar) reviewBar.hidden = true; return; }
    if (!reviewBar) {
      reviewBar = make('div', { class: 'as-review-bar', role: 'status' });
      const off = make('button', { type: 'button', class: 'as-review-off' }, 'Выключить');
      off.addEventListener('click', () => { setReview(false, true); try { sessionStorage.removeItem(REVIEW_KEY); } catch (e) { /* */ } });
      reviewBar.append(make('span', {}, 'Режим проверки включён'), off);
    }
    // к2: полоса — сразу под шапкой, в потоке страницы (не плавает над сценой); шапки ещё нет — в начало body, mount() переставит
    const h = header && header.isConnected ? header : document.querySelector('header.atlas-shell');
    if (h) { if (h.nextElementSibling !== reviewBar) h.after(reviewBar); } else if (reviewBar.parentNode !== document.body) document.body.prepend(reviewBar);
    reviewBar.hidden = false;
  }

  /* ---------- шапка ---------- */
  // V12.0 · 0.3: короткие подписи со значками (полное название — в title); «Требует решения» на телефоне уходит в «Ещё».
  // К1 (вид К1, сессия D, §1): пункт со счётчиком показывается, только если в данных выпуска число > 0 (или это текущая страница)
  const hasCount = item => (!item.show || item.show()) && (!item.count || (typeof item.count() === 'number' && item.count() > 0) || item.key === document.body.dataset.nav);   /* 1.0.17 B3-17b: show — пункт по признаку (progress — по конфигу) */
  // 1.0.17 B3-17b: «Ход строительства» — только при ключе progress конфига (нет ключа — ни пункта, ни меню); активен на PROGRESS.html и на главной с #progress=1
  const progressOn = () => { const c = (window.ATLAS_PROJECT || {}).progress; return !!c && typeof c === 'object' && c.enabled !== false; };
  const progressHash = () => /(?:^|[#&])progress=1(?:&|$)/.test(location.hash);
  // 1.0.20 b1 (§5.1): режимы «Площадка / Технадзор / Обзор» — только при ключе progress и ключе modes конфига (modes.enabled === false — выключены). Проверка одна для всех: AtlasShell.modesOn().
  const modesOn = () => { const m = (window.ATLAS_PROJECT || {}).modes; return progressOn() && !!m && m.enabled !== false; };
  const NAV = [
    { key: 'overview', href: 'OVERVIEW.html', label: 'Обзор', title: 'Обзор проекта', icon: 'home-view', menuPhone: true }, // V12.0 · B4 «Обзор»
    { key: 'model', href: 'index.html', label: 'Модель', title: 'Модель здания', tab: 'Модель', icon: 'model' },
    { key: 'remarks', href: 'RD_REMARKS.html', label: 'Замечания', title: 'Замечания к рабочей документации', tab: 'Замечания', icon: 'remarks', count: () => R().remarks },
    { key: 'progress', href: 'index.html#progress=1', label: 'Ход работ', title: 'Ход работ — отметки выполненных работ на модели', tab: 'Ход работ', icon: 'layers', show: () => progressOn() },   // 1.0.19a A-01 (Б1): подпись видна на 1001–1920, значок не ✓; на телефоне — вкладка вместо «Каталога»
    { key: 'docs', href: 'library.html', label: 'Чертежи', title: 'Чертежи и документы', tab: 'Чертежи', icon: 'drawings' },
    { key: 'catalogue', href: 'catalogue.html', label: 'Каталог', title: 'Каталог типов', tab: 'Каталог', icon: 'catalogue', noTab: () => progressOn() },   // 1.0.19a A-01: при ключе progress на телефоне — в «Ещё»
    { key: 'unplaced', href: 'UNPLACED.html', label: 'Требует решения', title: 'Модели без подтверждённого места в здании', icon: 'unplaced', count: () => R().unplaced, warn: true }
  ];
  /* 1.0.19a A-05 (М-3, О-5; WCAG 2.1.4): однобуквенные клавиши — только «в сцене». AtlasShell.inScene(e) → true, если цель события клавиатуры
     (или фокус) — внутри сцены модели (.stage: холст, панель сцены, масштаб, окна сцены) и это не поле ввода; фокус на body, в шапке, в панелях — false;
     страница без сцены — всегда false. Поиск с любого места — только с модификатором: Ctrl K (Windows/Linux), ⌘K (Mac); подпись — AtlasShell.kbdK(). */
  const typingEl = t => !!t && t.nodeType === 1 && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || !!t.isContentEditable);
  function inScene(e) {
    const t = e && e.target && e.target.nodeType === 1 ? e.target : document.activeElement;
    if (!t || t.nodeType !== 1 || typingEl(t) || !t.closest) return false;
    return !!t.closest('.stage');
  }
  const isMac = () => /mac|iphone|ipad|ipod/i.test(navigator.platform || '') || (!navigator.platform && /Mac OS X|iPhone|iPad/.test(navigator.userAgent || ''));
  const kbdK = () => isMac() ? '⌘K' : 'Ctrl K';
  const isSearchKey = e => !!e && (e.metaKey || e.ctrlKey) && !e.altKey && ((e.key || '').toLowerCase() === 'k' || e.code === 'KeyK');   // KeyK — и в русской раскладке
  /* 1.0.19a к2: имя раздела моделей без места — то же, что у пункта меню: при ключе progress «Без подтверждённого места» (пункт в «Ещё»), без ключа — «Требует решения», как в 1.0.18.
     AtlasShell.unplacedName() — имя; AtlasShell.unplacedWhere() — «в разделе «…»» для подсказок (prototype.js, overview.js, ABOUT.html) */
  const unplacedName = () => progressOn() ? 'Без подтверждённого места' : 'Требует решения';
  const unplacedWhere = () => 'в разделе «' + unplacedName() + '»' + (progressOn() ? ' (меню «Ещё»)' : '');
  const extraMenu = []; // AtlasShell.addMenuItem — до и после сборки шапки
  let mounted = false, modesApplied = false, header, menu, moreButton, tabMore;
  // 1.0.20 b1: вид режимов — разметка шапки, нижней панели и «Ещё» (см. «режимы: вид» ниже); cleanups — слушатели документа текущей сборки (снимает remount)
  let navEl = null, moreEl = null, tabbarEl = null, modeBox = null, modeBtn = null, modeList = null, placeHelpFn = null;
  const cleanups = [];
  const api = {
    fmt, plural, SIG, make, icons: ICONS, icon,
    addMenuItem(it) { if (!it || !it.title) return null; extraMenu.push(it); if (mounted && menu) return addToMenu(it); return null; },   // 1.0.20: пункт помнится и после сборки — remount() вставит его снова
    sigClass: s => 'sig sig--' + (SIG[s] || 'low'),
    release: R,
    project: P, title: T, pageTitle, storageKey, globalKey, fold, foldCore, LAT, latFold, inScene, isMac, kbdK, isSearchKey, unplacedName, unplacedWhere,
    review: () => review,
    setReview,
    modesOn,
    onHelp: null,
    help() { if (typeof api.onHelp === 'function') api.onHelp(); else location.href = 'index.html#help'; },
    mount,
    remount,
    closeMenu,
    searchSlot: () => header && header.querySelector('.as-search')
  };
  window.AtlasShell = api;

  /* 1.0.20 b1 (§5.1): atlas-modes.js грузится только при modesOn(). При разборе страницы — document.write (тег встаёт сразу за оболочкой
     и выполняется до следующих скриптов, как теги загрузчика наборов в PROGRESS.html); страница уже разобрана или запись не прошла
     (оболочка вставлена асинхронно) — вставляется элемент <script>, после onload шапка перестраивается (remount). Страницы не меняются. */
  (function loadModes() {
    if (!modesOn() || window.AtlasModes || document.querySelector('script[src*="atlas-modes.js"]')) return;
    const me = document.currentScript && document.currentScript.src;
    const src = me && /atlas-shell\.js(\?.*)?$/.test(me) ? me.replace(/atlas-shell\.js(\?.*)?$/, 'atlas-modes.js') : 'assets/atlas-modes.js';
    // шапка уже собрана без режимов (оболочка в <body> или вставлена поздно) — после загрузки atlas-modes.js собирается заново
    const ready = () => { if (mounted && !modesApplied && window.AtlasModes) remount(); };
    if (document.readyState === 'loading') {
      try { document.write('<script src="' + src.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"><\/script>'); } catch (e) { /* запись недоступна — ниже вставка элементом */ }
      const w = document.querySelector('script[src*="atlas-modes.js"]');
      if (w) { w.addEventListener('load', ready); return; }
    }
    const t = document.createElement('script');
    t.src = src;
    t.addEventListener('load', ready);
    (document.head || document.documentElement).append(t);
  })();

  /* ---------- общий всплывающий список (п. 9): «В здании / Лист / Тип / Где в здании · N» ---------- */
  let popSeq = 0, openPop = null;
  function closePop(focusBack) {
    if (!openPop) return;
    const { el, btn } = openPop;
    el.remove(); btn.setAttribute('aria-expanded', 'false');
    openPop = null;
    if (focusBack) btn.focus();
  }
  function popover(btn, items) {
    const id = 'asPop' + (++popSeq);
    btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);   // 1.0.19a A-07: раскрывающийся список ссылок (region) — без aria-haspopup
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (openPop && openPop.btn === btn) { closePop(); return; }
      closePop();
      const el = make('div', { class: 'as-pop', id, role: 'region', 'aria-label': btn.textContent.trim() });
      for (const it of items) {
        const a = make('a', { class: 'as-pop-item', href: it.href });
        if (it.blank) { a.target = '_blank'; a.rel = 'noopener'; }
        a.append(make('span', { class: 'as-pop-label' }, it.label));
        if (it.sub) a.append(make('span', { class: 'as-pop-sub' }, it.sub));
        el.append(a);
      }
      document.body.append(el);
      const r = btn.getBoundingClientRect(), w = Math.min(380, innerWidth - 16);
      el.style.width = w + 'px';
      let left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
      el.style.left = left + 'px';
      const h = el.offsetHeight, below = innerHeight - r.bottom - 8, above = r.top - 8;
      if (h > below && above > below) { el.style.top = Math.max(8, r.top - h - 6) + 'px'; el.style.maxHeight = (above - 6) + 'px'; }
      else { el.style.top = (r.bottom + 6) + 'px'; el.style.maxHeight = (below - 6) + 'px'; }
      btn.setAttribute('aria-expanded', 'true');
      openPop = { el, btn };
      el.querySelector('a')?.focus();
      el.addEventListener('keydown', ev => {
        const xs = [...el.querySelectorAll('a')], i = xs.indexOf(document.activeElement);
        if (ev.key === 'Escape') { ev.preventDefault(); closePop(true); }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); (xs[i + (ev.key === 'ArrowDown' ? 1 : -1)] || xs[0]).focus(); }
      });
      el.addEventListener('focusout', () => setTimeout(() => { if (openPop && openPop.el === el && !el.contains(document.activeElement) && document.activeElement !== btn) closePop(); }, 0));
    });
  }
  document.addEventListener('pointerdown', e => { if (openPop && !openPop.el.contains(e.target) && !openPop.btn.contains(e.target)) closePop(); }, true);
  window.addEventListener('resize', () => closePop());
  document.addEventListener('scroll', e => { if (openPop && !openPop.el.contains(e.target)) closePop(); }, true);
  // Человеческое название по имени в модели: «Л-1 / КС1т / опорный лист 580×200×10» → «Опорный лист КС1т».
  function humanName(name) {
    name = String(name || '').trim();
    let parts = name.split(/\s+\/\s+/); if (parts.length < 2) parts = name.split(/\s+·\s*/);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].split(';')[0].trim();
      const desc = last.replace(/\s*(?:L\s*=\s*)?\d+(?:[.,]\d+)?\s*(?:м|мм)?(?:\s*[×x]\s*\d+(?:[.,]\d+)?)*\s*(?:м|мм)?$/i, '').trim();
      const mark = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      if (/[а-яё]{4,}/.test(desc) && /^[^\s]{1,14}$/.test(mark)) return desc.charAt(0).toUpperCase() + desc.slice(1) + (desc.includes(mark) ? '' : ' ' + mark) + (parts.length >= 3 ? ' · ' + parts[0] : '');
    }
    return name;
  }
  function linkMethod(m) {
    m = String(m || '');
    const checked = /проверено вручную/.test(m) ? ' · проверено вручную' : '';
    if (/носител/.test(m)) return 'сборка, в которую входит элемент' + checked;
    if (/по пакету/.test(m)) return 'размещено по РД по номеру типа' + checked;
    if (/по марке/.test(m)) return 'связь по марке' + checked;
    return m;
  }
  api.popover = popover; api.closePop = closePop; api.humanName = humanName; api.linkMethod = linkMethod;

  function closeMenu(focusBack) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
    if (tabMore) tabMore.setAttribute('aria-expanded', 'false');
    if (focusBack) (menu.dataset.opener === 'tab' ? tabMore : moreButton).focus();
  }
  function openMenu(from) {
    menu.hidden = false;
    menu.dataset.opener = from;
    menu.classList.toggle('as-menu--sheet', from === 'tab');
    (from === 'tab' ? tabMore : moreButton).setAttribute('aria-expanded', 'true');
    // 1.0.19a A-07 (О-2): фокус — на первый видимый пункт (скрытые на этой ширине пункты пропускаются)
    const first = [...menu.querySelectorAll('a,button')].find(x => x.offsetParent !== null);
    if (first) first.focus();
  }

  function offlineHandler(button) {
    // Та же логика, что у прежней кнопки #offlineMode на главной; на главной обработчик задаёт движок.
    button.addEventListener('click', async () => {
      if (!/^https?:$/.test(location.protocol) || !window.isSecureContext || !('serviceWorker' in navigator)) { button.textContent = 'Локально: без кэша'; return; }
      try { await navigator.serviceWorker.register('service-worker.js', { scope: './' }); button.textContent = 'Кэш включён'; }
      catch (e) { button.textContent = 'Кэш недоступен'; }
    });
  }
  const OFFLINE_TEXT = {
    'Кэш': ['Сохранить для работы офлайн', 'Атлас откроется без сети на этом устройстве'],
    'Локально: без кэша': ['Офлайн-режим доступен при открытии по https', 'При открытии из файла атлас и так работает без сети'],
    'Кэш включён': ['Сохранено для работы офлайн', 'Атлас откроется без сети на этом устройстве'],
    'Кэш недоступен': ['Не удалось сохранить для офлайн', 'Браузер не разрешил сохранение']
  };
  function humanOffline(button) {
    const apply = () => {
      const t = OFFLINE_TEXT[button.textContent.trim()];
      if (!t) return;
      button.replaceChildren(make('span', { class: 'as-mi-title' }, t[0]), make('span', { class: 'as-mi-desc' }, t[1]));
      button.removeAttribute('title');
    };
    new MutationObserver(apply).observe(button, { childList: true, characterData: true, subtree: true });
    apply();
  }

  // AtlasShell.addMenuItem({href | onClick, title, desc, pageOnly, phoneOnly}): pageOnly — ключ страницы (data-nav), где пункт нужен.
  function addToMenu(it) {
    const page = document.body.dataset.nav || '';
    if (it.pageOnly && it.pageOnly !== page) return null;
    const el = it.href ? menuItem(it.href, it.title, it.desc || '') : make('button', { type: 'button', class: 'as-mi' });
    if (!it.href) { el.append(make('span', { class: 'as-mi-title' }, it.title), make('span', { class: 'as-mi-desc' }, it.desc || '')); }
    if (it.onClick) el.addEventListener('click', e => { closeMenu(); it.onClick(e); });
    if (it.phoneOnly) el.setAttribute('data-phone-only', '');
    if (it.id) el.id = it.id;
    const sep = menu.querySelector('.as-menu-sep');
    if (sep) sep.before(el); else menu.append(el);
    return el;
  }
  function menuItem(href, title, desc, extra) {
    const a = make('a', Object.assign({ class: 'as-mi', href }, extra || {}));
    a.append(make('span', { class: 'as-mi-title' }, title), make('span', { class: 'as-mi-desc' }, desc));
    return a;
  }
  /* 1.0.17 B3-17b: пункты «Ещё» хода работ; нет ключа progress — пусто.
     1.0.19a A-01: «Ход работ» на телефоне — вкладка нижней панели (дубля в «Ещё» нет), «Каталог» — в «Ещё» (телефон); страница — «Ход работ: история и ведомость» */
  function progressMenu(mv) {
    if (!progressOn()) return [];
    const cat = NAV.find(n => n.key === 'catalogue');
    const ci = menuItem(cat.href, cat.title || cat.label, '', { 'data-phone-only': '', 'data-progress': 'catalogue' });
    if ((document.body.dataset.nav || '') === 'catalogue') ci.setAttribute('aria-current', 'page');
    const pg = menuItem('PROGRESS.html', 'Ход работ: история и ведомость', 'Этапы, история отметок, ведомость XLSX', { 'data-progress': 'page' });
    return mv ? [pg] : [ci, pg];   // 1.0.20 b1: в режимах «Каталог» — среди пунктов, ушедших из шапки (на всех ширинах)
  }

  /* ---------- 1.0.20 b1 (§6.1, §13 п. 1): режимы — вид ----------
     Только при modesOn() и загруженном atlas-modes.js. Шапка (ПК) и нижняя панель (телефон) — 3 главные кнопки AtlasModes.mainOf(current());
     чип режима — на ПК слева от «Ещё», на телефоне в верхней строке; первая строка «Ещё» — «Режим: <имя> · сменить»; всё, что было в шапке
     и нижней панели 1.0.19, — в «Ещё» (ничего не удаляется). Режим — вид, а не права: права записи и приёмки — по роли журнала, как в 1.0.19.
     Высота шапки и нижней панели — как в 1.0.19 (чип 32 px в шапке 56 px; на телефоне 44 px в шапке 52 px). */
  const modeView = () => modesOn() && !!window.AtlasModes;
  const MODE_ICON = { today: 'check', accept: 'status-done', summary: 'layers' };
  const navOf = key => NAV.find(n => n.key === key);
  const cntOf = n => { if (!n || !n.count) return 0; const c = n.count(); return typeof c === 'number' && c > 0 ? c : 0; };
  const modeLabel = id => (window.AtlasModes.LIST.find(m => m.id === id) || {}).label || '';
  function buildChip() {
    modeBox = make('div', { class: 'as-mode' });
    modeBtn = make('button', { type: 'button', class: 'as-mode-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'asModeMenu', title: 'Режим работы на этом устройстве — сменить' });
    modeBtn.append(make('span', { class: 'as-mode-k' }, 'Режим:'), make('span', { class: 'as-mode-t' }, ''));
    modeBtn.insertAdjacentHTML('beforeend', ICONS.chevron);
    modeList = make('div', { class: 'as-mode-menu', id: 'asModeMenu', role: 'menu', 'aria-label': 'Режим работы', hidden: true });
    for (const m of window.AtlasModes.LIST) {
      const b = make('button', { type: 'button', class: 'as-mode-item', role: 'menuitemradio', 'aria-checked': 'false', tabindex: '-1', 'data-mode': m.id });
      b.append(make('span', {}, m.label), make('small', {}, window.AtlasModes.mainOf(m.id).map(x => x.label).join(' · ')));
      b.addEventListener('click', () => pickMode(m.id));
      modeList.append(b);
    }
    modeBox.append(modeBtn, modeList);
    modeBtn.addEventListener('click', () => (modeList.hidden ? openModeList() : closeModeList(true)));
    modeBtn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openModeList(); } });
    modeList.addEventListener('keydown', e => {
      const xs = [...modeList.querySelectorAll('[role="menuitemradio"]')], i = xs.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeModeList(true); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); xs[(i + (e.key === 'ArrowDown' ? 1 : -1) + xs.length) % xs.length].focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); xs[e.key === 'Home' ? 0 : xs.length - 1].focus(); }
      else if (e.key === 'Tab') closeModeList(false);
    });
    modeList.addEventListener('focusout', () => setTimeout(() => { if (modeList && !modeList.hidden && !modeList.contains(document.activeElement) && document.activeElement !== modeBtn) closeModeList(false); }, 0));
  }
  function openModeList() {
    if (!modeList) return;
    closeMenu(); closePop();
    modeList.hidden = false;
    modeBtn.setAttribute('aria-expanded', 'true');
    (modeList.querySelector('[aria-checked="true"]') || modeList.querySelector('[role="menuitemradio"]')).focus();
  }
  function closeModeList(focusBack) {
    if (!modeList || modeList.hidden) return;
    modeList.hidden = true;
    modeBtn.setAttribute('aria-expanded', 'false');
    if (focusBack) modeBtn.focus();
  }
  function pickMode(id) {
    const changed = id !== window.AtlasModes.current();
    closeModeList(true);
    if (changed) window.AtlasModes.set(id, { by: 'chip' });   // → atlas:mode → applyModes()
    if (modeBtn) modeBtn.focus();
  }
  // Кнопки режима, чип и строки «Ещё» — по текущему режиму (при сборке и после atlas:mode; шапка не пересобирается — поле поиска и тема страницы на месте)
  function applyModes() {
    if (!mounted || !modeView() || !navEl || !modeBox) return;
    const M = window.AtlasModes, cur = M.current(), main = M.mainOf(cur), page = document.body.dataset.nav || '', label = modeLabel(cur);
    navEl.querySelectorAll(':scope > a.as-link[data-key]').forEach(a => a.remove());
    const anchor = modeBox.parentNode === navEl ? modeBox : moreEl;
    tabbarEl.querySelectorAll(':scope > a.as-tab').forEach(a => a.remove());
    for (const m of main) {
      const n = navOf(m.key), c = cntOf(n), ic = (n && n.icon) || MODE_ICON[m.key] || 'layers';
      const a = make('a', { class: 'as-link', href: m.href, title: (n && n.title) || null, 'data-key': m.key });
      a.insertAdjacentHTML('beforeend', icon(ic, 'icon--16'));
      a.append(make('span', { class: 'as-link-t' }, m.label));
      if (c) a.append(make('span', { class: n.warn ? 'count count--warn' : 'count' }, fmt(c)));
      anchor.before(a);
      const t = make('a', { class: 'as-tab', href: m.href, 'data-key': m.key });
      t.innerHTML = icon(ic, 'icon--24');
      t.append(make('span', {}, m.label));
      if (c) t.append(make('span', { class: 'as-tab-badge' }, fmt(c)));
      tabMore.before(t);
    }
    modeBtn.querySelector('.as-mode-t').textContent = label;
    modeBtn.setAttribute('aria-label', 'Режим: ' + label + ' · сменить');
    modeList.querySelectorAll('[role="menuitemradio"]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === cur)));
    menu.querySelectorAll(':scope > [data-mode-item]').forEach(x => x.remove());
    const row = make('button', { type: 'button', class: 'as-mi', 'data-mode-item': 'row' });
    row.append(make('span', { class: 'as-mi-title' }, 'Режим: ' + label + ' · сменить'), make('span', { class: 'as-mi-desc' }, 'Вид атласа на этом устройстве; права записи не меняет'));
    row.addEventListener('click', () => { closeMenu(); openModeList(); });
    const keys = new Set(main.map(m => m.key)), moved = [];
    for (const n of NAV.filter(hasCount)) {
      if (keys.has(n.key) || n.key === 'model' || n.key === 'unplaced') continue;   // «Модель» — во всех режимах главная; «Без подтверждённого места · N» — в «Ещё», как в 1.0.19
      const c = cntOf(n);
      const mi = n.key === 'progress' ? menuItem(n.href, 'Ход работ на модели', 'Отметки выполненных работ на модели') : menuItem(n.href, (n.title || n.label) + (c ? ' · ' + fmt(c) : ''), '');
      mi.setAttribute('data-mode-item', n.key);
      if (n.key === page) mi.setAttribute('aria-current', 'page');
      moved.push(mi);
    }
    menu.prepend(row, ...moved);
    if (placeHelpFn) placeHelpFn();
    syncProgressNav();
  }
  document.addEventListener('atlas:mode', () => applyModes());
  document.addEventListener('pointerdown', e => { if (modeList && !modeList.hidden && modeBox && !modeBox.contains(e.target)) closeModeList(false); }, true);

  // Активный пункт: PROGRESS.html — «Ход работ»; главная с #progress=1 — «Ход работ» вместо «Модели» (телефон — «Ещё»)
  function syncProgressNav() {
    if (!header || !progressOn()) return;
    const nav = document.body.dataset.nav || '', on = nav === 'progress' || (nav === 'model' && progressHash());
    const cur = (el, b) => { if (!el) return; if (b) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); };
    if (modeView() && modeBox) {
      // 1.0.20 b1: на PROGRESS — кнопка режима по #tab (нет #tab — первая вкладка режима); текущая страница не среди главных — «Ещё»
      const tab = new URLSearchParams(location.hash.slice(1)).get('tab') || window.AtlasModes.progressTab(window.AtlasModes.current());
      const isCur = a => { const t = /[#&]tab=([^&]+)/.exec(a.getAttribute('href') || ''); return t ? nav === 'progress' && tab === t[1] : a.dataset.key === nav && !(nav === 'model' && on); };
      let main = false;
      header.querySelectorAll('.as-nav > a.as-link[data-key]').forEach(a => { const c = isCur(a); main = main || c; cur(a, c); });
      if (tabbarEl) tabbarEl.querySelectorAll(':scope > a.as-tab[data-key]').forEach(a => cur(a, isCur(a)));
      if (menu) { cur(menu.querySelector('[data-progress="page"]'), nav === 'progress' && !main); cur(menu.querySelector('[data-mode-item="progress"]'), nav === 'model' && on); }
      cur(moreButton, !main && !!nav); cur(tabMore, !main && !!nav);
      return;
    }
    header.querySelectorAll('.as-nav > .as-link[data-key]').forEach(a => cur(a, a.dataset.key === 'progress' ? on : a.dataset.key === nav && !on));
    if (menu) cur(menu.querySelector('[data-progress="page"]'), nav === 'progress');
    if (moreButton) cur(moreButton, nav === 'unplaced');   // 1.0.19a A-01: пункта «Требует решения» в шапке нет — текущая страница в «Ещё»
    const bar = document.querySelector('.as-tabbar');
    if (bar) { cur(bar.querySelector('a.as-tab[href="index.html"]'), nav === 'model' && !on); cur(bar.querySelector('a.as-tab[data-key="progress"]'), on); if (tabMore) cur(tabMore, nav === 'unplaced' || nav === 'catalogue'); }
  }

  // 1.0.19a A-01: при ключе progress на 1001–1279 поле поиска узкое — плейсхолдер «Найти» (полный — в aria-label и на других ширинах)
  const narrowHead = window.matchMedia ? matchMedia('(min-width: 1001px) and (max-width: 1279px)') : null;
  function syncSearchPh() {
    if (!header || !progressOn()) return;
    const inp = header.querySelector('.as-search input'); if (!inp) return;
    if (!inp.dataset.phFull) inp.dataset.phFull = inp.placeholder || 'Поиск по модели';
    const ph = narrowHead && narrowHead.matches ? 'Найти' : inp.dataset.phFull;
    if (inp.placeholder !== ph) inp.placeholder = ph;
  }
  api.syncSearchPh = syncSearchPh;

  /* 1.0.20: пересборка шапки и нижней панели (после поздней загрузки atlas-modes.js; смена режима — круг 2). Пункты addMenuItem вставляются снова. */
  function remount() {
    if (!mounted) return;
    closePop(); closeMenu(); closeModeList(false);
    cleanups.splice(0).forEach(f => { try { f(); } catch (e) { /* */ } });
    modeBox = modeBtn = modeList = null;
    document.querySelectorAll('body > nav.as-tabbar').forEach(x => x.remove());
    mounted = false;
    mount();
  }

  function mount() {
    if (mounted || !document.body) return;
    mounted = true;
    modesApplied = !!window.AtlasModes;
    const MV = modeView();   // 1.0.20 b1: вид режимов; false — разметка как в 1.0.19
    const page = document.body.dataset.nav || '';
    const old = document.querySelector('body > header');
    header = make('header', { class: 'atlas-shell', role: 'banner' });

    // Логотип без изменений + строка выпуска.
    // Знак и «3D Атлас» — без изменений (atlas-mark-v3.png), 28 px. Рядом объект и строка выпуска (моно) — из ATLAS_RELEASE.
    // 1.0.19a (решение владельца 24.10): в шапке — уменьшенная копия того же знака 84×84 (×3 к 28 px, телефоны с DPR 3), 5 КБ вместо 714 КБ; оригинал не меняется.
    // Нет копии на сайте — берём оригинал.
    const brand = make('a', { class: 'as-brand', href: 'index.html', 'aria-label': '3D Атлас — модель здания' });
    const mark = make('img', { src: 'assets/atlas-mark-v3-84.png', alt: '', width: 28, height: 28 });
    mark.addEventListener('error', () => { if (!/atlas-mark-v3\.png$/.test(mark.src)) mark.src = 'assets/atlas-mark-v3.png'; }, { once: true });
    brand.append(mark, make('span', { class: 'as-word' }, '3D Атлас'), make('span', { class: 'as-sep', 'aria-hidden': 'true' }));
    const ed = make('span', { class: 'as-edition' });
    const rel = R().release_label || '', dl = R().date_label ? 'ред. ' + R().date_label : '';
    if (T().object) ed.append(make('span', { class: 'as-ed-b' }, T().object));   // К1: название объекта — title.object; нет — строки нет
    ed.append(make('span', { class: 'as-ed-date mono' }, [rel, dl].filter(Boolean).join(' · ')));
    brand.append(ed);

    const nav = make('nav', { class: 'as-nav', 'aria-label': 'Разделы атласа' });
    for (const item of MV ? [] : NAV.filter(hasCount)) {   // в режимах кнопки шапки ставит applyModes()
      if (item.key === 'unplaced' && progressOn()) continue;   // 1.0.19a A-01: при ключе progress «Требует решения» — из шапки в «Ещё» (с числом)
      const a = make('a', { class: 'as-link', href: item.href, title: item.title || null, 'data-key': item.key });
      if (item.icon) a.insertAdjacentHTML('beforeend', icon(item.icon, 'icon--16'));
      a.append(make('span', { class: 'as-link-t' }, item.label));
      if (item.key === page) { a.setAttribute('aria-current', 'page'); }
      if (item.count) a.append(make('span', { class: item.warn ? 'count count--warn' : 'count' }, fmt(item.count())));
      nav.append(a);
    }
    const more = make('div', { class: 'as-more' });
    moreButton = make('button', { type: 'button', class: 'as-link as-more-btn', 'aria-expanded': 'false', 'aria-controls': 'asMoreMenu' });   // 1.0.19a A-07: раскрывающаяся панель ссылок — без aria-haspopup (не role=menu)
    moreButton.insertAdjacentHTML('beforeend', icon('more', 'icon--16'));
    moreButton.append(make('span', { class: 'as-link-t' }, 'Ещё'));
    menu = make('div', { class: 'as-menu', id: 'asMoreMenu', hidden: true });
    // «Требует решения» на телефоне — в «Ещё»; 1.0.19a A-01/A-11: при ключе progress — на всех ширинах, «Без подтверждённого места · N»
    const unplaced = progressOn() ? menuItem('UNPLACED.html', unplacedName() + ' · ' + fmt(R().unplaced), 'В РД нет подтверждённого места — в здании не показаны')
      : menuItem('UNPLACED.html', 'Требует решения · ' + fmt(R().unplaced), 'Модели без подтверждённого места в здании', { 'data-phone-only': '' });
    if (page === 'unplaced') unplaced.setAttribute('aria-current', 'page');
    menu.append(...(hasCount(NAV.find(n => n.key === 'unplaced')) ? [unplaced] : []), ...progressMenu(MV),   /* 1.0.17 B3-17b */
      menuItem('ABOUT.html#history', 'История выпусков', 'Что менялось от выпуска к выпуску'), // V12.2 · S4: история — на «О выпуске»
      ...((((window.ATLAS_TEXTS || {}).pages || {}).menu) || []).filter(x => x && x.href && x.label).map(x => menuItem(x.href, x.label, x.sub || '')));   // К1: страницы объекта — тексты объекта
    let offline = document.getElementById('offlineMode');
    if (!offline) { offline = make('button', { type: 'button', id: 'offlineMode' }, 'Кэш'); offlineHandler(offline); }
    offline.className = 'as-mi';
    offline.type = 'button';
    humanOffline(offline);
    menu.append(offline, menuItem('ABOUT.html', 'О выпуске', 'Состав, ограничения, технические сведения'));
    const help = make('button', { type: 'button', class: 'as-mi' });
    help.append(make('span', { class: 'as-mi-title' }, 'Как работать с атласом'), make('span', { class: 'as-mi-desc' }, 'Короткая справка по управлению'));
    help.addEventListener('click', () => { closeMenu(); api.help(); });
    help.classList.add('as-mi-help');
    const helpSep = make('div', { class: 'as-menu-sep', role: 'separator' });
    menu.append(help, helpSep);
    // 1.0.19a A-14 (О-8): на телефоне «Как работать с атласом» — первым пунктом «Ещё» (порядок в разметке, чтобы совпадал порядок фокуса)
    const phoneMQ = window.matchMedia ? matchMedia('(max-width: 1000px)') : null;
    // 1.0.20 b1: в режимах первая строка — «Режим: … · сменить», справка — сразу за ней
    const placeHelp = () => {
      const row = menu.querySelector(':scope > [data-mode-item="row"]');
      if (phoneMQ && phoneMQ.matches) { if (row) { if (row.nextElementSibling !== help) row.after(help); } else if (menu.firstElementChild !== help) menu.prepend(help); }
      else if (help.nextElementSibling !== helpSep) helpSep.before(help);
    };
    placeHelpFn = placeHelp;
    if (phoneMQ) { phoneMQ.addEventListener('change', placeHelp); cleanups.push(() => phoneMQ.removeEventListener('change', placeHelp)); }   // первый вызов — после пунктов «только на телефоне» (ниже)
    { const aux = ((window.ATLAS_PROJECT || {}).library || {}).nonworld_page; if (aux) menu.append(menuItem(aux, 'Типы и варианты', 'Вспомогательные типы и варианты — для проверки', { class: 'as-mi review-only' })); }   // К1: страница — library.nonworld_page конфига
    // 1.0.20 реш. 6: переключателя «Режим проверки» в «Ещё» больше нет — режим включается ссылкой …#review=1, выключается полосой «Выключить».
    // Пункты, которые страница добавляет через AtlasShell.addMenuItem (например, «Тёмная тема» на главной — B2).
    for (const it of extraMenu) addToMenu(it);
    // Пункты NAV «только в меню на телефоне» (V12.0 · «Обзор» — после раскомментирования строки в NAV).
    for (const item of MV ? [] : NAV.filter(n => n.menuPhone)) { const mi = menuItem(item.href, item.title || item.label, '', { 'data-phone-only': '' }); if (item.key === page) mi.setAttribute('aria-current', 'page'); menu.prepend(mi); }
    placeHelp();
    more.append(moreButton, menu);
    nav.append(more);
    navEl = nav; moreEl = more;
    if (MV) { buildChip(); more.before(modeBox); header.classList.add('as-has-modes'); }   // 1.0.20 b1: чип — на ПК слева от «Ещё»

    const tools = make('div', { class: 'as-tools' });
    const search = make('label', { class: 'as-search' });
    search.insertAdjacentHTML('beforeend', ICONS.search);
    const input = make('input', { type: 'search', id: 'asSearch', 'aria-label': 'Поиск по модели', placeholder: 'Поиск по модели', autocomplete: 'off', enterkeyhint: 'search', inputmode: 'search' });   // 1.0.19a A-10 (О-7): клавиатура телефона — «Найти»
    // Общий поиск: «Элементы / Замечания / Типы / Листы» (assets/atlas-search.js подключается при первом вводе).
    const results = make('div', { class: 'as-results', id: 'asResults', hidden: true, role: 'region', 'aria-label': 'Результаты поиска' });
    let loadSearch = null, sTimer = 0, sGen = 0;
    const needSearch = () => loadSearch || (loadSearch = window.AtlasSearch ? Promise.resolve() : new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'assets/atlas-search.js'; sc.onload = res; sc.onerror = rej; document.head.append(sc); }));
    const closeResults = () => { results.hidden = true; };
    input.setAttribute('aria-controls', 'asResults');   // 1.0.19a A-07: поле не combobox — без aria-expanded
    input.addEventListener('input', () => {
      clearTimeout(sTimer);
      const q = input.value.trim();
      if (!q) { closeResults(); return; }
      sTimer = setTimeout(async () => {
        const my = ++sGen;
        await needSearch();
        const gs = await window.AtlasSearch.groups(q, 5);
        if (my !== sGen) return;
        window.AtlasSearch.renderGroups(results, gs, { modelLink: q });
        const d = window.AtlasSearch.direct(q);
        if (d) { const a = make('a', { class: 'sg-item', href: d.href }); a.append(make('span', { class: 'sg-label' }, 'Перейти: ' + d.label + ' →')); results.prepend(a); }
        if (!gs.length && !d) {   // 1.0.19a A-04: пустой результат — с «Сбросить»
          const pe = make('p', { class: 'as-empty' }, 'Среди замечаний, типов и листов «' + q + '» не найдено. Проверьте раскладку или введите марку без дефиса' + (((window.ATLAS_TEXTS || {}).search || {}).example ? ', например ' + window.ATLAS_TEXTS.search.example : '') + '. ');
          const rb = make('button', { type: 'button', class: 'as-empty-reset' }, 'Сбросить');
          rb.addEventListener('click', () => { input.value = ''; closeResults(); input.focus(); });
          pe.append(rb); results.append(pe);
        }
        results.hidden = false;
      }, 200);
    });
    input.addEventListener('keydown', async e => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        await needSearch();
        const d = window.AtlasSearch.direct(input.value);
        location.href = d ? d.href : 'index.html#q=' + encodeURIComponent(input.value.trim());
      }
      if (e.key === 'ArrowDown' && !results.hidden) { e.preventDefault(); results.querySelector('a')?.focus(); }
      if (e.key === 'Escape') { closeResults(); input.blur(); header.classList.remove('as-search-open'); }
    });
    results.addEventListener('keydown', e => {
      const items = [...results.querySelectorAll('a')], i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); (items[i + (e.key === 'ArrowDown' ? 1 : -1)] || input).focus(); }
      if (e.key === 'Escape') { closeResults(); input.focus(); }
    });
    // 1.0.19a A-10 (О-7): своя кнопка «×» (системная скрыта стилем) — видна, когда в поле есть текст; на телефоне 44 px. Работает и с полем главной (#search)
    const clear = make('button', { type: 'button', class: 'as-search-clear', 'aria-label': 'Очистить поиск', title: 'Очистить', hidden: true }, '×');
    const clearSync = () => { const i = search.querySelector('input'); clear.hidden = !(i && i.value); };
    clear.addEventListener('mousedown', e => e.preventDefault());   // фокус остаётся в поле
    clear.addEventListener('click', e => { e.preventDefault(); const i = search.querySelector('input'); if (!i) return; i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.focus(); clearSync(); });
    search.addEventListener('input', clearSync); search.addEventListener('focusin', clearSync);
    search.append(input, clear, make('kbd', { title: 'Поиск с любого места' }, kbdK()));   // 1.0.19a A-05: подпись по платформе
    const searchToggle = make('button', { type: 'button', class: 'as-icon as-search-toggle', 'aria-label': 'Поиск', 'aria-expanded': 'false' });
    searchToggle.innerHTML = ICONS.searchBig;
    searchToggle.addEventListener('click', () => {
      const open = !header.classList.contains('as-search-open');
      header.classList.toggle('as-search-open', open);
      searchToggle.setAttribute('aria-expanded', String(open));
      if (open) (search.querySelector('input') || input).focus();
    });
    const helpBtn = make('button', { type: 'button', class: 'as-icon as-help', 'aria-label': 'Справка', title: 'Как работать с атласом' });
    helpBtn.innerHTML = ICONS.help;
    helpBtn.addEventListener('click', () => api.help());
    const themeSlot = make('span', { class: 'as-theme-slot' });
    tools.append(search, helpBtn, themeSlot, searchToggle);
    tools.append(results);
    if (MV && phoneMQ) {   // 1.0.20 b1: на телефоне чип — в верхней строке, перед кнопкой поиска (порядок фокуса = порядок на экране)
      const placeChip = () => { if (!modeBox) return; if (phoneMQ.matches) { if (modeBox.nextElementSibling !== searchToggle) searchToggle.before(modeBox); } else if (modeBox.nextElementSibling !== more) more.before(modeBox); };
      phoneMQ.addEventListener('change', placeChip); cleanups.push(() => phoneMQ.removeEventListener('change', placeChip));
      placeChip();
    }
    tools.addEventListener('focusout', () => setTimeout(() => { if (!tools.contains(document.activeElement)) closeResults(); }, 0));
    // Ссылка-пропуск: первая в шапке, видна при фокусе.
    const target = document.querySelector('#canvas') ? '#canvas' : 'main';
    const skip = make('a', { class: 'skip-link', href: '#' }, target === '#canvas' ? 'К модели' : 'К содержимому');
    skip.addEventListener('click', e => { e.preventDefault(); const t = document.querySelector(target); if (t) { if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1'); t.focus(); } });
    header.append(skip, brand, nav, tools);
    if (old) old.replaceWith(header); else document.body.prepend(header);

    // Нижняя панель телефона.
    const tabbar = make('nav', { class: 'as-tabbar', 'aria-label': 'Разделы атласа · нижняя панель' });
    for (const item of MV ? [] : NAV.filter(n => n.tab && hasCount(n) && !(n.noTab && n.noTab()))) {   // в режимах вкладки ставит applyModes()
      const a = make('a', { class: 'as-tab', href: item.href, 'data-key': progressOn() ? item.key : null });   // data-key — только при ключе progress (без ключа разметка как в 1.0.18)
      a.innerHTML = icon(item.icon, 'icon--24');
      a.append(make('span', {}, item.tab));
      if (item.key === page) a.setAttribute('aria-current', 'page');
      if (item.count) a.append(make('span', { class: 'as-tab-badge' }, fmt(item.count())));
      tabbar.append(a);
    }
    tabMore = make('button', { type: 'button', class: 'as-tab', 'aria-expanded': 'false', 'aria-controls': 'asMoreMenu' });
    tabMore.innerHTML = ICONS.more;
    tabMore.append(make('span', {}, 'Ещё'));
    if (page === 'unplaced') tabMore.setAttribute('aria-current', 'page');
    tabbar.append(tabMore);
    document.body.append(tabbar);
    document.body.classList.add('has-shell');
    tabbarEl = tabbar;
    if (MV) { tabbar.classList.add('as-tabbar--modes'); applyModes(); }   // 1.0.20 b1: 3 кнопки режима + «Ещё»
    if (progressOn()) { syncSearchPh(); if (narrowHead) narrowHead.addEventListener('change', syncSearchPh); }
    if (progressOn()) { header.classList.add('as-has-progress'); syncProgressNav(); addEventListener('hashchange', syncProgressNav); api.syncProgressNav = syncProgressNav; }   /* 1.0.17 B3-17e: класс — сжатие шапки только при ключе */   /* 1.0.17 B3-17b: и для вкладки «Ход работ» (адрес она пишет replaceState — без hashchange) */

    moreButton.addEventListener('click', () => menu.hidden ? openMenu('header') : closeMenu());
    // V12.2 · S4: пункт-ссылка закрывает меню (в том числе ссылка на якорь той же страницы — «История выпусков» на ABOUT.html)
    menu.addEventListener('click', e => { if (e.target.closest('a[href]')) closeMenu(); });
    tabMore.addEventListener('click', () => menu.hidden ? openMenu('tab') : closeMenu());
    const onDocDown = e => { if (!menu.hidden && !menu.contains(e.target) && !moreButton.contains(e.target) && !tabMore.contains(e.target)) closeMenu(); };
    const onDocKey = e => {
      if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); closeMenu(true); }
      const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable;
      if (isSearchKey(e) && page !== 'model') { e.preventDefault(); header.classList.add('as-search-open'); input.focus(); }
      else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && page !== 'model' && inScene(e)) { e.preventDefault(); input.focus(); }   // 1.0.19a A-05: «/» — только в сцене (на этих страницах сцены нет)
    };
    document.addEventListener('pointerdown', onDocDown);
    document.addEventListener('keydown', onDocKey);
    cleanups.push(() => { document.removeEventListener('pointerdown', onDocDown); document.removeEventListener('keydown', onDocKey); });   // 1.0.20: remount не копит слушатели
    // 1.0.19a A-07 (О-2): фокус ушёл из меню (Tab, щелчок в другом месте) — меню закрывается
    menu.addEventListener('focusout', () => setTimeout(() => { const a = document.activeElement; if (!menu.hidden && !menu.contains(a) && a !== moreButton && a !== tabMore && a && a !== document.body) closeMenu(); }, 0));
    menu.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...menu.querySelectorAll('a,button')].filter(x => x.offsetParent !== null);
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    });
    // Числа выпуска в тексте страниц: <span data-release="elements">…</span>
    for (const el of document.querySelectorAll('[data-release]')) fillRelease(el);
    reviewBarSync();   // 1.0.19a A-13
    document.dispatchEvent(new Event('atlas:shell'));
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
  // Когда тело документа уже разобрано, но DOMContentLoaded ещё не наступил (defer-скрипты), mount() вызывает страница сама.
})();
