/* atlas-field.js — полевой комплект, интерфейс «Что на ПК» (ядро 1.1, исполнитель A, 20.11.2026).
   Данные: window.ATLAS_FIELD, формат ATLAS_FIELD v1 (контракт Codex, ПЕРЕДАЧА_01/CONTRACT.md).
   Модуль нейтральный: без имён объекта; читает только ATLAS_FIELD, ATLAS_PROJECT (не обязательно) и __ATLAS.
   Навигация: window.ATLAS_FIELD_LOCATE(stationM) и window.ATLAS_FIELD_MEASURE_INVERT(stationM), если их даёт объект;
   иначе — запасной путь __ATLAS.fitIds/highlight по ID тел (если они есть в карточке).
   Печать и офлайн — необязательные window.AtlasFieldPrint / window.AtlasFieldOffline: нет модуля — нет кнопки.
   Ссылка: ?field=1 — открыть панель; &pk=21.5 — карточка пикета; &xing=<id> — карточка пересечения.
   Ничего не отправляет наружу, без fetch/XHR, работает из file://. Стили — внутри, классы af-*, тема всегда светлая. */
(() => {
  'use strict';
  if (window.AtlasField) return;

  /* ---------- подписи ---------- */
  const LABELS = {
    terrainM: 'Земля', invertM: 'Лоток', crownM: 'Верх трубы', depthToCrownM: 'Глубина до верха трубы',
    depthCrownM: 'Глубина до верха трубы', depthToInvertM: 'Глубина до лотка', localGroundwaterM: 'Уровень грунтовых вод',
    constructionMethod: 'Способ прокладки', nextConstructionMethod: 'Способ далее по трассе',
    chamberInnerDiameterMm: 'Камера, Ø в свету', neckInnerDiameterMm: 'Горловина, Ø в свету',
    fullStructuralDepthMm: 'Полная глубина конструкции', workingPartHeightMm: 'Высота рабочей части',
    profileWellDepthMm: 'Глубина колодца по профилю', neckAndCoverHeightMm: 'Горловина с люком, высота',
    bottomSlabType: 'Плита днища', bottomSlabCount: 'Плит днища', ringKS159Count: 'Колец КС-15-9',
    ringKS159aCount: 'Колец КС-15-9а', ringKS156Count: 'Колец КС-15-6', coverSlabType: 'Плита перекрытия',
    coverSlabCount: 'Плит перекрытия', neckRingType: 'Опорное кольцо', neckRingCount: 'Опорных колец',
    manholeCover: 'Люк', ladderType: 'Лестница', assemblyGroups: 'Порядок сборки',
    sandBeddingMm: 'Песчаная подготовка', sandBeddingCondition: 'Условие подготовки',
    soilDesignCondition: 'Грунтовые условия', absoluteWellBottomM: 'Отметка дна колодца',
    absoluteRimM: 'Отметка люка', tieInDiameterPlanMm: 'Ø врезки по плану', tieInDiameterSpecMm: 'Ø врезки по спецификации',
    tieInDiameterApprovedMm: 'Ø врезки принятый', outletDiameterMm: 'Ø выпуска', glandsDiameterMm: 'Сальники, Ø',
    glandsCount: 'Сальников', hydroProtection: 'Гидроизоляция',
    planLengthM: 'Длина по плану', profileLengthM: 'Длина по профилю', planWidthM: 'Ширина по плану',
    profileWidthM: 'Ширина по профилю', excavationDepthM: 'Глубина выемки', excavationVolumePdM3: 'Объём выемки по ПД',
    contourConflict: 'Расхождение контура', absolutePitBottomM: 'Отметка дна котлована',
    nominalPitBottomM: 'Дно котлована (расчётное)', nominalPrismVolumeM3: 'Объём призмы (расчётный)',
    volumeConflict: 'Расхождение объёма', shoringMethod: 'Крепление', shoringPileDiameterMm: 'Стойки крепления, Ø',
    shoringPileWallMm: 'Стойки, толщина стенки', shoringPilePitchM: 'Шаг стоек', shoringPileEmbedM: 'Заглубление стоек',
    backfill: 'Обратная засыпка', lengthM: 'Длина', widthAtBottomM: 'Ширина по дну', widthAtTopM: 'Ширина поверху',
    sandFoundationM: 'Песчаное основание', bendAngle: 'Угол поворота', pipeOuterDiameterMm: 'Труба, наружный Ø',
    pipeWallMm: 'Труба, стенка', casingOuterDiameterMm: 'Футляр, наружный Ø', casingWallMm: 'Футляр, стенка',
    casingM: 'Футляр', casing: 'Футляр', shoring: 'Крепление',
    lengthHddFromKv1PlanM: 'Длина ГНБ по плану', lengthHddFromKv1BoreM: 'Длина ГНБ по скважине',
    existingNetworkMark: 'Обозначение сети', printedElevationUpperM: 'Отметка на профиле (верхняя)',
    printedElevationLowerM: 'Отметка на профиле (нижняя)', positionMethod: 'Как получен пикет',
    elevationMeaning: 'Смысл отметок', owner: 'Владелец', dispatcherContact: 'Контакт диспетчера', contact: 'Контакт',
    posRule: 'Правило ПОС', qualityLevel: 'Качество сведений', quality: 'Качество сведений', qualityMethod: 'Метод',
    bufferM: 'Охранная зона', outerDiameterM: 'Наружный размер', topM: 'Верх сети',
  };
  /* Поля, которые в списке ПК и вверху карточки показываются первыми (остальные — по порядку данных). */
  const PRIMARY = ['terrainM', 'invertM', 'crownM', 'depthToCrownM', 'depthCrownM', 'depthToInvertM',
    'constructionMethod', 'nextConstructionMethod', 'localGroundwaterM'];
  const ORIGIN = {
    document: ['лист', 'doc'], survey: ['съёмка', 'survey'], exposure: ['шурф', 'survey'], graphic: ['графически', 'calc'],
    interpolation: ['интерп.', 'calc'], model_calculation: ['расчёт', 'calc'], unavailable: ['нет данных', 'none'],
  };
  const UNITS = { m: 'м', mm: 'мм', m2: 'м²', m3: 'м³', count: 'шт.', text: '', bool: '' };
  const NODE_KIND = { water_well: 'Колодец', well: 'Колодец', excavation: 'Котлован', pit: 'Котлован', trench: 'Траншея',
    bend: 'Угол поворота', valve: 'Арматура', support: 'Упор' };
  const METRIC = { vertical: 'по вертикали', horizontal: 'по горизонтали', minimum_3d: 'наименьшее в пространстве' };
  const STATE_RANK = { violation: 3, unchecked: 2, ok: 1 };

  /* ---------- данные ---------- */
  let D = null, sources = new Map(), stations = [], nodes = new Map(), crossings = new Map(), intervals = [];

  function prepare(data) {
    D = data;
    sources = new Map((D.sources || []).map(s => [s.id, s]));
    stations = (D.stations || []).filter(s => s && Number.isFinite(+s.stationM)).slice().sort((a, b) => a.stationM - b.stationM);
    nodes = new Map((D.nodes || []).map(n => [n.id, n]));
    crossings = new Map((D.crossings || []).map(x => [x.id, x]));
    const route = D.route || {};
    if (Array.isArray(D.intervals) && D.intervals.length) {
      intervals = D.intervals.map(i => ({ ...i, startM: +i.startM, endM: +i.endM }));
    } else {
      const s0 = Number.isFinite(+route.startM) ? +route.startM : (stations[0] ? stations[0].stationM : 0);
      const s1 = Number.isFinite(+route.endM) ? +route.endM : (stations.length ? stations[stations.length - 1].stationM : 0);
      intervals = [{ id: route.id || 'route', startM: s0, endM: s1, title: fmtPk(s0) + '–' + fmtPk(s1), refs: [], fromRoute: true }];
    }
  }

  /* ---------- форматирование ---------- */
  const nf = (min, max) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: false });
  const NF2 = nf(2, 2);
  const NF = { m: nf(2, 3), mm: nf(0, 1), m2: nf(0, 2), m3: nf(0, 2), count: nf(0, 0), any: nf(0, 3) };

  function fmtPk(m) {
    if (!Number.isFinite(+m)) return 'ПК?';
    const v = Math.round(+m * 100) / 100, h = Math.floor(v / 100), r = Math.round((v - h * 100) * 100) / 100;
    const [ri, rf] = String(r).split('.');
    return 'ПК' + h + '+' + ri.padStart(2, '0') + (rf ? ',' + rf : '');
  }
  function fmtValue(f) {
    if (!f || f.value === null || f.value === undefined) return null;
    const u = f.unit;
    if (u === 'bool') return f.value ? 'да' : 'нет';
    if (typeof f.value === 'number') {
      const s = (NF[u] || NF.any).format(f.value);
      return UNITS[u] ? s + ' ' + UNITS[u] : s;
    }
    return nb(String(f.value));
  }
  /* Марки и обозначения сетей не разрываются при переносе: «В ст 200», «Т (С250)-1-60», «КС-15-9 × 2».
     Короткие кавычки — целиком; «× N» — с маркой; короткое слово (≤ 3 букв) — со следующим, если дальше число или скобка. */
  function nb(text) {
    let t = String(text);
    t = t.replace(/«([^«»]{1,24})»/g, (m, x) => '«' + x.replace(/ /g, '\u00a0') + '»');
    t = t.replace(/ +× *(\d+)/g, '\u00a0×\u00a0$1');
    t = t.replace(/(^|[\s(«])([A-Za-zА-ЯЁа-яё]{1,3}) (?=[(\d]|[A-Za-zА-ЯЁа-яё]{1,3} \d)/g, (m, a, w) => a + w + '\u00a0');
    t = t.replace(/(^|[\s(«])([A-Za-zА-ЯЁа-яё]{1,3}) (?=[(\d]|[A-Za-zА-ЯЁа-яё]{1,3} \d)/g, (m, a, w) => a + w + '\u00a0');
    return t;
  }
  /* Редакция — строка выпуска атласа (ATLAS_RELEASE.release_label, её же показывает шапка), иначе из конфига объекта. */
  function editionLabel() {
    const R = window.ATLAS_RELEASE || {}, P = window.ATLAS_PROJECT || {};
    const v = R.release_label || R.edition || P.edition || P.release || (P.title && P.title.edition) || '';
    return v ? 'Редакция ' + String(v).replace(/^редакция\s*/i, '') : '';
  }
  /* Код сети по-русски: латинские буквы-двойники → кириллица в верхнем регистре (b1 → В1). */
  const LAT2CYR = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
  const netLabel = id => String(id).toUpperCase().replace(/[A-Z]/g, ch => LAT2CYR[ch] || ch);
  const fieldLabel = (key, f) => LABELS[key] || (f && f.label) || key;
  const isField = f => f && typeof f === 'object' && 'origin' in f && 'value' in f;
  function sourceShort(src) {
    if (!src) return '';
    if (src.short) return src.short;
    const head = String(src.title || src.id).split(' · ')[0];
    const m = head.match(/-([А-ЯA-Z]{2,6})$/);
    return m ? m[1] : head;
  }
  function refLink(r) {
    const src = sources.get(r.sourceId);
    const short = sourceShort(src) || r.sourceId;
    const where = r.pdfPage != null ? 'с. ' + r.pdfPage : (r.locator != null ? String(r.locator) : '');
    const text = short + (where ? ', ' + where : '');
    const title = [src && src.title, r.sheet, src && src.revision].filter(Boolean).join(' · ');
    if (src && src.path && (src.kind || 'pdf') !== 'record') {
      const href = src.path + (r.pdfPage != null ? '#page=' + r.pdfPage : '');
      return h('a', { class: 'af-ref', href, target: '_blank', rel: 'noopener', title }, text);
    }
    return h('span', { class: 'af-ref af-ref--plain', title }, text);
  }
  function refList(refs, max) {
    const seen = new Set(), out = [];
    for (const r of refs || []) {
      const k = r.sourceId + '|' + (r.pdfPage ?? r.locator);
      if (seen.has(k)) continue; seen.add(k); out.push(r);
    }
    const shown = max ? out.slice(0, max) : out;
    return h('span', { class: 'af-refs' }, shown.map(refLink), out.length > shown.length ? h('span', { class: 'af-more' }, '+' + (out.length - shown.length)) : null);
  }
  function originBadge(f) {
    const o = ORIGIN[f && f.origin] || [String((f && f.origin) || 'источник не указан'), 'none'];
    return h('span', { class: 'af-src af-src--' + o[1], title: 'Происхождение значения: ' + o[0] }, o[0]);
  }

  /* ---------- DOM ---------- */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const btn = (label, onclick, cls, extra) => h('button', { type: 'button', class: 'af-btn ' + (cls || ''), onclick, ...(extra || {}) }, label);
  const linkBtn = (label, href, cls, extra) => h('a', { class: 'af-btn ' + (cls || ''), href, ...(extra || {}) }, label);

  function fieldRow(key, f, opts) {
    const val = fmtValue(f);
    const long = val != null && (f.unit === 'text' || val.length > 24);
    const row = h('div', { class: 'af-f' + (val == null ? ' af-f--none' : '') + (long ? ' af-f--long' : '') + (opts && opts.big ? ' af-f--big' : ''), 'data-key': key },
      h('div', { class: 'af-f-l' }, fieldLabel(key, f)),
      h('div', { class: 'af-f-v' }, val == null ? 'нет данных' : val),
      h('div', { class: 'af-f-s' }, originBadge(f), refList(f.refs, 3)));
    if (val == null && f.missingReason) row.append(h('div', { class: 'af-f-why' }, f.missingReason));
    if (f.verticalDatum) row.append(h('div', { class: 'af-f-why' }, 'Система высот: ' + f.verticalDatum));
    return row;
  }
  function fieldsBlock(fields, opts) {
    const keys = Object.keys(fields || {}).filter(k => isField(fields[k]));
    const order = opts && opts.primaryFirst ? [...PRIMARY.filter(k => keys.includes(k)), ...keys.filter(k => !PRIMARY.includes(k))] : keys;
    return h('div', { class: 'af-fields' }, order.map(k => fieldRow(k, fields[k], { big: opts && opts.primaryFirst && PRIMARY.includes(k) })));
  }

  /* ---------- пересечения: статусы ---------- */
  const hasPage = o => !!(o && Array.isArray(o.refs) && o.refs.some(r => r && r.pdfPage != null && r.pdfPage !== ''));
  function crossingState(x) {
    const c = (x && x.clearance) || {};
    const missing = Array.isArray(c.missing) ? c.missing.slice() : [];
    let state = 'unchecked', downgraded = false;
    if (c.status === 'does_not_comply') state = 'violation';
    else if (c.status === 'complies') {
      const okD = c.distance && c.distance.value != null && hasPage(c.distance);
      const okT = c.threshold && c.threshold.value != null && hasPage(c.threshold);
      if (okD && okT) state = 'ok';
      else {
        downgraded = true;
        if (!okD) missing.push('У расстояния нет ссылки на страницу документа — «норма» не подтверждена.');
        if (!okT) missing.push('У порога нет ссылки на страницу документа — «норма» не подтверждена.');
      }
    }
    return { state, missing, downgraded, c };
  }
  const STATE_TEXT = { violation: 'Зазор меньше нормы', ok: 'Зазор в норме', unchecked: 'Недостаточно данных для проверки зазора' };
  function stateChip(state) {
    return h('span', { class: 'af-chip af-chip--' + state }, state === 'violation' ? 'зазор меньше нормы' : state === 'ok' ? 'зазор в норме' : 'нужны данные');
  }

  /* ---------- состояние ---------- */
  const S = { open: false, view: 'list', intervalId: null, query: '', stationId: null, crossingId: null, from: null, min: false, measure: {} };
  let root, body, head, fab, titleEl, backBtn, toggle3d, openBtn, note, ivBar;
  const phone = () => window.matchMedia('(max-width: 600px)').matches;

  function intervalOf(st) {
    const cur = intervals.find(i => i.id === S.intervalId);
    if (cur && st.stationM >= cur.startM && st.stationM <= cur.endM) return cur;
    return intervals.find(i => st.stationM >= i.startM && st.stationM <= i.endM) || intervals[0];
  }
  const stationsIn = iv => stations.filter(s => s.stationM >= iv.startM && s.stationM <= iv.endM);
  function crossingsNear(st) {
    const ids = new Set(st.crossingIds || []);
    const i = stations.indexOf(st), lo = i > 0 ? stations[i - 1].stationM : -Infinity, hi = i < stations.length - 1 ? stations[i + 1].stationM : Infinity;
    for (const x of crossings.values()) if (Number.isFinite(+x.stationM) && x.stationM > lo && x.stationM < hi) ids.add(x.id);
    return [...ids].map(id => crossings.get(id) || { id, missingCard: true });
  }
  function worstState(st) {
    let w = null;
    for (const x of crossingsNear(st)) {
      if (x.missingCard) continue;
      const s = crossingState(x).state;
      if (!w || STATE_RANK[s] > STATE_RANK[w]) w = s;
    }
    return w;
  }
  function stationByPk(v) {
    if (!Number.isFinite(v)) return null;
    return stations.find(s => Math.abs(s.stationM - v) < 0.005) || null;
  }

  /* поиск: «21», «0+21», «ПК0+21,5», а также текст подписи («КВ-1») */
  function search(q) {
    const raw = String(q || '').trim();
    if (!raw) return null;
    const t = raw.toLowerCase().replace(/^(пк|pk)\s*/, '').replace(/,/g, '.').replace(/\s+/g, '');
    let m = t.match(/^(\d+)\+(\d*(?:\.\d*)?)$/);
    if (m) {
      const hund = +m[1], rest = m[2];
      return stations.filter(s => {
        if (Math.floor(s.stationM / 100 + 1e-9) !== hund) return false;
        if (!rest) return true;
        const r = Math.round((s.stationM - hund * 100) * 1000) / 1000;
        return String(r).startsWith(rest.replace(/^0+(?=\d)/, '')) || (!rest.includes('.') && Math.floor(r) === +rest);
      });
    }
    if (/^\d+(?:\.\d*)?$/.test(t)) {
      return stations.filter(s => {
        const r = Math.round((s.stationM % 100) * 1000) / 1000;
        return String(r).startsWith(t) || String(s.stationM).startsWith(t) || Math.floor(s.stationM / 100) === +t && !t.includes('.') && t.length <= 2 && +t > 0;
      });
    }
    const low = raw.toLowerCase();
    return stations.filter(s => String(s.title || '').toLowerCase().includes(low));
  }

  /* ---------- адрес ---------- */
  function syncUrl() {
    try {
      const u = new URL(location.href), q = u.searchParams;
      ['field', 'pk', 'xing', 'iv'].forEach(k => q.delete(k));
      if (S.open) {
        q.set('field', '1');
        if (intervals.length > 1 && S.intervalId) q.set('iv', S.intervalId);
        const st = stations.find(s => s.id === S.stationId);
        if (S.view === 'station' && st) q.set('pk', String(st.stationM));
        if (S.view === 'crossing' && S.crossingId) q.set('xing', S.crossingId);
      }
      history.replaceState(history.state, '', u.pathname + (q.toString() ? '?' + q : '') + u.hash);
    } catch (e) { /* file:// в некоторых браузерах */ }
  }

  /* ---------- 3D ---------- */
  function insets() {
    const cv = document.getElementById('canvas');
    if (!cv || phone() || !root || root.hidden) return null;
    const c = cv.getBoundingClientRect(), p = root.getBoundingClientRect();
    return { top: 70, left: 16, bottom: 80, right: Math.max(16, Math.ceil(c.right - p.left) + 16) };
  }
  async function waitFor(fn, ms) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 150)); }
    return fn();
  }
  async function atlasReady() {
    const A = window.__ATLAS;
    if (!A) return null;
    try { await A.whenReady(); } catch (e) { /* */ }
    return A;
  }
  /* «3D здесь»: адаптер объекта по пикету; иначе — ID тел карточки через __ATLAS. */
  async function show3d(stationM, ids, label) {
    say('');
    const A = await atlasReady();
    if (!A) return say('Модель недоступна на этой странице.');
    if (phone()) minimize(true);
    const locate = Number.isFinite(+stationM) ? await waitFor(() => typeof window.ATLAS_FIELD_LOCATE === 'function' && window.ATLAS_FIELD_LOCATE, 3000) : null;
    const list = [...new Set(ids || [])].filter(id => typeof A.has !== 'function' || A.has(id));
    if (list.length) { try { A.highlight(list); S.hl = list; } catch (e) { /* */ } }
    if (locate) {
      let ok = false;
      try { ok = !!locate(+stationM); } catch (e) { ok = false; }
      if (ok) return say('Камера на ' + label + '.');
    }
    if (!list.length) { if (phone()) minimize(false); return say('Для ' + label + ' нет привязки к модели: адаптер пикетов не принял точку, ID тел в данных нет.'); }
    const st = await A.fitIds(list, insets() ? { insets: insets(), pad: 1.2 } : undefined);
    if (st === 'cancelled') { if (phone()) minimize(false); say('Тела ' + label + ' скрыты в текущем виде модели. Откройте «Всё здание».'); }
    else say('Камера на ' + label + '.');
  }
  async function measureInvert(st) {
    const fn = window.ATLAS_FIELD_MEASURE_INVERT;
    if (typeof fn !== 'function') return;
    if (phone()) minimize(true);
    let r = null;
    try { r = fn(+st.stationM); } catch (e) { r = null; }
    S.measure[st.id] = r || { failed: true };
    render();   /* на телефоне панель свёрнута — результат будет в карточке, когда её откроют */
  }

  /* ---------- подземный вид (необязательный адаптер объекта) ----------
     window.ATLAS_UNDERGROUND_VIEW(on, {fromM, toM}) → Promise<boolean active>; ошибка — отклонённый Promise.
     ATLAS_UNDERGROUND_VIEW.state() → {active, fromM, toM} (синхронно) и событие document 'golunderground:state' — состояние
     кнопки берётся оттуда, поэтому выключение вида кнопкой объекта сразу снимает «включено» и здесь.
     Нет функции — нет кнопки. Участок вне границ state() — нет кнопки. Нет state() — кнопка есть, после первого отказа
     для этого участка скрывается. */
  const ugApi = () => typeof window.ATLAS_UNDERGROUND_VIEW === 'function' ? window.ATLAS_UNDERGROUND_VIEW : null;
  S.ug = { active: false, busy: false, msg: '', note: {}, off: {} };
  function ugState() {
    const fn = ugApi();
    if (!fn || typeof fn.state !== 'function') return null;
    try { const st = fn.state(); return st && typeof st === 'object' ? st : null; } catch (e) { return null; }
  }
  const ugActive = () => { const st = ugState(); return st ? !!st.active : S.ug.active; };
  function ugFits(iv) {
    if (S.ug.off[iv.id]) return false;
    const st = ugState();
    if (!st || !Number.isFinite(+st.fromM) || !Number.isFinite(+st.toM)) return true;
    return iv.startM >= +st.fromM - 1e-6 && iv.endM <= +st.toM + 1e-6;
  }
  for (const ev of ['golunderground:state', 'atlas:underground']) document.addEventListener(ev, () => paintUg());
  function paintUg() {
    for (const b of document.querySelectorAll('.af-root .af-ug')) {
      const on = ugActive();
      b.setAttribute('aria-pressed', String(on));
      b.disabled = S.ug.busy;
      b.setAttribute('aria-busy', String(S.ug.busy));
      b.textContent = S.ug.busy ? (on ? 'Выключаю…' : 'Включаю…') : on ? 'Подземный вид включён' : 'Подземный вид';
      b.title = on ? 'Нажмите, чтобы вернуть общий вид' : 'Показать трубы и сети под землёй на этом участке';
    }
    for (const m of document.querySelectorAll('.af-root .af-ug-msg')) {
      const iv = m.dataset.iv, t = S.ug.msg || (iv && S.ug.note[iv]) || '';
      m.textContent = t; m.hidden = !t;
      m.classList.toggle('af-ug-msg--note', !S.ug.msg && !!t);
    }
  }
  function ugButton(iv) {
    if (!ugApi() || !ugFits(iv)) return null;
    const b = btn('Подземный вид', () => toggleUg(iv, b), 'af-btn--ghost af-ug', { 'aria-pressed': String(ugActive()), 'data-iv': iv.id });
    queueMicrotask(paintUg);
    return b;
  }
  const ugMsg = iv => h('div', { class: 'af-ug-msg', role: 'status', 'aria-live': 'polite', hidden: true, 'data-iv': iv.id });
  async function toggleUg(iv) {
    const fn = ugApi();
    if (!fn || S.ug.busy) return;
    const on = !ugActive();
    S.ug.busy = true; S.ug.msg = ''; paintUg();
    if (on && phone()) minimize(true);
    let failed = false;
    try {
      const r = await (on ? fn(true, { fromM: iv.startM, toM: iv.endM }) : fn(false));
      S.ug.active = !!r;
      if (on && !r) failed = true;
    } catch (e) {
      failed = true;
      /* крайний случай — не выключилось: кнопка нужна, показываем причину */
      if (!on) S.ug.msg = (e && e.message) ? String(e.message) : 'Не удалось вернуть общий вид.';
    } finally {
      S.ug.busy = false;
      if (failed && on) {
        /* не включилось для этого участка — кнопку больше не показываем, коротко поясняем */
        S.ug.off[iv.id] = true;
        S.ug.note[iv.id] = 'Подземный вид для участка ' + fmtPk(iv.startM) + '–' + fmtPk(iv.endM) + ' недоступен.';
        if (phone()) minimize(false);
        if (S.open && !S.min && S.view !== 'crossing') { S.ug.busy = false; const top = body.scrollTop; render(); body.scrollTop = top; }
      }
      paintUg(); updateFab();
    }
  }
  /* Адаптеры объекта (замер лотка, подземный вид) появляются после готовности модели — перерисовать карточку, когда появятся. */
  function waitAdapters() {
    if (!window.__ATLAS || S.waitingAdapters) return;
    const missing = () => [typeof window.ATLAS_FIELD_MEASURE_INVERT, typeof window.ATLAS_UNDERGROUND_VIEW].filter(t => t !== 'function').length;
    if (!missing()) return;
    S.waitingAdapters = true;
    const before = missing();
    waitFor(() => missing() < before, 15000).then(ok => { S.waitingAdapters = false; if (ok && S.open && !S.min && S.view !== 'crossing') render(); });
  }

  /* ---------- внешние модули ---------- */
  const printApi = () => (window.AtlasFieldPrint && typeof window.AtlasFieldPrint.sheet === 'function') ? window.AtlasFieldPrint : null;
  const offApi = () => (window.AtlasFieldOffline && typeof window.AtlasFieldOffline.save === 'function') ? window.AtlasFieldOffline : null;
  function callSafe(fn, okText) {
    try { const r = fn(); if (r && typeof r.then === 'function') r.then(() => { if (okText) say(okText); render(); }, () => say('Не удалось выполнить действие.')); else if (okText) say(okText); }
    catch (e) { say('Не удалось выполнить действие: ' + (e && e.message || e)); }
  }
  /* Офлайн: три состояния — процесс («сохраняю…»), отказ (ok:false → note), готовность только по check(id). */
  const offText = t => /пакет открыт с устройства/i.test(String(t || '')) ? 'Атлас открыт из файла на этом устройстве — интернет не нужен.' : String(t || '');
  const fmtDate = v => { try { const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(v); } };
  function savedRecord(api, id) {
    try { const st = api.status && api.status(); const it = st && Array.isArray(st.intervals) ? st.intervals.find(r => r && String(r.id) === String(id)) : null; return { st, it }; }
    catch (e) { return { st: null, it: null }; }
  }
  const OFF_LABEL = 'Сохранить для работы без интернета';
  /* Подпись недостающего файла: PDF — названием листа из sources, остальное — именем файла. */
  function fileLabel(href) {
    let path = String(href);
    try { path = decodeURIComponent(new URL(href, document.baseURI).pathname); } catch (e) { /* */ }
    for (const src of sources.values()) {
      if (src.path && path.endsWith(String(src.path).replace(/^\.?\//, ''))) return 'лист ' + (sourceShort(src) || src.id) + (src.title ? ' — ' + String(src.title).split(' · ').slice(1).join(' · ') : '');
    }
    return path.split('/').pop() || path;
  }
  async function verify(api, id, savedAt, failed) {
    if (typeof api.check !== 'function') return { kind: 'warn', text: 'Проверка кэша недоступна — готовность не подтверждена.' };
    let c;
    try { c = await Promise.race([api.check(id), new Promise(r => setTimeout(() => r('timeout'), 15000))]); }
    catch (e) { return { kind: 'fail', text: 'Не удалось проверить сохранённое: ' + (e && e.message || e) }; }
    if (c === 'timeout') return { kind: 'warn', text: 'Проверка сохранённого не ответила за 15 с. Нажмите кнопку, чтобы сохранить участок заново.' };
    if (!c) return { kind: 'warn', text: 'Проверка кэша не дала ответа — готовность не подтверждена.' };
    if (c.mode === 'file') return { kind: 'info', text: c.note || 'Пакет открыт с устройства.' };
    const missList = [...new Set([...(Array.isArray(c.missing) ? c.missing : []), ...(failed || [])])];
    if (Number.isFinite(c.cached) && Array.isArray(c.missing)) {
      const total = Number.isFinite(c.required) ? c.required : c.cached + c.missing.length, when = savedAt ? ' · ' + fmtDate(savedAt) : '';
      const offline = navigator.onLine === false ? ' Обновить можно при подключении.' : '';
      if (!missList.length && total > 0) return { kind: 'ready', text: 'Участок доступен без интернета · ' + plural(c.cached, 'файл', 'файла', 'файлов') + when + '.' + offline };
      const names = [...new Set(missList.map(fileLabel))];
      return { kind: 'warn', text: 'Сохранено не всё: ' + c.cached + ' из ' + total + when + '. Не загружены:',
        list: names.slice(0, 6).concat(names.length > 6 ? ['и ещё ' + (names.length - 6)] : []),
        tail: navigator.onLine === false ? 'Догрузить можно при подключении.' : 'Повторите сохранение при устойчивой сети.' };
    }
    return { kind: c.ok === false ? 'fail' : 'warn', text: c.note || 'Кэш не подтвердил состав участка.' };
  }
  function offlineBox(iv) {
    const api = offApi();
    if (!api) return null;
    S.off = S.off || {};
    const b = btn(OFF_LABEL, null, 'af-btn--ghost af-btn--save');
    const msg = h('div', { class: 'af-off-msg', role: 'status', 'aria-live': 'polite' });
    const paint = () => {
      const o = S.off[iv.id] || { kind: 'idle', text: '' };
      msg.className = 'af-off-msg af-off-msg--' + o.kind;
      msg.replaceChildren(...[h('span', null, offText(o.text)),
        Number.isFinite(o.done) && o.total > 0 ? h('progress', { class: 'af-progress', max: String(o.total), value: String(o.done), 'aria-label': 'Ход сохранения' }) : null,
        o.list && o.list.length ? h('ul', null, o.list.map(x => h('li', null, x))) : null,
        o.tail ? h('span', null, o.tail) : null].filter(Boolean));
      msg.hidden = !o.text;
      const busy = !!(S.offSaving && S.offSaving[iv.id]);
      b.disabled = busy; b.setAttribute('aria-busy', String(busy));
      b.textContent = busy ? 'Сохраняю…' : OFF_LABEL;
    };
    const reveal = () => { try { placement(); if (msg.isConnected && !msg.hidden) msg.scrollIntoView({ block: 'nearest' }); } catch (e) { /* */ } };
    /* Карточка может перерисоваться, пока идёт сохранение или проверка: состояние рисует последняя показанная кнопка участка. */
    S.offPaint = S.offPaint || {};
    S.offPaint[iv.id] = { paint, reveal };
    const set = (o, show) => { S.off[iv.id] = o; const cur = S.offPaint[iv.id]; if (cur) { cur.paint(); if (show) cur.reveal(); } };
    b.addEventListener('click', async () => {
      if (S.offSaving && S.offSaving[iv.id]) return;
      (S.offSaving = S.offSaving || {})[iv.id] = true;
      try { await doSave(); } finally { S.offSaving[iv.id] = false; S.offPaint[iv.id] && S.offPaint[iv.id].paint(); }
    });
    async function doSave() {
      set({ kind: 'busy', text: 'Сохраняю участок…' }, true);
      const onProgress = d => { if (d) set({ kind: 'busy', text: d.note || 'Сохраняю участок…', done: d.done, total: d.total }, true); };
      let r;
      try { r = await api.save(iv.id, { onProgress }); } catch (e) { r = { ok: false, note: 'Ошибка сохранения: ' + (e && e.message || e) }; }
      const rec = savedRecord(api, iv.id).it;
      if (!r || r.ok !== true) {
        /* нет сети, но участок уже сохранён — готовность не теряется */
        if (r && (r.reason === 'offline' || r.mode === 'offline' || navigator.onLine === false) && rec) {
          return set(await verify(api, iv.id, rec.savedAt), true);
        }
        if (r && r.mode === 'cache') return set(await verify(api, iv.id, rec && rec.savedAt, r.failed), true);   // сохранено не всё
        const t = (r && r.note) || 'Участок не сохранён.';
        return set({ kind: 'fail', text: (r && r.note) ? t : t + (r && r.hint ? ' (' + r.hint + ')' : '') }, true);
      }
      set({ kind: 'busy', text: 'Проверяю сохранённое на устройстве…' }, true);
      set(await verify(api, iv.id, r.savedAt || (rec && rec.savedAt) || new Date().toISOString(), r.failed), true);
    }
    if (!S.off[iv.id]) {
      const { st, it } = savedRecord(api, iv.id);
      if (it) { S.off[iv.id] = { kind: 'busy', text: 'Проверяю сохранённое ' + fmtDate(it.savedAt) + '…' }; verify(api, iv.id, it.savedAt).then(set); }
      else if (st) S.off[iv.id] = { kind: st.mode === 'file' ? 'info' : 'idle', text: st.mode === 'file' ? (st.note || '') : st.mode === 'cache' ? 'Участок пока не сохранён для работы без интернета.' : (st.note || '') };
    }
    paint();
    return [b, msg];
  }
  function intervalTools(iv, st) {
    const box = h('div', { class: 'af-actions' });
    const views = (st && Array.isArray(st.views) && st.views.length ? st.views : []).concat(Array.isArray(iv.views) ? iv.views : []);
    const seen = new Set();
    for (const v of views) if (v && v.href && !seen.has(v.href)) { seen.add(v.href); box.append(linkBtn(v.label || 'Вид', v.href, 'af-btn--ghost')); }
    const grid = h('div', { class: 'af-ivtools' });
    const p = printApi();
    if (p) grid.append(btn('Лист A4 на смену', () => callSafe(() => p.sheet(iv.id)), 'af-btn--ghost'));
    const ugB = ugButton(iv);
    if (ugB) grid.append(ugB);
    if (ugB || (!st && S.ug.note[iv.id])) grid.append(ugMsg(iv));
    if (!st) waitAdapters();
    const off = offlineBox(iv);
    if (off) grid.append(...off);
    if (grid.childNodes.length) box.append(grid);
    return box;
  }
  function sheetsBlock(refs) {
    const list = [];
    const seen = new Set();
    for (const r of refs || []) {
      const k = r.sourceId + '|' + (r.pdfPage ?? r.locator);
      if (seen.has(k)) continue; seen.add(k);
      const src = sources.get(r.sourceId);
      const label = 'Лист ПД · ' + (sourceShort(src) || r.sourceId) + (r.pdfPage != null ? ', с. ' + r.pdfPage : r.locator != null ? ', ' + r.locator : '');
      if (src && src.path && (src.kind || 'pdf') !== 'record') {
        list.push(h('a', { class: 'af-sheet', href: src.path + (r.pdfPage != null ? '#page=' + r.pdfPage : ''), target: '_blank', rel: 'noopener', title: src.title || '' },
          h('b', null, label), r.sheet ? h('span', null, r.sheet) : null));
      } else {
        list.push(h('div', { class: 'af-sheet af-sheet--plain' }, h('b', null, label), h('span', null, src ? 'файла нет в атласе' : 'источник «' + r.sourceId + '» не описан')));
      }
    }
    return list.length ? h('div', { class: 'af-sheets' }, list) : null;
  }

  /* ---------- виды ---------- */
  function say(t) { if (note) { note.textContent = t || ''; note.hidden = !t; } }

  function renderList() {
    titleEl.textContent = 'Пикеты';
    backBtn.hidden = true;
    const iv = intervals.find(i => i.id === S.intervalId) || intervals[0];
    S.intervalId = iv.id;
    const out = [];
    const route = D.route || {};
    const warn = [route.xyNote, route.verticalDatumNote].filter(Boolean);
    if (warn.length) out.push(h('div', { class: 'af-warn' }, warn.map(w => h('p', null, w))));
    const tg = marksToggle();
    if (tg) out.push(tg);
    if (intervals.length === 1) {
      out.push(h('div', { class: 'af-iv' }, 'Участок ' + (iv.fromRoute || !iv.title ? fmtPk(iv.startM) + '–' + fmtPk(iv.endM) : iv.title) + ' · ' + plural(stationsIn(iv).length, 'пикет', 'пикета', 'пикетов')));
    }
    const input = h('input', { class: 'af-search', type: 'search', id: 'afSearch', placeholder: 'Найти пикет: 21 или 0+21', autocomplete: 'off', enterkeyhint: 'search', value: S.query, 'aria-label': intervals.length > 1 ? 'Найти пикет по всей трассе' : 'Найти пикет' });
    const listBox = h('div', { class: 'af-list', role: 'list' });
    const count = h('div', { class: 'af-count', 'aria-live': 'polite' });
    const fill = () => {
      const found = search(S.query);
      const items = found || stationsIn(iv);
      count.textContent = found ? (found.length ? (intervals.length > 1 ? 'Найдено по всей трассе: ' : 'Найдено: ') + found.length : 'Пикета с таким номером нет') : '';
      count.hidden = !found;
      const frag = document.createDocumentFragment();
      for (const st of items) frag.append(stationRow(st, found && intervals.length > 1 && !(st.stationM >= iv.startM && st.stationM <= iv.endM) ? intervalHome(st) : null));
      listBox.replaceChildren(frag);
    };
    input.addEventListener('input', () => { S.query = input.value; fill(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const f = search(S.query); if (f && f.length === 1) openStation(f[0]); }
      if (e.key === 'Escape' && input.value) { e.stopPropagation(); input.value = ''; S.query = ''; fill(); }
    });
    out.push(h('div', { class: 'af-searchbox' }, input), count, listBox);
    fill();
    const xs = [...crossings.values()].filter(x => x.stationM >= iv.startM && x.stationM <= iv.endM);
    if (xs.length) {
      out.push(h('h3', { class: 'af-h3' }, 'Пересечения участка'), h('div', { class: 'af-xlist' }, xs.map(x => crossingRow(x, null))));
    }
    out.push(h('h3', { class: 'af-h3' }, 'Участок'), intervalTools(iv, null));
    const sh = sheetsBlock(iv.refs);
    if (sh) out.push(sh);
    return out;
  }
  const ivTitle = i => i.title || (fmtPk(i.startM) + '–' + fmtPk(i.endM));
  const intervalHome = st => intervals.find(i => st.stationM >= i.startM && st.stationM <= i.endM) || null;
  function stationRow(st, otherIv) {
    const f = st.fields || {};
    const vals = [];
    const depth = f.depthToCrownM || f.depthCrownM;
    if (depth) vals.push(miniVal('глубина до верха трубы', depth));
    if (f.terrainM) vals.push(miniVal('земля', f.terrainM));
    if (f.invertM) vals.push(miniVal('лоток', f.invertM));
    const method = f.constructionMethod || f.nextConstructionMethod;
    const ws = worstState(st);
    const [pk, ...rest] = String(st.title || fmtPk(st.stationM)).split(' · ');
    return h('button', { type: 'button', class: 'af-row', role: 'listitem', onclick: () => openStation(st), 'data-id': st.id },
      h('span', { class: 'af-row-pk' }, pk, rest.length ? h('small', null, nb(rest.join(' · '))) : null),
      h('span', { class: 'af-row-v' }, vals, method && method.value ? h('span', { class: 'af-row-m' }, shortMethod(method.value)) : null),
      ws ? stateChip(ws) : null,
      otherIv ? h('span', { class: 'af-row-iv' }, 'другой участок: ' + ivTitle(otherIv)) : null);
  }
  function shortMethod(v) {
    const s = String(v);
    if (/ГНБ|прокол|бурен/i.test(s)) return 'ГНБ';
    if (/открыт|траншей/i.test(s)) return 'открыто';
    return s.length > 28 ? s.slice(0, 26) + '…' : s;
  }
  function miniVal(label, f) {
    const v = fmtValue(f);
    if (v == null) return h('span', { class: 'af-mini af-mini--none' }, label + ': нет данных');
    return h('span', { class: 'af-mini' }, label + ': ', h('b', null, v), ' ', originBadge(f));
  }
  function crossingRow(x, fromSt) {
    if (x.missingCard) return h('div', { class: 'af-xrow af-xrow--none' }, 'Пересечение ' + x.id + ': карточки нет в данных');
    const { state } = crossingState(x);
    return h('button', { type: 'button', class: 'af-xrow', onclick: () => openCrossing(x, fromSt) },
      h('span', { class: 'af-xrow-t' }, nb(x.title || x.id), h('small', null, fmtPk(x.stationM) + (fromSt && x.stationM !== fromSt.stationM ? ' · ' + signedM(x.stationM - fromSt.stationM) + ' от ПК' : ''))),
      stateChip(state));
  }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    return n + ' ' + (a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many);
  }
  const signedM = d => (d > 0 ? '+' : '−') + NF.m.format(Math.abs(d)) + ' м';

  function renderStation(st) {
    const iv = intervalOf(st);
    S.intervalId = iv.id;
    titleEl.textContent = nb(st.title || fmtPk(st.stationM));
    backBtn.hidden = false;
    backBtn.textContent = '‹ Список ПК';
    const i = stations.indexOf(st);
    const prev = stations[i - 1], next = stations[i + 1];
    const out = [];
    out.push(h('div', { class: 'af-pager' },
      prev ? btn('‹ ' + fmtPk(prev.stationM), () => openStation(prev), 'af-btn--ghost af-btn--sm') : h('span'),
      h('span', { class: 'af-pager-iv' }, intervals.length > 1 ? '' : (iv.title || '')),
      next ? btn(fmtPk(next.stationM) + ' ›', () => openStation(next), 'af-btn--ghost af-btn--sm') : h('span')));
    const main = h('div', { class: 'af-actions af-actions--main' },
      btn('3D здесь', () => show3d(st.stationM, st.modelIds || st.ids, st.title || fmtPk(st.stationM)), 'af-btn--primary'));
    const ugB = ugButton(iv);
    if (ugB) main.append(ugB);
    if (typeof window.ATLAS_FIELD_MEASURE_INVERT === 'function') main.append(btn('Замер лотка', () => measureInvert(st), 'af-btn--ghost'));
    waitAdapters();
    out.push(main);
    if (ugB || S.ug.note[iv.id]) out.push(ugMsg(iv));
    const m = S.measure[st.id];
    if (m) out.push(measureBox(m));
    if (st.stationing && isField(st.stationing)) out.push(h('div', { class: 'af-stationing' }, 'Пикетаж: ', h('b', null, fmtValue(st.stationing)), ' ', originBadge(st.stationing), refList(st.stationing.refs, 2)));
    out.push(fieldsBlock(st.fields, { primaryFirst: true }));
    const near = crossingsNear(st);
    out.push(h('h3', { class: 'af-h3' }, 'Пересечения рядом'));
    out.push(near.length ? h('div', { class: 'af-xlist' }, near.map(x => crossingRow(x, st))) : h('p', { class: 'af-muted' }, 'Пересечений на этом пикете нет.'));
    const ns = (st.nodeIds || []).map(id => nodes.get(id) || { id, missingCard: true });
    if (ns.length) {
      out.push(h('h3', { class: 'af-h3' }, 'Сооружения и выемки'));
      ns.forEach((n, k) => out.push(nodeBlock(n, k === 0 && ns.length === 1)));
    }
    out.push(h('h3', { class: 'af-h3' }, 'Участок · ' + (iv.title || '')), intervalTools(iv, st));
    const sh = sheetsBlock(st.refs);
    if (sh) out.push(h('h3', { class: 'af-h3' }, 'Листы ПД'), sh);
    return out;
  }
  function measureBox(m) {
    if (m.failed) return h('div', { class: 'af-measure' }, 'Замер не выполнен: точка вне участка адаптера.');
    const parts = [];
    if (Number.isFinite(m.depthM)) parts.push(h('b', null, 'Глубина лотка ' + NF2.format(m.depthM) + ' м'));
    else parts.push(h('b', null, 'Глубина не определена: в этой точке нет поверхности рельефа.'));
    const sub = [];
    if (Array.isArray(m.point) && Number.isFinite(m.point[2])) sub.push('лоток ' + NF2.format(m.point[2]) + ' м');
    if (Number.isFinite(m.terrainM)) sub.push('рельеф ' + NF2.format(m.terrainM) + ' м');
    return h('div', { class: 'af-measure' }, parts, sub.length ? h('div', null, sub.join(' · ')) : null,
      h('div', { class: 'af-f-s' }, h('span', { class: 'af-src af-src--calc' }, 'расчёт'), h('span', { class: 'af-muted' }, 'по поверхности рельефа в модели — ориентир, не для разбивки')));
  }
  function nodeBlock(n, open) {
    if (n.missingCard) return h('p', { class: 'af-muted' }, 'Узел ' + n.id + ': карточки нет в данных.');
    const kind = NODE_KIND[n.kind] || n.kind || '';
    const d = h('details', { class: 'af-node', open: !!open },
      h('summary', null, h('span', null, nb(n.title || n.id)), kind ? h('small', null, kind + (Number.isFinite(+n.stationM) ? ' · ' + fmtPk(n.stationM) : '')) : null));
    const acts = h('div', { class: 'af-actions' });
    if (n.viewHref) acts.append(linkBtn('Показать в 3D', n.viewHref, 'af-btn--ghost'));
    if (n.sectionHref) acts.append(linkBtn('Разрез', n.sectionHref, 'af-btn--ghost'));
    for (const v of n.views || []) if (v && v.href) acts.append(linkBtn(v.label || 'Вид', v.href, 'af-btn--ghost'));
    const p = window.AtlasFieldPrint;
    if (/well/.test(n.kind || '') && p && typeof p.well === 'function') acts.append(btn('Монтажная карта', () => callSafe(() => p.well(n.id)), 'af-btn--ghost'));
    if (acts.childNodes.length) d.append(acts);
    if (/well/.test(n.kind || '') && !(Array.isArray(n.rings) && n.rings.length)) d.append(h('p', { class: 'af-muted' }, 'Порядок колец в источнике не указан.'));
    if (Array.isArray(n.rings) && n.rings.length) {
      d.append(h('h4', { class: 'af-h4' }, 'Кольца снизу вверх'));
      n.rings.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).forEach(r => d.append(h('div', { class: 'af-sub' }, h('b', null, (r.order ?? '') + '. ' + (r.title || '')), fieldsBlock(r.fields), refList(r.refs, 2))));
    }
    if (Array.isArray(n.inlets) && n.inlets.length) {
      d.append(h('h4', { class: 'af-h4' }, 'Вводы и выпуски'));
      n.inlets.forEach(r => d.append(h('div', { class: 'af-sub' }, h('b', null, r.title || ''), fieldsBlock(r.fields), refList(r.refs, 2))));
    }
    d.append(fieldsBlock(n.fields));
    return d;
  }

  function renderCrossing(x) {
    const from = stations.find(s => s.id === S.from);
    titleEl.textContent = nb(x.title || x.id);
    backBtn.hidden = false;
    backBtn.textContent = from ? '‹ ' + fmtPk(from.stationM) : '‹ Список ПК';
    const { state, missing, downgraded, c } = crossingState(x);
    const out = [];
    out.push(h('div', { class: 'af-pk' }, fmtPk(x.stationM), x.stationing && isField(x.stationing) ? h('span', null, ' ', originBadge(x.stationing)) : null));
    const box = h('div', { class: 'af-state af-state--' + state, role: 'status' });
    if (state === 'violation') {
      box.append(h('b', null, STATE_TEXT.violation), ...clearanceLine(c).filter(Boolean));
    } else if (state === 'ok') {
      const t = c.threshold && (c.threshold.refs || []).find(r => r.pdfPage != null);
      const src = t && sources.get(t.sourceId);
      const norm = [fmtValue(c.threshold), t ? (sourceShort(src) || t.sourceId) + ', с. ' + t.pdfPage : null].filter(Boolean).join(', ');
      box.append(h('b', null, STATE_TEXT.ok + (norm ? ' (норма: ' + norm + ')' : '')), ...clearanceLine(c).filter(Boolean));
    } else {
      box.append(h('b', null, STATE_TEXT.unchecked + (missing.length ? ':' : '')));
      if (downgraded) box.append(h('p', null, 'В данных указано «в норме», но без ссылок на страницу документа — проверку нельзя считать выполненной.'));
      if (missing.length) box.append(h('ul', null, missing.map(m => h('li', null, m))));
      else box.append(h('p', null, 'Причина в данных не указана.'));
    }
    out.push(box);
    out.push(h('div', { class: 'af-actions af-actions--main' },
      btn('3D здесь', () => show3d(x.stationM, [x.body, ...(x.modelIds || [])].filter(Boolean), x.title || x.id), 'af-btn--primary'),
      ...(x.views || []).filter(v => v && v.href).map(v => linkBtn(v.label || 'Вид', v.href, 'af-btn--ghost'))));
    const f = x.fields || {};
    out.push(h('h3', { class: 'af-h3' }, 'Владелец и связь'));
    out.push(contactRow('owner', f.owner), contactRow('dispatcherContact', f.dispatcherContact || f.contact));
    const q = f.qualityLevel || f.quality;
    if (q) out.push(h('div', { class: 'af-quality' }, 'Качество сведений: ', h('b', null, fmtValue(q) || 'нет данных'), f.qualityMethod && fmtValue(f.qualityMethod) ? ' — ' + fmtValue(f.qualityMethod) : '', ' ', originBadge(q)));
    if (Array.isArray(x.networks) && x.networks.length) {
      out.push(h('h3', { class: 'af-h3' }, 'Сети'));
      out.push(h('div', { class: 'af-nets' }, x.networks.map(n => h('div', { class: 'af-net' }, h('b', null, n.name || n.id),
        isField(n.elevation) ? fieldRow('elevation', { ...n.elevation, label: 'Отметка' + (n.elevation.pointKind ? ' (' + pointKindRu(n.elevation.pointKind) + ')' : '') }) : h('div', { class: 'af-muted' }, 'Отметка: нет данных'),
        n.outerDimensions ? h('div', { class: 'af-muted' }, 'Габариты: ' + ['width', 'height'].map(k => n.outerDimensions[k] && fmtValue(n.outerDimensions[k])).filter(Boolean).join(' × ')) : null))));
    }
    const rest = {};
    for (const [k, v] of Object.entries(f)) if (!['owner', 'dispatcherContact', 'contact', 'qualityLevel', 'quality', 'qualityMethod'].includes(k)) rest[k] = v;
    out.push(h('h3', { class: 'af-h3' }, 'Сведения'), fieldsBlock(rest));
    const acts = Array.isArray(x.actions) ? x.actions : (f.actions && Array.isArray(f.actions.value) ? f.actions.value : null);
    if (acts && acts.length) out.push(h('h3', { class: 'af-h3' }, 'Действия на месте'), h('ul', { class: 'af-todo' }, acts.map(a => h('li', null, String(a)))));
    const sh = sheetsBlock(x.refs);
    if (sh) out.push(h('h3', { class: 'af-h3' }, 'Листы ПД'), sh);
    return out;
  }
  function pointKindRu(k) {
    return ({ terrain: 'земля', invert: 'лоток', crown: 'верх трубы', sleeve: 'футляр', axis: 'ось', pit_bottom: 'дно котлована', well_bottom: 'дно колодца', rim: 'люк', other: 'тип не указан' })[k] || k;
  }
  function clearanceLine(c) {
    const parts = [];
    if (c.metric) parts.push('Расстояние ' + (METRIC[c.metric] || c.metric));
    const row = h('div', { class: 'af-fields' });
    if (isField(c.distance)) row.append(fieldRow('distance', { ...c.distance, label: 'Расстояние' }));
    if (isField(c.threshold)) row.append(fieldRow('threshold', { ...c.threshold, label: 'Порог' }));
    return [parts.length ? h('p', null, parts.join(' · ')) : null, row];
  }
  function contactRow(key, f) {
    const label = LABELS[key] || key;
    const v = f ? fmtValue(f) : null;
    if (v == null) {
      return h('div', { class: 'af-f af-f--none' }, h('div', { class: 'af-f-l' }, label), h('div', { class: 'af-f-v' }, 'нет в источнике'),
        f && f.missingReason ? h('div', { class: 'af-f-why' }, f.missingReason) : null);
    }
    const tel = /^[+\d][\d\s()-]{5,}$/.test(v.replace(/\(.*?\)\s*$/, '').trim()) ? 'tel:' + v.replace(/[^\d+]/g, '') : null;
    return h('div', { class: 'af-f' }, h('div', { class: 'af-f-l' }, label),
      h('div', { class: 'af-f-v' }, tel ? h('a', { href: tel }, v) : v), h('div', { class: 'af-f-s' }, originBadge(f), refList(f.refs, 3)));
  }

  function render() {
    if (!root) return;
    say('');
    let kids;
    const st = stations.find(s => s.id === S.stationId);
    const x = crossings.get(S.crossingId);
    if (S.view === 'station' && st) kids = renderStation(st);
    else if (S.view === 'crossing' && x) kids = renderCrossing(x);
    else { S.view = 'list'; kids = renderList(); }
    body.replaceChildren(...kids);
    root.dataset.view = S.view;
    placement();
    paintIvBar();
    body.scrollTop = 0;
    updateFab();
    syncUrl();
  }

  function paintIvBar() {
    if (!ivBar || intervals.length < 2) return;
    const iv = intervals.find(i => i.id === S.intervalId) || intervals[0];
    const sel = ivBar.querySelector('select');
    if (sel && sel.value !== iv.id) sel.value = iv.id;
    const n = stationsIn(iv).length, xs = [...crossings.values()].filter(x => x.stationM >= iv.startM && x.stationM <= iv.endM);
    const bad = xs.filter(x => crossingState(x).state === 'violation').length;
    const nm = ivBar.querySelector('.af-ivname'), range = fmtPk(iv.startM) + '–' + fmtPk(iv.endM);
    nm.textContent = iv.title && iv.title !== range ? iv.title : '';
    nm.hidden = !nm.textContent;
    ivBar.querySelector('.af-ivinfo').textContent = plural(n, 'пикет', 'пикета', 'пикетов') + ' · ' + plural(xs.length, 'пересечение', 'пересечения', 'пересечений') + (bad ? ' · зазор меньше нормы: ' + bad : '');
  }

  /* ---------- открыть / закрыть ---------- */
  function placement() {
    if (!root) return;
    const hd = document.querySelector('header.atlas-shell');
    const top = hd ? Math.max(0, Math.round(hd.getBoundingClientRect().bottom)) : 0;
    const tb = document.querySelector('.as-tabbar');
    let bottom = 0;
    if (tb && tb.offsetParent !== null) { const r = tb.getBoundingClientRect(); if (r.height) bottom = Math.max(0, Math.round(window.innerHeight - r.top)); }
    root.style.setProperty('--af-top', top + 'px');
    root.style.setProperty('--af-bottom', bottom + 'px');
    if (fab) fab.style.setProperty('--af-bottom', bottom + 'px');
  }
  function show() {
    build();
    S.open = true;
    root.hidden = false;
    S.min = false;
    root.classList.remove('af-min');
    document.body.classList.add('af-on');
    if (openBtn) openBtn.setAttribute('aria-pressed', 'true');
    placement();
  }
  function minimize(on) {
    S.min = !!on;
    root.classList.toggle('af-min', S.min);
    root.hidden = S.min;
    updateFab();
    if (!S.min) placement();
  }
  function updateFab() {
    if (!fab) return;
    fab.hidden = !(S.open && S.min);
    const st = stations.find(s => s.id === S.stationId);
    const what = S.view === 'station' && st ? fmtPk(st.stationM) : S.view === 'crossing' ? 'пересечение' : 'список ПК';
    fab.textContent = '';
    fab.append(h('span', { class: 'af-fab-i', 'aria-hidden': 'true' }, '↑'), 'Пикеты · ' + what);
  }
  function openStation(st) { show(); S.view = 'station'; S.stationId = st.id; S.crossingId = null; S.intervalId = intervalOf(st).id; render(); focusTitle(); }
  function openCrossing(x, fromSt) { const prevSt = S.view === 'station' ? S.stationId : null; show(); S.view = 'crossing'; S.crossingId = x.id; { const cur = intervals.find(i => i.id === S.intervalId); if (!(cur && x.stationM >= cur.startM && x.stationM <= cur.endM)) S.intervalId = (intervals.find(i => x.stationM >= i.startM && x.stationM <= i.endM) || intervals[0]).id; } S.from = fromSt ? fromSt.id : prevSt; render(); focusTitle(); }
  function focusTitle() { try { titleEl.focus({ preventScroll: true }); } catch (e) { /* */ } }
  function back() {
    if (S.view === 'crossing' && S.from && stations.some(s => s.id === S.from)) { S.view = 'station'; S.stationId = S.from; S.from = null; }
    else { S.view = 'list'; S.stationId = null; S.crossingId = null; }
    render();
  }
  function close() {
    if (!root) return;
    S.open = false; S.min = false;
    root.hidden = true;
    if (fab) fab.hidden = true;
    document.body.classList.remove('af-on');
    if (openBtn) openBtn.setAttribute('aria-pressed', 'false');
    const A = window.__ATLAS;
    if (A && S.hl && typeof A.highlightState === 'function') {
      const cur = A.highlightState();
      if (cur && cur.ids.length === S.hl.length && S.hl.every(id => cur.ids.includes(id))) { try { A.highlight(null); } catch (e) { /* */ } }
    }
    S.hl = null;
    syncUrl();
  }

  function build() {
    if (root) return;
    injectStyle();
    titleEl = h('h2', { class: 'af-title', id: 'afTitle', tabindex: '-1' }, 'Что на ПК');
    backBtn = btn('‹ Список ПК', back, 'af-btn--ghost af-back', { hidden: true });
    toggle3d = btn('3D', () => minimize(true), 'af-btn--ghost af-3d', { title: 'Показать модель', 'aria-label': 'Показать модель' });
    const closeBtn = btn('×', close, 'af-btn--ghost af-close', { 'aria-label': 'Закрыть панель «Что на ПК»', title: 'Закрыть' });
    const route = D.route || {};
    const sub = [editionLabel(), route.id ? 'трасса ' + netLabel(route.id) : null].filter(Boolean).join(' · ');
    head = h('div', { class: 'af-head' },
      h('div', { class: 'af-head-row' }, backBtn, h('span', { class: 'af-head-sp' }), toggle3d, closeBtn),
      h('div', { class: 'af-head-t' }, titleEl, sub ? h('div', { class: 'af-subt', title: D.release ? 'Выпуск данных полевого комплекта: ' + D.release : '' }, sub) : null));
    ivBar = h('div', { class: 'af-ivbar', hidden: intervals.length < 2 });
    if (intervals.length > 1) {
      const sel = h('select', { class: 'af-ivsel', id: 'afInterval' },
        intervals.map(i => h('option', { value: i.id, title: ivTitle(i) }, fmtPk(i.startM) + '–' + fmtPk(i.endM))));
      sel.addEventListener('change', () => { S.intervalId = sel.value; S.view = 'list'; S.stationId = null; S.crossingId = null; S.query = ''; render(); });
      ivBar.append(h('label', { class: 'af-ivlbl', for: 'afInterval' }, 'Участок', h('span', { class: 'af-ivn' }, intervals.length + ' на трассе')), sel, h('div', { class: 'af-ivname' }), h('div', { class: 'af-ivinfo' }));
      head.append(ivBar);
    }
    note = h('div', { class: 'af-note', role: 'status', 'aria-live': 'polite', hidden: true });
    body = h('div', { class: 'af-body' });
    root = h('section', { class: 'af-root', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'afTitle', hidden: true }, head, note, body);
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); if (S.view !== 'list') back(); else close(); return; }
      e.stopPropagation(); /* горячие клавиши модели не срабатывают, пока ввод в панели */
    });
    fab = h('button', { type: 'button', class: 'af-fab', hidden: true, onclick: () => minimize(false) });
    document.body.append(root, fab);
    window.addEventListener('resize', () => { if (S.open) placement(); });
  }

  function mountButton() {
    const tools = document.querySelector('header.atlas-shell .as-tools');
    const icon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M4 18h16M7 18v-4M12 18V8M17 18v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="5" r="2" fill="currentColor"/></svg>';
    openBtn = h('button', { type: 'button', class: 'af-open', id: 'afOpen', 'aria-pressed': 'false', title: 'Что на ПК: пикеты, отметки, пересечения', 'aria-label': 'Пикеты' });
    openBtn.innerHTML = icon;
    openBtn.append(h('span', { class: 'af-open-t' }, 'Пикеты'), h('span', { class: 'af-open-s', 'aria-hidden': 'true' }, 'ПК'));
    openBtn.addEventListener('click', () => {
      if (S.open && !S.min) return close();
      if (S.open && S.min) return minimize(false);
      show(); render(); focusTitle();
    });
    if (tools) tools.prepend(openBtn);
    else { openBtn.classList.add('af-open--float'); document.body.append(openBtn); }
    injectStyle();
  }

  function fromQuery() {
    const q = new URLSearchParams(location.search);
    if (q.get('field') !== '1') return;
    show();
    const xing = q.get('xing');
    const pkRaw = q.get('pk');
    const ivq = intervals.find(i => i.id === q.get('iv'));
    S.intervalId = (ivq || intervals[0]).id;
    const home = m => (ivq && m >= ivq.startM && m <= ivq.endM) ? ivq : (intervals.find(i => m >= i.startM && m <= i.endM) || ivq || intervals[0]);
    if (xing && crossings.has(xing)) { S.view = 'crossing'; S.crossingId = xing; S.intervalId = home(crossings.get(xing).stationM).id; }
    else if (pkRaw != null) {
      const v = Number(String(pkRaw).replace(',', '.'));
      const st = stationByPk(v);
      if (st) { S.view = 'station'; S.stationId = st.id; S.intervalId = home(st.stationM).id; }
      else { S.view = 'list'; S.query = pkRaw; if (Number.isFinite(v)) S.intervalId = home(v).id; }
    }
    render();
  }

  let styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    /* Светлые значения — копия assets/tokens.css (светлая тема): поле всегда светлое, даже при тёмной теме атласа. Шрифты — токены страницы. */
    const css = `
.af-root,.af-fab,.af-open{--af-bg:#FFFFFF;--af-bg2:#EDF2F5;--af-page:#F3F6F8;--af-text:#14202A;--af-text2:#3F5163;--af-line:#C4CED8;--af-line2:#DCE3E9;
 --af-brand:#0B4F6C;--af-brand-h:#083A50;--af-tint:#E2EEF3;--af-red:#B3261E;--af-red-bg:#FBEAE9;--af-red-t:#8C1D18;--af-ok:#1E7A4C;--af-ok-bg:#E6F4EC;--af-ok-t:#14573A;
 --af-grey:#4A5563;--af-grey-bg:#F0F2F4;--af-amber-bg:#FCF1E0;--af-amber-t:#7A4A00;--af-font:var(--font,"Golos Text",system-ui,sans-serif);--af-mono:var(--mono,ui-monospace,Menlo,monospace);
 color-scheme:light;font-family:var(--af-font);font-variant-numeric:tabular-nums}
.af-open{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;margin-right:6px;border:1px solid var(--af-brand);border-radius:8px;
 background:var(--af-bg);color:var(--af-brand);font:600 14px/1 var(--af-font);cursor:pointer;white-space:nowrap;flex:0 0 auto}
.af-open:hover{background:var(--af-tint)}.af-open[aria-pressed="true"]{background:var(--af-brand);color:#fff}
.af-open:focus-visible,.af-root :focus-visible,.af-fab:focus-visible{outline:3px solid #2F7F9F;outline-offset:2px}
.af-open-s{display:none}
.af-open--float{position:fixed;left:12px;bottom:12px;z-index:57;height:44px;box-shadow:0 4px 14px rgba(16,32,48,.18)}
.af-root{position:fixed;z-index:58;right:0;top:var(--af-top,56px);bottom:0;width:min(360px,100vw);box-sizing:border-box;display:flex;flex-direction:column;
 background:var(--af-page);color:var(--af-text);border-left:1px solid var(--af-line);box-shadow:0 12px 40px rgba(20,50,70,.22);font-size:16px;line-height:1.4}
.af-root[hidden]{display:none}
.af-root *{box-sizing:border-box}
.af-head{background:var(--af-bg);border-bottom:1px solid var(--af-line);padding:8px 8px 8px 12px}
.af-head-row{display:flex;align-items:center;gap:6px}
.af-head-sp{flex:1 1 auto;min-width:0}
.af-head-t{margin-top:6px;min-width:0}
.af-root[data-view="list"] .af-head{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:8px}
.af-root[data-view="list"] .af-head-row{grid-column:2;grid-row:1}
.af-root[data-view="list"] .af-head-t{grid-column:1;grid-row:1;margin-top:0}
.af-root[data-view="list"] .af-head-sp{display:none}
.af-root .af-head .af-ivbar{grid-column:1/-1}
.af-title{margin:0;font:700 19px/1.25 var(--af-font);color:var(--af-text);overflow-wrap:break-word;outline:none}
.af-subt{font:500 13px/1.3 var(--af-font);color:var(--af-text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.af-root .af-head .af-3d{display:none}
.af-root .af-close{font-size:26px;font-weight:400;width:44px;padding:0;line-height:1}
.af-ivbar{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;align-items:center;margin:10px -8px -8px -12px;padding:8px 8px 10px 12px;background:var(--af-tint);border-top:1px solid #9DBFCF}
.af-ivbar[hidden]{display:none}
.af-ivlbl{font:700 14px/1.2 var(--af-font);color:var(--af-brand-h);display:flex;gap:8px;align-items:baseline}.af-ivn{font-weight:500;font-size:13px;color:var(--af-text2)}
.af-root .af-ivsel{width:100%;min-width:0;height:auto;min-height:48px;padding:8px 10px;border:2px solid var(--af-brand);border-radius:8px;background:var(--af-bg);color:var(--af-text);font:700 16px/1.2 var(--af-font)}
.af-ivname{grid-column:1/-1;font:600 15px/1.35 var(--af-font);color:var(--af-text);overflow-wrap:anywhere}.af-ivname[hidden]{display:none}
.af-ivinfo{grid-column:1/-1;font:600 13px/1.3 var(--af-font);color:var(--af-brand-h)}
.af-root:not([data-view="list"]) .af-ivinfo,.af-root:not([data-view="list"]) .af-ivn{display:none}
.af-row-iv{grid-column:1/-1;font-size:13px;font-weight:600;color:var(--af-amber-t)}
.af-toggle{display:flex;align-items:center;gap:10px;min-height:44px;margin:0 0 8px;padding:4px 10px;background:var(--af-bg);border:1px solid var(--af-line2);border-radius:8px;font-weight:600;font-size:15px;cursor:pointer}
.af-toggle input{width:22px;height:22px;margin:0;accent-color:var(--af-brand)}
.af-mk-layer{position:absolute;inset:0;z-index:4;pointer-events:none;overflow:hidden;contain:layout style}
.af-mk-layer[hidden]{display:none}
.af-mk-svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.af-mk-ln{stroke-width:1.5}.af-mk-ln--s,.af-mk-dt--s{stroke:#0B4F6C;fill:#0B4F6C}
.af-mk-ln--unchecked,.af-mk-dt--unchecked{stroke:#4A5563;fill:#4A5563}.af-mk-ln--violation,.af-mk-dt--violation{stroke:#B3261E;fill:#B3261E}.af-mk-ln--ok,.af-mk-dt--ok{stroke:#1E7A4C;fill:#1E7A4C}
.af-mk-layer .af-mk{position:absolute;left:0;top:0;margin:0;pointer-events:auto;cursor:pointer;white-space:nowrap;font:600 13px/1.2 var(--font,"Golos Text",system-ui,sans-serif);font-variant-numeric:tabular-nums;
 padding:3px 7px;min-height:0;height:auto;border-radius:6px;border:1px solid #0B4F6C;background:rgba(255,255,255,.96);color:#0B4F6C;box-shadow:0 1px 3px rgba(16,32,48,.18);will-change:transform}
.af-mk-layer .af-mk--key{font-weight:700}
.af-mk-layer .af-mk--unchecked{border-color:#4A5563;background:#F0F2F4;color:#2E3742}
.af-mk-layer .af-mk--violation{border-color:#B3261E;background:#FBEAE9;color:#8C1D18}
.af-mk-layer .af-mk--ok{border-color:#1E7A4C;background:#E6F4EC;color:#14573A}
.af-mk-layer .af-mk:focus-visible{outline:3px solid #2F7F9F;outline-offset:1px}
.af-note{margin:8px 12px 0;padding:10px 12px;border-radius:8px;background:var(--af-tint);color:var(--af-brand-h);font-weight:600;font-size:15px}
.af-note[hidden]{display:none}
.af-body{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:12px 12px 24px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.af-root .af-btn{display:inline-flex;height:auto;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--af-line);
 background:var(--af-bg);color:var(--af-brand);font:600 15px/1.2 var(--af-font);text-decoration:none;cursor:pointer;text-align:center}
.af-root .af-btn:hover{background:var(--af-tint)}
.af-root .af-btn[hidden]{display:none}
.af-root .af-btn--primary{background:var(--af-brand);border-color:var(--af-brand);color:#fff}.af-root .af-btn--primary:hover{background:var(--af-brand-h)}
.af-root .af-btn--sm{font-size:14px;padding:8px 10px}
.af-root .af-back{flex:0 0 auto;padding:8px 10px}
.af-lbl{display:block;font-weight:600;font-size:14px;color:var(--af-text2);margin:0 0 4px}
.af-root .af-select,.af-root .af-search{width:100%;height:auto;min-height:48px;padding:10px 12px;border:1px solid #808F9E;border-radius:8px;background:var(--af-bg);color:var(--af-text);font:500 17px/1.2 var(--af-font)}
.af-searchbox{margin:10px 0 4px}
.af-iv{font-size:16px;font-weight:700;color:var(--af-text)}
.af-count{font-size:13px;color:var(--af-text2);margin:4px 2px 8px}
.af-warn{background:var(--af-amber-bg);color:var(--af-amber-t);border:1px solid #E7C98F;border-radius:8px;padding:8px 10px;margin:0 0 10px;font-size:13px;font-weight:600}
.af-warn p{margin:0}.af-warn p+p{margin-top:4px}
.af-list,.af-xlist{display:grid;gap:8px}
.af-root .af-row{content-visibility:auto;contain-intrinsic-size:auto 88px}
.af-root .af-row,.af-root .af-xrow{display:grid;height:auto;grid-template-columns:minmax(0,1fr) auto;gap:4px 10px;align-items:center;width:100%;min-height:56px;padding:10px 12px;text-align:left;
 background:var(--af-bg);border:1px solid var(--af-line);border-radius:10px;color:var(--af-text);font:inherit;cursor:pointer}
.af-row:hover,.af-xrow:hover{border-color:var(--af-brand);background:#F8FBFC}
.af-row-pk{font:700 18px/1.2 var(--af-font);grid-column:1}.af-row-pk small,.af-xrow-t small{display:block;font:500 13px/1.3 var(--af-font);color:var(--af-text2)}
.af-row .af-chip{grid-column:2;grid-row:1}
.af-row-v{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 12px;font-size:14px;color:var(--af-text2)}
.af-row-v b{color:var(--af-text);font-weight:700}
.af-row-m{font-weight:700;color:var(--af-brand)}
.af-mini--none{color:var(--af-text2)}
.af-root .af-xrow{grid-template-columns:minmax(0,1fr) auto}
.af-xrow-t{font-weight:600;min-width:0;overflow-wrap:break-word}
.af-xrow--none{padding:10px 12px;color:var(--af-text2);border:1px dashed var(--af-line);border-radius:10px}
.af-chip{display:inline-block;padding:4px 9px;border-radius:999px;font:700 13px/1.2 var(--af-font);white-space:nowrap;border:1px solid transparent}
.af-chip--violation{background:var(--af-red-bg);color:var(--af-red-t);border-color:var(--af-red)}
.af-chip--unchecked{background:var(--af-grey-bg);color:var(--af-grey);border-color:#9AA3AE}
.af-chip--ok{background:var(--af-ok-bg);color:var(--af-ok-t);border-color:var(--af-ok)}
.af-h3{margin:20px 0 8px;font:700 15px/1.3 var(--af-font);color:var(--af-text)}
.af-h4{margin:12px 0 4px;font:700 14px/1.3 var(--af-font)}
.af-muted{color:var(--af-text2);font-size:14px;margin:4px 0}
.af-pager{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;margin-bottom:10px}
.af-pager-iv{font-size:13px;color:var(--af-text2);text-align:center;min-width:0;overflow-wrap:anywhere}
.af-actions{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
.af-actions--main .af-btn{flex:1 1 140px;min-width:0}
.af-ivtools{flex:1 1 100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.af-ivtools>.af-btn:only-of-type{grid-column:1/-1}
.af-ivtools .af-off-msg,.af-ivtools .af-ug-msg{grid-column:1/-1}
.af-ivtools>.af-btn:last-of-type:nth-of-type(odd){grid-column:1/-1}
.af-root .af-ug[aria-pressed="true"]{background:var(--af-brand-h);border-color:var(--af-brand-h);color:#fff}
.af-ug-msg{font-size:14px;font-weight:600;color:var(--af-red-t);background:var(--af-red-bg);border:1px solid var(--af-red);border-radius:8px;padding:8px 10px;margin:4px 0}
.af-ug-msg[hidden]{display:none}
.af-ug-msg.af-ug-msg--note{color:var(--af-text2);background:var(--af-bg2);border-color:var(--af-line);font-weight:500}
.af-root .af-btn:disabled{opacity:.7;cursor:progress}
.af-off-msg{font-size:14px;line-height:1.35;padding:8px 10px;border-radius:8px;border:1px solid var(--af-line2);background:var(--af-bg);color:var(--af-text2)}
.af-off-msg[hidden]{display:none}
.af-off-msg{display:grid;gap:6px;scroll-margin:12px 0 16px}.af-off-msg ul{margin:0;padding-left:20px;font-weight:500}.af-off-msg li{margin:2px 0}
.af-progress{width:100%;height:10px;accent-color:var(--af-brand)}
.af-off-msg--busy{color:var(--af-brand-h);border-color:#9DBFCF;background:var(--af-tint)}
.af-off-msg--fail{color:var(--af-red-t);border-color:var(--af-red);background:var(--af-red-bg);font-weight:600}
.af-off-msg--warn{color:var(--af-amber-t);border-color:#E7C98F;background:var(--af-amber-bg);font-weight:600}
.af-off-msg--ready{color:var(--af-brand-h);border:2px solid var(--af-brand);background:var(--af-bg);font-weight:700}
.af-off-msg--info{color:var(--af-text);background:var(--af-bg2)}
.af-fields{display:grid;gap:6px}
.af-f{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:8px 10px;background:var(--af-bg);border:1px solid var(--af-line2);border-radius:8px}
.af-f-l{font-size:14px;color:var(--af-text2);font-weight:500;min-width:0}
.af-f-v{font:700 16px/1.3 var(--af-font);color:var(--af-text);text-align:right;overflow-wrap:break-word;max-width:100%;min-width:0}
.af-f-l{overflow-wrap:break-word}
.af-root .af-f--long{grid-template-columns:minmax(0,1fr)}
.af-root .af-f--long .af-f-v{text-align:left;font-weight:500;line-height:1.45}
.af-f-s{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}
.af-f-why{grid-column:1/-1;font-size:14px;line-height:1.4;color:var(--af-text2)}
.af-f--big .af-f-v{font-size:19px}
.af-f--none .af-f-v{color:var(--af-text2);font-family:var(--af-font);font-weight:600;font-size:14px}
.af-src{display:inline-block;padding:2px 7px;border-radius:5px;font:700 13px/1.3 var(--af-font);border:1px solid}
.af-src--doc{background:var(--af-tint);color:var(--af-brand-h);border-color:#9DBFCF}
.af-src--survey{background:#fff;color:var(--af-brand-h);border-color:var(--af-brand)}
.af-src--calc{background:var(--af-amber-bg);color:var(--af-amber-t);border-color:#E7C98F}
.af-src--none{background:var(--af-grey-bg);color:var(--af-grey);border-color:#B7BEC7}
.af-refs{display:inline-flex;flex-wrap:wrap;gap:4px 8px}
.af-ref{font-size:13px;font-weight:600;color:var(--af-brand);text-decoration:underline;text-underline-offset:2px;min-height:24px;display:inline-flex;align-items:center}
.af-ref--plain{text-decoration:none;color:var(--af-text2)}
.af-more{font-size:13px;color:var(--af-text2)}
.af-stationing{font-size:14px;color:var(--af-text2);margin:4px 0 8px;display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center}
.af-stationing b{color:var(--af-text);font-weight:700}
.af-measure{background:var(--af-bg);border:2px solid var(--af-brand);border-radius:10px;padding:10px 12px;margin:8px 0;font-size:15px;display:grid;gap:4px}
.af-measure b{font-size:18px}
.af-pk{font:700 22px/1.2 var(--af-font);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.af-state{border-radius:10px;padding:12px 14px;border:2px solid;margin-bottom:8px}
.af-state b{display:block;font-size:18px;margin-bottom:4px}
.af-state ul{margin:4px 0 0;padding-left:20px}.af-state li{margin:4px 0}.af-state p{margin:4px 0}
.af-state--violation{background:var(--af-red-bg);color:var(--af-red-t);border-color:var(--af-red)}
.af-state--ok{background:var(--af-ok-bg);color:var(--af-ok-t);border-color:var(--af-ok)}
.af-state--unchecked{background:var(--af-grey-bg);color:#2E3742;border-color:#8C96A1}
.af-state .af-f{background:rgba(255,255,255,.85)}
.af-quality{margin:8px 0;font-size:15px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.af-nets{display:grid;gap:8px}.af-net{background:var(--af-bg);border:1px solid var(--af-line2);border-radius:8px;padding:8px 10px;display:grid;gap:6px}
.af-todo{margin:0;padding-left:20px;font-size:16px}.af-todo li{margin:6px 0}
.af-node{background:var(--af-bg);border:1px solid var(--af-line);border-radius:10px;margin:0 0 8px;padding:0 10px}
.af-node>summary{min-height:48px;display:flex;flex-direction:column;justify-content:center;padding:8px 0;cursor:pointer;font-weight:700;list-style-position:inside}
.af-node>summary small{font-weight:500;color:var(--af-text2);font-size:13px}
.af-node[open]{padding-bottom:10px}
.af-sub{margin:6px 0;padding:6px 0;border-top:1px solid var(--af-line2)}
.af-sheets{display:grid;gap:6px}
.af-sheet{display:grid;gap:2px;min-height:48px;padding:8px 12px;border:1px solid var(--af-line);border-radius:8px;background:var(--af-bg);color:var(--af-brand);text-decoration:none}
.af-sheet span{font-size:13px;color:var(--af-text2)}.af-sheet--plain{color:var(--af-text)}
.af-fab.af-fab{position:fixed;z-index:57;left:12px;bottom:calc(var(--af-bottom,0px) + 12px);min-height:48px;padding:8px 16px;border-radius:999px;border:0;
 background:var(--af-brand);color:#fff;font:700 15px/1.2 var(--af-font);box-shadow:0 6px 18px rgba(16,32,48,.28);display:inline-flex;align-items:center;gap:8px;cursor:pointer}
.af-fab.af-fab[hidden]{display:none}.af-fab-i{font-size:18px}
@media (max-width:1000px){.af-open{height:44px}}
@media (max-width:600px){
 .af-root{width:100vw;left:0;right:0;bottom:var(--af-bottom,0px);border-left:0;box-shadow:none}
 .af-root .af-head .af-3d{display:inline-flex}
 .af-open{padding:0 10px;margin-right:2px;gap:4px}.af-open-t{display:none}.af-open-s{display:inline}
 .af-f-v{text-align:left}
 .af-ivtools{grid-template-columns:minmax(0,1fr)}
 .af-root .af-xrow{grid-template-columns:minmax(0,1fr)}
 .af-xrow .af-chip{justify-self:start}
}
@media (prefers-reduced-motion:no-preference){.af-btn,.af-row,.af-xrow{transition:background-color .12s,border-color .12s}}
`;
    document.head.append(h('style', { id: 'afStyle' }, css));
  }

  /* ---------- метки на модели (шаг 9) ----------
     Вешки ПК и подписи сетей у пересечений — HTML-слой поверх холста внутри .stage; позиция — __ATLAS.projectToScreen.
     Точка на оси: station.location / route.axis пакета → window.ATLAS_FIELD_POINT(stationM) → ATLAS_PROFILE_WORLD.route
     (ось профиля объекта; в контракте v1 своей оси нет). Высота: земля станции (terrainM), иначе лоток.
     Раскладка жадная по приоритету: пересечения → ключевые ПК (узлы-колодцы, углы) → концы трассы → прочие ПК.
     Пересчёт — только по событиям камеры/вида через rAF. pointer-events — только у самих меток. */
  const MK = { on: true, ready: false, items: [], layer: null, svg: null, frame: 0, placed: [], canvas: null, stage: null };
  const KEY_NODE = /well|bend|tie|valve|chamber|колод/i;
  function marksKey() { const P = window.ATLAS_PROJECT || {}; return ((P.storage && P.storage.prefix) || 'atlas:') + 'field-marks'; }
  try { MK.on = localStorage.getItem(marksKey()) !== '0'; } catch (e) { MK.on = true; }
  function setMarks(on) {
    MK.on = !!on;
    try { localStorage.setItem(marksKey(), MK.on ? '1' : '0'); } catch (e) { /* хранилище недоступно — только на эту сессию */ }
    if (MK.layer) MK.layer.hidden = !MK.on;
    if (MK.on) scheduleMarks();
  }
  function axisPoints() {
    if (MK.axis !== undefined) return MK.axis;
    const own = D.route && Array.isArray(D.route.axis) ? D.route.axis : null;
    const prof = window.ATLAS_PROFILE_WORLD && Array.isArray(window.ATLAS_PROFILE_WORLD.route) ? window.ATLAS_PROFILE_WORLD.route : null;
    const src = own || prof;
    MK.axis = src ? src.map(q => ({ m: +(q.stationM ?? q.station), x: +(q.xM ?? q.x), y: +(q.yM ?? q.y), z: +(q.zM ?? q.z ?? q.invert) }))
      .filter(q => [q.m, q.x, q.y, q.z].every(Number.isFinite)).sort((a, b) => a.m - b.m) : null;
    if (MK.axis && !MK.axis.length) MK.axis = null;
    return MK.axis;
  }
  function routePoint(m) {
    if (typeof window.ATLAS_FIELD_POINT === 'function') {
      try { const p = window.ATLAS_FIELD_POINT(m); if (Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite)) return p; } catch (e) { /* */ }
    }
    const a = axisPoints();
    if (!a || m < a[0].m - 1e-6 || m > a[a.length - 1].m + 1e-6) return null;
    const i = a.findIndex(q => q.m >= m);
    const hi = a[i < 0 ? a.length - 1 : i], lo = a[Math.max(0, (i < 0 ? a.length - 1 : i) - 1)];
    if (hi.m === m || hi === lo) return [hi.x, hi.y, hi.z];
    const t = (m - lo.m) / (hi.m - lo.m);
    return [lo.x + t * (hi.x - lo.x), lo.y + t * (hi.y - lo.y), lo.z + t * (hi.z - lo.z)];
  }
  const numVal = f => (f && typeof f.value === 'number' && Number.isFinite(f.value)) ? f.value : null;
  function anchor(item, ground) {
    const loc = item.location || item.point;
    let p = null;
    if (loc && Number.isFinite(+loc.xM) && Number.isFinite(+loc.yM)) {
      const r = routePoint(+item.stationM);
      p = [+loc.xM, +loc.yM, numVal(loc.zM) ?? (r ? r[2] : null)];
    } else p = routePoint(+item.stationM);
    if (!p || !p.every(Number.isFinite)) return null;
    const f = item.fields || {};
    const z = ground ? (numVal(f.terrainM) ?? numVal(f.invertM) ?? p[2]) : (numVal(f.invertM) ?? p[2]);
    return [p[0], p[1], z];
  }
  function netShort(x) {
    const f = x.fields || {};
    if (f.existingNetworkMark && f.existingNetworkMark.value) return nb(String(f.existingNetworkMark.value));
    const rid = D.route && D.route.id;
    const other = (x.networks || []).find(n => n && n.id !== rid && n.name);
    if (other) { const q = String(other.name).match(/«([^»]+)»/); return nb(q ? q[1] : other.name); }
    return nb(String(x.title || x.id));
  }
  function buildMarks() {
    const items = [];
    const first = stations[0], last = stations[stations.length - 1];
    for (const x of crossings.values()) {
      const p = anchor(x, false);
      if (p) items.push({ kind: 'x', id: x.id, p, text: netShort(x), prio: 0, state: crossingState(x).state, title: (x.title || x.id) + ' · ' + fmtPk(x.stationM) });
    }
    for (const st of stations) {
      const p = anchor(st, true);
      if (!p) continue;
      const keyNode = (st.nodeIds || []).map(id => nodes.get(id)).find(n => n && KEY_NODE.test(n.kind || ''));
      const name = keyNode ? String(st.title || '').split(' · ').slice(1).join(' · ') : '';
      const prio = keyNode ? 1 : (st === first || st === last) ? 2 : 3;
      items.push({ kind: 's', id: st.id, p, text: fmtPk(st.stationM) + (name ? ' · ' + name : ''), prio, title: st.title || fmtPk(st.stationM) });
    }
    items.sort((a, b) => a.prio - b.prio);
    return items;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function mountMarks() {
    const A = window.__ATLAS, stage = document.querySelector('.stage'), canvas = document.getElementById('canvas');
    if (MK.ready || !A || typeof A.projectToScreen !== 'function' || !stage || !canvas) return false;
    MK.items = buildMarks();
    if (!MK.items.length) return false;
    MK.stage = stage; MK.canvas = canvas; MK.ready = true;
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    MK.svg = document.createElementNS(SVGNS, 'svg');
    MK.svg.setAttribute('class', 'af-mk-svg'); MK.svg.setAttribute('aria-hidden', 'true');
    MK.layer = h('div', { class: 'af-mk-layer', 'aria-label': 'Метки пикетов и пересечений на модели', hidden: !MK.on });
    MK.layer.append(MK.svg);
    for (const it of MK.items) {
      it.el = h('button', { type: 'button', class: 'af-mk af-mk--' + it.kind + (it.kind === 'x' ? ' af-mk--' + it.state : '') + (it.prio <= 1 ? ' af-mk--key' : ''), title: it.title, tabindex: '-1',
        onclick: e => { e.stopPropagation(); if (it.kind === 'x') { const x = crossings.get(it.id); if (x) openCrossing(x, null); } else { const st = stations.find(q => q.id === it.id); if (st) openStation(st); } } }, it.text);
      it.el.style.visibility = 'hidden'; it.hidden = true;
      it.line = document.createElementNS(SVGNS, 'line');
      it.dot = document.createElementNS(SVGNS, 'circle'); it.dot.setAttribute('r', it.kind === 'x' ? '4' : '3');
      it.line.setAttribute('class', 'af-mk-ln af-mk-ln--' + (it.kind === 'x' ? it.state : 's'));
      it.dot.setAttribute('class', 'af-mk-dt af-mk-dt--' + (it.kind === 'x' ? it.state : 's'));
      it.line.style.display = it.dot.style.display = 'none';
      MK.svg.append(it.line, it.dot);
      MK.layer.append(it.el);
    }
    stage.append(MK.layer);
    for (const ev of ['atlas:camera', 'atlas:visibility', 'atlas:section', 'atlas:sceneready', 'atlas:scope', 'atlas:sheet', 'golunderground:state', 'atlas:underground'])
      document.addEventListener(ev, scheduleMarks);
    window.addEventListener('resize', scheduleMarks);
    try { new ResizeObserver(scheduleMarks).observe(stage); } catch (e) { /* */ }
    document.addEventListener('atlas:snapshotpaint', e => { if (MK.on && MK.placed.length) e.detail.add(ctx => paintMarks(ctx)); });
    scheduleMarks();
    return true;
  }
  function scheduleMarks() { if (MK.ready && MK.on && !MK.frame) MK.frame = requestAnimationFrame(layoutMarks); }
  const OBST = '.stage-actions,.tools,.atb-view,.zoom-controls,.card-occl:not([hidden]),.iss-legend,.iss-nav,.measure-panel:not([hidden]),.from-banner:not([hidden])';
  function obstacles(sr) {
    const out = [];
    for (const el of MK.stage.querySelectorAll(OBST)) { const r = el.getBoundingClientRect(); if (r.width && r.height) out.push(r); }
    /* панели объекта поверх холста: видимые дети .stage, кроме холстов и полноэкранных слоёв */
    for (const el of MK.stage.children) {
      if (el === MK.layer || el.tagName === 'CANVAS' || el.matches(OBST)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.width * r.height > 0.4 * sr.width * sr.height) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'static' || cs.pointerEvents === 'none') continue;
      out.push(r);
    }
    return out;
  }
  const hit = (a, b, pad) => a.l < b.right + pad && a.r > b.left - pad && a.t < b.bottom + pad && a.b > b.top - pad;
  const hit2 = (a, b, pad) => a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;
  function layoutMarks() {
    MK.frame = 0;
    if (!MK.on || !MK.ready) return;
    const A = window.__ATLAS, cr = MK.canvas.getBoundingClientRect(), sr = MK.stage.getBoundingClientRect();
    if (!cr.width || !cr.height) return;
    const narrow = window.innerWidth <= 600;
    const obs = obstacles(sr);
    const placed = [], plan = [];
    for (const it of MK.items) {
      if (!it.w) { it.w = it.el.offsetWidth || 60; it.h = it.el.offsetHeight || 22; }
      let q = null;
      try { q = A.projectToScreen(it.p); } catch (e) { q = null; }
      const ok = q && q[2] && q[0] >= cr.left && q[0] <= cr.right && q[1] >= cr.top && q[1] <= cr.bottom && !(narrow && it.prio > 1);
      let spot = null;
      if (ok) {
        const [x, y] = q;
        const cands = it.kind === 'x'
          ? [[14, -40 - it.h], [-14 - it.w, -40 - it.h], [14, 30], [-14 - it.w, 30]]
          : [[-it.w / 2, -24 - it.h], [-it.w / 2, 14], [10, -it.h / 2], [-10 - it.w, -it.h / 2]];
        for (const [dx, dy] of cands) {
          const r = { l: x + dx, t: y + dy, r: x + dx + it.w, b: y + dy + it.h };
          if (r.l < cr.left + 2 || r.r > cr.right - 2 || r.t < cr.top + 2 || r.b > cr.bottom - 2) continue;
          const pad = it.prio >= 3 ? 14 : 4;   /* промежуточные ПК — с запасом, чтобы трасса не превращалась в частокол */
          if (obs.some(o => hit(r, o, 4)) || placed.some(o => hit2(r, o, pad))) continue;
          spot = { r, x, y };
          break;
        }
      }
      if (spot) { placed.push(spot.r); plan.push([it, spot]); } else plan.push([it, null]);
    }
    /* запись — после всех чтений */
    MK.placed = [];
    for (const [it, sp] of plan) {
      if (!sp) { if (!it.hidden) { it.el.style.visibility = 'hidden'; it.line.style.display = it.dot.style.display = 'none'; it.hidden = true; } continue; }
      const lx = sp.r.l - sr.left, ly = sp.r.t - sr.top, ax = sp.x - sr.left, ay = sp.y - sr.top;
      it.el.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(ly) + 'px)';
      if (it.hidden !== false) { it.el.style.visibility = ''; it.line.style.display = it.dot.style.display = ''; it.hidden = false; }
      const ex = Math.min(Math.max(ax, lx + 6), lx + it.w - 6), ey = ay < ly ? ly : ly + it.h;
      it.line.setAttribute('x1', ax.toFixed(1)); it.line.setAttribute('y1', ay.toFixed(1));
      it.line.setAttribute('x2', ex.toFixed(1)); it.line.setAttribute('y2', ey.toFixed(1));
      it.dot.setAttribute('cx', ax.toFixed(1)); it.dot.setAttribute('cy', ay.toFixed(1));
      MK.placed.push({ it, l: sp.r.l - cr.left, t: sp.r.t - cr.top, ax: sp.x - cr.left, ay: sp.y - cr.top, ex: ex + sr.left - cr.left, ey: ey + sr.top - cr.top });
    }
  }
  const MK_COL = { s: ['#0B4F6C', '#FFFFFF', '#0B4F6C'], unchecked: ['#4A5563', '#F0F2F4', '#2E3742'], violation: ['#B3261E', '#FBEAE9', '#8C1D18'], ok: ['#1E7A4C', '#E6F4EC', '#14573A'] };
  function paintMarks(ctx) {
    const font = getComputedStyle(MK.layer.querySelector('.af-mk') || document.body).fontFamily || 'sans-serif';
    for (const m of MK.placed) {
      const [line, bg, fg] = MK_COL[m.it.kind === 'x' ? m.it.state : 's'] || MK_COL.s;
      ctx.strokeStyle = line; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(m.ax, m.ay); ctx.lineTo(m.ex, m.ey); ctx.stroke();
      ctx.fillStyle = line; ctx.beginPath(); ctx.arc(m.ax, m.ay, m.it.kind === 'x' ? 4 : 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = bg; ctx.strokeStyle = line; ctx.lineWidth = 1;
      const w = m.it.w, hh = m.it.h, r = 5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(m.l + .5, m.t + .5, w - 1, hh - 1, r); else ctx.rect(m.l + .5, m.t + .5, w - 1, hh - 1);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = fg; ctx.font = '600 13px ' + font; ctx.textBaseline = 'middle';
      ctx.fillText(m.it.el.textContent, m.l + 7, m.t + hh / 2 + .5);
    }
  }
  function marksToggle() {
    if (!MK.ready) return null;
    const cb = h('input', { type: 'checkbox', id: 'afMarks', checked: MK.on });
    cb.addEventListener('change', () => setMarks(cb.checked));
    return h('label', { class: 'af-toggle', for: 'afMarks' }, cb, h('span', null, 'Метки на модели'));
  }

  /* ---------- старт ---------- */
  function start() {
    const data = window.ATLAS_FIELD;
    if (!data || !Array.isArray(data.stations) || !data.stations.length) return; /* нет данных — нет кнопки */
    prepare(data);
    window.AtlasField = {
      data: D,
      open(pk) {
        if (pk == null) { show(); S.view = 'list'; render(); focusTitle(); return true; }
        const v = typeof pk === 'number' ? pk : Number(String(pk).replace(/^(пк|pk)/i, '').replace(',', '.'));
        let st = stationByPk(v);
        if (!st) { const f = search(String(pk)); if (f && f.length === 1) st = f[0]; }
        if (!st) { show(); S.view = 'list'; S.query = String(pk); render(); return false; }
        openStation(st); return true;
      },
      openCrossing(id) { const x = crossings.get(id); if (!x) return false; openCrossing(x, null); return true; },
      close,
    };
    let tries = 0;
    const tryMount = () => {
      if (document.querySelector('header.atlas-shell .as-tools') || ++tries > 40) { mountButton(); fromQuery(); return; }
      setTimeout(tryMount, 100);
    };
    tryMount();
    const mk = () => { const A = window.__ATLAS; if (A && typeof A.whenReady === 'function') A.whenReady().then(() => { if (mountMarks() && S.open && S.view === 'list') render(); }, () => {}); };
    if (window.__ATLAS) mk(); else document.addEventListener('atlas:ready', mk, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
