/* Атлас · полевой комплект — офлайн-сохранение интервала (ядро 1.1, модуль нейтральный: только window.ATLAS_FIELD и конфиг объекта).
   Формат данных — ATLAS_FIELD v1 (Codex, CONTRACT.md): sources[].path, stations/nodes/crossings с stationM и refs, intervals[] необязательно
   (нет — интервал один: route.startM–route.endM).

   API:  window.AtlasFieldOffline = { save(intervalId, {onProgress}?) → Promise<{ok, files, bytes?, note, ...}>, status() → {...},
                                      files(intervalId) → {interval, stations[], pdf[], pages[], data[]}, check(intervalId) → Promise<{ok, cached, missing[]}> }

   Первое сохранение активирует сервис-воркер в области './' и загружает комплект участка.
   Полный кэш атласа загружается по отдельной команде. Ход — onProgress({stage, note})
   и событие window 'atlas-field-offline-progress'.
   Как работает. Ядро кэширует сервис-воркером (service-worker.js, кнопка «Кэш» в меню шапки): кэш
   ATLAS_OFFLINE_PREFIX + encodeURIComponent(путь области) + '-' + ATLAS_OFFLINE_VERSION (assets/offline-manifest.js).
   save() кладёт в тот же кэш то, что нужно интервалу:
     · главная index.html для всех пикетов (воркер отдаёт эту страницу и для адресов с параметрами);
     · наборы config.plugins для главной (модули полевого комплекта, данные, слои) — состав из конфига, не списком;
     · страницы видов (views[].href, nodes[].viewHref, nodes[].sectionHref), их скрипты, стили, шрифты, картинки
       и страницы той же папки, на которые они ссылаются (например, общий профиль), а также листы PDF из их ссылок;
     · листы PDF (sources[].path, на которые ссылаются карточки интервала);
     · всё, что главная уже загрузила (геометрия, данные) — как дополнение, без срыва сохранения.
   Сервис-воркер полевого комплекта отдаёт без сети и адреса с параметрами, и файлы вне манифеста, и куски PDF (Range → 206/416).
   Из file:// ничего не делается и ничего не запрашивается: пакет и так на устройстве.
   Запросы — только к файлам своего выпуска (то же происхождение и область сервис-воркера); наружу ничего не отправляется. */
