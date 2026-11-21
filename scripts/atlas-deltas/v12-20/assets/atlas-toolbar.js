/* 3D Атлас · панель инструментов сцены (V12.0 «Чистовая отделка», сессия B3).
   Узлы создают prototype.js, view-settings.js, atlas-measure.js и движок — здесь они только раскладываются по группам
   (по id, без пересоздания) и получают значки. Новые узлы: «Сечение», «Ссылка», «Ракурс ▾», строка вида.
   Действия — через существующие узлы и API движка: [data-view].click(), __R24.camera(), __R24.capture(), AtlasViewLink.copy().
   Разметка:
   - компьютер: снизу .tools — «Оси, Подписи | Сечение, Линейка | Инструменты, Снимок, Ссылка»;
     сверху справа (.stage-actions > .atb-tr) — «3D / План», «Ракурс ▾», «Показать всё»; строка вида — под путём;
   - узкая сцена (< 700 px) — только значки с aria-label;
   - телефон (≤ 850 px) — как в V11.5: сверху справа «3D / План» и «Инструменты», справа столбец «Линейка», «Вписать»;
     «Показать всё» — в столбце, когда нужно. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const stage = document.querySelector('.stage'), tools = document.querySelector('.tools');
  if (!stage || !tools) return;
  // Признак панели B3: по нему prototype.js, view-settings.js и atlas-measure.js не раскладывают узлы сами.
  const API = window.AtlasToolbar = { ready: false, layout: () => layout(), viewText: () => viewText() };

  const icon = (name, cls) => (window.AtlasIcons ? window.AtlasIcons.use(name, null, cls) : '');
  // Значок — копия разобранного один раз образца (cloneNode), без разбора HTML на каждой кнопке (профиль V12, п. 3).
  const ICONS = new Map();
  const iconNode = (name, cls) => {
    const k = name + '|' + (cls || '');
    if (!ICONS.has(k)) { const t = document.createElement('template'); t.innerHTML = icon(name, cls); ICONS.set(k, t.content.firstChild); }
    const n = ICONS.get(k); return n ? n.cloneNode(true) : document.createTextNode('');
  };
  const tspan = (text, cls) => { const e = document.createElement('span'); if (cls) e.className = cls; e.textContent = text; return e; };
  const make = (tag, attrs, text) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) e.setAttribute(k, v);
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  };
  // Кнопка: значок + подпись (подпись прячется на узкой сцене, остаётся aria-label).
  function dress(el, name, text, label) {
    if (!el || el.dataset.atbIcon === name) return; // уже оформлена — не пересобирать разметку
    el.replaceChildren(iconNode(name)); if (text) el.append(tspan(text, 'atb-t'));
    el.dataset.atbIcon = name;
    el.classList.add('atb-b');
    const l = label || text;
    if (l) { el.setAttribute('aria-label', l); if (!el.title) el.title = l; }
  }
  const phone = matchMedia('(max-width: 850px)');

  /* ---------- новые узлы ---------- */
  const g1 = make('div', { class: 'atb-g', role: 'group', 'aria-label': 'Показ' });
  const g2 = make('div', { class: 'atb-g', role: 'group', 'aria-label': 'Сечение и замеры' });
  // V12.2 · M4 (макет D V12_2_замечания): отдельная группа «Замечания · N» — кнопку #atbIssues ставит atlas-issues.js (B2) в #atbGIssues; пустая группа скрыта
  const gI = make('div', { class: 'atb-g atb-g--issues', id: 'atbGIssues', role: 'group', 'aria-label': 'Замечания на модели' });
  const g3 = make('div', { class: 'atb-g atb-g--last', role: 'group', 'aria-label': 'Инструменты и вид' });
  const hold = make('div', { class: 'atb-hold', hidden: '' }); // прежние узлы движка, которых нет в новой панели
  const sliceBtn = make('button', { type: 'button', id: 'atbSlice', 'aria-pressed': 'false', 'aria-expanded': 'false', 'aria-controls': 'atbSlicePop' });
  dress(sliceBtn, 'section', 'Сечение', 'Сечение модели');
  const linkBtn = make('button', { type: 'button', id: 'atbLink' });
  dress(linkBtn, 'share-view', 'Ссылка', 'Ссылка на вид');
  linkBtn.title = 'Скопировать ссылку на текущий вид';
  const slicePop = make('div', { class: 'atb-pop atb-slice', id: 'atbSlicePop', role: 'dialog', 'aria-label': 'Сечение модели', hidden: '' });
  const sliceHead = make('div', { class: 'atb-pop-h' });
  sliceHead.append(make('b', {}, 'Сечение'));
  const sliceOff = make('button', { type: 'button', class: 'atb-pop-link' }, 'Убрать сечение'); // V12.5 Q9 (решение D): термин — «Убрать сечение» везде
  sliceHead.append(sliceOff);
  const axisLab = make('label', { class: 'atb-field' }, 'Плоскость');
  const valLab = make('label', { class: 'atb-field' }, 'Положение');
  /* V12.2 · S3 «По этажу»: фильтр «Уровень» = этаж + вид «План» + сечение Z по низу тел cut уровня (по габаритам тел в модели).
     К1-B3 · этажи из конфига (решение координатора 05.10): levels[] объекта; пункт — у уровня с cut = { field, match, label? }:
     field — поле записи albumRecord ('level' — умолчание) или 'name' — имя тела; match — строка (равенство) или '/регулярка/флаги';
     label — подпись пункта (нет — label уровня). Строки пункта — texts.toolbar объекта (координатор 05.10): floor_title (подсказка кнопки), floor_active (этаж нажат),
     floor_note (подсказка под пунктом), floor_empty (cut есть, тел нет); подстановки {label} — подпись пункта, {sub} — sub уровня, {z} — низ тел cut по модели, м.
     Нет текста — нейтральная подпись ядра.
     Нет cut ни у одного уровня, нет тел или нет уровня в фильтре — пункта нет. Отметку не додумываем. */
  const PRJ = () => (window.AtlasShell && window.AtlasShell.project && window.AtlasShell.project()) || window.ATLAS_PROJECT || {};
  const TX = k => { const t = ((window.ATLAS_TEXTS || {}).toolbar || {})[k]; return typeof t === 'string' ? t : null; };
  const fill = (t, f) => t.replace(/\{(label|sub|z)\}/g, (m, k) => k === 'label' ? f.name : k === 'sub' ? (f.mark || '') : fmtZ(f.z)).replace(/ {2,}/g, ' ');
  const FLOOR_NOTE = () => TX('floor_note') || '';
  const floorTitle = f => TX('floor_title') != null ? fill(TX('floor_title'), f) : f.name + ': сечение на отметке ' + fmtZ(f.z) + ' м по модели';
  const floorActive = f => TX('floor_active') != null ? fill(TX('floor_active'), f) : 'По этажу: ' + f.name + ' · сечение на отметке ' + fmtZ(f.z) + ' м по модели.' + (FLOOR_NOTE() ? ' ' + FLOOR_NOTE() : '');
  const cutTest = c => {
    const m = c && c.match; if (typeof m !== 'string' || !m) return null;
    const rx = /^\/(.*)\/([a-z]*)$/.exec(m); let re = null;
    if (rx) { try { re = new RegExp(rx[1], rx[2]); } catch (e) { return null; } }
    const fld = typeof c.field === 'string' && c.field ? c.field : 'level';
    const val = x => String((fld === 'name' ? x.name : (x.albumRecord || {})[fld]) ?? '');
    return re ? x => re.test(val(x)) : x => val(x) === m;
  };
  const floorsOf = () => (Array.isArray(PRJ().levels) ? PRJ().levels : []).filter(l => l && typeof l.label === 'string' && l.cut).map(l => { const t = cutTest(l.cut); return t ? [l.label, typeof l.sub === 'string' ? l.sub : '', t, (typeof l.cut.label === 'string' && l.cut.label) || l.label] : null; }).filter(Boolean);
  const floorBox = make('div', { class: 'atb-floor', role: 'group', 'aria-label': 'Сечение по этажу' });
  const floorNote = make('p', { class: 'atb-note atb-floor-note' });
  let floorPlan = null, floorOn = null;
  const levelBtn = l => [...document.querySelectorAll('#levelChoices button')].find(b => (b.firstChild && b.firstChild.textContent || '').trim() === l) || null;
  const fmtZ = z => (z < 0 ? '−' : '') + Math.abs(z).toFixed(2).replace('.', ',');
  function floorBuild() {
    const all = (window.__FULL_ATLAS && window.__FULL_ATLAS.allWorld && window.__FULL_ATLAS.allWorld()) || [];
    const FLOORS = floorsOf(); if (!FLOORS.length) return false; /* К1-B3: нет cut в конфиге — пункта нет */
    if (!all.length || !document.querySelector('#levelChoices button')) return false;
    floorPlan = [];
    for (const [lev, mark, inSlab, name] of FLOORS) {
      if (!levelBtn(lev)) continue;
      // V12.2b п. 7: только рабочие физические тела (albumRecord.bucket 'active' и physical) — без вспомогательных маркеров «…CHECK… · не материал»
      let z = Infinity; for (const x of all) { const r = x.albumRecord || {}; if (x.bounds && r.bucket === 'active' && r.physical === true && inSlab(x)) z = Math.min(z, x.bounds[0][2]); }
      if (Number.isFinite(z)) floorPlan.push({ lev, mark, z, name });
    }
    floorBox.replaceChildren(make('span', { class: 'atb-floor-h' }, 'По этажу'));
    const row = make('div', { class: 'atb-floor-row' });
    for (const f of floorPlan) {
      const b = make('button', { type: 'button', class: 'atb-pop-link', 'aria-pressed': 'false', title: floorTitle(f) }, f.name);
      b.onclick = () => floorGo(f); f.btn = b; row.append(b);
    }
    floorBox.append(row, floorNote);
    floorNote.textContent = floorPlan.length ? FLOOR_NOTE() : (TX('floor_empty') != null ? TX('floor_empty') : 'Элементов для сечения по этажу в модели нет.');
    return true;
  }
  // V12.4b: этаж «нажат», только пока в движке стоит его сечение (срез P9 временно заменяет его — кнопка отжата, при снятии среза — снова нажата)
  const floorLive = () => { if (!floorOn) return false; const A = window.__ATLAS; if (!(A && A.features && A.features.sectionApi)) return true; const sc = (A.sectionState() || {}).section; return !!(sc && sc.axis === 'z' && Math.abs(sc.value - floorOn.z) < 1e-6); };
  function floorSync() {
    const live = floorLive();
    for (const f of floorPlan || []) f.btn.setAttribute('aria-pressed', String(f === floorOn && live));
    if (floorOn && live) floorNote.textContent = floorActive(floorOn);
    else if (floorPlan && floorPlan.length) floorNote.textContent = FLOOR_NOTE();
  }
  // 1.0.19a A-03: вид «План» — обработчик движка [data-view=plan] напрямую (без события щелчка), отметка «3D / План» — здесь
  function planView() {
    const pv = document.querySelector('[data-view="plan"]'); if (!pv) return;
    if (typeof pv.onclick === 'function') pv.onclick(); else pv.click();
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b === pv)));
    viewSoon();
  }
  // V12.2 · S3 (логика прежняя): уровень + «План» + сечение Z. 1.0.19a A-03: уровень — AtlasPrototype.setLevel (API, без щелчка по левой панели: на телефоне «Состав» не открывается);
  // нет API — прежний путь (кнопка уровня). Телефон: после выбора этажа «Инструменты» закрываются — план виден сразу (2 касания от «Инструментов»).
  async function floorGo(f) {
    const lb = levelBtn(f.lev); if (!lb) return;
    const P = window.AtlasPrototype;
    let viaApi = false;
    if (P && typeof P.setLevel === 'function') { try { viaApi = (await P.setLevel(f.lev)) !== null; } catch (e) { viaApi = false; } }
    if (!viaApi) lb.click();
    planView();
    // V12.2 · E13: сечение в метрах — __ATLAS.setSection({axis:'z', value}), когда сцена уровня готова (whenReady ждёт последнюю сцену); ползунок — выключен
    if (FS().sectionApi) {
      (FS().whenReady ? window.__ATLAS.whenReady() : Promise.resolve()).then(() => {
        setSlice('none');
        if (window.__ATLAS.setSection({ axis: 'z', value: f.z, flip: false })) { floorOn = f; floorSync(); }
        sliceSync(); window.AtlasViewSettings?.sync?.();
        if (phone.matches) { const vp = $('viewSettings'); if (vp && !vp.hidden) window.AtlasViewSettings?.open?.(false); }
      });
      return;
    }
    // запасной путь (движок без features.sectionApi): процент ползунка в габарите сцены
    // после перестройки сцены (большой уровень — несколько кадров) — положение ползунка по Z сечения в габарите сцены
    // (движок: box[0] + (box[1]−box[0])·value/100); ждём, пока число тел сцены устоится, и повторяем, если перестройка сбросила ось.
    const scn = () => (window.__ATLAS && window.__ATLAS.sceneObjects && window.__ATLAS.sceneObjects()) || [];
    let last = -1, same = 0, frames = 0, tries = 0;
    const apply = () => {
      const m = new Map(((window.__FULL_ATLAS && window.__FULL_ATLAS.allWorld()) || []).map(x => [x.renderId, x]));
      let lo = Infinity, hi = -Infinity;
      for (const s of scn()) { const x = m.get(s.renderId); if (x && x.bounds) { lo = Math.min(lo, x.bounds[0][2]); hi = Math.max(hi, x.bounds[1][2]); } }
      const v = $('sliceValue'), fl = $('r23SliceFlip');
      if (!v || !Number.isFinite(lo) || hi <= lo) return;
      if (fl) fl.checked = false; // показ — ниже сечения
      setSlice('2'); // сначала ось (setSlice ставит 50 %, если ползунок был на 100), потом положение
      v.step = 'any';
      v.value = String(Math.max(0, Math.min(100, (f.z - lo) / (hi - lo) * 100)));
      v.dispatchEvent(new Event('input', { bubbles: true })); window.__R24?.request?.(); window.AtlasViewSettings?.sync?.();
      floorOn = f; floorSync();
      setTimeout(() => { if (floorOn === f && !sliceOn() && tries++ < 2) apply(); }, 400);
    };
    const wait = () => {
      const n = scn().length; same = n === last ? same + 1 : 0; last = n;
      if ((same >= 3 && n > 0) || ++frames > 120) apply(); else requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  }
  // Окно «Сечение» собирается при первом открытии (до первого кадра — не строить скрытое).
  // 1.0.19a A-03: при открытии окно модель не режет; сверху — этажи, плоскости X/Y/Z — под спойлером «Другие плоскости»
  let sliceBuilt = false;
  const otherBox = make('details', { class: 'atb-other' });
  otherBox.append(make('summary', {}, 'Другие плоскости (X, Y, Z)'));
  function buildSlice() { if (sliceBuilt) return; sliceBuilt = true; slicePop.append(sliceHead, otherBox, make('p', { class: 'atb-note' }, 'Сечение для просмотра: торцы элементов не закрашены.')); layout(); if (!(floorPlan && floorPlan.length)) otherBox.open = true; }

  const tr = make('div', { class: 'atb-tr' });
  const camBtn = make('button', { type: 'button', id: 'atbCamera', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'atbCameraMenu' });
  camBtn.append(iconNode('view-iso'), tspan('Ракурс', 'atb-t'), iconNode('chevron-down', 'icon--16 atb-chev'));
  camBtn.classList.add('atb-b');
  camBtn.setAttribute('aria-label', 'Ракурс');
  camBtn.title = 'Ракурс';
  const camMenu = make('div', { class: 'atb-pop atb-menu', id: 'atbCameraMenu', role: 'menu', 'aria-label': 'Ракурс', hidden: '' });
  const VIEWS = [
    ['iso', 'Изометрия', 'view-iso'], ['plan', 'Сверху', 'view-top'], ['front', 'Спереди', 'view-front'], ['side', 'Сбоку', 'view-front'],
    ['back', 'Сзади', 'view-front'], ['left', 'Слева', 'view-front'], ['bottom', 'Снизу', 'view-top']
  ];
  // Пункты меню «Ракурс» — при первом открытии.
  function buildCam() {
    if (camMenu.firstChild) return;
    for (const [v, t, ic] of VIEWS) {
      const b = make('button', { type: 'button', role: 'menuitemradio', 'aria-checked': 'false', 'data-cam': v, tabindex: '-1' });
      b.append(iconNode(ic), tspan(t));
      camMenu.append(b);
    }
  }
  const camWrap = make('div', { class: 'atb-cam' });
  camWrap.append(camBtn, camMenu);
  const viewLine = make('div', { class: 'atb-view', role: 'status', 'aria-live': 'off', hidden: '' });

  /* ---------- раскладка ---------- */
  let seg = null;
  function layout() {
    const actions = document.querySelector('.stage-actions');
    const zoom = document.querySelector('.zoom-controls');
    seg = seg || tools.querySelector('.view-controls') || document.querySelector('.view-controls');
    if (seg) { seg.classList.add('atb-seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Вид'); }
    // Группы нижней панели
    if (!g1.isConnected) tools.append(g1, g2, gI, g3, slicePop, hold);
    const put = (g, ids) => { for (const id of ids) { const e = typeof id === 'string' ? $(id) : id; if (e && e.parentElement !== g) g.append(e); } };
    put(g1, ['quickAxes', 'quickLabels']);
    put(g2, [sliceBtn]);
    const measure = $('quickMeasure');
    if (measure) {
      if (phone.matches && zoom) { if (measure.parentElement !== zoom) zoom.prepend(measure); }
      else if (measure.parentElement !== g2 || measure.previousElementSibling !== sliceBtn) sliceBtn.after(measure);
    }
    put(g3, ['viewSettingsToggle', 'quickShot', linkBtn]);
    // Сечение: #sliceAxis и #sliceValue — в быстрой панели «Сечение» (view-settings.js их не забирает при AtlasToolbar).
    // Узлы движок читает по id каждый кадр — они всегда в документе: до первого открытия окна — в скрытом hold.
    const ax = $('sliceAxis'), sv = $('sliceValue');
    const vsSlice = phone.matches ? [...document.querySelectorAll('#viewSettings details')].find(d => /^Сечение/.test(d.querySelector('summary')?.textContent || '')) : null;
    if (vsSlice || sliceBuilt) {
      if (ax && ax.parentElement !== axisLab) axisLab.append(ax);
      if (sv && sv.parentElement !== valLab) valLab.append(sv);
      // Телефон: быстрой панели нет — плоскость и положение в «Инструменты → Сечение модели».
      if (vsSlice) { if (axisLab.parentElement !== vsSlice) vsSlice.querySelector('summary').after(axisLab, valLab); }
      else if (axisLab.parentElement !== otherBox) otherBox.append(axisLab, valLab);
    } else for (const e of [ax, sv]) if (e && e.parentElement !== hold) hold.append(e);
    // S3 «По этажу» (1.0.19a A-03): ПК — вверху окна «Сечение»; телефон — вверху «Инструментов» (до плана 2 касания)
    if ((phone.matches || sliceBuilt) && (floorPlan || floorBuild())) {
      if (phone.matches) { const vp = $('viewSettings'), an = vp && (vp.querySelector(':scope > .tool-intro') || vp.querySelector(':scope > .r23-menu-head')); if (an && an.nextElementSibling !== floorBox) an.after(floorBox); }
      else if (sliceHead.nextElementSibling !== floorBox) sliceHead.after(floorBox);
    }
    // Прочие узлы прежней панели — вне вида (движок к ним обращается по id).
    for (const e of [...tools.children]) if (![g1, g2, gI, g3, slicePop, hold, seg].includes(e)) hold.append(e);
    for (const v of ['front', 'side']) { const e = tools.querySelector('[data-view="' + v + '"]'); if (e && e.parentElement !== hold && (!seg || e.parentElement !== seg)) hold.append(e); }
    // Верх справа
    if (actions) {
      if (!tr.isConnected) actions.append(tr);
      if (phone.matches) { if (seg && seg.parentElement !== tools) tools.prepend(seg); }
      else if (seg && seg.parentElement !== tr) tr.prepend(seg);
      if (camWrap.parentElement !== tr) (seg && seg.parentElement === tr ? seg.after(camWrap) : tr.prepend(camWrap));
      const qr = $('quickRestore');
      if (qr) { if (phone.matches && zoom) { if (qr.parentElement !== zoom) zoom.prepend(qr); } else if (qr.parentElement !== tr) tr.append(qr); }
      // 1.0.19a A-02: ↺ «Как при открытии» — сразу за «Показать всё» (ПК — вверху справа, телефон — столбец справа)
      const qh = $('quickHome');
      if (qh && qr && qh.previousElementSibling !== qr) qr.after(qh); else if (qh && !qr && qh.parentElement !== (phone.matches && zoom ? zoom : tr)) (phone.matches && zoom ? zoom : tr).append(qh);
    }
    if (!viewLine.isConnected) stage.append(viewLine);
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', 'Инструменты сцены');
    stage.classList.add('atb');
    // compactSync — только из ResizeObserver: чтение clientWidth здесь заставило бы браузер пересчитать раскладку до первого кадра.
  }
  function dressAll() {
    dress($('quickAxes'), 'axes', 'Оси', 'Оси');
    dress($('quickLabels'), 'labels', 'Подписи', 'Подписи');
    dress($('viewSettingsToggle'), 'settings', 'Инструменты', 'Инструменты');
    dress($('quickShot'), 'camera', 'Снимок', 'Снимок');
    dress($('quickRestore'), 'show', 'Показать всё', 'Показать всё');
    dress($('quickHome'), 'reset-view', 'Как при открытии', 'Как при открытии');
    dress($('menu'), 'sidebar', 'Состав', 'Разделы модели');
    dress($('card'), 'element', 'Элемент', 'Карточка элемента');   // 1.0.19a A-11: «паспорт» → «карточка»
    dress($('zoomIn'), 'zoom-in', '', 'Приблизить');
    dress($('zoomOut'), 'zoom-out', '', 'Отдалить');
    dress($('fit'), 'fit', '', 'Вписать в окно');
    for (const v of ['iso', 'plan']) { const e = document.querySelector('[data-view="' + v + '"]'); if (e) { e.textContent = v === 'iso' ? '3D' : 'План'; e.setAttribute('aria-label', v === 'iso' ? 'Трёхмерный вид' : 'План, вид сверху'); } }
    dress($('quickMeasure'), 'ruler', 'Линейка', 'Линейка');
  }
  // Подписи прячутся, когда сцена узкая (панели слева и справа открыты на 1024–1180 и т. п.).
  let compact = null;
  function compactSync(entries) {
    const w = entries && entries[0] ? entries[0].contentRect.width : stage.clientWidth;
    if (!w) return;
    const c = !phone.matches && w < 700;
    if (c !== compact) { compact = c; stage.classList.toggle('atb-compact', c); }
  }
  new ResizeObserver(compactSync).observe(stage);
  // 1.0.19a A-09 (М-5): нижняя панель и столбец масштаба («Вписать») не пересекаются — столбец поднимается над панелью (ПК; на телефоне раскладка своя)
  let zoomUp = null;
  function zoomSync() {
    const z = document.querySelector('.stage.atb .zoom-controls');
    if (!z || phone.matches) { if (zoomUp) { zoomUp = false; stage.classList.remove('atb-zoom-up'); } return; }
    const t = tools.getBoundingClientRect(), s = stage.getBoundingClientRect();
    if (!t.width) return;
    const was = stage.classList.contains('atb-zoom-up');
    if (was) stage.classList.remove('atb-zoom-up');   // мерить в обычном положении
    const zr = z.getBoundingClientRect();
    const hit = zr.width > 0 && t.right + 8 > zr.left && t.left - 8 < zr.right && t.bottom + 8 > zr.top && t.top - 8 < zr.bottom;
    if (hit) { const b = Math.ceil(s.bottom - t.top + 8) + 'px'; if (stage.style.getPropertyValue('--atb-zoom-b') !== b) stage.style.setProperty('--atb-zoom-b', b); }
    stage.classList.toggle('atb-zoom-up', hit); zoomUp = hit;
  }
  let zoomT = 0; const zoomSoon = () => { cancelAnimationFrame(zoomT); zoomT = requestAnimationFrame(zoomSync); };
  new ResizeObserver(zoomSoon).observe(stage); new ResizeObserver(zoomSoon).observe(tools);
  // Строка вида — под путём «Всё здание › …»: путь бывает в 2 строки (узкая сцена), тогда строка вида опускается.
  function viewTop() {
    const pth = document.querySelector('.stage-actions .stage-path'), acts = document.querySelector('.stage-actions');
    const anchor = pth && pth.offsetParent ? pth : acts;
    if (!anchor) return;
    const top = Math.round(anchor.getBoundingClientRect().bottom - stage.getBoundingClientRect().top + 8);
    if (top > 0 && viewLine.style.top !== top + 'px') viewLine.style.top = top + 'px';
    if (top > 0) { const vb = top + Math.round(viewLine.offsetHeight || 0) + 'px'; if (stage.style.getPropertyValue('--atb-view-b') !== vb) stage.style.setProperty('--atb-view-b', vb); }   // 1.0.15 B3-3 (L3): низ строки вида — легенда замечаний (ПК) не заходит на чип «Изометрия», когда путь в 2 строки
  }
  const pathRO = new ResizeObserver(viewTop);
  document.addEventListener('atlas:ready', () => { const pth = document.querySelector('.stage-actions .stage-path'); if (pth) pathRO.observe(pth); pathRO.observe(stage); });
  phone.addEventListener('change', () => { layout(); closePops(); });

  /* ---------- «Сечение» ---------- */
  const FS = () => (window.__ATLAS && window.__ATLAS.features) || {};
  // E13: сечение включено — ползунком или через API (sectionState().section)
  const sliceOn = () => { const a = $('sliceAxis'); return (!!a && a.value !== 'none') || (FS().sectionApi && !!(window.__ATLAS.sectionState() || {}).section); };
  // 1.0.19a A-03: «Плоскость» показывает включённое сечение API («По этажу», вырез): подпись пункта «Без сечения» на это время — по сечению (значение 'none' для движка не меняется)
  function axisText() {
    const ax = $('sliceAxis'), o0 = ax && ax.querySelector('option[value="none"]'); if (!o0) return;
    if (!o0.dataset.t0) o0.dataset.t0 = o0.textContent;
    let t = o0.dataset.t0;
    const sc = ax.value === 'none' && FS().sectionApi ? (window.__ATLAS.sectionState() || {}).section : null;
    if (sc) t = floorOn && floorLive() ? 'Сечение Z · ' + floorOn.name : sc.box ? 'Вырез' : 'Сечение ' + String(sc.axis || '').toUpperCase();
    if (o0.textContent !== t) o0.textContent = t;
  }
  function sliceSync() {
    const on = sliceOn();
    if (sliceBtn.getAttribute('aria-pressed') !== String(on)) sliceBtn.setAttribute('aria-pressed', String(on));
    sliceOff.disabled = !on;
    if (!on && floorOn) floorOn = null; // сечение снято любым путём (в т. ч. «Убрать сечение» в «Инструментах»)
    floorSync(); // V12.4b: и при замене сечения срезом P9
    axisText();
  }
  function setSlice(axis) {
    const a = $('sliceAxis'), v = $('sliceValue');
    if (!a) return;
    if (axis !== 'none' && a.value === 'none' && v && +v.value >= 100) v.value = '50';
    a.value = axis;
    a.dispatchEvent(new Event('change', { bubbles: true }));
    if (axis === 'none') { const f = $('r23SliceFlip'); if (f) f.checked = false; floorOn = null; floorSync(); if (FS().sectionApi && (window.__ATLAS.sectionState() || {}).section) window.__ATLAS.setSection(null); }
    window.__R24?.request?.();
    window.AtlasViewSettings?.sync?.();
    sliceSync();
  }
  function openPop(pop, btn, yes) {
    pop.hidden = !yes;
    btn.setAttribute('aria-expanded', String(yes));
  }
  sliceBtn.addEventListener('click', () => {
    const open = slicePop.hidden;
    buildSlice();
    closePops(slicePop);
    openPop(slicePop, sliceBtn, open);   // 1.0.19a A-03: открытие окна модель не режет (было: сразу Z по середине)
    if (open) (floorBox.querySelector('[aria-pressed="true"]') || floorBox.querySelector('button') || otherBox.querySelector('summary') || slicePop).focus?.();
  });
  sliceOff.addEventListener('click', () => { setSlice('none'); openPop(slicePop, sliceBtn, false); sliceBtn.focus(); });
  slicePop.addEventListener('change', sliceSync);
  document.addEventListener('atlas:section', sliceSync); // E13: сечение снято/поставлено через API (в т. ч. при смене раздела)

  /* ---------- «Ракурс ▾» ---------- */
  function camOpen(yes, focusFirst) {
    buildCam();
    closePops(camMenu);
    openPop(camMenu, camBtn, yes);
    if (yes) { viewNow(); const cur = camMenu.querySelector('[aria-checked="true"]') || camMenu.firstElementChild; if (focusFirst) cur.focus(); }
  }
  camBtn.addEventListener('click', () => camOpen(camMenu.hidden, true));
  camBtn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); camOpen(true, true); } });
  camMenu.addEventListener('keydown', e => {
    const items = [...camMenu.querySelectorAll('[data-cam]')], i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); items[e.key === 'Home' ? 0 : items.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); camOpen(false); camBtn.focus(); }
    else if (e.key === 'Tab') camOpen(false);
  });
  camMenu.addEventListener('click', e => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    const v = b.dataset.cam;
    const btn = document.querySelector('[data-view="' + v + '"]');
    if (btn) btn.click();
    else if (window.__R24 && window.__R24.camera) {
      window.__R24.camera(v);
      document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', 'false'));
    }
    camOpen(false);
    camBtn.focus();
    viewSoon();
  });

  /* ---------- «Ссылка на вид» ---------- */
  linkBtn.addEventListener('click', () => {
    if (window.AtlasViewLink && window.AtlasViewLink.copy) window.AtlasViewLink.copy();
    else window.AtlasViewSettings?.toast?.('Ссылка на вид пока недоступна');
  });

  /* ---------- закрытие всплывающих ---------- */
  function closePops(except) {
    if (except !== slicePop && !slicePop.hidden) openPop(slicePop, sliceBtn, false);
    if (except !== camMenu && !camMenu.hidden) openPop(camMenu, camBtn, false);
  }
  document.addEventListener('pointerdown', e => {
    if (!slicePop.hidden && !slicePop.contains(e.target) && !sliceBtn.contains(e.target)) openPop(slicePop, sliceBtn, false);
    if (!camMenu.hidden && !camWrap.contains(e.target)) openPop(camMenu, camBtn, false);
  }, true);
  slicePop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); openPop(slicePop, sliceBtn, false); sliceBtn.focus(); } });

  /* ---------- строка вида: «Изометрия · 63° / 25°» ---------- */
  const PRESETS = [['Изометрия', 1.1, 0.43, 'iso'], ['Сверху', -Math.PI / 2, Math.PI / 2, 'plan'], ['Спереди', Math.PI / 2, 0, 'front'], ['Сбоку', 0, 0, 'side'],
    ['Сзади', -Math.PI / 2, 0, 'back'], ['Слева', Math.PI, 0, 'left'], ['Снизу', -Math.PI / 2, -Math.PI / 2, 'bottom']];
  const norm = a => { const t = 2 * Math.PI; return ((a % t) + t) % t; };
  const deg = r => Math.round(r * 180 / Math.PI);
  let lastCam = null, camEv = null;
  const FT = () => (window.__ATLAS && window.__ATLAS.features) || {};
  // V12.2 · E12: камера — из события atlas:camera {az, el, …} (приходит только при изменении); без features.cameraEvent — опрос capture()
  document.addEventListener('atlas:camera', e => { camEv = e.detail || null; viewSoon(); }); // §3: при вращении — каждый кадр; строка вида — не чаще 5 раз в секунду
  function readCam() {
    if (FT().cameraEvent && camEv && Number.isFinite(camEv.az) && Number.isFinite(camEv.el)) return camEv;
    try { const c = window.__R24 && window.__R24.capture && window.__R24.capture().camera; return c && Number.isFinite(c.az) && Number.isFinite(c.el) ? c : null; } catch (e) { return null; }
  }
  function viewText() {
    const c = readCam();
    if (!c) return null;
    // «Сверху» и «Снизу»: азимут при наклоне ±90° не важен.
    const p = PRESETS.find(([, az, el]) => Math.abs(c.el - el) < 0.01 && (Math.abs(Math.abs(el) - Math.PI / 2) < 0.01 || Math.abs(norm(c.az) - norm(az)) < 0.01 || Math.abs(norm(c.az) - norm(az)) > 2 * Math.PI - 0.01));
    return { name: p ? p[0] : 'Свой ракурс', key: p ? p[3] : null, az: deg(norm(c.az)) % 360, el: deg(c.el) };
  }
  function viewNow() {
    const t = viewText();
    if (!t) return;
    const key = t.name + t.az + '/' + t.el;
    for (const b of camMenu.querySelectorAll('[data-cam]')) b.setAttribute('aria-checked', String(b.dataset.cam === t.key));
    if (key === lastCam) return;
    lastCam = key;
    const ic = tspan('', 'atb-view-ic'); ic.append(iconNode('axes', 'icon--16'));
    const tx = tspan(t.name + ' · ', 'atb-view-t'), b1 = document.createElement('b'), b2 = document.createElement('b');
    b1.textContent = t.az + '°'; b2.textContent = t.el + '°'; tx.append(b1, ' / ', b2);
    viewLine.replaceChildren(ic, tx);
    viewLine.setAttribute('aria-label', 'Вид: ' + t.name.toLowerCase() + ', азимут ' + t.az + '°, наклон ' + t.el + '°');
    viewLine.hidden = false;
  }
  // Не чаще 5 раз в секунду: capture() не опрашивает сцену, но и его не нужно звать на каждый кадр.
  let viewTimer = 0, viewLast = 0;
  function viewSoon() {
    if (viewTimer) return;
    const wait = Math.max(0, 200 - (performance.now() - viewLast));
    viewTimer = setTimeout(() => { viewTimer = 0; viewLast = performance.now(); viewNow(); sliceSync(); }, wait);
  }
  const canvas = $('canvas');
  if (canvas) {
    canvas.addEventListener('pointermove', e => { if (e.buttons && !FT().cameraEvent) viewSoon(); }, { passive: true });
    for (const t of ['pointerup', 'wheel', 'keyup', 'touchend']) canvas.addEventListener(t, () => { if (!FT().cameraEvent) viewSoon(); }, { passive: true });
  }
  document.addEventListener('click', e => { if (e.target.closest('button')) viewSoon(); }, true);
  for (const ev of ['atlas:selection', 'atlas:selectionchange', 'atlas:deselect', 'atlas:viewlink', 'hashchange']) document.addEventListener(ev, viewSoon); // E8: selectionchange; atlas:deselect — до V12.3
  addEventListener('hashchange', viewSoon);

  /* К1-B3 (ревью D, нейтральность): тел на модели нет (__ATLAS.emptyWorld() или пустой __FULL_ATLAS.allWorld()) — «Сечение» и «Подписи» выключены
     (aria-disabled + перехват щелчка до обработчиков), подсказка «Нет тел на модели». Тела есть — ничего не меняется. */
  const NO_BODIES = 'Нет элементов на модели';   // 1.0.19a A-11
  const noBodies = () => { try { const A = window.__ATLAS; if (A && typeof A.emptyWorld === 'function' && A.emptyWorld()) return true; const F = window.__FULL_ATLAS; return !!(F && typeof F.allWorld === 'function' && !(F.allWorld() || []).length); } catch (e) { return false; } };
  let gated = false;
  function bodyGate() {
    if (gated || !noBodies()) return;
    gated = true;
    for (const b of [sliceBtn, $('quickLabels')]) {
      if (!b) continue;
      b.setAttribute('aria-disabled', 'true'); b.title = NO_BODIES; b.dataset.atbNoBodies = '1';
      b.addEventListener('click', e => { e.preventDefault(); e.stopImmediatePropagation(); }, true);
      new MutationObserver(() => { if (b.title !== NO_BODIES) b.title = NO_BODIES; if (b.getAttribute('aria-disabled') !== 'true') b.setAttribute('aria-disabled', 'true'); }).observe(b, { attributes: true, attributeFilter: ['title', 'aria-disabled'] });
    }
  }
  API.noBodies = () => gated;
  /* ---------- запуск ---------- */
  dressAll();
  layout();
  sliceSync();
  // #quickMeasure вставляет atlas-measure.js на atlas:ready (setTimeout 0) после #quickLabels — то есть в группу g1:
  // как только он появится, оформить и переложить в «Сечение, Линейка».
  new MutationObserver(() => { const m = $('quickMeasure'); if (m && m.parentElement === g1) { dress(m, 'ruler', 'Линейка', 'Линейка'); layout(); } }).observe(g1, { childList: true });
  document.addEventListener('atlas:ready', () => requestAnimationFrame(() => {
    dressAll(); layout();
    API.ready = true; viewNow(); sliceSync(); bodyGate();
    document.dispatchEvent(new Event('atlas:toolbar'));
  }));
})();
