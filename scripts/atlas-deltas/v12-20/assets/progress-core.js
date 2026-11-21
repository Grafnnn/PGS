/* 1.0.17 П-1 · AtlasProgress — общая логика «Хода строительства» для вкладки «Ход работ» (atlas-progress.js) и меню PROGRESS.html (progress-page.js).
   Без сети и без движка: хранилище (IndexedDB «atlas:<project_id>:progress»), свёртка журнала на дату, слияние по eid, конфликты, роли,
   ведомость (расчёт), файлы журнала и плана (импорт нескольких файлов, выгрузка), машинные JSON и CSV, книга XLSX (через XlsxLite).
   Форматы — СОСТАВ_1_0_17 §2.1–2.2: событие {eid, t, date, op, id, stage?, batch?, pct?|qty?, unit?, by, role, note?, photo?, src, seq?}.
   Правила: журнал только дописывается; состояние на дату D — свёртка событий с date ≤ D (по date, t, eid); confirm/reject — признак последней отметки;
   величина только с основанием (items.b), «нет объёма» не суммируется как ноль; штуки — всегда. */
'use strict';
window.AtlasProgress = window.AtlasProgress || (() => {
  // пределы и правила сервера PGS (pgs_patch README §3): eid, длины, без управляющих символов (в note можно перевод строки и табуляцию), фото — http(s)
  const QTY_MAX = 999999999999, EID_RE = /^[A-Za-z0-9._:-]{8,80}$/, LIMITS = { id: 300, body: 300, note: 2000, photo: 2000, stage: 120, batch: 80, unit: 32, by: 200, src: 300 };
  const CTRL = /[\u0000-\u001F\u007F]/, CTRL_NOTE = /[\u0000-\u0008\u000B-\u001F\u007F]/;
  const isPhoto = v => { try { const u = new URL(String(v)); return u.protocol === 'http:' || u.protocol === 'https:'; } catch (e) { return false; } };
  const CORE_VERSION = '1.0.20';   // r3, Р-16: «Ядро» в листе «Сведения» — версия этого модуля ядра (на сайте другой отметки версии нет)
  const OPS = ['done', 'partial', 'undo', 'confirm', 'reject'], MARK = new Set(['done', 'partial', 'undo']), CONF = new Set(['confirm', 'reject']);
  const ROLES = ['operator', 'supervisor', 'admin'], EV_ROLES = ['operator', 'supervisor'];   // роли пользователей; в событии журнала — только operator/supervisor (схема progress-journal, К-1)
  const ROLE_LABEL = { operator: 'оператор', supervisor: 'технадзор', admin: 'администратор' };
  // 1.0.19a, Б10: слова интерфейса — «принято / возвращено»; коды событий (confirm, reject) не меняются
  const OP_LABEL = { done: 'выполнено', partial: 'частично', undo: 'снято', confirm: 'принято', reject: 'возвращено' };
  const BASIS = { model: 'модель', source: 'паспорт / пакет', calc: 'расчёт', text: 'текст пакета', count: 'штуки' };
  /* 1.0.18, П-8: признаки надёжности величины (items.f — коды ставит сборка, tools/build/progress_items.py) — для человека по-русски (лист «Ведомость» XLSX);
     неизвестный код — как есть. Коды в данных и в машинных выгрузках не меняются. conditional_extent — «условный габарит», как в карточке элемента. */
  const FLAG_LABEL = { no_quantity: 'объём не задан', conditional_extent: 'условный габарит', gost_5781: 'масса по ГОСТ 5781', partial_geometry: 'геометрия неполная', volume_conditional: 'объём условный', quantity_excluded: 'не входит в объём' };
  const flagText = f => (Array.isArray(f) ? f : f == null || f === '' ? [] : [f]).map(c => Object.prototype.hasOwnProperty.call(FLAG_LABEL, c) ? FLAG_LABEL[c] : String(c)).join(', ');
  const FIELDS = ['eid', 't', 'date', 'op', 'id', 'body', 'stage', 'batch', 'pct', 'qty', 'unit', 'by', 'role', 'note', 'photo', 'src', 'seq'];
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const str = v => typeof v === 'string' ? v.trim() : '';
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const r9 = v => v == null ? null : Math.round(v * 1e9) / 1e9;   // r2, Д6: только шум float, не округление вывода
  const round = (v, k) => v == null ? null : Math.round(v * Math.pow(10, k == null ? 3 : k)) / Math.pow(10, k == null ? 3 : k);
  // 1.0.18, П-4: склонение при числе — plural(n, ['отметку', 'отметки', 'отметок']): 1, 21 — первая форма; 2–4, 22–24 — вторая; 0, 5–20, 11–14 — третья
  const plural = (n, f) => { const a = Math.abs(Math.trunc(Number(n) || 0)), d = a % 10, h = a % 100; return f[d === 1 && h !== 11 ? 0 : d >= 2 && d <= 4 && (h < 12 || h > 14) ? 1 : 2]; };
  /* 1.0.18, П-7: окно PGS — iframe sandbox без allow-same-origin: у документа непрозрачный источник (self.origin 'null'), IndexedDB и localStorage
     бросают SecurityError, запросы к /api/progress уходят без cookie и с Origin: null. Только http(s): у file:// в Chrome источник тоже 'null' — это не окно PGS. */
  const sandboxed = () => { try { return /^https?:$/.test(location.protocol) && String(self.origin) === 'null'; } catch (e) { return false; } };
  // «Открыть в новой вкладке» из окна PGS: allow-popups-to-escape-sandbox делает её обычной вкладкой (свой источник, cookie, IndexedDB)
  // круг 1 (К5): без 'noopener' — иначе window.open всегда null и отказ (нет allow-popups, блокировщик) не виден; новая вкладка — сам атлас, opener безвреден
  const openTab = url => { try { return !!window.open(url || location.href, '_blank'); } catch (e) { return false; } };

  /* ---------- время и идентификаторы ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dateOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => dateOf(new Date());
  // время записи — местное с поясом и миллисекундами (порядок отметки и подтверждения в одну секунду)
  function nowIso(d) { d = d || new Date(); const o = -d.getTimezoneOffset(), s = o >= 0 ? '+' : '-', a = Math.abs(o); return dateOf(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0') + s + pad(Math.floor(a / 60)) + ':' + pad(a % 60); }
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && (() => { const [y, m, d] = s.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d)); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d; })();
  const isTime = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !isNaN(Date.parse(s));
  function addDays(s, k) { const [y, m, d] = s.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d + k)); return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate()); }
  const ruDate = s => isDate(s) ? s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4) : (s || '');
  function uuid() {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* file:// без secure context — ниже */ }
    const b = new Uint8Array(16); crypto.getRandomValues(b); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* ---------- ключ «тело» или «тело::часть» (r2, Р-1) ----------
     Тело определяется по набору тел, не «по последнему ::»: у renderId бывает свой «::» (PREFIX::2911), у ключа части — тоже (<ТИП>::…).
     keyResolver(items, {bodyIds, has}) → {split, isBody, bodies}: (1) items[key].bd — тело части (сборка); (2) точное совпадение с телом; (3) самый длинный
     префикс-тело по «::». Набор тел: body_ids, все bd, ключи items без bd и без префикса-тела, has() (тела data/parts/index.js — AtlasParts.has). Кэш по ключу.
     Нет ни bd, ни body_ids, ни has — прежний разбор (legacy): по последнему «::», если часть похожа на P<n>.<X><n>. */
  const PART_RE = /^P\d+\.[A-Za-z]+\d+$/;
  function keyResolver(items, o) {
    items = items || {}; o = o || {};
    const B = new Set(Array.isArray(o.bodyIds) ? o.bodyIds : []), ext = typeof o.has === 'function' ? o.has : null, cache = new Map();
    for (const k in items) { const v = items[k]; if (v && typeof v.bd === 'string' && v.bd) B.add(v.bd); }
    if (!B.size && !ext) return { legacy: true, bodies: B, split: k => splitKey(k), isBody: k => splitKey(k).part === null };
    const known = k => B.has(k) || (ext ? !!ext(k) : false);
    const pre = k => { for (let i = k.lastIndexOf('::'); i > 0; i = k.lastIndexOf('::', i - 1)) { const b = k.slice(0, i); if (known(b)) return b; } return null; };   // справа налево — первый найденный самый длинный
    for (const k in items) { const v = items[k]; if (!(v && v.bd) && !B.has(k) && !pre(k)) B.add(k); }
    const split = key => {
      key = String(key || ''); let r = cache.get(key); if (r) return r;
      const v = items[key], bd = v && typeof v.bd === 'string' && v.bd && key.startsWith(v.bd + '::') ? v.bd : null;
      if (!bd && known(key)) r = { id: key, part: null };
      else { const b = bd || pre(key); r = b ? { id: b, part: key.slice(b.length + 2) } : { id: key, part: null }; }
      cache.set(key, r); return r;
    };
    return { legacy: false, bodies: B, split, isBody: k => split(k).part === null, known };
  }
  function splitKey(key, isBody) {
    if (isBody && typeof isBody.split === 'function') return isBody.split(key);   // r2: разборщик keyResolver
    key = String(key || '');
    if (isBody && isBody(key)) return { id: key, part: null };
    const i = key.lastIndexOf('::');
    if (i > 0) { const b = key.slice(0, i), p = key.slice(i + 2); if (p && (PART_RE.test(p) || (isBody && isBody(b)))) return { id: b, part: p }; }
    return { id: key, part: null };
  }
  const joinKey = (id, part) => part ? id + '::' + part : id;

  /* ---------- события ---------- */
  // Проверка события. ctx: {today, closedUntil, strictRole} → массив причин (пусто — годно)
  function check(e, ctx) {
    const err = [];
    if (!isObj(e)) return ['не объект'];
    if (typeof e.eid !== 'string' || !EID_RE.test(e.eid)) err.push('eid — 8…80 знаков A-Z a-z 0-9 . _ : -');
    if (!isTime(e.t)) err.push('время записи t не ISO');
    if (!isDate(e.date)) err.push('дата работ не ГГГГ-ММ-ДД');
    else if (isTime(e.t) && e.date > e.t.slice(0, 10)) err.push('дата работ позже даты записи');
    if (!OPS.includes(e.op)) err.push('действие не из ' + OPS.join('/'));
    if (!str(e.id)) err.push('нет id элемента');
    if (!str(e.by)) err.push('нет оператора (by)');
    if (!EV_ROLES.includes(e.role)) err.push('роль события не из ' + EV_ROLES.join('/'));
    if (e.pct != null && (num(e.pct) == null || e.pct < 0 || e.pct > 100)) err.push('pct не число 0…100');
    if (e.qty != null && (num(e.qty) == null || e.qty < 0)) err.push('qty не число ≥ 0');
    else if (e.qty != null && e.qty > QTY_MAX) err.push('qty: больше 999 999 999 999');
    if (e.op === 'partial' && num(e.pct) == null && num(e.qty) == null) err.push('«частично» без % и без объёма');
    if (e.qty != null && !str(e.unit)) err.push('объём без единицы');
    for (const [k, n] of Object.entries(LIMITS)) if (typeof e[k] === 'string' && e[k].length > n) err.push(k + ' длиннее ' + n);
    for (const k of ['eid', 't', 'date', 'id', 'body', 'stage', 'batch', 'unit', 'by', 'photo', 'src']) if (typeof e[k] === 'string' && CTRL.test(e[k])) err.push(k + ': управляющие символы');
    if (typeof e.note === 'string' && CTRL_NOTE.test(e.note)) err.push('note: управляющие символы');
    if (e.photo != null && !isPhoto(e.photo)) err.push('фото — только ссылка http(s)');
    if (e.body != null && (typeof e.body !== 'string' || !e.body || (e.body !== e.id && !String(e.id || '').startsWith(e.body + '::')))) err.push('body: ключ части не начинается с ключа элемента');   // r2, Р-2 (как сервер PGS: body = id или префикс «body::»)
    if (CONF.has(e.op) && e.role !== 'supervisor') err.push('принимать и возвращать работы может только технадзор');
    if (ctx) {
      if (ctx.today && isDate(e.date) && e.date > ctx.today) err.push('дата работ в будущем');
      if (ctx.closedUntil && isDate(e.date) && e.date <= ctx.closedUntil && !str(e.note)) err.push('закрытый период (до ' + ruDate(ctx.closedUntil) + ' включительно): нужно примечание');
    }
    return err;
  }
  // Чистое событие: только поля контракта, строки обрезаны, пустые убраны
  function clean(e, src) {
    const o = {};
    for (const k of FIELDS) { let v = e[k]; if (v == null || v === '') continue; if (typeof v === 'string') { v = v.trim(); if (!v) continue; } o[k] = v; }
    if (!o.src && src) o.src = src;
    return o;
  }
  // Новое событие из интерфейса: op, id, opt {date, pct, qty, unit, stage, batch, note, photo, by, role} → {event} | {errors}
  let lastMs = 0;   // время записи строго растёт внутри страницы: пакет и его отмена в одну миллисекунду не меняются местами
  function make(op, id, opt, ctx) {
    opt = opt || {};
    lastMs = Math.max(Date.now(), lastMs + 1);
    const e = clean({ eid: uuid(), t: nowIso(new Date(lastMs)), date: opt.date || today(), op, id, body: opt.body || (opt.bodyOf ? opt.bodyOf(id) : undefined), stage: opt.stage, batch: opt.batch, pct: op === 'done' ? undefined : opt.pct, qty: op === 'done' ? undefined : opt.qty, unit: opt.qty != null && op !== 'done' ? opt.unit : undefined, by: opt.by, role: opt.role, note: opt.note, photo: opt.photo }, 'browser');
    const errors = check(e, Object.assign({ today: today() }, ctx || {}));
    return errors.length ? { errors } : { event: e };
  }
  // Повтор отклонённой сервером отметки текущей датой и временем (новый eid): «отметка раньше решения технадзора…», «после отметки стоит снятие другого автора…»
  const RETRY_RE = /раньше решения технадзора|снятие другого автора/;
  function retry(e, opt, ctx) { return make(e.op, e.id, Object.assign({}, opt, { date: today(), body: e.body, pct: e.pct, qty: e.qty, unit: e.unit, stage: e.stage, note: e.note, photo: e.photo }), ctx); }
  // Пакет: N событий с общим batch (узел, этап, этаж, рамка); отменяется одним действием (undoBatch).
  // opt.states (свёртка на сегодня) — элементы, уже стоящие в этом состоянии, в пакет не входят (выполненное не перезаписывается)
  /* 1.0.19a, Б2: «частично» не понижает выполненное (готовые пропускаются); отметка и снятие пропускают принятое технадзором (conf = confirmed),
     пока не задано opt.includeConfirmed (явное «снять и принятые» после подтверждения). skipped — сколько пропущено и почему. Формат событий прежний. */
  function makeBatch(op, ids, opt, ctx) {
    const batch = uuid(), out = [], errors = [], S = opt && opt.states, inc = !!(opt && opt.includeConfirmed), skipped = { done: 0, confirmed: 0, none: 0 };
    for (const id of ids) {
      if (S) {
        const s = S.get(id);
        if (MARK.has(op) && s && s.conf === 'confirmed' && !inc) { skipped.confirmed++; continue; }
        if ((op === 'done' || op === 'partial') && s && s.st === 'done') { skipped.done++; continue; }
        if (op === 'undo' && (!s || s.st === 'none')) { skipped.none++; continue; }
      }
      const r = make(op, id, Object.assign({}, opt, { states: undefined, includeConfirmed: undefined, batch, stage: (opt && opt.stageOf) ? opt.stageOf(id) : opt && opt.stage }), ctx); if (r.event) out.push(r.event); else errors.push({ id, errors: r.errors });
    }
    return { batch, events: out, errors, skipped };
  }
  /* 1.0.19a, Б2 (принцип 4): подтверждение по риску, а не по размеру. batchRisk(op, keys, o) → {cases, lower, outside, confirmed, whole, write, skipDone, skipConf}.
     o: {states (свёртка на сегодня), stageOf(key), stage (выбранный этап), whole ('' | 'object' | 'level:<этаж>' — пакет без этапа от 20 элементов на нескольких этажах или на одном, решает интерфейс),
         pct, qty, unit, includeConfirmed}. Пакет (ключей > 1) считается по правилам makeBatch (пропуски), одиночная отметка — как есть.
     Случаи (cases): lower — понижает выполненное (снять отмеченное; частично ниже текущего; частично по готовому элементу — только одиночная);
     outside — элемент вне выбранного этапа; confirmed — снятие или правка принятого технадзором (одиночная — любая отметка, пакет — снятие);
     whole — весь объект или весь этаж без этапа. Пусто — окна нет. */
  function batchRisk(op, keys, o) {
    o = o || {}; keys = keys || [];
    const S = o.states || new Map(), one = keys.length === 1, r = { cases: [], lower: 0, outside: 0, confirmed: 0, whole: o.whole || '', write: 0, skipDone: 0, skipConf: 0, n: keys.length };
    if (!MARK.has(op)) return r;
    const np = num(o.pct), nq = num(o.qty);
    for (const k of keys) {
      const s = S.get(k), conf = !!(s && s.conf === 'confirmed'), st = s ? s.st : 'none';
      if (!one || o.zone) {   // 1.0.20 (W1-7): пакет по зоне («Сегодня») пропускает готовое и принятое и при одном элементе — как makeZoneBatch
        if (conf && !o.includeConfirmed) { r.skipConf++; if (op === 'undo' && st !== 'none') r.confirmed++; continue; }
        if ((op === 'done' || op === 'partial') && st === 'done') { r.skipDone++; continue; }
        if (op === 'undo' && st === 'none') continue;
      }
      r.write++;
      if (conf) r.confirmed++;
      if (op === 'undo' ? st !== 'none' : op === 'partial' && (st === 'done' || (st === 'partial' && ((np != null && s.pct != null && np < s.pct) || (np == null && nq != null && s.qty != null && (!o.unit || s.unit === o.unit) && nq < s.qty))))) r.lower++;
      if (o.stage && o.stageOf) { const sid = o.stageOf(k); if (sid !== o.stage) r.outside++; }
    }
    if (r.lower) r.cases.push('lower');
    if (r.outside) r.cases.push('outside');
    if (r.confirmed) r.cases.push('confirmed');
    if (r.whole && (r.write || r.confirmed)) r.cases.push('whole');
    return r;
  }
  // Отмена пакета: каждому элементу, у которого последняя отметка — из пакета, возвращается прежнее значение (до пакета) той же датой работ;
  // прежней отметки не было — «снято». Новые события с общим batch отмены.
  function undoBatch(events, batch, opt, ctx) {
    const last = new Map(), prev = new Map(), conf = new Map();
    for (const e of sorted(events)) { if (MARK.has(e.op)) { if (e.batch !== batch) prev.set(e.id, e); last.set(e.id, e); } else if (CONF.has(e.op) && e.role === 'supervisor') conf.set(e.id, e); }   // prev — последняя отметка не из пакета (раньше пакетной, если последняя — пакетная); 1.0.18, П-2: решение — только технадзора
    const ub = uuid(), out = [], errors = [];
    for (const [id, e] of last) {
      if (e.batch !== batch || e.op === 'undo') continue;
      const p = prev.get(id), back = p && p.op !== 'undo' ? p : null, c = conf.get(id);
      // после пакета по элементу есть решение технадзора — отмена сегодняшней датой (сервер не примет отметку раньше решения)
      const d = c && cmp(c, e) > 0 ? today() : e.date;
      const r = make(back ? back.op : 'undo', id, Object.assign({}, opt, { date: d, batch: ub, stage: e.stage, body: e.body, pct: back ? back.pct : undefined, qty: back ? back.qty : undefined, unit: back ? back.unit : undefined, note: (opt && opt.note) || 'отмена пакета ' + batch.slice(0, 8) }), ctx);
      if (r.event) out.push(r.event); else errors.push({ id, errors: r.errors });
    }
    return { batch: ub, events: out, errors };
  }
  // порядок: дата работ, время записи (по моменту, не по строке: у операторов бывают разные пояса), eid
  const tms = e => { const v = Date.parse(e.t); return Number.isFinite(v) ? v : 0; };
  const cmp = (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : tms(a) - tms(b) || (a.eid < b.eid ? -1 : a.eid > b.eid ? 1 : 0);
  const sorted = evs => evs.map(e => [e, tms(e)]).sort((x, y) => { const a = x[0], b = y[0]; return a.date < b.date ? -1 : a.date > b.date ? 1 : x[1] - y[1] || (a.eid < b.eid ? -1 : a.eid > b.eid ? 1 : 0); }).map(x => x[0]);
  const sig = e => e.op + '|' + (e.op === 'partial' ? (num(e.pct) != null ? 'p' + e.pct : 'q' + e.qty + (e.unit || '')) : '');

  /* ---------- свёртка ---------- */
  // Состояние элемента: st done|partial|none, pct, qty, unit, last (событие), first (дата первой отметки), conf null|confirmed|rejected, cv (подтверждённое значение)
  function blank(id) { return { id, st: 'none', pct: 0, qty: null, unit: null, last: null, first: null, lastDate: null, conf: null, confBy: null, confDate: null, cv: null, need: false, by: new Set(), n: 0, note: null, photo: null, bad: 0 }; }
  function apply(S, e) {
    let s = S.get(e.id); if (!s) S.set(e.id, s = blank(e.id));
    s.n++;
    if (MARK.has(e.op)) {
      if (e.op === 'undo') { s.st = 'none'; s.pct = 0; s.qty = null; s.unit = null; }
      else { s.st = e.op; s.pct = e.op === 'done' ? 100 : num(e.pct); s.qty = e.op === 'done' ? null : num(e.qty); s.unit = e.op === 'done' ? null : e.unit || null; if (!s.first) s.first = e.date; }
      // r2, Р-4: изменение после решения технадзора — подтверждённое = 0 до нового confirm, «требует подтверждения»
      if (s.conf || s.cv) s.need = true; s.cv = null;
      s.last = e; s.lastDate = e.date; s.conf = null; s.by.add(e.by);
      if (e.note) s.note = e.note; if (e.photo) s.photo = e.photo;
    } else if (CONF.has(e.op)) {
      if (e.role !== 'supervisor') { s.bad++; return s; }   // не технадзор — признак не ставится (на сервере такое событие отклоняется)
      s.wd = e.op === 'reject' && s.conf === 'confirmed';   // 1.0.20: «приёмка снята» — reject сразу после confirm (отметка между ними сбрасывает conf); то же правило, что withdrawnSet
      s.conf = e.op === 'confirm' ? 'confirmed' : 'rejected'; s.confBy = e.by; s.confDate = e.date;
      if (e.op === 'confirm') s.cv = { st: s.st, pct: s.pct, qty: s.qty, unit: s.unit }; else s.cv = null;
      s.need = false;
      if (e.note) s.note = e.note;
    }
    return s;
  }
  // fold(events, date?) → Map id → состояние (date — включительно; нет — все события)
  function fold(events, date) {
    const S = new Map();
    for (const e of sorted(events)) { if (date && e.date > date) break; apply(S, e); }
    return S;
  }

  /* ---------- слияние и конфликты ---------- */
  const same = (a, b) => FIELDS.every(k => k === 'src' || k === 'seq' || JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
  // merge(base, add) → {events, added, dup, clash}: объединение по eid; тот же eid с другим содержимым — clash (остаётся первое)
  function merge(base, add) {
    const by = new Map(), added = [], dup = [], clash = [];
    for (const e of base) by.set(e.eid, e);
    for (const e of add) { const o = by.get(e.eid); if (!o) { by.set(e.eid, e); added.push(e); } else if (same(o, e)) dup.push(e.eid); else clash.push(e.eid); }
    return { events: [...by.values()], added, dup, clash };
  }
  // Конфликт: у одного элемента за одну дату отметки разных операторов с разными значениями.
  // Решён, если позже (по t) по этому элементу есть событие технадзора (новая отметка, подтверждение или отклонение).
  function conflicts(events, date) {
    const G = new Map(), sup = new Map();
    for (const e of events) {
      if (date && e.date > date) continue;
      if (MARK.has(e.op)) { const k = e.id + '\u0001' + e.date; (G.get(k) || G.set(k, []).get(k)).push(e); }
      if (e.role === 'supervisor') { const a = sup.get(e.id) || sup.set(e.id, []).get(e.id); a.push(e); }
    }
    const out = [];
    for (const [k, list] of G) {
      const ops = list.filter(e => e.role === 'operator' || !e.role);
      const who = new Set(ops.map(e => e.by)), vals = new Set(ops.map(sig));
      if (who.size < 2 || vals.size < 2) continue;
      const tmax = ops.reduce((m, e) => Math.max(m, tms(e)), 0);
      const res = sorted((sup.get(list[0].id) || []).filter(e => tms(e) > tmax))[0] || null;
      out.push({ id: list[0].id, date: list[0].date, events: sorted(ops), by: [...who], values: [...vals], resolved: !!res, resolvedBy: res });
    }
    return out.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? -1 : 1);
  }

  /* ---------- роли (без сервера — по имени, без паролей; на сервере by/role ставит сервер) ---------- */
  const can = (role, op) => role === 'operator' ? MARK.has(op) : role === 'supervisor' || role === 'admin' ? OPS.includes(op) : false;
  const canPlan = role => role === 'supervisor' || role === 'admin';

  /* ---------- план ---------- */
  // Действующий план: опубликованный (data/progress_plan.js) или местная правка поверх него (base_rev ≥ rev опубликованного; иначе — устарела)
  function effectivePlan(pub, local) {
    const P = isObj(pub) ? pub : null, L = isObj(local) && Array.isArray(local.stages) ? local : null;
    if (L && (!P || (L.base_rev != null ? L.base_rev >= (P.rev || 0) : (L.rev || 0) >= (P.rev || 0)))) return Object.assign({}, L, { _local: true });
    return P ? Object.assign({}, P, { _local: false, _staleLocal: !!L }) : null;
  }
  const stagesOf = plan => (plan && Array.isArray(plan.stages) ? plan.stages.slice() : []).sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  // r3, Р-12: этап ключа — по полному ключу (в плане бывают ключи частей), затем по телу
  const stageOfKey = (idx, key, isBody) => idx.get(key) || idx.get(splitKey(key, isBody).id) || null;
  function stageIndex(plan) { const M = new Map(); for (const s of stagesOf(plan)) for (const id of s.ids || []) if (!M.has(id)) M.set(id, s); return M; }
  // Проверка плана: E — цикл after, неизвестный предшественник; W — элемент в двух этапах, элемента нет в мире (has), захватка вне этапа
  function planCheck(plan, has) {
    const errors = [], warnings = [], S = stagesOf(plan), byId = new Map(S.map(s => [s.id, s])), seen = new Map();
    for (const s of S) {
      for (const a of s.after || []) if (!byId.has(a)) errors.push({ code: 'after', stage: s.id, msg: 'этап ' + s.id + ': предшественник ' + a + ' не найден' });
      for (const id of s.ids || []) {
        if (seen.has(id)) warnings.push({ code: 'dup', stage: s.id, id, msg: 'элемент ' + id + ' уже в этапе ' + seen.get(id) });
        else seen.set(id, s.id);
        if (has && !has(id)) warnings.push({ code: 'missing', stage: s.id, id, msg: 'элемента ' + id + ' нет в мире' });
      }
      const own = new Set(s.ids || []);
      for (const l of s.lots || []) for (const id of l.ids || []) if (!own.has(id)) warnings.push({ code: 'lot', stage: s.id, id, msg: 'захватка ' + l.id + ': элемент ' + id + ' не в этапе' });
    }
    const st = new Map();   // поиск цикла
    const dfs = id => { st.set(id, 1); for (const a of (byId.get(id) || {}).after || []) { if (!byId.has(a)) continue; if (st.get(a) === 1) return [a, id]; if (!st.get(a)) { const c = dfs(a); if (c) return c; } } st.set(id, 2); return null; };
    for (const s of S) if (!st.get(s.id)) { const c = dfs(s.id); if (c) { errors.push({ code: 'cycle', stage: c[1], msg: 'цикл в порядке: ' + c[1] + ' ↔ ' + c[0] }); break; } }
    return { errors, warnings };
  }
  // Предупреждение о порядке: у этапа есть невыполненные элементы в предшественниках (after) — список {stage, open}
  function orderWarn(plan, states, stageId) {
    const S = stagesOf(plan), byId = new Map(S.map(s => [s.id, s])), st = byId.get(stageId), out = [];
    if (!st) return out;
    for (const a of st.after || []) { const p = byId.get(a); if (!p) continue; const open = (p.ids || []).filter(id => { const s = states.get(id); return !s || s.st !== 'done'; }).length; if (open) out.push({ stage: p.id, title: p.title, open }); }
    return out;
  }
  // 1.0.19a, Б7/Б10: имя этапа для человека — название из плана; нет названия — «этап <n>» (код этапа — только мелко рядом)
  const stageName = s => s ? String(s.title || ('этап ' + (s.n ?? ''))).trim() : '';

  /* ---------- ведомость ---------- */
  const fracOf = (s, q) => !s ? 0 : s.st === 'done' ? 1 : s.st === 'partial' ? (s.pct != null ? s.pct / 100 : s.qty != null && q ? Math.min(1, s.qty / q) : null) : 0;
  // Значение элемента: {pc — доля штуки, v — величина в ед. items (null — нет объёма), vu — единица величины}
  function valueOf(s, it) {
    const q = it && num(it.q), u = it && it.u || null, f = fracOf(s, q);
    if (q != null) return { pc: f == null ? 0 : f, v: f == null ? (s && s.qty != null && s.unit === u ? Math.min(q, s.qty) : 0) : f * q, vu: u };
    // нет объёма: частично объёмом в своей единице — величина есть только у события; в сумму плана не идёт
    return { pc: f == null ? 0 : f, v: s && s.st === 'partial' && s.qty != null ? s.qty : null, vu: s && s.unit || u };
  }
  const confState = s => s && s.cv ? Object.assign({}, s, s.cv) : null;
  const confLabel = s => !s ? 'нет' : s.conf === 'confirmed' ? 'да' : s.conf === 'rejected' ? 'отклонено' : s.need && s.st !== 'none' ? 'требует подтверждения' : 'нет';   // r3, Р-16: «снято» — без «требует подтверждения»
  /* sheet(opt) → {rows, summary, byDay, journal, info, period}
     opt: {items: ATLAS_PROGRESS_ITEMS.items, plan, events, from, to, basis:'all'|'confirmed', meta:{object, release, core, by},
           info(id) → {title, mark, section, rd, level, axes, type_id, pick_id}, isBody(id)} */
  function sheet(opt) {
    const items = (opt && opt.items) || {}, plan = opt.plan, ev = (opt.events || []).filter(e => isObj(e)), to = opt.to || today(), from = opt.from || null;
    const conf = opt.basis === 'confirmed', info = opt.info || (() => ({})), isBody = opt.isBody;
    const partsOf = new Map();   // тело → ключи частей из items
    for (const k of Object.keys(items)) { const x = splitKey(k, isBody); if (x.part) (partsOf.get(x.id) || partsOf.set(x.id, []).get(x.id)).push(k); }
    for (const e of ev) { const x = splitKey(e.id, isBody); if (x.part) { const a = partsOf.get(x.id) || partsOf.set(x.id, []).get(x.id); if (!a.includes(e.id)) a.push(e.id); } }
    /* r2, Р-3: «для КС» — работы с датой работ в периоде, подтверждённые к моменту выгрузки (confirm с t ≤ now, независимо от даты confirm):
       решение технадзора после конца периода переносится на дату работ последней отметки (если та в периоде). */
    /* r3, Р-11: решение технадзора (confirm/reject) оценивается по времени записи t (≤ момента выгрузки), не по дате работ.
       Отметки — с датой работ ≤ конца периода; решение относится к отметке, которая была последней (по date, t) среди записанных до него;
       действует последнее по t решение, относящееся к последней отметке периода. Оно ставится сразу после неё (той же датой работ). */
    // 1.0.20 (волна 1, W1-6): время записи пакета идёт вперёд часов на 1 мс за событие (make: lastMs) — решения этой страницы
    // с t чуть позже Date.now() иначе не видны до следующей перерисовки («Принять все ждущие»)
    const now = opt.now || Math.max(Date.now(), lastMs);
    /* 1.0.18, П-2: решения — только технадзора (role supervisor), как в apply().
       П-6: решение относилось к более ранней отметке периода, после него отметку изменили — ключ в need: метка «требует подтверждения», итог 0 (Р-4) */
    const ks = (end, need) => {
      const marks = new Map(), decs = new Map(), out = [];
      for (const e of sorted(ev)) {
        if (MARK.has(e.op)) { (marks.get(e.id) || marks.set(e.id, []).get(e.id)).push(e); if (e.date <= end) out.push(e); }
        else if (CONF.has(e.op) && e.role === 'supervisor' && tms(e) <= now) (decs.get(e.id) || decs.set(e.id, []).get(e.id)).push(e);
      }
      for (const [id, ds] of decs) {
        const ms = marks.get(id) || [], inP = ms.filter(m => m.date <= end), lastIn = inP[inP.length - 1];
        if (!lastIn) continue;
        let win = null, before = false;
        for (const d of ds) {
          const td = tms(d); let at = null;
          for (const m of ms) if (tms(m) < td) at = m;   // ms — по (date, t): последняя из записанных до решения
          if (at === lastIn && (!win || td > tms(win))) win = d;
          else if (at && at !== lastIn && at.date <= end) before = true;   // решение по более ранней отметке периода
        }
        if (win) { out.push(Object.assign({}, win, { date: lastIn.date })); if (need) decDate.set(id, win.date); }   // 1.0.20 §6.6: «Дата приёмки» — дата решения, не дата работ
        else if (before && need) need.add(id);
      }
      return out;
    };
    const needK = new Set(), decDate = new Map(), evK = conf ? ks(to, needK) : ev;
    const S1 = fold(evK, to), S0 = from ? fold(conf ? ks(addDays(from, -1)) : ev, addDays(from, -1)) : new Map();
    const pick = (S, k) => { const s = S.get(k); return conf ? confState(s) : s; };
    const rows = [], seen = new Set(), stageAt = new Map();   // 1.0.18: Map ключ → этап строки (имя stageOfKey — у общего правила этапа ключа)
    const push = (st, k, ord) => {
      if (seen.has(k)) return; seen.add(k);
      const x = splitKey(k, isBody), it = items[k] || null, I = info(x.id, x.part) || {};
      const s1 = S1.get(k), a1 = valueOf(pick(S1, k), it), a0 = valueOf(pick(S0, k), it), all1 = valueOf(s1, it), cv1 = valueOf(confState(s1), it);
      const q = it ? num(it.q) : null, u = it && it.u || null, cl = confLabel(s1 && needK.has(k) ? Object.assign({}, s1, { need: true }) : s1);   // 1.0.20 §6.6: «Принял» / «Дата приёмки» — только при «да» (правило 1.0.18 Р-11)
      stageAt.set(k, st);
      rows.push({
        key: k, id: x.id, part: x.part, stage: st ? st.id : '', stageTitle: st ? st.title || '' : 'вне порядка', ord,
        section: I.section || (it && it.sec) || '', rd: (it && it.rd) || I.rd || '', level: (it && it.lv) || I.level || '', axes: (it && it.ax) || I.axes || '', mark: (it && it.mk) || I.mark || '', title: I.title || (it && it.nm) || '',
        type_id: I.type_id ?? (it && it.ty) ?? null, pick_id: I.pick_id ?? null,   /* nm / sec / ty — необязательные поля items (сборка К-3); на главной — из движка */
        /* r2, Д6: значения строки — сырые (суммы этапов не копят округление); округляется только вывод */
        pcs: 1, pcsPeriod: r9(a1.pc - a0.pc), pcsTotal: r9(a1.pc),
        unit: q != null ? u : (u || ''), q, basis: q != null ? (BASIS[it.b] || it.b || '') : 'нет объёма',
        period: q != null ? r9(a1.v - a0.v) : (a1.v != null ? r9(a1.v - (a0.v || 0)) : null), total: q != null ? r9(a1.v) : a1.v, totalUnit: q != null ? u : a1.vu,
        rest: q != null ? r9(q - a1.v) : null, pct: q != null && q > 0 ? round(a1.v / q * 100, 1) : round(a1.pc * 100, 1),
        totalConfirmed: q != null ? r9(cv1.v) : r9(cv1.pc), first: s1 && s1.first || null, last: s1 && s1.lastDate || null,
        by: s1 ? [...s1.by].join(', ') : '', confirmed: cl, acceptedBy: cl === 'да' ? s1.confBy || '' : '', acceptedDate: cl === 'да' ? (conf && decDate.get(k)) || s1.confDate || null : null, note: s1 && s1.note || '', flags: it && Array.isArray(it.f) ? it.f.join(', ') : '', flagNames: it && Array.isArray(it.f) ? flagText(it.f) : '',   /* 1.0.18, П-6; П-8: flags — коды, flagNames — по-русски */
        state: s1 ? s1.st : 'none', allTotal: q != null ? r9(all1.v) : null
      });
    };
    for (const st of stagesOf(plan)) {
      const order = [];
      for (const l of st.lots || []) for (const id of l.ids || []) if (!order.includes(id)) order.push(id);
      for (const id of st.ids || []) if (!order.includes(id)) order.push(id);
      let n = 0;
      for (const id of order) { const ps = partsOf.get(id); if (ps && ps.length) ps.slice().sort().forEach(k => push(st, k, ++n)); else push(st, id, ++n); }
    }
    // вне порядка — только элементы с отметками (иначе ведомость = весь мир)
    let n = 0; const outside = [...S1.keys()].filter(k => !seen.has(k)).sort();
    for (const k of outside) { const x = splitKey(k, isBody); if (seen.has(x.id) && !x.part) continue; push(null, k, ++n); }
    rows.forEach((r, i) => { r.n = i + 1; });
    // сводка: этап × единица (штуки — у всех этапов)
    const sum = new Map(), add = (st, u, f) => { const k = (st || '') + '\u0001' + u; let o = sum.get(k); if (!o) sum.set(k, o = { stage: st, unit: u, plan: 0, period: 0, total: 0, totalConfirmed: 0, noVol: 0, n: 0 }); f(o); };
    for (const r of rows) {
      add(r.stage, 'шт', o => { o.plan += 1; o.period += r.pcsPeriod; o.total += r.pcsTotal; o.n++; o.totalConfirmed += r.q != null ? 0 : r.totalConfirmed || 0; });
      if (r.q != null && r.unit && r.unit !== 'шт') add(r.stage, r.unit, o => { o.plan += r.q; o.period += r.period || 0; o.total += r.total || 0; o.totalConfirmed += r.totalConfirmed || 0; o.n++; });
      else if (r.q == null) add(r.stage, 'шт', o => { o.noVol++; });
    }
    // штуки подтверждённые — отдельно (у строк с величиной totalConfirmed — в её единице)
    for (const r of rows) if (r.q != null) { const s = S1.get(r.key), c = valueOf(confState(s), items[r.key]); add(r.stage, 'шт', o => { o.totalConfirmed += c.pc; }); }
    const stTitle = new Map(stagesOf(plan).map(s => [s.id, s.title || '']));
    const summary = [...sum.values()].map(o => ({ stage: o.stage || '', title: o.stage ? stTitle.get(o.stage) || '' : 'вне порядка', unit: o.unit, plan: r9(o.plan), period: r9(o.period), total: r9(o.total), pct: o.plan ? round(o.total / o.plan * 100, 1) : null, totalConfirmed: r9(o.totalConfirmed), noVol: o.unit === 'шт' ? o.noVol : null, n: o.n }));
    // по дням: дата × этап × единица — выполнено за день (разница значений на конец дня)
    const byDay = [], D = new Map(), prev = new Map(), S = new Map(), list = sorted(evK).filter(e => e.date <= to);
    const val = k => { const s = S.get(k); return valueOf(conf ? confState(s) : s, items[k]); };
    let day = null, touched = new Set();
    const close = () => {
      if (!day || (from && day < from)) { for (const k of touched) prev.set(k, val(k)); touched = new Set(); return; }
      for (const k of touched) {
        const a = prev.get(k) || valueOf(null, items[k]), b = val(k), st = stageAt.get(k), sid = st ? st.id : '', it = items[k], u = it && num(it.q) != null ? it.u : null;
        const kk = day + '\u0001' + sid; let o = D.get(kk); if (!o) D.set(kk, o = { date: day, stage: sid, title: st ? st.title || '' : 'вне порядка', pcs: 0, vol: new Map(), keys: [] });
        o.pcs += b.pc - a.pc; if (u && u !== 'шт') o.vol.set(u, (o.vol.get(u) || 0) + (b.v || 0) - (a.v || 0)); o.keys.push({ key: k, a, b, u });
        prev.set(k, b);
      }
      touched = new Set();
    };
    for (const e of list) { if (e.date !== day) { close(); day = e.date; } apply(S, e); touched.add(e.id); }
    close();
    for (const o of D.values()) {
      byDay.push({ date: o.date, stage: o.stage, title: o.title, unit: 'шт', qty: r9(o.pcs), keys: o.keys });
      for (const [u, v] of o.vol) byDay.push({ date: o.date, stage: o.stage, title: o.title, unit: u, qty: r9(v), keys: o.keys });
    }
    byDay.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : a.unit === 'шт' ? -1 : 1);
    const journal = sorted(ev).filter(e => (!from || e.date >= from) && e.date <= to);
    // 1.0.18, П-3: этап события в листе «Журнал» — e.stage, иначе по ключу тем же правилом, что журнал на странице (полный ключ части, затем тело)
    const jIdx = stageIndex(plan), stageOfEvent = e => e.stage || (stageOfKey(jIdx, e.id, isBody) || {}).id || '';
    const m = opt.meta || {};
    const info0 = [
      ['Объект', m.object || ''], ['Код объекта (project_id)', m.project_id || ''], ['Выпуск', m.release || ''], ['Ядро', m.core || CORE_VERSION],
      ['План работ', plan ? (plan.plan_id || '') + ' · ревизия ' + (plan.rev ?? '—') + ' · ' + (plan.status === 'approved' ? 'утверждён' : 'черновик') + (plan._local ? ' (местная правка)' : '') : 'плана нет'],
      ['Период', (from ? ruDate(from) : 'с начала') + ' — ' + ruDate(to)], ['Итог считается', conf ? 'по подтверждённым технадзором отметкам (для КС)' : 'по всем отметкам'],
      ['Дата выгрузки', ruDate(today()) + (conf ? ' (подтверждения учтены по этот момент)' : '')], ['Выгрузил', m.by || ''],
      ['Оговорка', 'Рабочий документ атласа, не исполнительная документация. Объёмы — по модели или источнику, основание указано в каждой строке («расчёт» — масса по ГОСТ). «нет объёма» — величины в данных нет, в суммы не входит. Код позиции сметы не заполняется: сметных позиций в данных нет.'],
      ['Строк ведомости', rows.length], ['Событий журнала за период', journal.length]
    ];
    return { rows, summary, byDay, journal, info: info0, period: { from, to }, basis: conf ? 'confirmed' : 'all', stageOf: stageOfEvent };
  }
  /* 1.0.19a, Б8: «Ведомость объёмов для КС (черновик)» — вид «Только отмеченные». Строки ведомости R.rows и R.summary не меняются (JSON для PGS и CSV — прежние).
     isMarked(row) — у элемента есть отметка с датой работ ≤ конца периода и она не снята (состояние не «нет»), либо есть величина за период
     или принятый объём (круг 2, B-02: снятая отметка без величин — не отмеченная; прежде считалась по дате последней отметки, в том числе снятия).
     markedRows(R) — строки вида «Только отмеченные»: isMarked; если у периода есть начало (R.period.from) — только строки с величиной за период
     (круг 2: «Этот месяц» не показывает элементы, отмеченные раньше, с нулём за период; без начала периода — нарастающим итогом, как прежде).
     круг 4: с началом периода — только с положительной величиной за период (снятая или уменьшенная в периоде отметка — не «отмеченная»);
     «Принятые (для КС)» (R.basis 'confirmed') без начала периода — только строки с принятым объёмом или штуками (без них — нули «Принято: нет»).
     summaryKS(R) — сводка этап × единица: каждая строка — в своей единице (с объёмом — в ней; «шт» и без объёма — в штуках), без сложения в «шт» элементов,
     у которых есть объём в другой единице; показываются только этапы, у которых есть строки markedRows. Формат строки — как у R.summary. */
  const isMarked = r => !!(r && r.last && (r.state !== 'none' || r.period || r.pcsPeriod || r.totalConfirmed));
  const markedOf = R => { const from = R && R.period && R.period.from, conf = R && R.basis === 'confirmed'; return r => isMarked(r) && (from ? r.period > 0 || r.pcsPeriod > 0 : !conf || r.totalConfirmed > 0 || r.pcsTotal > 0); };
  const markedRows = R => ((R && R.rows) || []).filter(markedOf(R));
  function summaryKS(R) {
    const sum = new Map(), live = new Set(), isM = markedOf(R), get =(st, u) => { const k = (st || '') + '\u0001' + u; let o = sum.get(k); if (!o) sum.set(k, o = { stage: st, unit: u, plan: 0, period: 0, total: 0, totalConfirmed: 0, noVol: 0, n: 0 }); return o; };
    for (const r of (R && R.rows) || []) {
      const vol = r.q != null && r.unit && r.unit !== 'шт', u = vol ? r.unit : 'шт', o = get(r.stage, u);
      o.n++;
      if (r.q != null) { o.plan += r.q; o.period += r.period || 0; o.total += r.total || 0; o.totalConfirmed += r.totalConfirmed || 0; }
      else { o.plan += 1; o.period += r.pcsPeriod || 0; o.total += r.pcsTotal || 0; o.totalConfirmed += r.totalConfirmed || 0; o.noVol++; }
      if (isM(r)) live.add(r.stage || '');
    }
    const stTitle = new Map(((R && R.summary) || []).map(s => [s.stage, s.title]));
    return [...sum.values()].filter(o => live.has(o.stage || '')).map(o => ({ stage: o.stage || '', title: stTitle.has(o.stage || '') ? stTitle.get(o.stage || '') : (o.stage ? '' : 'вне порядка'), unit: o.unit, plan: r9(o.plan), period: r9(o.period), total: r9(o.total), pct: o.plan ? round(o.total / o.plan * 100, 1) : null, totalConfirmed: r9(o.totalConfirmed), noVol: o.unit === 'шт' ? o.noVol : null, n: o.n }));
  }
  /* 1.0.19a, Б8: готовые периоды для ведомости — periodOf('month' | 'prev' | 'quarter', сегодня) → {from, to}; «этот месяц» и «квартал» — по сегодня
     (дата работ в будущем недоступна), «прошлый» — весь прошлый месяц (29.02 в високосный год). */
  function periodOf(kind, d) {
    d = isDate(d) ? d : today();
    const y = +d.slice(0, 4), m = +d.slice(5, 7), first = (Y, M) => Y + '-' + pad(M) + '-01', last = (Y, M) => addDays(M === 12 ? (Y + 1) + '-01-01' : Y + '-' + pad(M + 1) + '-01', -1);
    if (kind === 'month') return { from: first(y, m), to: d };
    if (kind === 'prev') { const Y = m === 1 ? y - 1 : y, M = m === 1 ? 12 : m - 1; return { from: first(Y, M), to: last(Y, M) }; }
    if (kind === 'quarter') return { from: first(y, Math.floor((m - 1) / 3) * 3 + 1), to: d };
    return null;
  }

  /* ---------- выгрузки ---------- */
  const COLS = {
    sheet: [['№', 6, 'i'], ['Код этапа', 10], ['Этап', 24], ['Порядок', 8, 'i'], ['Раздел', 18], ['Раздел РД', 10], ['Этаж', 8], ['Оси', 10], ['ID элемента', 28], ['Марка / позиция', 14], ['Наименование', 36, 'w'],
      ['Шт, план', 8, 'i'], ['Шт, за период', 10, 'n'], ['Шт, нарастающим', 10, 'n'], ['Ед.', 6], ['Объём по модели', 12, 'n'], ['Основание объёма', 14], ['За период', 11, 'n'], ['Нарастающим итогом', 12, 'n'], ['Остаток', 11, 'n'], ['%', 7, 'p1'],
      ['Первая отметка', 11, 'd'], ['Последняя отметка', 11, 'd'], ['Оператор(ы)', 18], ['Подтверждено', 12], ['Нарастающим, подтверждено', 13, 'n'], ['Признаки надёжности', 18], ['Примечание', 24, 'w'], ['Код позиции сметы', 14]],
    accept: [['Принял', 18], ['Дата приёмки', 11, 'd']],   // 1.0.20 §6.6 — только при opt.accept, в конце листа «Ведомость»
    summary: [['Код этапа', 10], ['Этап', 28], ['Ед.', 6], ['План', 12, 'n'], ['За период', 12, 'n'], ['Нарастающим итогом', 13, 'n'], ['%', 7, 'p1'], ['Нарастающим, подтверждено', 13, 'n'], ['Без объёма, шт', 10, 'i']],
    byDay: [['Дата', 11, 'd'], ['Код этапа', 10], ['Этап', 28], ['Ед.', 6], ['Выполнено за день', 13, 'n']],
    journal: [['eid', 36], ['Дата работ', 11, 'd'], ['Время записи', 16, 'dt'], ['Оператор', 18], ['Роль', 12], ['Действие', 12], ['Элемент', 30], ['Этап', 8], ['Пакет', 10], ['%', 7, 'p1'], ['Кол-во', 10, 'n'], ['Ед.', 6], ['Примечание', 28, 'w'], ['Фото', 24], ['Источник', 18]]
  };
  const cols = k => COLS[k].map(([title, width, type]) => ({ title, width, type: type || 's' }));
  /* workbook(R, opt) — opt.rows: 'all' (по умолчанию — книга 1.0.18) | 'marked' (1.0.19a, Б8: «Только отмеченные» — в листе «Ведомость» только отмеченные строки,
     «Сводка» — summaryKS; круг 2: строки — markedRows, с началом периода — только с величиной за период). Имена листов и порядок колонок — прежние. */
  /* 1.0.20 §6.6 + §14 (b5): opt.accept (страница — при modesOn()) — в конце «Ведомости» колонки «Принял», «Дата приёмки»; «Код позиции сметы» — code позиций снимка сметы
     по карте для этапа строки (несколько — «; »), без снимка и карты или этапа нет в карте — «не сопоставлено»; в «Сведениях» — строка «Позиции сметы» (weightsLabel).
     Снимок и карта — opt.estimate / opt.costMap, если ключей нет — window.ATLAS_PROGRESS_ESTIMATE / ATLAS_PROGRESS_COST_MAP. Без opt.accept книга = 1.0.19. */
  const NO_EST = 'не сопоставлено';
  const OGOV_EST = 'Код позиции сметы не заполняется: сметных позиций в данных нет.';
  function workbook(R, opt) {
    const marked = !!(opt && opt.rows === 'marked'), rowsW = marked ? markedRows(R) : R.rows, sumW = marked ? summaryKS(R) : R.summary, acc = !!(opt && opt.accept);
    const cm = acc ? ('costMap' in opt || 'estimate' in opt ? costMapOf(opt.costMap, opt.estimate) : costMapOf()) : null, codes = cm ? estimateCodes(cm.map, cm.est) : null;
    const codeOf = r => !acc ? '' : codes && r.stage && codes.has(r.stage) ? codes.get(r.stage).join('; ') : NO_EST;
    const info1 = !acc ? R.info : (() => { const a = R.info.map(([k, v]) => k === 'Оговорка' && typeof v === 'string' ? [k, v.replace(OGOV_EST, 'Код позиции сметы — по карте соответствия смете (строка «Позиции сметы»); этап без карты — «' + NO_EST + '».')] : [k, v]), at = a.findIndex(([k]) => k === 'Строк ведомости');
      a.splice(at < 0 ? a.length : at, 0, ['Позиции сметы', weightsLabel(cm.map, cm.est)]); return a; })();
    const info = marked ? info1.map(([a, b]) => a === 'Строк ведомости' ? [a, rowsW.length + ' — только ' + (R.basis === 'confirmed' ? 'принятые' : 'отмеченные') + ' элементы' + (R.period && R.period.from ? ' с величиной за период' : '') + ' (всего строк в плане и вне порядка: ' + R.rows.length + ')'] : [a, b]) : info1;
    return [
      { name: 'Сведения', cols: [{ title: 'Параметр', width: 28 }, { title: 'Значение', width: 90, type: 'w' }], rows: info.map(([a, b]) => [a, typeof b === 'number' ? String(b) : b]), filter: false },
      { name: 'Ведомость', cols: acc ? cols('sheet').concat(cols('accept')) : cols('sheet'), rows: rowsW.map(r => { const a = [r.n, r.stage, r.stageTitle, r.ord, r.section, r.rd, r.level, r.axes, r.key, r.mark, r.title, r.pcs, r.pcsPeriod, r.pcsTotal, r.q != null ? r.unit : 'шт', r.q != null ? r.q : 'нет объёма', r.basis, r.period, r.total, r.rest, r.pct, r.first, r.last, r.by, r.confirmed, r.totalConfirmed, r.flagNames, r.note, codeOf(r)]; if (acc) a.push(r.acceptedBy || '', r.acceptedDate || null); return a; }) },   // 1.0.18, П-8: признаки надёжности — по-русски
      { name: 'Сводка', cols: cols('summary'), rows: sumW.map(s => [s.stage, s.title, s.unit, s.plan, s.period, s.total, s.pct, s.totalConfirmed, s.noVol]) },
      { name: 'По дням', cols: cols('byDay'), rows: R.byDay.map(d => [d.date, d.stage, d.title, d.unit, d.qty]) },
      { name: 'Журнал', cols: cols('journal'), rows: R.journal.map(e => [e.eid, e.date, e.t, e.by, ROLE_LABEL[e.role] || e.role, OP_LABEL[e.op] || e.op, e.id, R.stageOf ? R.stageOf(e) : e.stage || '', e.batch ? e.batch.slice(0, 8) : '', num(e.pct), num(e.qty), e.unit || '', e.note || '', e.photo || '', e.src || '']) }   // 1.0.18, П-3
    ];
  }
  const safe = s => String(s || '').replace(/[\\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'объект';
  const periodName = R => (R.period.from ? R.period.from + '_' : '') + R.period.to;
  // 1.0.19a, Б8: заголовок книги — «Ведомость объёмов для КС (черновик)»; имя файла прежнее; opt.rows — как у workbook
  async function xlsx(R, meta, opt) {
    if (!window.XlsxLite) throw new Error('нет xlsx-lite.js');
    const bytes = await XlsxLite.build(workbook(R, opt), { title: 'Ведомость объёмов для КС (черновик) · ' + ((meta && meta.object) || '') });
    return { name: 'Ведомость_ход_работ_' + safe(meta && (meta.short || meta.object || meta.project_id)) + '_' + periodName(R) + (R.basis === 'confirmed' ? '_подтверждённые' : '') + '.xlsx', bytes, type: XlsxLite.MIME };
  }
  // Машинный JSON для PGS: стабильные ID (renderId, pickId, type_id, partKey)
  function machineJson(R, meta, plan) {
    const o = { schema: 1, kind: 'atlas-progress-sheet', project_id: meta && meta.project_id || null, release: meta && meta.release || null, plan_rev: plan ? plan.rev ?? null : null, plan_status: plan ? plan.status || null : null, period: R.period, basis: R.basis, generated: nowIso(),
      items: R.rows.map(r => ({ element_id: r.id, part_key: r.part, pick_id: r.pick_id, type_id: r.type_id, stage_id: r.stage || null, unit: r.q != null ? r.unit : null, qty_plan: r.q, basis: r.q != null ? r.basis : 'нет объёма', pcs_period: r.pcsPeriod, pcs_total: r.pcsTotal, qty_period: r.q != null ? r.period : null, qty_total: r.q != null ? r.total : null, pct: r.pct, confirmed: r.confirmed, qty_total_confirmed: r.q != null ? r.totalConfirmed : null, operators: r.by, estimate_code: null })),
      events: R.journal };
    return { name: safe(meta && (meta.project_id || meta.short)) + '_progress_' + periodName(R) + '.json', text: JSON.stringify(o, null, 1), type: 'application/json' };
  }
  // CSV (UTF-8 с BOM, «;»): по элементу и дню — date; element_id; type_id; stage_id; unit; qty_day; qty_total; pct; basis; operator; confirmed; estimate_code
  function csv(R, items, events) {
    const q = v => { let s = v == null ? '' : String(v); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };   // = + - @ в начале строки — апостроф (формулы в Excel)
    const rowBy = new Map(R.rows.map(r => [r.key, r])), byKeyDay = new Map();
    for (const e of events || []) if (MARK.has(e.op)) { const k = e.id + '\u0001' + e.date; (byKeyDay.get(k) || byKeyDay.set(k, new Set()).get(k)).add(e.by); }
    const lines = ['date;element_id;type_id;stage_id;unit;qty_day;qty_total;pct;basis;operator;confirmed;estimate_code'];
    for (const d of R.byDay) for (const x of d.keys || []) {
      const r = rowBy.get(x.key); if (!r) continue;
      // строка элемента — один раз за день: в своей единице величины, без величины — в штуках
      if (x.u && x.u !== 'шт' ? d.unit !== x.u : d.unit !== 'шт') continue;
      const u = x.u || 'шт', day = x.u ? (x.b.v || 0) - (x.a.v || 0) : x.b.pc - x.a.pc;
      const it = items && items[x.key], qq = it && num(it.q);
      lines.push([d.date, x.key, r.type_id ?? '', r.stage, u, round(day, 6), round(x.u ? x.b.v : x.b.pc, 6), qq ? round((x.b.v || 0) / qq * 100, 1) : round(x.b.pc * 100, 1), r.basis, [...(byKeyDay.get(x.key + '\u0001' + d.date) || [])].join(', '), r.confirmed, ''].map(q).join(';'));
    }
    return { name: 'progress_' + periodName(R) + '.csv', text: '﻿' + lines.join('\r\n') + '\r\n', type: 'text/csv;charset=utf-8' };
  }

  /* ---------- файлы журнала и плана ---------- */
  const stripLocal = e => { const o = {}; for (const k of FIELDS) if (e[k] != null) o[k] = e[k]; return o; };
  function journalFile(events, meta) {
    const by = meta && meta.by || 'оператор', d = today();
    const o = { schema: 1, project_id: meta && meta.project_id || null, as_of: nowIso(), source: 'files', exported_by: by, events: sorted(events).map(stripLocal) };
    return { name: safe(meta && meta.project_id) + '_progress_' + safe(by) + '_' + d + '.json', text: JSON.stringify(o, null, 1), type: 'application/json' };
  }
  function planFile(plan, meta) {
    const o = Object.assign({}, plan); delete o._local; delete o._staleLocal;
    return { name: safe(meta && meta.project_id) + '_plan_r' + (o.rev ?? 0) + '.json', text: JSON.stringify(o, null, 1), type: 'application/json' };
  }
  // Разбор файла: JSON журнала ({events}), массив событий, JS-срез «window.ATLAS_PROGRESS_JOURNAL = …» или план ({stages}) → {kind, events|plan, errors, skipped}
  function parseFile(text, name, opt) {
    const res = { name, kind: null, events: [], plan: null, errors: [], skipped: 0, project_id: null };
    let t = String(text || '').replace(/^﻿/, '').trim();
    const m = /^(?:window\.)?ATLAS_PROGRESS_(?:JOURNAL|PLAN)\s*=\s*([\s\S]*?);?\s*$/.exec(t); if (m) t = m[1];
    let o; try { o = JSON.parse(t); } catch (e) { res.errors.push('не JSON: ' + e.message); return res; }
    if (isObj(o) && Array.isArray(o.stages)) { res.kind = 'plan'; res.plan = o; res.project_id = o.project_id || null; return res; }
    const list = Array.isArray(o) ? o : isObj(o) && Array.isArray(o.events) ? o.events : null;
    if (!list) { res.errors.push('нет списка events'); return res; }
    res.kind = 'journal'; res.project_id = isObj(o) ? o.project_id || null : null;
    if (opt && opt.project_id && res.project_id && res.project_id !== opt.project_id) { res.errors.push('файл другого объекта: ' + res.project_id); return res; }
    for (const e of list) { const c = clean(isObj(e) ? e : {}, name); if (!c.src || c.src === 'browser') c.src = name;   /* источник импорта — имя файла */ const why = check(c); if (why.length) { res.skipped++; if (res.errors.length < 20) res.errors.push((c.eid || '?').slice(0, 8) + ': ' + why.join('; ')); } else res.events.push(c); }
    return res;
  }
  async function readFiles(files, opt) {
    const out = [];
    for (const f of [...(files || [])]) { try { out.push(parseFile(await f.text(), f.name, opt)); } catch (e) { out.push({ name: f.name, kind: null, events: [], errors: ['не прочитан: ' + e.message], skipped: 0 }); } }
    return out;
  }
  function save(file) {
    const blob = file.bytes ? new Blob([file.bytes], { type: file.type }) : new Blob([file.text], { type: file.type || 'application/octet-stream' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = file.name; a.rel = 'noopener'; a.style.display = 'none'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  /* 1.0.19a, Б5: «Конец смены» — один путь для панели «Ход работ» и PROGRESS. saveJournal(store, meta) — файл журнала, как в 1.0.18 (journalFile: все события
     этого браузера), скачивание и пометка «сохранено в файл» → {n, name, markErr}; n 0 — отметок нет, файла нет.
     shareJournal(store, meta) — тот же файл через окно «Поделиться» (navigator.share с файлом), где браузер это умеет (canShareFiles());
     после отправки — пометка «сохранено в файл»; отказ человека (AbortError) — {cancelled}. */
  async function saveJournal(store, meta) {
    const ev = await store.events();
    if (!ev.length) return { n: 0 };
    const f = journalFile(ev, meta); save(f);
    let markErr = null; try { await store.markSaved(ev.map(e => e.eid)); } catch (e) { markErr = e; }
    return { n: ev.length, name: f.name, markErr };
  }
  const shareFile = f => { try { return new File([f.text], f.name, { type: f.type }); } catch (e) { return null; } };
  function canShareFiles() {
    try { const x = shareFile({ text: '{}', name: 'journal' + '.json', type: 'application/json' });   /* имя пробного файла — склейкой: проверка комплекта ищет пути к файлам в строках */ return !!(x && typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [x] })); } catch (e) { return false; }
  }
  async function shareJournal(store, meta) {
    const ev = await store.events();
    if (!ev.length) return { n: 0 };
    const f = journalFile(ev, meta), x = shareFile(f);
    if (!x || !canShareFiles() || !navigator.canShare({ files: [x] })) return { n: ev.length, unsupported: true };
    try { await navigator.share({ files: [x], title: f.name }); } catch (e) { return { n: ev.length, name: f.name, cancelled: e && e.name === 'AbortError', error: e && e.name !== 'AbortError' ? e : null }; }
    let markErr = null; try { await store.markSaved(ev.map(e => e.eid)); } catch (e) { markErr = e; }
    return { n: ev.length, name: f.name, shared: true, markErr };
  }

  /* ---------- хранилище: IndexedDB «atlas:<project_id>:progress» (events — по eid; kv — план, пользователь, закрытый период, seq сервера) ----------
     Нет IndexedDB (приватное окно, запрет) — память страницы: store.memory = true, интерфейс предупреждает. Вкладки — через BroadcastChannel того же имени. */
  const dbName = pid => 'atlas:' + (pid || 'unknown') + ':progress';
  const req = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  function idbOpen(name) {
    return new Promise((ok, no) => {
      let r; try { r = indexedDB.open(name, 1); } catch (e) { return no(e); }
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'eid' }); if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
      r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); r.onblocked = () => no(new Error('база занята другой вкладкой'));
    });
  }
  async function openStore(pid) {
    const name = dbName(pid), subs = new Set();
    let cache = null; const keep = recs => { if (cache) for (const r of recs) cache.set(r.eid, r); };
    // круг 1 (К10): записи add(), чья транзакция ещё идёт (eid → запись); add() видит их как уже записанные, после успеха или сбоя транзакции — убираются
    const writing = new Map(), unwrite = recs => { for (const r of recs) if (writing.get(r.eid) === r) writing.delete(r.eid); };
    let bc = null; try { bc = new BroadcastChannel(name); bc.onmessage = m => { if (m.data && m.data.k === 'events') cache = null; subs.forEach(f => { try { f(m.data || {}); } catch (e) { /* подписчик */ } }); }; } catch (e) { bc = null; }   // чужая вкладка изменила журнал — кэш сбрасывается
    const tell = k => { try { bc && bc.postMessage({ k }); } catch (e) { /* закрыт */ } subs.forEach(f => { try { f({ k, local: true }); } catch (e) { /* подписчик */ } }); };
    let db = null, mem = null;
    try { db = await idbOpen(name); } catch (e) { mem = { events: new Map(), kv: new Map(), why: String(e && e.message || e) }; }
    const tx = (st, mode) => db.transaction(st, mode).objectStore(st);
    /* 1.0.18, П-5: запись событий — кэш журнала в памяти обновляется только после завершения транзакции (oncomplete);
       сбой или отмена (квота, запрет) — исключение, кэш и уведомления не меняются, событие не уходит в очередь отправки */
    /* круг 4 (Н3-3): правка уже записанных — чтение и запись в одной транзакции readwrite (get → правка → put). У PROGRESS и вкладки модели свои кэш и очередь,
       а транзакции readwrite одной базы браузер выполняет по одной: устаревший кэш другой вкладки не затирает её _saved, _sync, by, seq.
       writeTx(puts, edits) → записанные записи: puts — новые записи целиком; edits — Map eid → правка(запись из базы | undefined) → запись | null (не менять) */
    const writeTx = (puts, edits) => {
      const out = [];
      if (mem) { for (const r of puts) { mem.events.set(r.eid, r); out.push(r); } for (const [k, f] of edits) { const r = f(mem.events.get(k)); if (r) { mem.events.set(k, r); out.push(r); } } return Promise.resolve(out); }
      return new Promise((ok, no) => {
        let err = null; const fail = t => no(err || t.error || new Error('запись в хранилище браузера не удалась'));
        let t; try {
          t = db.transaction('events', 'readwrite'); const s = t.objectStore('events');
          for (const r of puts) { s.put(r); out.push(r); }
          for (const [k, f] of edits) { const g = s.get(k); g.onsuccess = () => { try { const r = f(g.result); if (r) { s.put(r); out.push(r); } } catch (e) { err = e; try { t.abort(); } catch (x) { /* уже отменена */ } } }; }   // исключение в правке или put — отмена транзакции, причина — это исключение
        } catch (e) { try { t && t.abort(); } catch (x) { /* уже отменена */ } no(e); return; }
        t.oncomplete = () => ok(out); t.onerror = () => fail(t); t.onabort = () => fail(t);
      });
    };
    /* круг 3 (П2): очередь записей журнала — add, mark и update (чтение-правка-запись) идут по одной, в порядке вызова; следующая начинается после
       завершения транзакции предыдущей (успех или сбой), поэтому параллельные markSaved и update одного eid не теряют _saved, _sync, by, seq; кэш = база */
    let wq = Promise.resolve();
    const serial = f => { const p = wq.then(f); wq = p.then(() => {}, () => {}); return p; };
    const S = {
      pid, name, memory: !!mem, memoryWhy: mem ? mem.why : null,
      // r3, Р-16: журнал — кэш в памяти (одно чтение IndexedDB; записи этой вкладки обновляют кэш, чужие — сбрасывают)
      async all() { if (!cache) { const a = mem ? [...mem.events.values()] : await req(tx('events', 'readonly').getAll()); cache = new Map(a.map(e => [e.eid, e])); } return [...cache.values()]; },
      async events() { return (await S.all()).map(stripLocal); },
      /* add(events, how) → {added, dup, clash}; how: {saved (из файла — уже в файле), synced (от сервера), src, user (автор очереди), nc}
         круг 3 (К2): nc — отметка от имени последнего пользователя PGS, когда сервер не подтвердил вход (служебное поле _nc: 1, в событие не входит) */
      add(evs, how) { return serial(() => add1(evs, how)); },
      mark(eids, field) { return serial(() => mark1(eids, field)); },
      markSaved: eids => S.mark(eids, '_saved'), markSynced: eids => S.mark(eids, '_sync'),
      async unsaved() { return (await S.all()).filter(e => !e._saved && !e._sync).length; },
      async unsynced() { return (await S.all()).filter(e => !e._sync); },   // с служебными полями (_imp — импорт из файла)
      // события для свёртки и списков: без отклонённых сервером (kv server:rejected)
      async active() { const rej = (await S.get('server:rejected')) || {}; return (await S.all()).filter(e => !rej[e.eid] && !e._rep).map(stripLocal); },   // без отклонённых и без замещённых импортом технадзора (Р-5)
      async rejected() { const rej = (await S.get('server:rejected')) || {}; return Object.keys(rej).length; },
      // update([{eid, ...поля}]) — правка местной копии по ответу сервера (by, role, seq, note) с пометкой «отправлено»
      update(list) { return serial(() => update1(list)); },
      async get(k) { return mem ? mem.kv.get(k) : req(tx('kv', 'readonly').get(k)); },
      // круг 3 (Н-1): kv — успех только после завершения транзакции (oncomplete), как у записи событий; отмена при фиксации (квота) — исключение, уведомления нет
      async set(k, v) {
        if (mem) mem.kv.set(k, v);
        else await new Promise((ok, no) => {
          const fail = (t, ev) => no((ev && ev.target && ev.target.error) || t.error || new Error('запись в хранилище браузера не удалась'));
          let t; try { t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); } catch (e) { try { t && t.abort(); } catch (x) { /* уже отменена */ } no(e); return; }
          t.oncomplete = () => ok(); t.onerror = ev => fail(t, ev); t.onabort = ev => fail(t, ev);
        });
        tell('kv:' + k); return v;
      },
      on(f) { subs.add(f); return () => subs.delete(f); },
      close() { try { bc && bc.close(); } catch (e) { /* закрыт */ } try { db && db.close(); } catch (e) { /* закрыт */ } }
    };
    async function add1(evs, how) {
        how = how || {}; const put = [], local = !how.synced && !how.imported;
        // r2, Р-6: автор очереди — пользователь PGS, вошедший на этом устройстве последним (kv server:lastUser); без входа — null
        const u = local ? (how.user !== undefined ? how.user : (await S.get('server:lastUser')) || null) : null;
        const have = new Map((await S.all()).map(e => [e.eid, e])), added = [], dup = [], clash = [], edits = new Map();
        for (const [k, r] of writing) have.set(k, r);   // круг 1 (К10): от чтения журнала до постановки в writing — без await
        // круг 4 (Н3-3): правка уже записанного — по записи из базы в той же транзакции (запись кэша может быть устаревшей, если её изменила другая вкладка)
        const edit = (k, f) => { const g = edits.get(k); edits.set(k, g ? (x => { const r = g(x); return f(r || x) || r; }) : f); };
        for (const e0 of evs) {
          const e = clean(e0, how.src); const o = have.get(e.eid);
          // r2, Р-5: событие с сервера на месте замещённого или импортированного — сервер главнее (запись заменяется)
          if (o && how.synced && (o._rep || o._imp) && !same(o, e)) { const at = Date.now(), rec = Object.assign({}, e, { _saved: o._saved || 0, _sync: 1, _at: at }); have.set(e.eid, rec); edit(e.eid, x => Object.assign({}, e, { _saved: (x || o)._saved || 0, _sync: 1, _at: at })); added.push(e); continue; }
          if (o) { if (same(o, e)) { dup.push(e.eid); if ((how.synced && !o._sync) || (e.seq != null && o.seq == null)) edit(e.eid, x => { const b = x || o; return (how.synced && !b._sync) || (e.seq != null && b.seq == null) ? Object.assign({}, b, { seq: e.seq ?? b.seq, _sync: b._sync || (how.synced ? 1 : 0) }) : null; }); } else clash.push(e.eid); continue; }
          const rec = Object.assign({}, e, { _saved: how.saved ? 1 : 0, _sync: how.synced ? 1 : 0, _imp: how.imported ? 1 : 0, _u: u, _at: Date.now() }, local && how.nc ? { _nc: 1 } : null); have.set(e.eid, rec); put.push(rec); added.push(e);   // круг 3 (К2): _nc
        }
        if (put.length || edits.size) { let out; for (const r of put) writing.set(r.eid, r); try { out = await writeTx(put, edits); keep(out); } finally { unwrite(put); } if (out.length) tell('events'); }   // 1.0.18, П-5: кэш — после записи
        return { added, dup, clash };
    }
    // круг 4 (Н3-3): mark и update — запись из базы в той же транзакции readwrite (не из кэша вкладки); копии: запись кэша меняется только после завершения транзакции
    async function mark1(eids, field) {
        const c = new Map((await S.all()).map(e => [e.eid, e])), edits = new Map();
        for (const k of new Set(eids)) { const o = c.get(k); if (!o || !o[field]) edits.set(k, x => x && !x[field] ? Object.assign({}, x, { [field]: 1 }) : null); }   // в кэше уже с пометкой — без чтения базы
        if (!edits.size) return 0;
        const recs = await writeTx([], edits); keep(recs);
        if (recs.length) tell('events'); return recs.length;
    }
    async function update1(list) {
        const xs = new Map(), edits = new Map();
        for (const x of list) if (x && x.eid) (xs.get(x.eid) || xs.set(x.eid, []).get(x.eid)).push(x);
        for (const [k, a] of xs) edits.set(k, o => { if (!o) return null; const r = Object.assign({}, o); let n = 0; for (const x of a) { if (x._sync === 0 && o._sync) continue; n++; for (const f of ['by', 'role', 'seq', 'note', 't', '_rep', '_rst', '_u', '_keep', '_nc']) if (x[f] != null) r[f] = x[f]; r._sync = x._sync != null ? x._sync : 1; } return n ? r : null; });   /* К4-3: уже отправленную не возвращать в очередь */   // круг 3 (К2): _nc
        if (!edits.size) return 0;
        const recs = await writeTx([], edits); keep(recs);
        if (recs.length) tell('events'); return recs.length;
    }
    return S;
  }

  /* ---------- данные выпуска ---------- */
  /* ---------- 1.0.20 (§5.3 задания): зоны, пакеты приёмки, замечания к РД, снятие приёмки, «К исправлению» ---------- */
  // строка ждёт приёмки: последняя отметка элемента (done/partial), решения технадзора по ней нет (перенос из progress-page.js 1.0.19, формула та же)
  const isOpen = (e, states) => !!e && ['done', 'partial'].includes(e.op) && (states.get(e.id) || {}).last === e && !(states.get(e.id) || {}).conf;
  /* зона = захватка этапа (stage.lots[]) или весь этап без захваток (lot: null, key = id этапа). Порядок: этапы по n, внутри — по lot.seq, затем по порядку массива.
     draft — план-черновик, lot.draft === true или lot.source === 'atlas_draft' (§13.5); level и seq — из полей захватки, нет — null.
     Элементы этапа, не вошедшие ни в одну захватку, — отдельная зона этапа (lot: null, key = id этапа, rest: true): иначе они выпали бы из пакетов. */
  function zonesOf(plan) {
    const out = [], dp = !!(plan && plan.status === 'draft'), seen = new Set();
    for (const s of stagesOf(plan)) {
      if (!isObj(s) || !s.id) continue;
      const ids = Array.isArray(s.ids) ? s.ids.filter(k => typeof k === 'string') : [], st = stageName(s);
      const lots = (Array.isArray(s.lots) ? s.lots : []).map((l, i) => [l, i]).filter(x => isObj(x[0]));
      const seqOf = l => Number.isInteger(l.seq) && l.seq >= 1 ? l.seq : null;
      lots.sort((a, b) => (seqOf(a[0]) ?? Infinity) - (seqOf(b[0]) ?? Infinity) || a[1] - b[1]);
      const inLots = new Set();
      for (const [l, i] of lots) {
        const lid = l.id != null && l.id !== '' ? String(l.id) : null, key = lid && !seen.has(lid) ? lid : s.id + '/' + (lid || 'lot' + (i + 1)); seen.add(key);
        const lids = (Array.isArray(l.ids) ? l.ids : []).filter(k => typeof k === 'string'); for (const k of lids) inLots.add(k);
        out.push({ key, stage: s.id, lot: lid, title: str(l.title) || str(l.name) || 'захватка ' + (i + 1), stageTitle: st, level: typeof l.level === 'string' && l.level ? l.level : null, seq: seqOf(l), draft: dp || l.draft === true || l.source === 'atlas_draft', ids: lids });
      }
      const rest = lots.length ? ids.filter(k => !inLots.has(k)) : ids;
      if (!lots.length || rest.length) out.push(Object.assign({ key: s.id, stage: s.id, lot: null, title: st, stageTitle: st, level: null, seq: null, draft: dp, ids: rest }, lots.length ? { rest: true } : {}));
    }
    return out;
  }
  // ключ элемента → key зоны (первая зона, где есть ключ)
  function zoneIndex(plan) { const M = new Map(); for (const z of zonesOf(plan)) for (const k of z.ids) if (!M.has(k)) M.set(k, z.key); return M; }
  // пакет отметок по зоне — те же правила, что makeBatch (1.0.19a): «частично» не понижает готовое, принятое пропускается (opt.states)
  const makeZoneBatch = (op, zone, opt, ctx) => makeBatch(op, (zone && zone.ids) || [], Object.assign({}, opt, { stage: zone && zone.stage, stageOf: undefined }), ctx);
  /* пакеты приёмки: только строки isOpen, группы «автор × дата работ × зона» (зона — по ключу, затем по телу события; нет — null).
     У элемента открыта одна строка (последняя отметка), поэтому он попадает ровно в один пакет. need — сколько строк «изменено после приёмки». */
  function packagesOf(events, states, zoneIdx) {
    const Z = zoneIdx instanceof Map ? zoneIdx : new Map(), G = new Map();
    for (const e of events || []) {
      if (!isOpen(e, states)) continue;
      const z = Z.has(e.id) ? Z.get(e.id) : e.body && Z.has(e.body) ? Z.get(e.body) : Z.get(splitKey(e.id).id) ?? null, k = e.by + '\u0001' + e.date + '\u0001' + (z ?? '');
      let g = G.get(k); if (!g) G.set(k, g = { by: e.by, date: e.date, zone: z, events: [], need: 0, keys: [] });
      g.events.push(e); g.keys.push(e.id); if ((states.get(e.id) || {}).need) g.need++;
    }
    return [...G.values()].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : String(a.by).localeCompare(String(b.by), 'ru') || String(a.zone ?? '').localeCompare(String(b.zone ?? ''), 'ru'));
  }
  // замечания атласа к РД у элемента: ATLAS_REMARKS.by_element[тело || ключ]; данных нет — null («нет в источнике»); у элемента замечаний нет — []
  function remarkIdsOf(key, bodyOf) {
    const R = window.ATLAS_REMARKS, B = isObj(R) && isObj(R.by_element) ? R.by_element : null;
    if (!B) return null;
    const b = typeof bodyOf === 'function' ? bodyOf(key) : null, v = Object.prototype.hasOwnProperty.call(B, b || key) ? B[b || key] : Object.prototype.hasOwnProperty.call(B, key) ? B[key] : null;
    return Array.isArray(v) ? v.map(x => isObj(x) ? String(x.id ?? '') : String(x)).filter(Boolean) : v == null || v === '' ? [] : [String(v)];
  }
  /* 1.0.20, §13.2: связь элемента с замечаниями к РД → {st, ids}: 'yes' — есть замечания; 'no' — замечаний нет, и связь проверяема: ключ элемента (или его тело)
     известен выпуску — known(k), и хотя бы один ключ by_element известен выпуску; 'unk' — связь не проверена (данных нет, ключ не найден, связь не сходится с выпуском).
     'unk' не считается «без замечаний». Статус замечаний не учитывается. */
  const remLink = new WeakMap();
  function remarkStateOf(key, bodyOf, known) {
    const R = window.ATLAS_REMARKS, B = isObj(R) && isObj(R.by_element) ? R.by_element : null, ids = remarkIdsOf(key, bodyOf);
    if (!B || ids == null) return { st: 'unk', ids: null };
    if (ids.length) return { st: 'yes', ids };
    if (typeof known !== 'function') return { st: 'unk', ids: [] };
    let c = remLink.get(B); if (!c || c.known !== known) { c = { known, ok: Object.keys(B).some(k => { try { return !!known(k); } catch (e) { return false; } }) }; remLink.set(B, c); }
    const b = typeof bodyOf === 'function' ? bodyOf(key) : null;
    return { st: c.ok && (known(key) || (!!b && known(b))) ? 'no' : 'unk', ids: [] };
  }
  // «приёмка снята»: reject технадзора, перед которым у элемента последнее решение — confirm без отметок между ними (решения не технадзора не считаются, как в apply)
  function withdrawnSet(events) {
    const out = new Set(), dec = new Map();
    for (const e of sorted(events || [])) {
      if (MARK.has(e.op)) { dec.delete(e.id); continue; }
      if (!CONF.has(e.op) || e.role !== 'supervisor') continue;
      if (e.op === 'reject' && dec.get(e.id) === 'confirm') out.add(e.eid);
      dec.set(e.id, e.op);
    }
    return out;
  }
  // «К исправлению»: возвращённые технадзором (conf = rejected); by — только элементы, где отмечал этот автор
  function toFix(states, by) {
    const out = [];
    for (const s of (states && states.values ? states.values() : [])) {
      if (s.conf !== 'rejected' || (by && !(s.by && s.by.has(by)))) continue;
      out.push({ id: s.id, note: s.note || null, confBy: s.confBy, confDate: s.confDate, withdrawn: !!s.wd });
    }
    return out.sort((a, b) => a.confDate < b.confDate ? 1 : a.confDate > b.confDate ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  // Опубликованный срез: items, план, журнал (data/progress_*.js) — только чтение
  function published() {
    const I = window.ATLAS_PROGRESS_ITEMS, P = window.ATLAS_PROGRESS_PLAN, J = window.ATLAS_PROGRESS_JOURNAL;
    const ev = isObj(J) && Array.isArray(J.events) ? J.events.map(e => clean(e, J.source === 'server' ? 'server' : 'выпуск')).filter(e => !check(e).length) : [];
    return { items: isObj(I) && isObj(I.items) ? I.items : {}, bodyIds: isObj(I) && Array.isArray(I.body_ids) ? I.body_ids : null, itemsMeta: isObj(I) ? { release: I.release, generated: I.generated, project_id: I.project_id } : null, plan: isObj(P) && Array.isArray(P.stages) ? P : null, journal: ev, journalAsOf: isObj(J) ? J.as_of || null : null };
  }
  /* 1.0.19a, решение владельца 13 (24.10.2026): сокращения КС, RFI, PGS — с расшифровкой в подсказке. abbrParts(s) — части строки подписи:
     строки и пары [сокращение, подсказка] (h() панели и PROGRESS делает из пары <abbr title>); null — сокращений нет. Только подписи интерфейса:
     КС — только в «для КС» (в данных «КС» бывает маркой изделия), PGS и RFI — отдельным словом. Тексты — словарь подписей, строка 23 (те же, что AtlasAbbr.TITLES у C);
     буквенной расшифровки PGS в источниках нет — подсказка поясняет, что это. */
  const ABBR = Object.freeze({
    'КС': 'КС — формы КС-2 (акт о приёмке выполненных работ) и КС-3 (справка о стоимости выполненных работ и затрат)',
    RFI: 'RFI — запрос информации (Request for Information): вопрос проектировщику с просьбой уточнить проект',
    PGS: 'PGS — сайт, где ведутся общий журнал и роли'
  });
  const ABBR_RE = /(^|[^0-9A-Za-z_])(PGS|RFI)(?![0-9A-Za-z_])|(для )(КС)(?![0-9A-Za-zА-Яа-яЁё.-])/g;
  function abbrParts(s) {
    s = String(s); if (!/PGS|RFI|для КС/.test(s)) return null;
    const out = []; let i = 0, m; ABBR_RE.lastIndex = 0;
    while ((m = ABBR_RE.exec(s))) { const pre = m[2] ? m[1] : m[3], w = m[2] || m[4], at = m.index + pre.length; if (at > i) out.push(s.slice(i, at)); out.push([w, ABBR[w]]); i = at + w.length; }
    if (!out.length) return null;
    if (i < s.length) out.push(s.slice(i));
    return out;
  }
  // Ключ конфига progress: {enabled, project_id, units, roles}; нет — модуль выключен (ни пункта, ни запросов)
  function config() {
    const P = window.ATLAS_PROJECT || {}, c = P.progress;
    if (!isObj(c) || c.enabled === false) return null;
    return Object.assign({ enabled: true }, c, { project_id: c.project_id || P.project_id || P.id || null });
  }

  /* 1.0.20 §14: снимок сметы window.ATLAS_PROGRESS_ESTIMATE (schemas/progress-estimate.schema.json) и карта «смета → этапы» window.ATLAS_PROGRESS_COST_MAP
     (schemas/progress-cost-map.schema.json). Десятичные строки — только целыми (BigInt): qty × 1000, цена × 100, allocation × 1 000 000; во float не складываются.
     decInt(s, k) — строка с ≤ k знаками после точки → BigInt (× 10^k), иначе null.
     costMapOf(map?, est?) → {map, est} (без аргументов — из window; чужая или битая схема — null).
     costMapCheck(map, est) → {ok, errors[], over[], missing[], unmapped}: строка без stageId или с плохой allocation — ошибка; over — budgetItemId с суммой allocation > 1;
       missing — budgetItemId карты, которых нет в снимке; unmapped — работ (kind work) снимка, сопоставленных меньше чем на 1 (остаток — «не сопоставлено»).
     estimateCodes(map, est) → Map этап → [code…] (порядок строк карты, без повторов; только позиции, найденные в снимке) или null без обоих файлов.
     weightsLabel(map, est) — подпись весов: без обоих — «веса из сметы не сопоставлены с этапами»; с обоими — «по смете <sourceRef> · карта: черновик / подтверждена · условно».
     Ключи с «::» (recordId, bodyId, partKey) не разрезаются. */
  const DEC_RE = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/, A1 = 1000000n;
  const decInt = (s, k) => { const m = typeof s === 'string' ? DEC_RE.exec(s) : null; if (!m || (m[2] || '').length > k) return null; return BigInt(m[1] + (m[2] || '').padEnd(k, '0')); };
  function costMapOf(map, est) {
    if (arguments.length === 0) { map = window.ATLAS_PROGRESS_COST_MAP; est = window.ATLAS_PROGRESS_ESTIMATE; }
    return { map: isObj(map) && map.schema === 'atlas-progress-cost-map/1' && Array.isArray(map.rows) ? map : null, est: isObj(est) && est.schema === 'atlas-progress-estimate/1' && Array.isArray(est.items) ? est : null };
  }
  function costMapCheck(map, est) {
    const errors = [], over = [], missing = new Set(), items = new Map(), alloc = new Map();
    if (!isObj(map) || !Array.isArray(map.rows)) return { ok: false, errors: ['нет карты соответствия'], over, missing: [], unmapped: null };
    if (isObj(est) && Array.isArray(est.items)) for (const it of est.items) { if (!isObj(it) || typeof it.budgetItemId !== 'string') continue; if (items.has(it.budgetItemId)) errors.push('снимок: повтор budgetItemId ' + it.budgetItemId); else items.set(it.budgetItemId, it); }
    if (isObj(est) && map.project && est.project && map.project !== est.project) errors.push('карта и снимок разных объектов: ' + map.project + ' / ' + est.project);
    map.rows.forEach((r, i) => {
      if (!isObj(r) || typeof r.stageId !== 'string' || !r.stageId) { errors.push('строка ' + (i + 1) + ': нет stageId'); return; }
      if (typeof r.budgetItemId !== 'string' || !r.budgetItemId) { errors.push('строка ' + (i + 1) + ': нет budgetItemId'); return; }
      const a = decInt(r.allocation, 6); if (a == null || a <= 0n || a > A1) { errors.push('строка ' + (i + 1) + ': allocation не 0 < a ≤ 1 (десятичная строка, ≤ 6 знаков)'); return; }
      alloc.set(r.budgetItemId, (alloc.get(r.budgetItemId) || 0n) + a);
      if (isObj(est) && !items.has(r.budgetItemId)) missing.add(r.budgetItemId);
    });
    for (const [k, a] of alloc) if (a > A1) over.push(k);
    let unmapped = null;
    if (isObj(est)) { unmapped = 0; for (const [k, it] of items) if (it.kind === 'work' && (alloc.get(k) || 0n) < A1) unmapped++; }
    return { ok: !errors.length && !over.length && !missing.size, errors, over, missing: [...missing], unmapped };
  }
  function estimateCodes(map, est) {
    if (!isObj(map) || !Array.isArray(map.rows) || !isObj(est) || !Array.isArray(est.items)) return null;
    const code = new Map(), out = new Map(), lab = new Map();
    // 1.0.20, Q00: коды позиций повторяются по разделам — при sections[].label код пишется «<label>/<code>»
    if (Array.isArray(est.sections)) for (const s of est.sections) if (isObj(s) && typeof s.id === 'string' && typeof s.label === 'string' && s.label) lab.set(s.id, s.label);
    for (const it of est.items) if (isObj(it) && typeof it.budgetItemId === 'string' && !code.has(it.budgetItemId) && typeof it.code === 'string' && it.code) code.set(it.budgetItemId, (lab.has(it.sectionId) ? lab.get(it.sectionId) + '/' : '') + it.code);
    for (const r of map.rows) {
      if (!isObj(r) || typeof r.stageId !== 'string' || !r.stageId || !code.has(r.budgetItemId)) continue;
      const a = decInt(r.allocation, 6); if (a == null || a <= 0n || a > A1) continue;
      const L = out.get(r.stageId) || out.set(r.stageId, []).get(r.stageId), c = code.get(r.budgetItemId); if (!L.includes(c)) L.push(c);
    }
    return out;
  }
  const W_NONE = 'веса из сметы не сопоставлены с этапами';
  function weightsLabel(map, est) {
    const m = isObj(map) && Array.isArray(map.rows), e = isObj(est) && Array.isArray(est.items);
    if (!m || !e) return W_NONE + (m ? ' (нет снимка сметы)' : e ? ' (нет карты соответствия)' : '');
    const ch = costMapCheck(map, est), bad = ch.errors.length + ch.over.length + ch.missing.length;
    return 'по смете' + (est.sourceRef ? ' ' + est.sourceRef : '') + (isDate(String(est.capturedAt || '').slice(0, 10)) ? ' (снимок ' + ruDate(String(est.capturedAt).slice(0, 10)) + ')' : '') + ' · карта: ' + (map.status === 'confirmed' ? 'подтверждена' : 'черновик') + ' · условно'
      + (ch.unmapped ? ' · не сопоставлено работ: ' + ch.unmapped : '') + (bad ? ' · ошибок карты: ' + bad : '');
  }

  return {
    version: 1, OPS, ROLES, ROLE_LABEL, OP_LABEL, BASIS, FLAG_LABEL, flagText,
    uuid, today, nowIso, isDate, addDays, ruDate, splitKey, joinKey, keyResolver, plural, sandboxed, openTab,
    check, clean, make, retry, RETRY_RE, QTY_MAX, isPhoto, EID_RE, LIMITS, makeBatch, batchRisk, undoBatch, sorted, fold, apply, blank, merge, conflicts, can, canPlan,
    effectivePlan, stagesOf, stageIndex, stageOfKey, CORE_VERSION, planCheck, orderWarn, stageName,
    valueOf, sheet, isMarked, markedRows, summaryKS, periodOf, workbook, xlsx, machineJson, csv, journalFile, planFile, parseFile, readFiles, save, saveJournal, shareJournal, canShareFiles,
    dbName, openStore, published, config, ABBR, abbrParts,
    isOpen, zonesOf, zoneIndex, makeZoneBatch, packagesOf, remarkIdsOf, remarkStateOf, withdrawnSet, toFix,   // 1.0.20, §5.3; remarkStateOf — §13.2
    decInt, costMapOf, costMapCheck, estimateCodes, weightsLabel, W_NONE   // 1.0.20, §14 (b5): снимок сметы и карта соответствия
  };
})();