(function () {
  'use strict';
  if (window.AtlasFieldOffline) return;

  const NOTE_FILE = 'Пакет открыт с устройства — всё уже доступно без сети';
  const NOTE_NO_SW = 'На этом устройстве участок для работы без сети ещё не сохранялся.';
  const NOTE_SW_FAIL = 'Браузер не дал сохранить для работы без сети: ';
  const NOTE_INSECURE = 'Сохранение без сети доступно только при открытии по https. Откройте атлас по защищённой ссылке или с устройства (файлом).';
  const NOTE_NO_DATA = 'Нет данных полевого комплекта (window.ATLAS_FIELD).';
  const EPS = 1e-6;

  const P = () => window.ATLAS_PROJECT || {};
  const F = () => window.ATLAS_FIELD || null;
  const isFile = () => location.protocol === 'file:';
  const canSW = () => /^https?:$/.test(location.protocol) && window.isSecureContext && 'serviceWorker' in navigator && 'caches' in window;

  /* ---------- журнал в localStorage (ключ объекта: storage.prefix + 'field-offline') ---------- */
  function storageKey() {
    const p = P(), pre = (p.storage && p.storage.prefix) || ('atlas:' + (p.project_id || (F() && F().projectId) || 'default') + ':');
    return pre + 'field-offline';
  }
  function readLog() {
    try { const v = JSON.parse(localStorage.getItem(storageKey()) || 'null'); return v && typeof v === 'object' && v.intervals ? v : { intervals: {} }; }
    catch (e) { return { intervals: {} }; }
  }
  function writeLog(log) { try { localStorage.setItem(storageKey(), JSON.stringify(log)); return true; } catch (e) { return false; } }

  /* ---------- интервал и состав по данным (без запросов) ---------- */
  const num = v => (v === null || v === undefined || v === '' || !isFinite(+v)) ? null : +v;
  function pk(m) {               // 45 → «ПК0+45», 21.5 → «ПК0+21,5»
    m = num(m); if (m === null) return '…';
    const h = Math.floor(m / 100), r = Math.round((m - h * 100) * 100) / 100;
    return 'ПК' + h + '+' + (r < 10 ? '0' : '') + String(r).replace('.', ',');
  }
  function intervalOf(data, id) {
    const list = Array.isArray(data.intervals) ? data.intervals.filter(Boolean) : [];
    if (list.length) {
      const it = id == null ? list[0] : list.find(i => String(i.id) === String(id));
      if (!it) return null;
      return { id: String(it.id), title: it.title || '', startM: num(it.startM ?? it.from), endM: num(it.endM ?? it.to),
               refs: it.refs || [], views: it.views || [], fromRoute: false };
    }
    const r = data.route || {};
    return { id: id != null ? String(id) : String(r.id || 'route'), title: r.title || r.name || (pk(r.startM) + '–' + pk(r.endM)),
             startM: num(r.startM), endM: num(r.endM), refs: r.refs || [], views: r.views || [], fromRoute: true };
  }
  const inRange = (iv, m) => { m = num(m); return m !== null && (iv.startM === null || m >= iv.startM - EPS) && (iv.endM === null || m <= iv.endM + EPS); };

  function refsDeep(x, out) {      // refs карточки, её полей, колец, вводов и оценки зазора
    if (!x || typeof x !== 'object') return out;
    (x.refs || []).forEach(r => r && out.push(r));
    const f = x.fields && typeof x.fields === 'object' ? x.fields : {};
    Object.keys(f).forEach(k => { const v = f[k]; if (v && Array.isArray(v.refs)) v.refs.forEach(r => r && out.push(r)); });
    ['rings', 'inlets'].forEach(k => (Array.isArray(x[k]) ? x[k] : []).forEach(y => refsDeep(y, out)));
    if (x.clearance && typeof x.clearance === 'object') ['distance', 'threshold'].forEach(k => { const v = x.clearance[k]; if (v && Array.isArray(v.refs)) v.refs.forEach(r => r && out.push(r)); });
    return out;
  }
  function dataSrc() {
    const s = Array.from(document.scripts).map(s => s.getAttribute('src') || '').find(u => /(^|\/)field-data\.js(\?|$)/.test(u));
    return s || 'project/field-data.js';
  }
  function plugins() {             // наборы config.plugins, которые грузит главная (pages нет / [] — по требованию / есть index)
    const out = [];
    (Array.isArray(P().plugins) ? P().plugins : []).forEach(p => (p && Array.isArray(p.data) ? p.data : []).forEach(d => {
      const e = typeof d === 'string' ? { src: d } : d;
      if (!e || typeof e.src !== 'string') return;
      if (Array.isArray(e.pages) && e.pages.length && !e.pages.some(q => String(q).replace(/\.html$/, '') === 'index')) return;
      out.push(e.src);
    }));
    return out;
  }
  const uniq = a => Array.from(new Set(a.map(u => String(u).split('#')[0]).filter(Boolean)));
  function files(intervalId) {
    const data = F();
    if (!data) return null;
    const iv = intervalOf(data, intervalId);
    if (!iv) return null;
    const stations = (data.stations || []).filter(s => s && inRange(iv, s.stationM));
    const nodeIds = new Set(), xIds = new Set();
    stations.forEach(s => { (s.nodeIds || []).forEach(i => nodeIds.add(i)); (s.crossingIds || []).forEach(i => xIds.add(i)); });
    const nodes = (data.nodes || []).filter(n => n && (inRange(iv, n.stationM) || nodeIds.has(n.id)));
    const crossings = (data.crossings || []).filter(c => c && (inRange(iv, c.stationM) || xIds.has(c.id)));
    const refs = refsDeep({ refs: iv.refs }, []);
    stations.concat(nodes, crossings).forEach(x => refsDeep(x, refs));
    const used = new Set(refs.map(r => r.sourceId).filter(Boolean));
    const sources = (data.sources || []).filter(s => s && s.path && (s.kind || 'pdf') !== 'record');
    const pdf = sources.filter(s => !used.size || used.has(s.id)).map(s => s.path);
    const pages = [];
    const addViews = v => (Array.isArray(v) ? v : []).forEach(x => x && x.href && pages.push(x.href));
    addViews(iv.views);
    stations.concat(nodes, crossings).forEach(x => addViews(x.views));
    nodes.forEach(n => { if (n.viewHref) pages.push(n.viewHref); if (n.sectionHref) pages.push(n.sectionHref); });
    const marks = uniq(stations.map(s => num(s.stationM)).filter(m => m !== null).map(String));
    const links = ['index.html'];
    marks.forEach(m => links.push('index.html?pdFieldPk=' + m, 'index.html?field=1&pk=' + m));
    return { interval: { id: iv.id, title: iv.title, startM: iv.startM, endM: iv.endM, fromRoute: iv.fromRoute },
             stations: marks.map(Number), pdf: uniq(pdf), pages: uniq(links.concat(pages)), plugins: uniq(plugins()), data: [dataSrc().split('#')[0]],
             counts: { stations: stations.length, nodes: nodes.length, crossings: crossings.length } };
  }

  /* ---------- кэш сервис-воркера ядра ---------- */
  let manifestLoad;
  function loadManifest() {
    if (window.ATLAS_OFFLINE_VERSION) return Promise.resolve(true);
    if (!manifestLoad) manifestLoad = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'assets/offline-manifest.js';
      script.onload = () => resolve(Boolean(window.ATLAS_OFFLINE_VERSION));
      script.onerror = () => { script.remove(); manifestLoad = null; resolve(false); };
      document.head.append(script);
    });
    return manifestLoad;
  }
  function runtimeFiles() {
    // Эти файлы нужны с холодного старта, даже когда движок ещё не успел их запросить.
    const paths = window.ATLAS_OFFLINE_FILES || [];
    return paths.filter(path => /^(assets\/(fonts\/[^/]+\.woff2|atlas-(abbr|issues)\.js)|data\/(geometry(?:-index|_\d+)\.js|passports\/[^/]+\.js|metadata-light\.js|release-info\.js|element-types\.js|rd_remarks_final\.js|nodes\.js|layers\.js))$/.test(path));
  }
  const scopeURL = () => new URL('./', document.baseURI).href;
  const workerURL = () => new URL('service-worker.js', scopeURL()).href;
  const isActive = reg => reg?.scope === scopeURL() && reg.active?.scriptURL === workerURL() && reg.active.state === 'activated';
  async function cacheName(reg) {
    if (!await loadManifest()) return null;
    const prefix = window.ATLAS_OFFLINE_PREFIX || (P().build?.offline?.cache_prefix) || ('atlas-' + (P().project_id || 'default') + '-');
    const name = prefix + encodeURIComponent(new URL(reg.scope).pathname) + '-' + window.ATLAS_OFFLINE_VERSION;
    return await caches.has(name) ? name : null;
  }
  const own = (u, scope) => u.origin === location.origin && u.href.startsWith(scope);
  const strip = u => { const x = new URL(u.href); x.hash = ''; return x; };
  const bare = h => { const u = new URL(h); return u.origin + u.pathname; };
  const dirOf = h => bare(h).replace(/[^/]*$/, '');
  const isHtml = h => /\.html?$/i.test(new URL(h).pathname);
  const isPdf = h => /\.pdf$/i.test(new URL(h).pathname);

  function scanHtml(html, base, scope) {   // зависимости страницы и её ссылки на страницы той же папки и на PDF
    const deps = [], pages = [], pdf = [], doc = new DOMParser().parseFromString(html, 'text/html');
    const follow = dirOf(base) !== scope;   // страницы видов в подпапках (project/…); от главной по меню не идём
    const res = v => { if (!v || /^(data|blob|javascript|mailto|tel):/i.test(v)) return null; try { const u = new URL(v, base); return own(u, scope) ? strip(u).href : null; } catch (e) { return null; } };
    const dep = v => { const h = res(v); if (h) deps.push(h); };
    doc.querySelectorAll('script[src]').forEach(e => dep(e.getAttribute('src')));
    doc.querySelectorAll('link[href]').forEach(e => { if (/stylesheet|icon|preload|modulepreload|manifest/i.test(e.getAttribute('rel') || '')) dep(e.getAttribute('href')); });
    doc.querySelectorAll('img[src], source[src], video[poster]').forEach(e => dep(e.getAttribute('src') || e.getAttribute('poster')));
    const css = t => { const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g; let m; while ((m = re.exec(t))) dep(m[2]); };
    doc.querySelectorAll('style').forEach(e => css(e.textContent));
    doc.querySelectorAll('[style]').forEach(e => css(e.getAttribute('style')));
    doc.querySelectorAll('a[href]').forEach(e => {
      const h = res(e.getAttribute('href')); if (!h) return;
      if (isPdf(h)) pdf.push(h);
      else if (follow && isHtml(h) && dirOf(h) === dirOf(base) && !new URL(h).search) pages.push(h);   // соседние страницы той же папки
    });
    return { deps, pages, pdf };
  }
  function loadedByThisPage(scope) {       // что главная уже загрузила (геометрия, данные, движок)
    let list = [];
    try { list = performance.getEntriesByType('resource').filter(e => !(e.responseStatus >= 400)).map(e => e.name); } catch (e) {}
    return list.map(n => { try { return new URL(n); } catch (e) { return null; } })
      .filter(u => u && own(u, scope) && !u.search && !/\/albums\//.test(u.pathname)).map(u => strip(u).href);
  }

  /* Полный состав: Map href → {role, soft}. getText(href) — текст страницы (save: из сети, check: из кэша). */
  async function collect(list, scope, getText) {
    const want = new Map(), abs = h => { try { const u = strip(new URL(h, document.baseURI)); return own(u, scope) ? u.href : null; } catch (e) { return null; } };
    const add = (h, role, soft) => { const a = abs(h); if (!a) return null; const cur = want.get(a); if (!cur) want.set(a, { role, soft: !!soft }); else if (!soft) cur.soft = false; return a; };
    list.data.forEach(h => add(h, 'data'));
    list.plugins.forEach(h => add(h, 'module'));
    list.pdf.forEach(h => add(h, 'pdf'));
    add('assets/offline-manifest.js', 'data');
    runtimeFiles().forEach(h => add(h, 'data'));
    const queue = [];
    const entry = bare(new URL('index.html', document.baseURI));
    list.pages.forEach(h => {
      const href = abs(h);
      if (!href) return;
      const canonical = bare(href);
      add(canonical, 'page');
      if (canonical !== entry && href !== canonical) add(href, 'page');
      queue.push(canonical);
    });
    const seen = new Set(), here = bare(location.href);
    while (queue.length) {
      const h = bare(queue.shift());
      if (seen.has(h)) continue; seen.add(h);
      let text = null;
      try { text = await getText(h); } catch (e) {}
      if (text) {
        const s = scanHtml(text, h, scope);
        s.deps.forEach(d => add(d, 'dep'));
        s.pdf.forEach(d => add(d, 'pdf'));
        s.pages.forEach(d => { if (!want.has(d)) { add(d, 'page'); queue.push(d); } });
      }
      if (h === here) loadedByThisPage(scope).forEach(d => add(d, 'loaded', true));
    }
    return want;
  }

  const completeResponse = response => response && response.status === 200 && response.type !== 'opaque';
  async function store(cache, href, readText = false) {
    const hit = await cache.match(href);
    if (completeResponse(hit)) return { bytes: 0, text: readText ? await hit.text() : null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    try {
      const response = await fetch(href, { credentials: 'same-origin', signal: controller.signal });
      if (!completeResponse(response)) throw new Error('HTTP ' + response.status);
      const path = decodeURIComponent(new URL(href).pathname.slice(new URL(scopeURL()).pathname.length));
      const bytes = Number(window.ATLAS_OFFLINE_SIZES?.[path]) || Number(response.headers.get('content-length')) || 0;
      const text = readText ? await response.clone().text() : null;
      await cache.put(href, response);
      return { bytes, text, added: true };
    } finally { clearTimeout(timer); }
  }
  async function pool(items, n, fn) { const q = items.slice(); await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); })); }
  function progress(opts, stage, note, extra) {
    const d = Object.assign({ stage, note }, extra || {});
    try { if (opts && typeof opts.onProgress === 'function') opts.onProgress(d); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('atlas-field-offline-progress', { detail: d })); } catch (e) {}
  }
  const SW_WAIT_MS = 120000;
  async function ensureSW(opts) {   // включить сервис-воркер, как кнопка «Кэш» ядра, и дождаться активации (до SW_WAIT_MS)
    let reg = null, registered = false;
    try { reg = await navigator.serviceWorker.getRegistration(); } catch (e) {}
    if (isActive(reg)) return { reg };
    if (reg?.scope !== scopeURL()) {
      progress(opts, 'register', 'Включаем работу без сети на этом устройстве…');
      try { reg = await navigator.serviceWorker.register('service-worker.js', { scope: './' }); registered = true; }
      catch (e) { return { error: NOTE_SW_FAIL + String(e && e.message || e || 'причина не сообщена') + '.' }; }
    }
    progress(opts, 'activate', 'Готовим хранилище на устройстве…');
    const t0 = Date.now();
    let slowNoted = false;
    while (Date.now() - t0 < SW_WAIT_MS) {
      const a = reg.active;
      if (isActive(reg)) return { reg, registered };
      const w = reg.installing || reg.waiting;
      if (w && w.state === 'redundant') break;           // установка сорвалась — сразу отказ, без ожидания
      if (!a && !w && Date.now() - t0 > 1500) break;    // установка сорвалась (redundant)
      if (!slowNoted && Date.now() - t0 > 10000) { slowNoted = true; progress(opts, 'activate', 'Медленная сеть: хранилище ещё готовится, ждём…'); }
      await new Promise(r => setTimeout(r, 200));
    }
    return { error: NOTE_SW_FAIL + (Date.now() - t0 >= SW_WAIT_MS ? 'хранилище не подготовилось за ' + Math.round(SW_WAIT_MS / 1000) + ' с' : 'установка хранилища сорвалась') + '. Проверьте свободное место и повторите.' };
  }
  async function activeReg() { try { const r = await navigator.serviceWorker.getRegistration(); return isActive(r) ? r : null; } catch (e) { return null; } }

  async function save(intervalId, opts) {
    const data = F();
    if (!data) return { ok: false, files: 0, note: NOTE_NO_DATA };
    const list = files(intervalId);
    if (!list) return { ok: false, files: 0, note: 'Интервал «' + intervalId + '» не найден в данных полевого комплекта.' };
    const at = new Date().toISOString(), iv = list.interval;
    const remember = rec => { const log = readLog(); log.intervals[iv.id] = Object.assign({ id: iv.id, title: iv.title, startM: iv.startM, endM: iv.endM, savedAt: at, release: data.release || null }, rec); log.last = iv.id; rec.stored = writeLog(log); return rec; };
    if (isFile()) {
      const rec = remember({ ok: true, mode: 'file', files: list.pdf.length + list.pages.length + list.plugins.length + list.data.length, note: NOTE_FILE });
      return Object.assign({ interval: iv }, rec);
    }
    if (!canSW()) return { ok: false, files: 0, mode: 'insecure', reason: 'insecure', note: NOTE_INSECURE };
    if (navigator.onLine === false) return { ok: false, files: 0, mode: 'offline', reason: 'offline', note: 'Нет сети. Сохранить участок можно при подключении; уже сохранённое доступно.' };
    const sw = await ensureSW(opts);
    if (sw.error) return { ok: false, files: 0, mode: 'no-sw', reason: 'sw-failed', note: sw.error };
    const reg = sw.reg;
    if (!await loadManifest()) return { ok: false, files: 0, note: NOTE_SW_FAIL + 'не удалось загрузить состав комплекта.' };
    const name = await cacheName(reg);
    if (!name) return { ok: false, files: 0, mode: 'no-sw', reason: 'no-cache', note: NOTE_SW_FAIL + 'не найдено хранилище атласа.' };
    progress(opts, 'files', 'Сохраняем листы, разрезы и данные участка…');
    const cache = await caches.open(name);
    const stat = { added: 0, bytes: 0, failed: [], skipped: [] };
    const saveFile = async (href, readText = false) => {
      const result = await store(cache, href, readText);
      if (result.added) { stat.added++; stat.bytes += result.bytes; }
      return result.text;
    };
    const unread = new Map();
    const want = await collect(list, reg.scope, async href => {
      try { return await saveFile(href, true); }
      catch (error) { unread.set(href, String(error.message || error)); return null; }
    });
    let done = 0;
    await pool(Array.from(want), 4, async ([href, file]) => {
      try {
        if (unread.has(href)) throw new Error(unread.get(href));
        await saveFile(href);
      } catch (error) { (file.soft ? stat.skipped : stat.failed).push({ href, error: String(error.message || error) }); }
      done++; if (done % 10 === 0 || done === want.size) progress(opts, 'files', 'Сохранено ' + done + ' из ' + want.size + '…', { done, total: want.size });
    });
    const required = Array.from(want.values()).filter(w => !w.soft).length;
    const ok = !stat.failed.length;
    const rec = remember({ ok, mode: 'cache', cache: name, swRegistered: !!sw.registered, files: want.size, required, added: stat.added, bytes: stat.bytes,
      failed: stat.failed.map(f => f.href), skipped: stat.skipped.map(f => f.href), pdf: Array.from(want.values()).filter(w => w.role === 'pdf').length,
      note: ok ? 'Сохранено для работы без сети: ' + want.size + ' файл(ов), листов PDF — ' + list.pdf.length + '.'
               : 'Сохранено не всё: не удалось получить ' + stat.failed.length + ' файл(ов). Повторите при устойчивой сети.' });
    try { window.dispatchEvent(new CustomEvent('atlas-field-offline', { detail: Object.assign({ interval: iv }, rec) })); } catch (e) {}
    return Object.assign({ interval: iv, bytes: stat.bytes }, rec, { failedDetails: stat.failed });
  }

  function status() {
    const log = readLog(), ids = Object.keys(log.intervals || {});
    const mode = isFile() ? 'file' : canSW() ? (navigator.serviceWorker && navigator.serviceWorker.controller ? 'cache' : 'no-sw') : 'insecure';
    const items = ids.map(id => log.intervals[id]).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    const last = items[0] || null;
    const fmt = s => { try { return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (e) { return s; } };
    return { mode, intervals: items, last,
      note: mode === 'file' ? NOTE_FILE
        : !items.length ? (mode === 'cache' ? 'Интервалы для работы без сети не сохранены.' : mode === 'no-sw' ? NOTE_NO_SW : NOTE_INSECURE)
        : 'Сохранено: ' + items.map(i => (i.title || i.id) + ' — ' + fmt(i.savedAt) + (i.ok ? '' : ' (не полностью)')).join('; ') };
  }

  async function check(intervalId) {     // каждый обязательный файл состава — в кэше? Без сети: страницы читаются из кэша
    const list = files(intervalId);
    if (!list) return { ok: false, note: NOTE_NO_DATA };
    if (isFile()) return { ok: true, mode: 'file', cached: null, missing: [], note: NOTE_FILE };
    if (!canSW()) return { ok: false, mode: 'insecure', note: NOTE_INSECURE };
    const reg = await activeReg();
    if (!reg) return { ok: false, mode: 'no-sw', note: NOTE_NO_SW };
    await loadManifest();
    const name = await cacheName(reg), cache = name && await caches.open(name);
    if (!cache) return { ok: false, mode: 'no-sw', note: NOTE_NO_SW };
    const want = await collect(list, reg.scope, async h => { const r = await cache.match(h); return r ? r.text() : null; });
    const missing = [], softMissing = [], roles = {};
    for (const [h, w] of want) {
      const hit = await cache.match(h);
      if (!completeResponse(hit)) (w.soft ? softMissing : missing).push(h);
      else if (!w.soft) roles[w.role] = (roles[w.role] || 0) + 1;
    }
    const required = Array.from(want.values()).filter(w => !w.soft).length;
    return { ok: !missing.length, mode: 'cache', cache: name, required, cached: required - missing.length, byRole: roles, missing, softMissing: softMissing.length };
  }

  window.AtlasFieldOffline = { save, status, files, check };
})();
