/* 1.0.17 П-4 · PROGRESS.html — меню «Ход работ»: Порядок · История отметок · Ведомость. Вход и роли на сервере ведёт PGS (своего входа у атласа нет).
   Логика — AtlasProgress (progress-core.js), обмен — AtlasProgressSync (progress-sync.js, только http(s)). Без ключа config progress — сообщение, без запросов.
   Адрес: #tab=plan|journal|sheet&stage=&from=&to=&op=&by=&q=&only=conflicts|open|all&basis=confirmed|all&rows=all
   1.0.19a: Б3 — «Принять все ждущие (N)» с повторной проверкой каждой строки; у технадзора — «ждут приёмки» по умолчанию; Б8 — «Ведомость объёмов для КС (черновик)»:
   «Только отмеченные» и «Все строки», периоды «Этот месяц / Прошлый / Квартал», у технадзора — «Принятые»; Б9 — первый экран по роли (читатель — «Ведомость»,
   технадзор — «История отметок»), «Открыть файл…» и «Сохранить журнал» читателя — в «Ещё», пустые состояния «Отметок пока нет»; Б5 — плашка «Не сохранено: N · Сохранить»,
   «Покинуть сайт?» только при риске потери; Б7/Б10 — этапы по названию, коды мелко, «Принять / Вернуть»; М-12 — ошибки «что случилось → что делать → [Повторить]».
   1.0.20 (§5.2): хост вкладок — window.AtlasProgressPage.register(key, {title, render(body, ctx), count?(ctx)}) и ctx(); при AtlasShell.modesOn() — вкладки по режиму
   (AtlasModes.current), остальные — в «Ещё ▾» на странице; без modesOn() — вкладки и первый экран как в 1.0.19. Фильтры «Истории отметок» only=fix и lot=<id захватки>. */
'use strict';
(() => {
  const AP = window.AtlasProgress, SH = window.AtlasShell;
  /* 1.0.20, §5.2: вкладки других модулей (today, summary — C; accept — B). Регистрация до и после запуска страницы; без modesOn() не показываются. */
  const REG = new Map(), BUILTIN = { plan: 'Порядок', journal: 'История отметок', sheet: 'Ведомость' }, HOST = { ready: false, ctx: null, mk: null, onReg: null };
  window.AtlasProgressPage = {
    register(key, def) {
      if (typeof key !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(key) || key in BUILTIN || !def || typeof def.render !== 'function') return false;
      REG.set(key, def); if (HOST.onReg) { try { HOST.onReg(key); } catch (e) { console.error(e); } } return true;
    },
    ctx() { return HOST.ctx || (HOST.mk ? HOST.mk() : null); }
  };
  const $ = id => document.getElementById(id);
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'on') { for (const [n, f] of Object.entries(v)) e.addEventListener(n, f); } else if (k === 'class') e.className = v; else if (k in e && typeof v !== 'string') e[k] = v; else e.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat(3)) if (c != null && c !== false) { if (c.nodeType) { if (INTER.test(tag) && c.querySelectorAll) for (const a of c.querySelectorAll('abbr[tabindex]')) a.removeAttribute('tabindex'); e.append(c); continue; } const ps = NO_ABBR.test(tag) ? null : abbrOf(c); if (!ps) { e.append(String(c)); continue; } const sp = document.createElement('span'); for (const x of ps) sp.append(typeof x === 'string' ? x : abbrEl(x, tag)); e.append(sp); }   // одной строкой в <span>: в кнопках-flex части не разносятся промежутком gap
    return e;
  };
  // 1.0.19a, решение владельца 13: КС, RFI, PGS в подписях — <abbr title> с расшифровкой (AtlasProgress.abbrParts); не в option, select, textarea, code, abbr
  const NO_ABBR = /^(option|select|textarea|code|abbr|script|style|title)$/i;
  const abbrOf = s => { const A = window.AtlasProgress; return A && typeof A.abbrParts === 'function' ? A.abbrParts(s) : null; };
  /* круг 4: расшифровка видна с клавиатуры и касанием — у <abbr> tabindex=0, по фокусу подсказка рядом со словом (role=tooltip), без фокуса скрыта;
     внутри кнопки или ссылки tabindex не ставится (вложенный фокус), там расшифровка — в title */
  const INTER = /^(button|a|summary|label)$/i;
  const abbrTip = e => { let t = document.getElementById('apgAbbrTip'); if (e.type === 'blur') { if (t) t.hidden = true; return; } if (!t) { t = document.createElement('div'); t.id = 'apgAbbrTip'; t.className = 'apg-abbr-tip'; t.setAttribute('role', 'tooltip'); document.body.append(t); }
    const r = e.currentTarget.getBoundingClientRect(); t.textContent = e.currentTarget.title; t.hidden = false; t.style.left = Math.max(8, Math.min(r.left, innerWidth - t.offsetWidth - 8)) + 'px'; t.style.top = (r.bottom + 6 + t.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - 6 - t.offsetHeight) : r.bottom + 6) + 'px'; };
  const abbrEl = ([w, t], tag) => { const a = document.createElement('abbr'); a.className = 'apg-abbr'; a.title = t; a.textContent = w; if (!INTER.test(tag || '')) { a.tabIndex = 0; a.addEventListener('focus', abbrTip); a.addEventListener('blur', abbrTip); } return a; };
  const app = (el, ...k) => { el.append(...k.flat(3).filter(x => x != null && x !== false)); return el; };   // append без «null» в тексте
  const fmt = (v, k) => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: k == null ? 3 : k }) : String(v);
  const main = $('pgMain'), body = $('pgBody'), sub = $('pgSub'), acts = $('pgActions'), bar = $('pgBar'), tabsEl = $('pgTabs');
  const done = () => main.removeAttribute('aria-busy');
  if (!AP) { sub.textContent = 'Не загрузился модуль хода работ (progress-core.js). Что делать: обновите страницу; если не помогло — проверьте, что папка assets сайта на месте.'; done(); return; }
  const cfg = AP.config();
  if (!cfg) {
    sub.textContent = 'У этого объекта ход работ не включён (ключ progress в конфигурации).';
    body.append(h('p', { class: 'muted' }, 'Модуль подключается данными объекта: ключ ', h('code', {}, 'progress'), ' в project/config.js и набор ', h('code', {}, 'plugins: progress'), '.'));
    done(); return;
  }
  const PGS_NOTE = 'PGS — сайт, где ведутся общий журнал и роли';   // 1.0.19a, словарь 22
  // 1.0.18, П-7: окно PGS (iframe sandbox без allow-same-origin) — хранилища браузера и входа PGS нет: сообщение и эта же страница в новой вкладке
  if (AP.sandboxed()) {
    sub.textContent = 'Страница открыта в окне PGS.';
    const note = h('p', { class: 'muted' }, 'Здесь браузер не даёт сохранить журнал отметок и войти в PGS (' + PGS_NOTE + '). В новой вкладке — порядок работ, журнал, ведомость и отметки работают как обычно.');
    body.append(h('div', { class: 'card pg-card' }, h('p', { class: 'pg-warn', role: 'status' }, 'В окне PGS отметки недоступны — откройте модель в новой вкладке.'), note,
      h('div', { class: 'pg-row' }, h('button', { type: 'button', class: 'pbtn pbtn--primary', on: { click: () => { if (!AP.openTab(location.href)) note.textContent = 'Не открылась новая вкладка — скопируйте адрес: ' + location.href; } } }, 'Открыть в новой вкладке'))));
    if (tabsEl) tabsEl.style.display = 'none';   // круг 1: .tabs-seg (display: inline-flex) перекрывает hidden — без пустой плашки вкладок
    done(); return;
  }
  const pid = cfg.project_id, pub = AP.published(), items = pub.items;
  const T = (SH && SH.title && SH.title()) || {}, R = (SH && SH.release && SH.release()) || {};
  const metaBase = () => ({ object: T.object || T.short || pid, short: T.short || T.object || pid, project_id: pid, release: R.release_label || (pub.itemsMeta && pub.itemsMeta.release) || '', core: (window.ATLAS_CORE_VERSION || (window.ATLAS_RELEASE || {}).core || ''), by: S.user ? S.user.by : '' });
  const S = { store: null, events: [], localPlan: null, plan: null, user: null, closedUntil: null, sync: null, online: null, unsaved: 0, more: 300 };
  const Q = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  const setQ = o => { const q = new URLSearchParams(location.hash.slice(1)); for (const [k, v] of Object.entries(o)) { if (v == null || v === '' || v === false) q.delete(k); else q.set(k, v); } history.replaceState(null, '', '#' + q.toString()); };
  const nameOf = id => { const it = items[id] || {}; const x = AP.splitKey(id, k => k in items); const b = items[x.id] || {}; return it.nm || (x.part ? (b.nm ? b.nm + ' · ' : '') + x.part : b.nm) || ''; };
  const info = (id, part) => { const k = AP.joinKey(id, part), it = items[k] || items[id] || {}; return { title: it.nm || (part ? part : ''), section: it.sec || '', type_id: it.ty ?? null }; };
  const EL = ['элемент', 'элемента', 'элементов'], nEl = n => fmt(n, 0) + ' ' + AP.plural(n, EL);

  // A plan includes parts as well as bodies. Use the exact build-time body inventory.
  // r2, Р-1: один разборщик ключей с вкладкой — items.bd, body_ids, самый длинный префикс-тело (план содержит и тела, и части)
  const isBody = AP.keyResolver(items, { bodyIds: pub.bodyIds });
  const bodyOf = k => { const x = AP.splitKey(k, isBody); return x.part ? x.id : undefined; };   // Р-2: событие части несёт body
  const roleName = (r, online) => r ? AP.ROLE_LABEL[r] || r : online ? 'только просмотр' : 'роль не задана';   // К-7: не «null»
  // круг 3 (К2): вход не подтверждён сервером — автор по последнему входу устройства (preUser, preRole), события с пометкой _nc
  const pre = () => !!(S.online && S.online.online && !S.online.user && S.online.preUser);
  const role = () => S.online && S.online.user ? S.online.role : pre() ? S.online.preRole : S.user ? S.user.role : null;
  const who = () => S.online && S.online.user ? S.online.user : pre() ? S.online.preUser : S.user ? S.user.by : null;
  const preHow = () => pre() ? { user: S.online.preUser, nc: true } : undefined;
  // круг 4 (Н3-1): вход не подтверждён и К2 выключен, а имя на устройстве есть — куда на деле идёт отметка: в очередь последнего вошедшего (Р-6, _u = lastUser) или без автора (Р-13)
  const fate = o => o && o.lastUser ? 'отметки записываются в этом браузере в очередь «' + o.lastUser + '» (последний вход на этом устройстве) и ' + (o.lastRole === null ? 'уйдут, только если в PGS ему дадут роль журнала (его последний вход — только просмотр); сохраните журнал в файл' : o.notFound ? 'уйдут, когда объект найдётся в PGS и он войдёт' : 'уйдут, когда он войдёт')   /* К4-1 */
    : 'отметки записываются в этом браузере как сделанные до входа — после входа их можно отправить от своего имени или оставить местными';
  const errName = e => String(e && (e.name || e.message) || e);
  const canPlan = () => AP.canPlan(role());
  const writer = () => AP.can(role(), 'done');   // 1.0.19a, Б9: читатель — без роли записи
  const stageOfId = id => AP.stagesOf(S.plan).find(s => s.id === id) || null;
  const stageOfEv = (e, idx) => e.stage || (AP.stageOfKey(idx, e.id, isBody) || {}).id || '';   // r3, Р-12: этап события — по полю stage, затем по плану
  const stageCell = id => { const s = id ? stageOfId(id) : null; return s ? [AP.stageName(s), ' ', h('small', { class: 'code muted' }, s.id)] : id ? h('span', { class: 'code' }, id) : ''; };
  const srcText = () => S.online && S.online.online && S.online.user ? 'данные PGS и этого браузера' : 'данные этого браузера' + (pub.journal.length ? ' и среза выпуска' : '');
  const emptyNote = () => h('div', { class: 'card pg-card pg-empty' }, h('p', {}, h('strong', {}, 'Отметок пока нет'), ' · ' + srcText()), h('p', { class: 'muted' }, writer() ? 'Отметки ставятся на модели: «На модели» → «Отмечать».' : 'Отметки появятся, когда их сделают на модели или загрузят файл журнала («Ещё» → «Открыть файл…»).'));
  let toastT = 0;
  /* М-12, О-12: ошибки — «что случилось → что делать», висят до «Закрыть», с кнопкой действия (act {label, run}); прочие — 6,5 с, при наведении не гаснут.
     Текст сообщения — первым узлом (#pgToast textContent начинается с него). */
  const toast = (t, bad, act) => {
    let el = $('pgToast');
    if (!el) { el = h('div', { id: 'pgToast', class: 'pg-toast', role: 'status', 'aria-live': 'polite', on: { mouseenter: () => clearTimeout(toastT), mouseleave: () => { if (!el.classList.contains('pg-toast--bad')) { clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 6500); } } } }); document.body.append(el); }
    el.textContent = ''; el.append(h('span', { class: 'pg-toast-msg' }, t));
    if (act && typeof act.run === 'function') el.append(h('button', { type: 'button', class: 'pg-toast-btn', on: { click: () => { el.hidden = true; act.run(); } } }, act.label || 'Повторить'));
    if (bad) el.append(h('button', { type: 'button', class: 'pg-toast-btn', on: { click: () => { el.hidden = true; } } }, 'Закрыть'));
    el.classList.toggle('pg-toast--bad', !!bad); el.setAttribute('role', bad ? 'alert' : 'status'); el.setAttribute('aria-live', bad ? 'assertive' : 'polite'); el.hidden = false; clearTimeout(toastT);
    if (!bad) toastT = setTimeout(() => { el.hidden = true; }, 6500);
  };
  const storeErr = (what, e) => what + ': хранилище браузера не приняло запись (' + errName(e) + '). Что делать: сохраните журнал в файл, освободите место в браузере и повторите.';

  /* ---------- данные ---------- */
  async function load() {
    const local = await S.store.active();   // без отклонённых сервером
    S.events = AP.merge(pub.journal, local).events;
    S.localPlan = await S.store.get('plan') || null;
    S.plan = AP.effectivePlan(pub.plan, S.localPlan);
    S.user = await S.store.get('user') || null;
    S.closedUntil = await S.store.get('closedUntil') || null;
    S.unsaved = await S.store.unsaved();
    S.rejected = await S.store.rejected();
    const rej = (await S.store.get('server:rejected')) || {}, done = (await S.store.get('server:retried')) || {};
    S.rejList = Object.keys(rej).length ? (await S.store.all()).filter(e => rej[e.eid] && !done[e.eid]).map(e => ({ e, reason: rej[e.eid] })) : [];
  }
  async function refresh() { await load(); renderHead(); renderTab(); }

  /* ---------- шапка страницы ---------- */
  function renderHead() {
    const p = S.plan;
    sub.textContent = [T.object || pid, p ? 'план ' + (p.plan_id || '') + ' · ревизия ' + (p.rev ?? '—') + ' · ' + (p.status === 'approved' ? 'утверждён' : 'черновик') + (p._local ? ' (местная правка)' : '') : 'плана нет', pub.journalAsOf ? 'срез журнала выпуска на ' + AP.ruDate(String(pub.journalAsOf).slice(0, 10)) : null].filter(Boolean).join(' · ');
    acts.textContent = '';
    const u = who(), r = role();
    acts.append(h('button', { type: 'button', class: 'pbtn pg-user', on: { click: () => userDialog() }, title: 'Кто отмечает: имя и роль' }, u ? u + ' · ' + roleName(r, !!(S.online && S.online.user)) + (pre() ? ' · вход не подтверждён сервером' : '') : 'Кто отмечает?'));   // круг 3 (К2)
    const file = h('input', { type: 'file', accept: '.json,.js,application/json', multiple: true, hidden: true, on: { change: e => importFiles(e.target.files).then(() => { e.target.value = ''; }) } });
    const openBtn = h('button', { type: 'button', class: 'pbtn', on: { click: () => file.click() }, title: 'Файлы журнала операторов и файл плана — можно несколько сразу' }, 'Открыть файл…');
    const saveBtn = h('button', { type: 'button', class: 'pbtn' + (S.unsaved ? ' pbtn--outline' : ''), on: { click: saveJournal }, title: 'Журнал этого браузера — в файл (основное хранилище до сервера)' }, 'Сохранить журнал' + (S.unsaved ? ' · ' + S.unsaved : ''));
    // 1.0.19a, Б9: читателю «Открыть файл…» и «Сохранить журнал» — в «Ещё» (несохранённые есть — «Сохранить» на плашке)
    const toModel = () => h('a', { class: 'pbtn pbtn--primary', href: 'index.html#progress=1' + (Q().stage ? '&stage=' + encodeURIComponent(Q().stage) : '') }, 'На модели');
    const site = siteView();
    S.siteActs = site ? () => [h('button', { type: 'button', class: 'pbtn', on: { click: () => file.click() }, title: openBtn.title }, 'Открыть файл…'), h('button', { type: 'button', class: saveBtn.className, on: { click: saveJournal }, title: saveBtn.title }, saveBtn.textContent), toModel()] : null;
    if (site) acts.append(file);   // 1.0.20, §14: «Площадка» — первый экран ≤ 30: действия — в «Ещё ▾» вкладок
    else if (writer()) acts.append(file, openBtn, saveBtn);
    else { const m = h('details', { class: 'pg-more' }, h('summary', { class: 'pbtn' }, 'Ещё'), h('div', { class: 'pg-more-l' }, openBtn, saveBtn)); acts.append(file, modesOn() ? shut(m) : m); }
    if (!site) acts.append(toModel());
    bar.textContent = '';
    const notes = [];
    if (S.store.memory) notes.push(h('span', { class: 'pg-warn' }, 'Хранилище браузера недоступно (' + (S.store.memoryWhy || 'приватное окно?') + '): отметки живут до закрытия вкладки — сохраняйте журнал в файл.'));
    if (S.unsaved) notes.push(h('span', { class: 'pg-save' }, 'Не сохранено: ' + S.unsaved + ' · ', h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: saveJournal } }, 'Сохранить')));   // 1.0.19a, Б5: плашка
    const O = S.online, unconf = O && O.unconf ? ' · ждут подтверждения входа: ' + O.unconf : '';
    const errShown = O && O.error && !O.paused && !O.notFound ? O.error : null;   // круг 4 (Л1): сбой записи входа (warn) — до следующей успешной записи
    if (O && O.online) notes.push(O.user ? h('span', { class: O.warn ? 'pg-warn' : 'pg-ok' }, 'Вы: ' + O.user + ', ' + roleName(O.role, true) + (O.others ? ' · ждут входа своего автора: ' + O.others : '') + (O.pending ? ' · ждут отправки ' + O.pending : '') + (errShown ? ' · ' + errShown : '') + (O.warn && O.warn !== errShown ? ' · ' + O.warn : '')) : h('span', {}, 'Журнал на сервере PGS: ' + (!O.needLogin && !O.forbidden && (O.paused || O.notFound) ? 'вход не подтверждён сервером' : 'вход не выполнен') + ' — ', h('a', { href: O.loginUrl || '/login', target: '_top' }, 'Войти в PGS'), unconf),   // круг 3 (К2, Ф3)
      h('span', { class: 'muted' }, PGS_NOTE + '; пользователи и роли — там'));
    // 1.0.18, П-1: 404 на проверке входа — объекта нет в PGS; прочий неуспех — отправка приостановлена до следующей успешной проверки (отметки записываются)
    // круг 3 (К2, Ф3): вход в этом сеансе не подтверждён — от имени последнего пользователя устройства (отправятся после подтверждения) или «записать после ответа сервера»
    const cause = O && O.online ? (O.notFound ? 'объект не найден в PGS' : O.paused) : null;
    if (cause && !O.user && O.preUser) notes.push(h('span', { class: 'pg-warn' }, 'Сервер PGS не подтвердил вход (' + cause + '): отметки записываются в этом браузере от имени «' + O.preUser + '» (последний вход на этом устройстве) с пометкой «вход не подтверждён сервером» и уйдут на сервер, когда сервер подтвердит этот вход'));
    // круг 4 (О2): в сеансе был 401 (needLogin), потом сбой — нужен вход, а не «ответ сервера»; (Н3-1) с именем на устройстве — куда на деле идёт отметка
    else if (cause && !O.user && O.needLogin) notes.push(h('span', { class: 'pg-warn' }, 'Вход в PGS не выполнен (последняя проверка: ' + cause + ') — войдите в PGS' + (who() ? '; ' + fate(O) : '')));
    else if (cause && !O.user) notes.push(h('span', { class: 'pg-warn' }, 'Сервер PGS не подтвердил вход (' + cause + '): ' + (who() ? fate(O) : 'отметки можно будет записать после ответа сервера')));
    else if (O && O.online && O.notFound) notes.push(h('span', { class: 'pg-warn' }, 'Объект не найден в PGS: отметки и автор сохранены в этом браузере, отправка закрыта'));
    else if (O && O.online && O.paused) notes.push(h('span', { class: 'pg-warn' }, 'Отправка приостановлена до следующей проверки входа PGS (' + O.paused + '): отметки записываются в этом браузере'));
    const nAnon = O && O.user ? (O.anon || 0) + (O.preOther || 0) : 0;
    if (nAnon) notes.push(h('span', { class: 'pg-warn' }, (O.anon ? 'Отметки до первого входа в PGS (автор не подтверждён): ' + O.anon + ' ' : '') + (O.preOther ? 'Сделаны до входа от имени «' + (O.preOtherBy || []).join('», «') + '» (вход не был подтверждён сервером): ' + O.preOther + ' ' : ''),   // r3, Р-13; круг 3 (К2)
      h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: async () => { if (!confirm('Отправить ' + nAnon + ' ' + AP.plural(nAnon, ['отметку', 'отметки', 'отметок']) + ' от имени «' + O.user + '»? На сервере автором будет этот пользователь.')) return;   /* 1.0.18, П-4 */ const rej0 = Object.keys(S.sync.state().rejected || {}).length; let n; try { n = await S.sync.adoptAnon(); } catch (e) { toast(storeErr('Не записано', e), true); refresh(); return; }   /* 1.0.18, П-5 */
        // круг 1 (К4); круг 3 (Ф2): «Отправлено» — только если сервер принял (очередь пуста); иначе «Помечено…, ждут отправки N (причина)»; отклонённые — отдельно
        const st = S.sync.state(), rejN = Math.max(0, Object.keys(st.rejected || {}).length - rej0), stop = st.notFound ? 'отправка закрыта (объект не найден в PGS)' : st.paused ? 'отправка приостановлена (' + st.paused + ')' : !st.user ? 'отправка остановлена (' + (st.error || 'Войти в PGS') + ')' : st.readOnly ? 'на сервер не уйдут (только просмотр: в PGS нет роли журнала)' : st.pending ? 'ждут отправки ' + st.pending + (st.error ? ' (' + st.error + ')' : '') : null;
        toast(stop ? 'Помечено от вашего имени: ' + n + ' — ' + stop : 'Отправлено от вашего имени: ' + (n - rejN) + (rejN ? ' · отклонено сервером: ' + rejN : ''), !!stop || !!rejN); refresh(); } } }, 'Отправить от моего имени'), ' ',
      h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: async () => { let n; try { n = await S.sync.keepAnon(); } catch (e) { toast(storeErr('Не записано', e), true); refresh(); return; } toast('Оставлены местными: ' + n + ' (на сервер не уходят, в файл журнала — да)'); refresh(); } } }, 'Оставить местными')));
    if (S.online && S.online.online && S.online.imported) notes.push(h('span', { class: 'pg-warn' }, 'Не отправлено — импорт: ' + S.online.imported + ' (события из файлов отправляет технадзор)'));
    if (S.online && S.online.online && S.online.readOnly) notes.push(h('span', { class: 'pg-warn' }, 'Только просмотр: в PGS нет роли журнала' + (S.online.viewOnly ? ' — ваши отметки на сервер не уйдут: ' + S.online.viewOnly + (S.online.viewOnlyUnsaved ? ' (сохраните журнал в файл)' : ' (они сохранены в файле журнала)') : '')));   // круг 4 (Н3-2)
    if (S.online && S.online.forbidden) notes.push(h('span', { class: 'pg-warn' }, 'Нет доступа к проекту в PGS'));
    if (S.rejected) notes.push(h('span', { class: 'pg-warn' }, 'Отклонено сервером: ' + S.rejected + ' (в свёртку не входят)'));
    if (S.closedUntil) notes.push(h('span', {}, 'Закрытый период — до ' + AP.ruDate(S.closedUntil) + ' включительно (правки только с примечанием)'));
    if (S.plan && S.plan._staleLocal) notes.push(h('span', { class: 'pg-warn' }, 'Местная правка плана старше опубликованной ревизии — показан опубликованный план.'));
    bar.append(...notes); bar.hidden = !notes.length;
  }
  // круг 1 (К2): проверка входа не удалась (404 или приостановка) — сервер вход не подтвердил, это не «вход не найден»
  // круг 3 (К2): есть последний пользователь устройства — отметки от его имени с пометкой, уйдут после подтверждения входа
  // круг 4 (О2, Н3-1): после 401 в сеансе — «войдите в PGS»; с именем на устройстве — куда на деле идёт отметка
  const noCheck = o => !(o && (o.notFound || o.paused)) ? null : o.preUser ? 'Сервер PGS не подтвердил вход (' + (o.notFound ? 'объект не найден в PGS' : o.paused) + '). Отметки записываются от имени «' + o.preUser + '» (последний вход на этом устройстве) с пометкой «вход не подтверждён сервером» и уйдут на сервер после подтверждения входа; если войдёт другой пользователь — решение в «Истории отметок»: отправить от его имени или оставить местными.'
    : o.needLogin ? 'Вход в PGS не выполнен (последняя проверка: ' + (o.notFound ? 'объект не найден в PGS' : o.paused) + ') — войдите в PGS и нажмите «Проверить вход»' + (who() ? '; ' + fate(o) + '.' : '.')
    : 'Сервер PGS не подтвердил вход (' + (o.notFound ? 'объект не найден в PGS' : o.paused) + ') — ' + (who() ? (o.lastUser ? fate(o) + '.' : 'отметки записываются как сделанные до входа.') : 'отметки можно будет записать после ответа сервера.');
  function userDialog() {
    const back = document.activeElement;
    const d = h('dialog', { class: 'pg-dlg', 'aria-labelledby': 'pgDlgH' });
    const close = () => { try { d.close(); } catch (e) { /* */ } d.remove(); const b = back && back.isConnected ? back : document.querySelector('.pg-user'); if (b) { try { b.focus(); } catch (e) { /* */ } } };
    if (S.sync && S.online && S.online.online) {
      const msg = h('p', { class: 'muted', 'aria-live': 'polite' }, S.online.user ? 'Сейчас: ' + S.online.user + ' · ' + roleName(S.online.role, true) : noCheck(S.online) || 'Вход не выполнен. Войдите в PGS (вход и роли ведёт PGS) и нажмите «Проверить вход».');
      d.append(h('h2', { id: 'pgDlgH' }, 'Журнал на сервере PGS'), h('p', { class: 'muted' }, PGS_NOTE + '.'), msg,
        h('div', { class: 'pg-row' }, !S.online.user && S.online.loginUrl ? h('a', { class: 'pbtn pbtn--primary', href: S.online.loginUrl, target: '_top' }, 'Войти в PGS') : null, h('button', { type: 'button', class: 'pbtn', on: { click: async () => { const r = await S.sync.me(); if (r.user) { close(); refresh(); } else msg.textContent = noCheck(S.sync.state()) || 'Вход в PGS не найден — войдите в PGS в этом браузере и повторите.'; } } }, 'Проверить вход'),
          h('button', { type: 'button', class: 'pbtn', on: { click: close } }, 'Закрыть')));
    } else {
      const nm = h('input', { type: 'text', value: S.user ? S.user.by : '', id: 'pgName', placeholder: 'Иванов И. И.', autocomplete: 'name' });
      const rl = h('select', { id: 'pgRole' }, ['operator', 'supervisor'].map(r => h('option', { value: r, selected: S.user && S.user.role === r }, AP.ROLE_LABEL[r])));
      d.append(h('h2', { id: 'pgDlgH' }, 'Кто отмечает'), h('p', { class: 'muted' }, 'Без сервера роль задаётся по имени, без пароля. Имя попадает в каждое событие журнала.'),
        h('label', { class: 'pg-f', for: 'pgName' }, h('span', {}, 'Фамилия И. О.'), nm), h('label', { class: 'pg-f', for: 'pgRole' }, h('span', {}, 'Роль'), rl),
        h('div', { class: 'pg-row' }, h('button', { type: 'button', class: 'pbtn pbtn--primary', on: { click: async () => { const by = nm.value.trim(); if (!by) { nm.focus(); return; } try { await S.store.set('user', { by, role: rl.value }); } catch (e) { toast(storeErr('Имя не записано', e), true); return; }   /* круг 3 (Н-1) */ close(); refresh(); } } }, 'Сохранить'), h('button', { type: 'button', class: 'pbtn', on: { click: close } }, 'Отмена')));
    }
    d.addEventListener('cancel', e => { e.preventDefault(); close(); });
    document.body.append(d); d.showModal();
  }
  // 1.0.19a, Б5: файл журнала — AtlasProgress.saveJournal (тот же файл, что в 1.0.18, и тот же путь, что в панели на модели)
  async function saveJournal() {
    let r; try { r = await AP.saveJournal(S.store, { project_id: pid, by: who() || 'оператор' }); } catch (e) { toast('Файл журнала не сохранён (' + errName(e) + '). Что делать: нажмите «Повторить».', true, { label: 'Повторить', run: saveJournal }); return; }
    if (!r.n) { toast('В этом браузере отметок нет.'); return; }
    if (r.markErr) { toast('Журнал выгружен (' + r.name + '), но пометка «сохранено в файл» не записана: ' + errName(r.markErr) + '. Что делать: проверьте файл в загрузках; отметки остаются в браузере.', true); refresh(); return; }   // 1.0.18, П-5
    toast('Журнал сохранён: ' + r.name); refresh();
  }
  async function importFiles(files) {
    const res = await AP.readFiles(files, { project_id: pid }), lines = []; let bad = false;
    for (const r of res) {
      if (r.kind === 'journal' && !r.events.length && r.errors.length) { lines.push(r.name + ': не принят — ' + r.errors[0]); continue; }   // Д9: причина отказа (файл другого объекта и т. п.)
      if (r.kind === 'journal') { let a; try { a = await S.store.add(r.events, { saved: true, imported: true }); } catch (e) { bad = true; lines.push(r.name + ': не записан — хранилище браузера не приняло запись (' + errName(e) + ')'); continue; }   /* 1.0.18, П-5 */   /* онлайн: отправляет только технадзор, с автором по файлу */ lines.push(r.name + ': событий ' + r.events.length + ', новых ' + a.added.length + (a.dup.length ? ', повторов ' + a.dup.length : '') + (a.clash.length ? ', расхождений eid ' + a.clash.length : '') + (r.skipped ? ', пропущено ' + r.skipped + (r.errors[0] ? ' (' + r.errors[0] + (r.errors.length > 1 ? ' и др.' : '') + ')' : '') : '')); }
      else if (r.kind === 'plan') {
        const c = AP.planCheck(r.plan);
        if (c.errors.length) { lines.push(r.name + ': план не принят — ' + c.errors.map(e => e.msg).join('; ')); continue; }
        if (!canPlan()) { lines.push(r.name + ': план правит технадзор'); continue; }
        try { await S.store.set('plan', Object.assign({}, r.plan, { base_rev: pub.plan ? pub.plan.rev ?? 0 : 0 })); } catch (e) { bad = true; lines.push(r.name + ': план не записан — хранилище браузера не приняло запись (' + errName(e) + ')'); continue; }   // круг 3 (Н-1)
        lines.push(r.name + ': план ревизии ' + (r.plan.rev ?? '—') + ' принят как местная правка' + (c.warnings.length ? ' (предупреждений ' + c.warnings.length + ')' : ''));
      } else lines.push(r.name + ': ' + (r.errors[0] || 'не распознан'));
    }
    // круг 2 (B-06): совет — по причине: сбой хранилища → место в браузере; файл не разобран или не принят → проверить файл
    const badFile = res.some(r => r.errors && r.errors.length && !r.events.length && !r.plan), failed = bad || badFile;
    const todo = [bad ? 'освободите место в браузере или сохраните журнал в файл и откройте снова' : '', badFile ? 'проверьте, что это файл журнала или плана этого объекта, и откройте снова' : ''].filter(Boolean).join('; ');
    toast((lines.join(' · ') || 'Файлы не выбраны') + (todo ? '. Что делать: ' + todo + '.' : ''), failed); refresh();
  }

  /* ---------- вкладки ---------- */
  // 1.0.19a, словарь 3: Порядок · История отметок · Ведомость; Б9: первый экран по роли — технадзор «История отметок», читатель «Ведомость», оператор «Порядок»
  const TABS = [['plan', 'Порядок'], ['journal', 'История отметок'], ['sheet', 'Ведомость']];
  const defTab = () => role() === 'supervisor' ? 'journal' : writer() ? 'plan' : 'sheet';
  /* 1.0.20, §5.2: режимы (ключ modes) — главные вкладки по режиму, остальные в «Ещё ▾»; незарегистрированная вкладка модуля не показывается */
  const MODE_TABS = { site: [['today', 'journal'], ['plan', 'sheet', 'summary']], supervisor: [['accept', 'journal', 'sheet'], ['summary', 'plan', 'today']], overview: [['summary', 'sheet'], ['journal', 'plan']] };
  const MODE_FIRST = { site: 'today', supervisor: 'accept', overview: 'summary' };
  const modesOn = () => { try { return !!(SH && typeof SH.modesOn === 'function' && SH.modesOn()); } catch (e) { return false; } };
  // П3-1 (§6.5 п. 8): метка разметки режимов для стилей сенсора (цели ≥ 56 px при pointer: coarse, atlas-progress.css) — только при modesOn(); без ключа класса нет (0 px)
  if (modesOn()) document.body.classList.add('pg-modes');
  const modeNow = () => { let m = null; try { m = window.AtlasModes && typeof AtlasModes.current === 'function' ? AtlasModes.current() : null; } catch (e) { /* */ } return MODE_TABS[m] ? m : 'overview'; };
  const hasTab = k => !!k && (k in BUILTIN || REG.has(k));
  const tabSet = () => { const [m, x] = MODE_TABS[modeNow()]; return { main: m.filter(hasTab), more: x.filter(hasTab) }; };
  const firstTab = () => { const md = modeNow(); let f = null; try { f = window.AtlasModes && typeof AtlasModes.progressTab === 'function' ? AtlasModes.progressTab(md) : null; } catch (e) { /* */ } f = hasTab(f) ? f : MODE_FIRST[md]; const t = tabSet(); return hasTab(f) ? f : t.main[0] || t.more[0] || defTab(); };
  const curTab = () => { const t = Q().tab; if (!modesOn()) return TABS.some(x => x[0] === t) ? t : defTab(); return hasTab(t) ? t : firstTab(); };
  const tabTitle = (k, c) => { if (k in BUILTIN) return BUILTIN[k]; const d = REG.get(k) || {}; let n = null; if (typeof d.count === 'function') { try { n = d.count(c); } catch (e) { console.error(e); } } return String(d.title || k) + (n != null && n !== '' ? ' · ' + (typeof n === 'number' ? fmt(n, 0) : n) : ''); };
  const goTab = k => { setQ({ tab: k }); renderTab(); const b = $('pgTab-' + k); if (b) b.focus(); };
  // 1.0.20, §14: пункты закрытого меню («Ещё», «Ещё ▾») не видны и не в порядке Tab — у списка hidden, пока details закрыт (только при modesOn)
  const shut = d => { const l = d.querySelector(':scope > .pg-more-l'); if (!l) return d; const f = () => { l.hidden = !d.open; }; f(); d.addEventListener('toggle', f); return d; };
  const siteView = () => modesOn() && modeNow() === 'site';
  function renderTabs() {
    const cur = curTab(), M = modesOn(), old = $('pgTabsMore');
    tabsEl.textContent = '';
    if (!M) {
      if (old) old.remove();
      for (const [k, t] of TABS) { tabsEl.append(h('button', { type: 'button', role: 'tab', id: 'pgTab-' + k, 'aria-selected': String(k === cur), 'aria-controls': 'pgBody', tabindex: k === cur ? '0' : '-1', on: { click: () => { setQ({ tab: k }); renderTab(); }, keydown: e => { const i = TABS.findIndex(x => x[0] === k), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (j == null) return; e.preventDefault(); const n = TABS[(j + TABS.length) % TABS.length][0]; setQ({ tab: n }); renderTab(); const b = $('pgTab-' + n); if (b) b.focus(); } } }, t)); }
      tabsEl.hidden = false; return;
    }
    const c = HOST.ctx || mkCtx(), t = tabSet(), shown = t.main.slice(); if (!shown.includes(cur)) shown.push(cur);   // вкладка из «Ещё», открытая по адресу, — видна выбранной
    for (const k of shown) tabsEl.append(h('button', { type: 'button', role: 'tab', id: 'pgTab-' + k, 'data-tab': k, 'aria-selected': String(k === cur), 'aria-controls': 'pgBody', tabindex: k === cur ? '0' : '-1', on: { click: () => goTab(k), keydown: e => { const i = shown.indexOf(k), j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null; if (j == null) return; e.preventDefault(); goTab(shown[(j + shown.length) % shown.length]); } } }, tabTitle(k, c)));
    tabsEl.hidden = false;
    const more = t.more.filter(k => !shown.includes(k)), xa = siteView() && S.siteActs ? S.siteActs() : [];   // «Площадка» (§14): «Открыть файл…», «Сохранить журнал», «На модели» — здесь
    if (!more.length && !xa.length) { if (old) old.remove(); return; }
    for (const x of xa) { x.setAttribute('role', 'menuitem'); x.addEventListener('click', () => { d.open = false; }); }
    const d = h('details', { class: 'pg-more pg-tabs-more', id: 'pgTabsMore' }, h('summary', { class: 'pbtn', 'aria-label': xa.length ? 'Ещё: разделы и файлы журнала' : 'Ещё разделы хода работ' }, 'Ещё ▾'),
      h('div', { class: 'pg-more-l', role: 'menu' }, more.map(k => h('button', { type: 'button', role: 'menuitem', class: 'pbtn', 'data-tab': k, on: { click: () => { d.open = false; goTab(k); } } }, tabTitle(k, c))),
        more.length && xa.length ? h('hr', { class: 'pg-more-sep', role: 'separator' }) : null, xa));
    shut(d);
    d.addEventListener('keydown', e => { if (e.key === 'Escape' && d.open) { e.preventDefault(); d.open = false; d.querySelector('summary').focus(); } });
    if (old) old.replaceWith(d); else tabsEl.after(d);
  }
  function renderTab() {
    HOST.ctx = modesOn() ? mkCtx() : null;
    renderTabs();
    const cur = curTab(); body.textContent = ''; body.setAttribute('role', 'tabpanel'); body.setAttribute('aria-labelledby', 'pgTab-' + cur);
    try { if (REG.has(cur) && !(cur in BUILTIN)) REG.get(cur).render(body, HOST.ctx || mkCtx()); else (cur === 'journal' ? renderJournal : cur === 'sheet' ? renderSheet : renderPlan)(); } catch (e) { body.append(h('p', { class: 'pg-warn' }, 'Вкладка не построена: ' + (e && e.message || e) + '. Что делать: обновите страницу; если повторяется — сообщите координатору.')); console.error(e); }
    // 1.0.20 (от A): адрес вкладки пишется replaceState — hashchange от вкладок, go() и setQ() нет; подсветка кнопки режима в шапке — по #tab
    if (HOST.ctx) { try { const A = window.AtlasShell; if (A && typeof A.syncProgressNav === 'function') A.syncProgressNav(); } catch (e) { /* */ } }
  }
  /* ctx для вкладок модулей (§5.2): снимок данных на момент отрисовки и функции страницы */
  const memKey = () => { try { return SH && typeof SH.storageKey === 'function' ? SH.storageKey('progress-last') : 'atlas:' + (/^[a-z0-9-]+$/.test(pid || '') ? pid : 'default') + ':progress-last'; } catch (e) { return null; } };
  const memGet = () => { try { const k = memKey(), v = k ? localStorage.getItem(k) : null, o = v ? JSON.parse(v) : null; return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
  const memSet = o => { try { const k = memKey(); if (k) localStorage.setItem(k, JSON.stringify(Object.assign(memGet(), o))); return !!k; } catch (e) { return false; } };
  const go = (tab, q) => { const p = new URLSearchParams(); if (tab) p.set('tab', tab); for (const [k, v] of Object.entries(q || {})) if (v != null && v !== '' && v !== false) p.set(k, v); history.replaceState(null, '', '#' + p.toString()); S.more = 300; renderTab(); };
  function mkCtx() {
    const idx = S.plan ? AP.stageIndex(S.plan) : new Map();
    return { AP, h, items, plan: S.plan, events: S.events, states: AP.fold(S.events), role, who, writer, online: () => S.online && S.online.online ? S.online : null, canPlan, srcText,
      addEvents, toast, userDialog, go, nameOf, stageOf: e => stageOfEv(e, idx), bodyOf, memGet, memSet, closedUntil: S.closedUntil, digestSnapshot: window.ATLAS_PROGRESS_DIGEST || null, mode: modesOn() ? modeNow() : null, loadRemarks };
  }
  HOST.mk = () => mkCtx();
  HOST.onReg = key => { if (!HOST.ready || !modesOn()) return; const q = Q().tab; if (q === key || (!hasTab(q) && curTab() === key)) renderTab(); else renderTabs(); };   // вкладка, зарегистрированная после запуска, — без перезагрузки

  /* ---------- Порядок ---------- */
  const clonePlan = () => JSON.parse(JSON.stringify(Object.assign({}, S.plan, { _local: undefined, _staleLocal: undefined })));
  async function savePlan(p, why) {
    p.base_rev = pub.plan ? pub.plan.rev ?? 0 : (S.localPlan && S.localPlan.base_rev) || 0;
    p.rev = Math.max(p.rev || 0, (pub.plan && pub.plan.rev) || 0) + (S.plan && S.plan._local ? 0 : 1);
    p.edited = AP.nowIso(); p.edited_by = who() || '';
    try { await S.store.set('plan', p); } catch (e) { toast(storeErr('План не записан', e), true, { label: 'Повторить', run: () => savePlan(p, why) }); refresh(); return; }   // круг 3 (Н-1)
    toast(why || 'План сохранён в этом браузере (местная правка).'); refresh();
  }
  function renderPlan() {
    const p = S.plan, edit = canPlan();
    if (!p) {
      body.append(h('div', { class: 'card pg-card' }, h('p', {}, 'У выпуска нет плана работ (data/progress_plan.js). Откройте файл плана («Открыть файл…») или создайте первый этап.'), edit ? h('button', { type: 'button', class: 'pbtn', on: { click: () => savePlan({ schema: 1, plan_id: pid + '-plan', rev: 0, status: 'draft', basis: 'создан в меню', stages: [{ id: 'S010', n: 10, title: 'Этап 1', after: [], ids: [] }] }) } }, 'Создать план') : h('p', { class: 'muted' }, 'Создать план может технадзор.')));
      return;
    }
    const chk = AP.planCheck(p, k => k in items || !Object.keys(items).length), stages = AP.stagesOf(p), states = AP.fold(S.events, AP.today());
    const head = h('div', { class: 'pg-plan-head' },
      h('span', { class: 'pg-badge ' + (p.status === 'approved' ? 'pg-badge--ok' : 'pg-badge--draft') }, p.status === 'approved' ? 'утверждён' : 'черновик'),
      h('span', { class: 'muted' }, (p.basis || '') + (p.approved_by ? ' · утвердил ' + p.approved_by + ' ' + AP.ruDate(String(p.approved_at || '').slice(0, 10)) : '')));
    const tools = h('div', { class: 'pg-row' });
    if (edit) {
      tools.append(h('button', { type: 'button', class: 'pbtn', on: { click: () => { const q = clonePlan(), n = stages.length ? Math.max(...stages.map(s => s.n || 0)) + 10 : 10; let id = 'S' + String(n).padStart(3, '0'); while (q.stages.some(s => s.id === id)) id += 'a'; q.stages.push({ id, n, title: 'Новый этап', after: stages.length ? [stages[stages.length - 1].id] : [], ids: [] }); savePlan(q); } } }, 'Добавить этап'));
      tools.append(p.status === 'approved'
        ? h('button', { type: 'button', class: 'pbtn', on: { click: () => { const q = clonePlan(); q.status = 'draft'; delete q.approved_by; delete q.approved_at; savePlan(q, 'План возвращён в черновик.');   /* Д11а */ } } }, 'Вернуть в черновик')
        : h('button', { type: 'button', class: 'pbtn pbtn--outline', disabled: chk.errors.length > 0, title: chk.errors.length ? 'Сначала исправьте ошибки плана' : null, on: { click: () => { const q = clonePlan(); q.status = 'approved'; q.approved_by = who(); q.approved_at = AP.nowIso(); savePlan(q, 'План утверждён (местная правка — сохраните в файл или отправьте на сервер).'); } } }, 'Утвердить'));
      if (S.localPlan) tools.append(h('button', { type: 'button', class: 'pbtn', on: { click: async () => { if (!confirm('Сбросить местную правку плана и вернуться к плану выпуска?')) return; try { await S.store.set('plan', null); } catch (e) { toast(storeErr('Правка плана не сброшена', e), true); return; }   /* круг 3 (Н-1) */ refresh(); } } }, 'Сбросить правку'));
      if (S.sync && S.online && S.online.user) tools.append(h('button', { type: 'button', class: 'pbtn', on: { click: pushPlan } }, 'На сервер'));
    }
    if (S.sync && S.online && S.online.user) {
      tools.append(h('button', { type: 'button', class: 'pbtn', title: 'План сервера — местной правкой (ревизия сервера запоминается для If-Match)', on: { click: pullPlan } }, 'План с сервера'));
    }
    tools.append(h('button', { type: 'button', class: 'pbtn', on: { click: () => AP.save(AP.planFile(clonePlan(), { project_id: pid })) } }, 'Скачать план (JSON)'));
    body.append(h('div', { class: 'pg-toolbar' }, head, tools));
    if (!S.events.length) body.append(emptyNote());
    if (!edit) body.append(h('p', { class: 'muted' }, 'Порядок правит технадзор (роль «технадзор»), остальным — только просмотр.'));
    if (chk.errors.length || chk.warnings.length) body.append(h('details', { class: 'card pg-card pg-check', open: chk.errors.length > 0 }, h('summary', {}, 'Проверка плана: ошибок ' + chk.errors.length + ', предупреждений ' + chk.warnings.length), h('ul', {}, chk.errors.map(e => h('li', { class: 'pg-bad' }, e.msg)), chk.warnings.slice(0, 50).map(w => h('li', {}, w.msg)), chk.warnings.length > 50 ? h('li', { class: 'muted' }, '… ещё ' + (chk.warnings.length - 50)) : null)));
    const inPlan = AP.stageIndex(p), plannedPartBodies = new Set(); for (const k of inPlan.keys()) { const x = AP.splitKey(k, isBody); if (x.part) plannedPartBodies.add(x.id); }
    // r3, Р-12 (правило Codex, ATLAS_R2_OUTSIDE_PLAN_FIX eb399383): этап — по полному ключу, затем по телу; тело-агрегат, чьи части в плане по отдельности, — не «вне порядка»; непропланированная часть такого тела — остаётся
    const outside = Object.keys(items).filter(k => { const x = AP.splitKey(k, isBody); return !AP.stageOfKey(inPlan, k, isBody) && !(x.part === null && plannedPartBodies.has(k)); });
    const list = h('ol', { class: 'pg-stages' });
    stages.forEach((st, i) => {
      const ids = st.ids || [], dn = ids.filter(id => { const s = states.get(id); return s && s.st === 'done'; }).length, pt = ids.filter(id => { const s = states.get(id); return s && s.st === 'partial'; }).length;
      // 1.0.19a, Б7: «Сначала завершите…» — только при реальном нарушении (у этапа есть отметки, а предыдущие не завершены), серым и по названиям
      const pct = ids.length ? Math.round(dn / ids.length * 1000) / 10 : 0, warn = dn || pt ? AP.orderWarn(p, states, st.id) : [];
      const move = d => { const q = clonePlan(), a = AP.stagesOf(q), j = i + d; if (j < 0 || j >= a.length) return; const n1 = a[i].n, n2 = a[j].n; const x = q.stages.find(s => s.id === a[i].id), y = q.stages.find(s => s.id === a[j].id); x.n = n2; y.n = n1; if (n1 === n2) { x.n = n2 + d; } savePlan(q); };
      const li = h('li', { class: 'card pg-stage' + (Q().stage === st.id ? ' pg-stage--cur' : ''), id: 'st-' + st.id },
        h('div', { class: 'pg-stage-h' },
          edit ? h('input', { type: 'text', class: 'pg-stage-t', value: st.title || '', 'aria-label': 'Название этапа ' + AP.stageName(st), on: { change: e => { const q = clonePlan(); q.stages.find(s => s.id === st.id).title = e.target.value.trim(); savePlan(q); } } }) : h('strong', { class: 'pg-stage-t' }, AP.stageName(st)),
          h('span', { class: 'pg-stage-n code' }, st.id),
          // Т-3: подпись шкалы — снаружи заливки
          h('span', { class: 'pg-meter', title: 'выполнено ' + dn + ' из ' + ids.length + (pt ? ', частично ' + pt : '') }, h('span', { class: 'pg-meter-bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + pct + '%' })), h('b', {}, dn || pt ? fmt(pct, 1) + ' %' : 'не начато')),
          edit ? h('span', { class: 'pg-row pg-move' }, h('button', { type: 'button', class: 'pbtn pbtn--sm', 'aria-label': 'Выше', disabled: i === 0, on: { click: () => move(-1) } }, '↑'), h('button', { type: 'button', class: 'pbtn pbtn--sm', 'aria-label': 'Ниже', disabled: i === stages.length - 1, on: { click: () => move(1) } }, '↓')) : null),
        h('div', { class: 'pg-stage-m muted' },
          nEl(ids.length) + (st.rd ? ' · ' + st.rd : '') + ((st.lots || []).length ? ' · захваток (участков работ) ' + st.lots.length : '') + ' · после: ',
          edit ? h('input', { type: 'text', class: 'pg-after', value: (st.after || []).join(', '), 'aria-label': 'Предыдущие этапы для «' + AP.stageName(st) + '» (коды через запятую)', on: { change: e => { const q = clonePlan(); q.stages.find(s => s.id === st.id).after = e.target.value.split(/[\s,;]+/).filter(Boolean); savePlan(q); } } }) : ((st.after || []).map(a => { const s = stageOfId(a); return s ? AP.stageName(s) : a; }).join(', ') || '—'),
          warn.length ? h('span', { class: 'pg-order' }, ' · Сначала завершите: ' + warn.map(w => (w.title || 'этап') + ' (осталось ' + fmt(w.open, 0) + ')').join(', ')) : null),
        h('div', { class: 'pg-row' }, h('a', { class: 'pbtn pbtn--sm', href: 'index.html#progress=1&stage=' + encodeURIComponent(st.id) }, 'На модели'), h('button', { type: 'button', class: 'pbtn pbtn--sm', 'aria-expanded': 'false', on: { click: e => toggleComp(e.currentTarget, li, st, edit) } }, 'Состав')));
      list.append(li);
    });
    body.append(list);
    body.append(h('p', { class: 'muted' }, 'Вне порядка (есть в объёмах, нет ни в одном этапе): ' + fmt(outside.length) + (outside.length ? ' — ' : ''), outside.length ? h('span', { class: 'code' }, outside.slice(0, 5).join(', ') + (outside.length > 5 ? ' …' : '')) : null));
    if (Q().stage) setTimeout(() => { const el = $('st-' + Q().stage); if (el) el.scrollIntoView({ block: 'center' }); }, 0);
  }
  function toggleComp(btn, li, st, edit) {
    const old = li.querySelector('.pg-comp'); if (old) { old.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    btn.setAttribute('aria-expanded', 'true');
    const box = h('div', { class: 'pg-comp' }), q = h('input', { type: 'search', placeholder: 'ID или наименование', 'aria-label': 'Поиск в составе этапа' }), out = h('ul', { class: 'pg-ids' });
    const draw = () => {
      out.textContent = ''; const s = q.value.trim().toLowerCase(); let n = 0;
      for (const id of st.ids || []) { if (s && !(id.toLowerCase().includes(s) || nameOf(id).toLowerCase().includes(s))) continue; if (++n > 200) { out.append(h('li', { class: 'muted' }, '… уточните поиск')); break; }
        out.append(h('li', {}, h('span', { class: 'mono' }, id), ' ', h('span', { class: 'muted' }, nameOf(id)), edit ? h('button', { type: 'button', class: 'pg-x', 'aria-label': 'Убрать ' + id + ' из этапа', on: { click: () => { const P = clonePlan(), x = P.stages.find(z => z.id === st.id); x.ids = x.ids.filter(z => z !== id); for (const l of x.lots || []) l.ids = (l.ids || []).filter(z => z !== id); savePlan(P); } } }, '×') : null)); }
      if (!n) out.append(h('li', { class: 'muted' }, 'пусто'));
    };
    q.addEventListener('input', draw);
    box.append(q, out);
    if ((st.lots || []).length) box.append(h('p', { class: 'muted' }, 'Захватки (участки работ): ' + st.lots.map((l, i) => (l.title || 'захватка ' + (i + 1)) + ' — ' + (l.ids || []).length).join('; ')));
    if (edit) {
      const ta = h('textarea', { rows: 3, placeholder: 'ID через пробел, запятую или с новой строки', 'aria-label': 'Добавить элементы в этап' });
      box.append(ta, h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: () => { const add = ta.value.split(/[\s,;]+/).filter(Boolean); if (!add.length) return; const P = clonePlan(); for (const s of P.stages) if (s.id !== st.id) s.ids = (s.ids || []).filter(z => !add.includes(z)); const x = P.stages.find(z => z.id === st.id); x.ids = [...new Set([...(x.ids || []), ...add])]; savePlan(P, 'Добавлено в этап «' + AP.stageName(st) + '»: ' + add.length + ' (из других этапов перенесены)'); } } }, 'Добавить в этап'));
    }
    li.append(box); draw();
  }
  async function pushPlan() {
    const r = await S.sync.putPlan(clonePlan());   // If-Match — ревизия сервера, на которой начата правка (kv server:planRev)
    if (r.ok) toast('План отправлен на сервер, ревизия ' + (r.rev ?? '—') + (r.warn ? ', но ' + r.warn : ''), !!r.warn);   // круг 3 (Н-1)
    else if (r.conflict) toast('На сервере другая ревизия плана (' + (r.rev ?? '—') + '). Что делать: нажмите «План с сервера» и повторите правку.', true);
    else toast((r.error || 'План не отправлен') + '. Что делать: проверьте вход в PGS и повторите.', true, { label: 'Повторить', run: pushPlan });
  }
  async function pullPlan() {
    const r = await S.sync.getPlan();
    if (!r || r.error) { toast(((r && r.error) || 'План сервера не получен') + '. Что делать: проверьте вход в PGS и повторите.', true, { label: 'Повторить', run: pullPlan }); return; }
    if (!r.plan) { toast('На сервере плана нет — «На сервер» создаст его из текущего.'); return; }
    if (S.localPlan && !confirm('Заменить местную правку плана планом сервера (ревизия ' + r.rev + ')?')) return;
    try { await S.store.set('plan', Object.assign({}, r.plan, { rev: r.rev, status: r.status || r.plan.status, base_rev: pub.plan ? pub.plan.rev ?? 0 : 0 })); } catch (e) { toast(storeErr('План сервера не записан', e), true); return; }   // круг 3 (Н-1)
    toast('План сервера, ревизия ' + r.rev); refresh();
  }

  /* ---------- История отметок ---------- */
  // 1.0.19a, Б3: у технадзора по умолчанию — «ждут приёмки» (only=open); снятый флажок — only=all
  const onlyOf = q => q.only != null && q.only !== '' ? q.only : role() === 'supervisor' ? 'open' : '';
  const isOpen = AP.isOpen;   // 1.0.20: перенос в progress-core.js (§5.3), формула та же
  function renderJournal() {
    const q = Q(), only = onlyOf(q), ev = AP.sorted(S.events).reverse(), states = AP.fold(S.events), confs = AP.conflicts(S.events), r = role();
    const ops = ['', ...AP.OPS], bys = [...new Set(S.events.map(e => e.by))].sort(), stages = AP.stagesOf(S.plan), idx = S.plan ? AP.stageIndex(S.plan) : new Map();
    const stageOf = e => stageOfEv(e, idx);   // r3, Р-12
    const f = h('div', { class: 'pg-filters' },
      h('label', { class: 'pg-f' }, h('span', {}, 'С'), h('input', { type: 'date', value: q.from || '', on: { change: e => { setQ({ from: e.target.value }); renderTab(); } } })),
      h('label', { class: 'pg-f' }, h('span', {}, 'По'), h('input', { type: 'date', value: q.to || '', on: { change: e => { setQ({ to: e.target.value }); renderTab(); } } })),
      h('label', { class: 'pg-f' }, h('span', {}, 'Действие'), h('select', { on: { change: e => { setQ({ op: e.target.value }); renderTab(); } } }, ops.map(o => h('option', { value: o, selected: (q.op || '') === o }, o ? AP.OP_LABEL[o] : 'все')))),
      h('label', { class: 'pg-f' }, h('span', {}, 'Кто'), h('select', { on: { change: e => { setQ({ by: e.target.value }); renderTab(); } } }, h('option', { value: '' }, 'все'), bys.map(b => h('option', { value: b, selected: q.by === b }, b)))),
      stages.length ? h('label', { class: 'pg-f' }, h('span', {}, 'Этап'), h('select', { on: { change: e => { setQ({ stage: e.target.value }); renderTab(); } } }, h('option', { value: '' }, 'все'), stages.map(s => h('option', { value: s.id, selected: q.stage === s.id }, AP.stageName(s))))) : null,
      h('label', { class: 'pg-f pg-f--q' }, h('span', {}, 'Поиск'), h('input', { type: 'search', value: q.q || '', placeholder: 'ID, имя, примечание', on: { change: e => { setQ({ q: e.target.value.trim() }); renderTab(); } } })),
      h('label', { class: 'pg-chk' }, h('input', { type: 'checkbox', checked: only === 'conflicts', on: { change: e => { setQ({ only: e.target.checked ? 'conflicts' : (r === 'supervisor' ? 'all' : '') }); renderTab(); } } }), 'только конфликты'),
      h('label', { class: 'pg-chk' }, h('input', { type: 'checkbox', id: 'pgOnlyOpen', checked: only === 'open', on: { change: e => { setQ({ only: e.target.checked ? 'open' : (r === 'supervisor' ? 'all' : '') }); renderTab(); } } }), 'ждут приёмки'));
    body.append(f);
    /* 1.0.20, §5.2: only=fix — «К исправлению» (возвращённые технадзором; у оператора — его элементы), lot=<id захватки> — элементы захватки; без этих параметров — как в 1.0.19 */
    const fixL = only === 'fix' ? AP.toFix(states, r === 'supervisor' ? null : who()) : null, fixSet = fixL ? new Set(fixL.map(x => x.id)) : null;
    const M = modesOn(), wds = M ? AP.withdrawnSet(S.events) : null;   // 1.0.20, §6.5 п. 3–4, 6: окно причин, «Снять приёмку», «приёмка снята», «Исправлено — отметить снова» — только при modesOn
    const zs = q.lot ? AP.zonesOf(S.plan) : [], lotZ = q.lot ? zs.find(z => z.lot === q.lot && (!q.stage || z.stage === q.stage)) || zs.find(z => z.key === q.lot) || null : null, lotSet = q.lot ? new Set(lotZ ? lotZ.ids : []) : null;
    if (fixSet || lotSet) body.append(h('div', { class: 'pg-row pg-fchips' },
      fixSet ? h('span', { class: 'pg-fchip' }, 'К исправлению ', h('button', { type: 'button', class: 'pbtn pbtn--sm', 'aria-label': 'Снять фильтр «К исправлению»', on: { click: () => { setQ({ only: r === 'supervisor' ? 'all' : '' }); renderTab(); } } }, '×')) : null,
      lotSet ? h('span', { class: 'pg-fchip' }, 'Захватка (участок работ): ' + (lotZ ? lotZ.title + (lotZ.lot ? ' · ' + lotZ.stageTitle : '') : q.lot + ' — нет в плане') + ' ', h('button', { type: 'button', class: 'pbtn pbtn--sm', 'aria-label': 'Снять фильтр по захватке', on: { click: () => { setQ({ lot: '' }); renderTab(); } } }, '×')) : null));
    if (S.rejList && S.rejList.length) {   // отклонённые сервером: причина; «раньше решения технадзора» / «снятие другого автора» — повтор текущей датой и временем
      const box = h('section', { class: 'card pg-card pg-confs', 'aria-label': 'Отклонено сервером' }, h('h2', {}, 'Отклонено сервером: ' + S.rejList.length), h('p', { class: 'muted' }, 'В состояние на модели и в ведомость не входят.'));
      for (const { e, reason } of S.rejList.slice(0, 50)) {
        const row = h('div', { class: 'pg-conf' }, h('span', { class: 'mono' }, AP.ruDate(e.date)), h('span', {}, h('b', {}, nameOf(e.id) || e.id), ' ', h('span', { class: 'muted' }, (AP.OP_LABEL[e.op] || e.op) + ' ' + valText(e))), h('span', { class: 'pg-warn' }, reason));
        if (AP.RETRY_RE.test(reason) && who()) row.append(h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: async () => { const r = AP.retry(e, { by: who(), role: role() || 'operator' }, { closedUntil: S.closedUntil });
          // круг 3 (Ф4, Н-1): сначала событие; пометка «повторено» — только после его записи, сбой пометки — сообщение
          if (!(await addEvents([r])) || !r.event) return;
          try { const d = (await S.store.get('server:retried')) || {}; d[e.eid] = r.event.eid; await S.store.set('server:retried', d); } catch (x) { toast('Повтор записан, но пометка «повторено» не записана в хранилище браузера (' + errName(x) + '): отклонённая останется в списке — второй раз не нажимайте', true); }
          refresh(); } } }, 'Повторить сегодняшней датой'));
        box.append(row);
      }
      body.append(box);
    }
    if (!S.events.length) { body.append(emptyNote()); return; }
    const open = confs.filter(c => !c.resolved);
    if (open.length) {
      const box = h('section', { class: 'card pg-card pg-confs', 'aria-label': 'Конфликты' }, h('h2', {}, 'Конфликты: ' + open.length), h('p', { class: 'muted' }, 'Один элемент, одна дата, разные значения от разных операторов. Решает технадзор новой отметкой.'));
      for (const c of open.slice(0, 50)) {
        const row = h('div', { class: 'pg-conf' }, h('span', { class: 'mono' }, AP.ruDate(c.date)), h('span', {}, h('b', {}, nameOf(c.id) || c.id), ' ', h('span', { class: 'muted code' }, c.id)),
          h('span', {}, c.events.map(e => e.by + ': ' + valText(e)).join(' · ')));
        if (r === 'supervisor') for (const e of uniqVals(c.events)) row.append(h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: () => addEvents([AP.make(e.op, e.id, { date: e.date, body: bodyOf(e.id), pct: e.pct, qty: e.qty, unit: e.unit, stage: e.stage, note: 'решение конфликта: принято ' + valText(e) + ' (' + e.by + ')', by: who(), role: r }, { closedUntil: null })]) } }, 'Принять: ' + valText(e)));
        box.append(row);
      }
      body.append(box);
    }
    const cset = new Set(confs.filter(c => !c.resolved).map(c => c.id + '\u0001' + c.date)), s = (q.q || '').toLowerCase();
    const list = ev.filter(e => (!q.from || e.date >= q.from) && (!q.to || e.date <= q.to) && (!q.op || e.op === q.op) && (!q.by || e.by === q.by) && (!q.stage || stageOf(e) === q.stage)
      && (!s || e.id.toLowerCase().includes(s) || (e.note || '').toLowerCase().includes(s) || nameOf(e.id).toLowerCase().includes(s))
      && (only !== 'conflicts' || cset.has(e.id + '\u0001' + e.date)) && (only !== 'open' || isOpen(e, states))
      && (!fixSet || (fixSet.has(e.id) && (states.get(e.id) || {}).last === e)) && (!lotSet || lotSet.has(e.id) || (!!e.body && lotSet.has(e.body))));
    const head = h('div', { class: 'pg-row pg-journal-h' }, h('p', { class: 'muted', 'aria-live': 'polite' }, 'Событий: ' + fmt(list.length) + ' из ' + fmt(ev.length)));
    // 1.0.19a, Б3: «Принять все ждущие (N)» — все строки отбора, которые ждут приёмки (круг 2, B-05: и те, что ниже «Показать ещё»)
    const shown = r === 'supervisor' ? list.filter(e => isOpen(e, states)) : [];
    if (shown.length) head.append(h('button', { type: 'button', id: 'pgAcceptShown', class: 'pbtn pbtn--primary', on: { click: e => acceptDialog(shown, states, e.currentTarget) } }, 'Принять все ждущие (' + fmt(shown.length, 0) + ')'));
    body.append(head);
    const tb = h('tbody');
    for (const e of list.slice(0, S.more)) {
      const st = states.get(e.id), last = st && st.last === e, cf = last && st.conf;
      const act = h('td', { class: 'pg-act' });
      if (r === 'supervisor' && last && ['done', 'partial'].includes(e.op) && !st.conf) act.append(h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: () => { let n; if (S.closedUntil && AP.today() <= S.closedUntil) { n = prompt('Закрытый период: примечание к приёмке'); if (n == null) return; } addEvents([AP.make('confirm', e.id, { date: AP.today(), by: who(), role: r, stage: e.stage, body: bodyOf(e.id), note: n }, { closedUntil: S.closedUntil })]); } } }, 'Принять'), h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: x => { if (M) { reasonDialog([e], states, x.currentTarget, 'return'); return; } const n = prompt('Причина возврата'); if (n == null) return; addEvents([AP.make('reject', e.id, { date: AP.today(), by: who(), role: r, stage: e.stage, body: bodyOf(e.id), note: n }, { closedUntil: S.closedUntil })]); } } }, 'Вернуть'));
      if (M && r === 'supervisor' && last && ['done', 'partial'].includes(e.op) && st.conf === 'confirmed') act.append(h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: x => reasonDialog([e], states, x.currentTarget, 'withdraw') } }, 'Снять приёмку'));
      if (M && last && cf === 'rejected' && ['done', 'partial'].includes(e.op)) {
        act.append(h('small', { class: 'pg-fixinfo' }, (st.wd ? 'приёмка снята' : 'вернул') + ': ' + (st.confBy || '—') + ', ' + AP.ruDate(st.confDate) + (st.note ? ' · ' + st.note : '')));
        if (writer() && r !== 'supervisor' && st.by && st.by.has(who())) act.append(h('button', { type: 'button', class: 'pbtn pbtn--sm pbtn--primary', on: { click: () => addEvents([AP.make(e.op, e.id, { date: AP.today(), by: who(), role: r || 'operator', stage: e.stage, body: bodyOf(e.id), pct: e.pct, qty: e.qty, unit: e.unit }, { closedUntil: S.closedUntil })]) } }, 'Исправлено — отметить снова'));
      }
      if (e.batch && e.op !== 'undo' && (r === 'supervisor' || e.by === who())) act.append(h('button', { type: 'button', class: 'pbtn pbtn--sm', title: 'Снять все отметки этого пакета', on: { click: () => { if (!confirm('Отменить пакет ' + e.batch.slice(0, 8) + '?')) return; const u = AP.undoBatch(S.events, e.batch, { by: who(), role: r || 'operator' }, { closedUntil: S.closedUntil }); addEvents(u.events.map(x => ({ event: x })).concat(u.errors.map(x => ({ errors: x.errors })))); } } }, 'Отменить пакет'));
      tb.append(h('tr', { class: cset.has(e.id + '\u0001' + e.date) ? 'pg-tr--conf' : null },
        h('td', { class: 'mono' }, AP.ruDate(e.date)), h('td', { class: 'mono muted' }, String(e.t || '').slice(11, 16)),
        h('td', {}, e.by, h('small', { class: 'muted' }, ' ' + (AP.ROLE_LABEL[e.role] || e.role))),
        h('td', {}, h('span', { class: 'pg-op pg-op--' + e.op }, AP.OP_LABEL[e.op] || e.op), cf ? h('span', { class: 'pg-conf-mark pg-conf-mark--' + cf, title: cf === 'confirmed' ? 'принято технадзором' : M && st.wd ? 'приёмка снята' : 'возвращено технадзором' }, cf === 'confirmed' ? ' ✓' : ' ✕') : null,
          M && (wds.has(e.eid) || (cf === 'rejected' && st.wd)) ? h('small', { class: 'pg-wd' }, ' приёмка снята') : null),
        h('td', {}, h('span', {}, nameOf(e.id) || ''), h('br'), h('span', { class: 'mono muted pg-id code' }, e.id)),
        h('td', { class: 'mono' }, valText(e)), h('td', {}, stageCell(stageOf(e))),
        h('td', {}, e.note || '', e.photo && AP.isPhoto(e.photo) ? h('a', { href: e.photo, target: '_blank', rel: 'noopener noreferrer' }, ' фото') : null),
        h('td', { class: 'muted' }, e.src || ''), act));
    }
    body.append(h('div', { class: 'card pg-tablebox' }, h('table', { class: 'pg-table' }, h('thead', {}, h('tr', {}, ['Дата работ', 'Запись', 'Кто', 'Действие', 'Элемент', 'Значение', 'Этап', 'Примечание', 'Источник', ''].map(t => h('th', { scope: 'col' }, t)))), tb)));
    if (list.length > S.more) body.append(h('button', { type: 'button', class: 'pbtn', on: { click: () => { S.more += 300; renderTab(); } } }, 'Показать ещё'));
  }
  /* 1.0.19a, Б3: окно сводки «Принять все ждущие»: N, объёмы по единицам (разные не складываются), «изменено после приёмки» K; в закрытом периоде — одно примечание.
     При нажатии журнал перечитывается, каждая строка проверяется как одиночной кнопкой (это всё ещё последняя отметка элемента, решения нет); изменившиеся — пропускаются.
     События — как у одиночной «Принять» (confirm, дата — сегодня, этап и body отметки), новых полей нет. */
  function acceptDialog(shown, states, from, opt) {   // 1.0.20: opt {title, extra} — окна вкладки «Принять»; без opt — как в 1.0.19a
    opt = opt || {};
    const vol = new Map(); let noVol = 0, changed = 0;
    for (const e of shown) { const s = states.get(e.id), it = items[e.id]; if (s && s.need) changed++; const v = AP.valueOf(s, it); if (it && it.q != null && it.u) vol.set(it.u, (vol.get(it.u) || 0) + (v.v || 0)); else noVol++; }
    const closed = !!(S.closedUntil && AP.today() <= S.closedUntil);
    const d = h('dialog', { class: 'pg-dlg pg-accept', 'aria-labelledby': 'pgAccH' }), note = closed ? h('input', { type: 'text', id: 'pgAccNote', 'aria-label': 'Примечание к приёмке (закрытый период)' }) : null;
    const close = () => { try { d.close(); } catch (e) { /* */ } d.remove(); if (from && from.isConnected) { try { from.focus(); } catch (e) { /* */ } } };
    const go = h('button', { type: 'button', class: 'pbtn pbtn--primary', on: { click: async () => { const n = note ? note.value.trim() : undefined; if (note && !n) { note.focus(); return; } go.disabled = true; await acceptShown(shown, n); close(); } } }, 'Принять ' + nEl(shown.length));
    app(d, h('h2', { id: 'pgAccH' }, (opt.title || 'Принять все ждущие') + ': ' + nEl(shown.length)),
      h('ul', { class: 'pg-acc-l' }, [...vol].map(([u, v]) => h('li', {}, 'Объём: ' + fmt(v) + ' ' + u)), noVol ? h('li', {}, 'Без объёма в данных: ' + nEl(noVol)) : null, h('li', { class: changed ? 'pg-warn' : null }, 'Изменено после приёмки: ' + fmt(changed, 0))),
      opt.extra || null,
      h('p', { class: 'muted' }, 'Каждая строка перед записью проверяется ещё раз: если отметку изменили после показа, строка не принимается.'),
      closed ? h('label', { class: 'pg-f', for: 'pgAccNote' }, h('span', {}, 'Закрытый период (до ' + AP.ruDate(S.closedUntil) + '): примечание ко всем'), note) : null,
      h('div', { class: 'pg-row' }, go, h('button', { type: 'button', class: 'pbtn', on: { click: close } }, 'Отмена')));
    d.addEventListener('cancel', e => { e.preventDefault(); close(); });
    document.body.append(d); d.showModal(); (note || go).focus();
  }
  async function acceptShown(shown, n) {
    if (!who()) { userDialog(); return; }
    try { await load(); } catch (e) { toast(storeErr('Журнал не прочитан', e), true); return; }
    const states = AP.fold(S.events), out = [], r = role(); let gone = 0;
    for (const e of shown) {
      const s = states.get(e.id);
      if (!s || !s.last || s.last.eid !== e.eid || s.conf || !['done', 'partial'].includes(s.last.op)) { gone++; continue; }   // как одиночная кнопка: последняя отметка, решения нет
      out.push(AP.make('confirm', e.id, { date: AP.today(), by: who(), role: r, stage: e.stage, body: bodyOf(e.id), note: n }, { closedUntil: S.closedUntil }));
    }
    const ok = await addEvents(out, gone ? fmt(gone, 0) + ' ' + AP.plural(gone, ['строка', 'строки', 'строк']) + ' ' + AP.plural(gone, ['изменилась', 'изменились', 'изменились']) + ' после показа — не ' + AP.plural(gone, ['принята', 'приняты', 'приняты']) : '');
    return ok;
  }
  /* 1.0.20, §6.5 п. 3–4 и §13.3: «Вернуть» и «Снять приёмку» — окно с чипами причин (вместо prompt при modesOn). Нужен чип или текст «другое…».
     События — reject технадзора (дата — сегодня, автор — кто отмечает) на каждую строку, перед записью журнал перечитывается и строка проверяется ещё раз.
     «Снять приёмку» — только у принятых (conf = confirmed): повторное снятие строку не находит, новой величины нет. Форматы событий прежние. */
  const WHY = ['нет акта', 'дефект', 'не по РД', 'нет фото'];
  const isoAdd = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  function reasonDialog(rows, states, from, kind) {
    const wd = kind === 'withdraw', on = new Set();
    const d = h('dialog', { class: 'pg-dlg pg-reason', 'aria-labelledby': 'pgWhyH' });
    const close = () => { try { d.close(); } catch (e) { /* */ } d.remove(); if (from && from.isConnected) { try { from.focus(); } catch (e) { /* */ } } };
    const txt = h('input', { type: 'text', id: 'pgWhyT', maxlength: '500', 'aria-label': 'Другая причина', on: { input: () => upd() } }), txtL = h('label', { class: 'pg-f', for: 'pgWhyT', hidden: true }, h('span', {}, 'Другая причина'), txt);
    const note = () => { const t = txtL.hidden ? '' : txt.value.trim(), w = WHY.filter(x => on.has(x)).concat(t ? [t] : []).join('; '); return w ? ((wd ? 'Снята приёмка: ' : '') + w).slice(0, AP.LIMITS.note) : ''; };
    const goB = h('button', { type: 'button', class: 'pbtn pbtn--primary', disabled: true, on: { click: async () => { const n = note(); if (!n) return; goB.disabled = true; await reasonShown(rows, n, wd); close(); } } }, (wd ? 'Снять приёмку · ' : 'Вернуть ') + nEl(rows.length));
    const upd = () => { goB.disabled = !note(); };
    const chip = (w, other) => { const b = h('button', { type: 'button', class: 'pbtn pg-why', 'aria-pressed': 'false', on: { click: () => { const p = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(p)); if (other) { txtL.hidden = !p; if (p) txt.focus(); } else if (p) on.add(w); else on.delete(w); upd(); } } }, w); return b; };
    const cl = wd && S.closedUntil ? rows.filter(e => { const s = states.get(e.id); return s && s.confDate && s.confDate <= S.closedUntil; }).length : 0;
    app(d, h('h2', { id: 'pgWhyH' }, (wd ? 'Снять приёмку' : 'Вернуть') + ': ' + nEl(rows.length)),
      h('p', { class: 'muted' }, wd ? 'Подтверждённое станет 0, отметка оператора и её величина останутся. Новая отметка оператора — снова «ждёт приёмки».' : 'Строки вернутся оператору («К исправлению»).'),
      cl ? h('p', { class: 'pg-warn', role: 'status' }, 'Приёмка относится к закрытому периоду до ' + AP.ruDate(S.closedUntil) + ': ведомость за него при новой выгрузке изменится.') : null,
      h('p', {}, 'Причина (хотя бы одна):'), h('div', { class: 'pg-row pg-whys', role: 'group', 'aria-label': 'Причины' }, WHY.map(w => chip(w)), chip('другое…', true)), txtL,
      h('p', { class: 'muted' }, 'Каждая строка перед записью проверяется ещё раз: если отметку изменили после показа, строка пропускается.'),
      h('div', { class: 'pg-row' }, goB, h('button', { type: 'button', class: 'pbtn', on: { click: close } }, 'Отмена')));
    d.addEventListener('cancel', e => { e.preventDefault(); close(); });
    document.body.append(d); d.showModal(); d.querySelector('.pg-why').focus();
  }
  async function reasonShown(rows, n, wd) {
    if (!who()) { userDialog(); return false; }
    if (role() !== 'supervisor') { toast('Возвращает и снимает приёмку технадзор (роль журнала «технадзор»).', true); return false; }
    try { await load(); } catch (e) { toast(storeErr('Журнал не прочитан', e), true); return false; }
    const states = AP.fold(S.events), out = []; let gone = 0;
    for (const e of rows) {
      const s = states.get(e.id);
      if (!s || !s.last || s.last.eid !== e.eid || !['done', 'partial'].includes(s.last.op) || (wd ? s.conf !== 'confirmed' : !!s.conf)) { gone++; continue; }
      out.push(AP.make('reject', e.id, { date: AP.today(), by: who(), role: 'supervisor', stage: e.stage, body: bodyOf(e.id), note: n }, { closedUntil: S.closedUntil }));
    }
    return addEvents(out, gone ? fmt(gone, 0) + ' ' + AP.plural(gone, ROWS) + ' ' + AP.plural(gone, ['изменилась', 'изменились', 'изменились']) + ' после показа — пропущено' : '');
  }
  // «Принято за 7 дней» (§6.5 п. 4): принятые элементы, группы «кто принял × дата приёмки × зона»; «Снять приёмку» — у технадзора. Свёрнуто: на первый экран не влияет
  function acceptedSection(states, sup) {
    const from = isoAdd(AP.today(), -6), zi = S.plan ? AP.zoneIndex(S.plan) : new Map(), zones = new Map(AP.zonesOf(S.plan).map(z => [z.key, z])), G = new Map();
    for (const s of states.values()) {
      if (s.conf !== 'confirmed' || !s.confDate || s.confDate < from || !s.last || !['done', 'partial'].includes(s.last.op)) continue;
      const e = s.last, z = zi.has(e.id) ? zi.get(e.id) : e.body && zi.has(e.body) ? zi.get(e.body) : null, k = s.confBy + '\u0001' + s.confDate + '\u0001' + (z ?? '');
      let g = G.get(k); if (!g) G.set(k, g = { by: s.confBy, date: s.confDate, zone: z, rows: [] }); g.rows.push(e);
    }
    if (!G.size) return null;
    const gs = [...G.values()].sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : String(a.by).localeCompare(String(b.by), 'ru') || String(a.zone ?? '').localeCompare(String(b.zone ?? ''), 'ru'));
    const n = gs.reduce((a, g) => a + g.rows.length, 0);
    const d = h('details', { class: 'card pg-card pg-acc-done', id: 'pgAccDone' }, h('summary', {}, 'Принято за 7 дней: ' + nEl(n)),
      h('div', { class: 'pg-more-l pg-acc-done-l' }, gs.slice(0, 24).map(g => { const z = g.zone != null ? zones.get(g.zone) : null, head = ['принял ' + g.by, AP.ruDate(g.date), z ? z.stageTitle : 'вне порядка работ', z && z.lot ? z.title : null].filter(Boolean).join(' · ');
        return h('section', { class: 'pg-pkg', 'aria-label': 'Принято: ' + head }, h('h3', { class: 'pg-pkg-h' }, head), h('ul', { class: 'pg-acc-l' }, h('li', {}, 'Элементов: ' + fmt(g.rows.length, 0))),
          sup ? h('div', { class: 'pg-row' }, h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: x => reasonDialog(g.rows, states, x.currentTarget, 'withdraw') } }, 'Снять приёмку')) : null); }),
        gs.length > 24 ? h('p', { class: 'muted' }, '… ещё групп: ' + fmt(gs.length - 24, 0) + ' — снять приёмку по строке можно в «Истории отметок»') : null));
    return shut(d);
  }
  const valText = e => e.op === 'partial' ? (e.pct != null ? fmt(e.pct, 1) + ' %' : fmt(e.qty) + ' ' + (e.unit || '')) : e.op === 'done' ? '100 %' : '';
  const uniqVals = evs => { const m = new Map(); for (const e of evs) { const k = e.op + valText(e); if (!m.has(k)) m.set(k, e); } return [...m.values()]; };
  // круг 3 (Ф4): → true, если события записаны; К2 — при неподтверждённом входе с пометкой _nc (от имени последнего пользователя устройства)
  async function addEvents(rs, extra) {
    const bad = rs.filter(r => r.errors), ok = rs.filter(r => r.event).map(r => r.event);
    if (!who()) { userDialog(); return false; }
    // 1.0.18, П-5: запись в IndexedDB не удалась — событий нет ни в журнале, ни в очереди отправки; сообщение
    if (ok.length) { try { await S.store.add(ok, preHow()); } catch (e) { toast('Не записано: хранилище браузера не приняло запись (' + errName(e) + ') — события не сохранены и не отправлены. Что делать: сохраните журнал в файл, освободите место в браузере и нажмите «Повторить».', true, { label: 'Повторить', run: () => addEvents(rs, extra) }); refresh(); return false; } }
    const msg = ok.length ? 'Записано событий: ' + ok.length + (bad.length ? ', не записано ' + bad.length + ': ' + bad[0].errors.join('; ') : '') + (extra ? ' · ' + extra : '')
      : bad.length ? 'Не записано: ' + bad[0].errors.join('; ') + (extra ? ' · ' + extra : '') + '. Что делать: исправьте и повторите.' : 'Не записано: ' + (extra || 'нечего записывать');
    toast(msg, !ok.length && (bad.length > 0 || !extra));
    refresh();
    return ok.length > 0;
  }

  /* ---------- Принять (1.0.20, §6.5 b3 и §13.2; вкладка модуля accept — только при modesOn()) ---------- */
  /* Замечания к РД — данные атласа window.ATLAS_REMARKS (by_element), не quality/RFI PGS. Нет на странице — один тег <script src> из набора remarks конфига
     (ATLAS_PROJECT.plugins) при первом входе на вкладку; набор не объявлен — запроса нет; ошибка загрузки — «нет в источнике». */
  const REM = { st: null };   // null — не начинали; 'load' | 'ok' | 'fail' | 'none' (набор не объявлен)
  const remSrc = () => { const P = window.ATLAS_PROJECT || {}, pl = (Array.isArray(P.plugins) ? P.plugins : []).find(p => p && p.name === 'remarks'), L = pl && Array.isArray(pl.data) ? pl.data : [];
    for (const d of L) { const src = typeof d === 'string' ? d : d && d.src, g = d && typeof d === 'object' ? d.global : null; if (typeof src === 'string' && /^data\/[^?#:]+\.js$/.test(src) && (!g || g === 'ATLAS_REMARKS')) return src; } return null; };
  /* 1.0.20 §14: ctx.loadRemarks(cb?) — та же подгрузка для вкладок модулей («Итог» C). → 'ok' | 'load' | 'fail' | 'none' (набор не объявлен — запроса нет, строки нет).
     При 'load' по окончании: cb(состояние) и перерисовка вкладки, с которой вызвали, если она ещё открыта. Тег — один на страницу. */
  REM.cbs = []; REM.tabs = new Set();
  function loadRemarks(cb) {
    const st = remarksState();
    if (st === 'load') { if (typeof cb === 'function') REM.cbs.push(cb); REM.tabs.add(curTab()); }
    return st;
  }
  function remarksState() {
    if (window.ATLAS_REMARKS) return REM.st = 'ok';
    if (REM.st) return REM.st;
    const src = remSrc(); if (!src) return REM.st = 'none';
    REM.st = 'load';
    const s = document.createElement('script'); s.src = src;
    const fin = () => { REM.st = window.ATLAS_REMARKS ? 'ok' : 'fail'; const cbs = REM.cbs.splice(0), tabs = new Set(REM.tabs); REM.tabs.clear();
      for (const f of cbs) { try { f(REM.st); } catch (e) { console.error(e); } }
      if (HOST.ready && modesOn() && (curTab() === 'accept' || tabs.has(curTab()))) renderTab(); };
    s.onload = fin; s.onerror = fin; document.body.append(s);
    return 'load';
  }
  const knownKey = k => k in items || !!(isBody.bodies && isBody.bodies.has(k));   // ключ (тело или часть) есть в объёмах выпуска
  const COND_F = ['conditional_extent', 'volume_conditional'];   // «Условные объёмы» — флаги f progress_items: условный габарит, объём условный
  const ROWS = ['строка', 'строки', 'строк'];
  function pkgStats(evs, states, rs) {
    const vol = new Map(); let noVol = 0, cond = 0, need = 0, yes = 0, unk = 0;
    for (const e of evs) {
      const s = states.get(e.id), it = items[e.id], v = AP.valueOf(s, it), r = rs(e.id);
      if (s && s.need) need++;
      if (it && it.q != null && it.u) vol.set(it.u, (vol.get(it.u) || 0) + (v.v || 0)); else noVol++;
      if (it && Array.isArray(it.f) && it.f.some(f => COND_F.includes(f))) cond++;
      if (r.st === 'yes') yes++; else if (r.st === 'unk') unk++;
    }
    return { vol, noVol, cond, need, yes, unk };
  }
  // строка «Замечания к РД» карточки и окна: по данным, без придумывания
  const remLine = (rst, yes, unk) => rst === 'ok' ? [h('li', { class: yes ? 'pg-warn' : null }, 'С замечаниями к РД: ' + fmt(yes, 0)), unk ? h('li', { class: 'pg-warn' }, 'связь с замечаниями не проверена · ' + fmt(unk, 0)) : null]
    : [h('li', { class: 'muted' }, rst === 'load' ? 'Замечания к РД: загружаются…' : 'Замечания к РД: нет в источнике')];
  const showList = (evs, rs) => h('details', { class: 'pg-acc-more' }, h('summary', {}, 'показать'), h('ul', { class: 'pg-ids' }, evs.slice(0, 50).map(e => { const r = rs(e.id); return h('li', {}, h('span', { class: 'mono' }, e.id), ' ', h('span', { class: 'muted' }, nameOf(e.id)), r.ids && r.ids.length ? ' · ' + r.ids.join(', ') : null); }), evs.length > 50 ? h('li', { class: 'muted' }, '… ещё ' + fmt(evs.length - 50, 0)) : null));
  const remHow = () => { const R = window.ATLAS_REMARKS || {}, st = [...new Set((Array.isArray(R.items) ? R.items : []).map(x => x && x.status).filter(Boolean))];
    return h('details', { class: 'pg-acc-more' }, h('summary', {}, 'Как посчитано'), h('p', { class: 'muted' }, 'Замечания к РД — замечания атласа к рабочей документации (данные выпуска, связь «элемент → замечания» по ключу тела или элемента). «Без замечаний» — элемент есть в объёмах выпуска, связь сходится с выпуском, замечаний у него нет. Если связь не проверена (ключа нет в объёмах выпуска или связь не сходится), строка не принимается этой кнопкой. Статус замечания не учитывается' + (st.length ? ': в данных — ' + st.map(x => '«' + x + '»').join(', ') + (st.some(x => /закрыт/i.test(x)) ? '' : ', статуса «закрыто» нет') : '') + '.')); };
  function renderAccept() {
    const r = role(), sup = r === 'supervisor', states = AP.fold(S.events), open = AP.sorted(S.events).filter(e => isOpen(e, states)).reverse();
    const rst = remarksState(), memo = new Map(), rs = k => { let v = memo.get(k); if (!v) memo.set(k, v = rst === 'ok' ? AP.remarkStateOf(k, bodyOf, knownKey) : { st: 'unk', ids: null }); return v; };
    body.append(h('h2', { class: 'pg-h2 pg-acc-h' }, 'Принять · ' + fmt(open.length, 0) + ' · ' + srcText()));
    if (!S.events.length) { body.append(emptyNote()); return; }
    if (!sup) body.append(h('p', { class: 'muted' }, 'Принимает и возвращает технадзор (роль журнала «технадзор»); здесь — только просмотр.'));
    // «Изменено после приёмки — проверить повторно» (§6.5 п. 5): элементы need, решения нет
    const needN = [...states.values()].filter(s => s.need && s.st !== 'none' && !s.conf).length;
    if (needN) body.append(h('section', { class: 'card pg-card pg-acc-need', 'aria-label': 'Изменено после приёмки' }, h('p', {}, h('strong', {}, 'Изменено после приёмки — проверить повторно: ' + nEl(needN))), h('div', { class: 'pg-row' }, h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: () => go('journal', { only: 'open' }) } }, 'Выборочно'))));
    const done7 = acceptedSection(states, sup);
    if (!open.length) { body.append(h('p', { class: 'muted pg-acc-none' }, 'Ждущих приёмки строк нет.')); if (done7) body.append(done7); return; }
    // массовая приёмка (реш. 7, §13.2): «без замечаний» — только st 'no'; с замечаниями и непроверенная связь — отдельными строками, не принимаются
    const free = open.filter(e => rs(e.id).st === 'no'), withR = open.filter(e => rs(e.id).st === 'yes'), unk = open.filter(e => rs(e.id).st === 'unk');
    const mass = h('section', { class: 'card pg-card pg-acc-mass', 'aria-label': 'Массовая приёмка' });
    if (rst === 'ok' || rst === 'load') {
      const b = h('button', { type: 'button', id: 'pgAcceptFree', class: 'pbtn pbtn--primary', disabled: !sup || rst !== 'ok' || !free.length, on: { click: e => acceptDialog(free, states, e.currentTarget, { title: 'Принять всё без замечаний к РД',
        extra: h('ul', { class: 'pg-acc-l' }, withR.length ? h('li', { class: 'pg-warn' }, 'Не принимаются — с замечаниями к РД: ' + fmt(withR.length, 0) + ' · ', showList(withR, rs)) : null, unk.length ? h('li', { class: 'pg-warn' }, 'Не принимаются — связь с замечаниями не проверена · ' + fmt(unk.length, 0) + ' · ', showList(unk, rs)) : null, h('li', {}, remHow())) }) } }, 'Принять всё без замечаний к РД' + (rst === 'ok' ? ' (' + fmt(free.length, 0) + ')' : ''));
      app(mass, h('div', { class: 'pg-row' }, b), h('ul', { class: 'pg-acc-l' }, remLine(rst, withR.length, unk.length)), rst === 'ok' ? remHow() : null);
    } else {
      app(mass, h('div', { class: 'pg-row' }, h('button', { type: 'button', id: 'pgAcceptAll', class: 'pbtn pbtn--primary', disabled: !sup, on: { click: e => acceptDialog(open, states, e.currentTarget) } }, 'Принять все ждущие (' + fmt(open.length, 0) + ')')), h('ul', { class: 'pg-acc-l' }, remLine(rst, 0, 0)));
    }
    body.append(mass);
    // пакеты «автор × дата работ × зона» (AP.packagesOf); зона — захватка (участок работ) или этап без захваток
    const zones = new Map(AP.zonesOf(S.plan).map(z => [z.key, z])), pk = AP.packagesOf(S.events, states, S.plan ? AP.zoneIndex(S.plan) : new Map());
    const list = h('div', { class: 'pg-pkgs' }), lim = S.pkMore || 12;
    for (const g of pk.slice(0, lim)) {
      const z = g.zone != null ? zones.get(g.zone) : null, t = pkgStats(g.events, states, rs);
      const head = [g.by, AP.ruDate(g.date), z ? z.stageTitle : 'вне порядка работ', z && z.lot ? z.title : null].filter(Boolean).join(' · ');
      list.append(h('section', { class: 'card pg-card pg-pkg', 'aria-label': 'Пакет: ' + head },
        h('h3', { class: 'pg-pkg-h' }, head, z && z.draft ? h('span', { class: 'pg-badge pg-badge--draft' }, 'черновик атласа') : null),
        h('ul', { class: 'pg-acc-l' }, h('li', {}, 'Элементов: ' + fmt(g.events.length, 0)), [...t.vol].map(([u, v]) => h('li', {}, 'Объём: ' + fmt(v) + ' ' + u)), t.noVol ? h('li', {}, 'Без объёма в данных: ' + fmt(t.noVol, 0)) : null,
          t.cond ? h('li', {}, 'Условные объёмы: ' + fmt(t.cond, 0)) : null, h('li', { class: t.need ? 'pg-warn' : null }, 'Изменено после приёмки: ' + fmt(t.need, 0)), remLine(rst, t.yes, t.unk)),
        h('div', { class: 'pg-row' },
          sup ? h('button', { type: 'button', class: 'pbtn pbtn--sm pbtn--primary', on: { click: e => acceptDialog(g.events, states, e.currentTarget, { title: 'Принять пакет', extra: h('ul', { class: 'pg-acc-l' }, remLine(rst, t.yes, t.unk)) }) } }, 'Принять') : null,
          sup ? h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: e => reasonDialog(g.events, states, e.currentTarget, 'return') } }, 'Вернуть') : null,
          h('button', { type: 'button', class: 'pbtn pbtn--sm', on: { click: () => go('journal', { by: g.by, from: g.date, to: g.date, stage: z ? z.stage : '', lot: z && z.lot ? z.lot : '', only: 'open' }) } }, 'Выборочно'))));
    }
    body.append(h('h2', { class: 'pg-h2' }, 'Пакеты: ' + fmt(pk.length, 0) + ' · ' + fmt(open.length, 0) + ' ' + AP.plural(open.length, ROWS) + ' ждут приёмки'), list);
    if (pk.length > lim) body.append(h('button', { type: 'button', class: 'pbtn', on: { click: () => { S.pkMore = lim + 12; renderTab(); } } }, 'Показать ещё'));
    if (done7) body.append(done7);
  }
  window.AtlasProgressPage.register('accept', { title: 'Принять', render: () => renderAccept(), count: c => c.events.filter(e => AP.isOpen(e, c.states)).length });

  /* ---------- Ведомость объёмов для КС (черновик) ---------- */
  // 1.0.19a, Б8: «Принятые» у технадзора по умолчанию (basis=all — явный выбор «Все отметки»); «Только отмеченные» по умолчанию (rows=all — «Все строки»)
  const basisOf = q => q.basis === 'confirmed' || (q.basis !== 'all' && role() === 'supervisor') ? 'confirmed' : 'all';
  function sheetOf(q) { return AP.sheet({ items, plan: S.plan, events: S.events, from: q.from || null, to: q.to || AP.today(), basis: basisOf(q), info, isBody, meta: metaBase() }); }
  function renderSheet() {
    const q = Q(), conf = basisOf(q) === 'confirmed', marked = q.rows !== 'all', td = AP.today();
    const per = k => { const p = AP.periodOf(k, td); return p && q.from === p.from && (q.to || td) === p.to; };
    // круг 2 (B-08): в первом месяце квартала «Квартал» = «Этот месяц» — нажата одна кнопка группы («Этот месяц»)
    const perBtn = (k, t) => h('button', { type: 'button', 'aria-pressed': String(!!per(k) && !(k === 'quarter' && per('month'))), on: { click: () => { const p = AP.periodOf(k, td); setQ({ from: p.from, to: p.to }); renderTab(); } } }, t);
    app(body, h('h2', { class: 'pg-h2 pg-sheet-h' }, 'Ведомость объёмов для КС (черновик)'), S.events.length ? null : emptyNote(),
      h('div', { class: 'pg-filters' },
        h('div', { class: 'seg pg-seg', role: 'group', 'aria-label': 'Период' }, perBtn('month', 'Этот месяц'), perBtn('prev', 'Прошлый месяц'), perBtn('quarter', 'Квартал')),
        h('label', { class: 'pg-f' }, h('span', {}, 'Период с'), h('input', { type: 'date', value: q.from || '', max: td, on: { change: e => { setQ({ from: e.target.value }); renderTab(); } } })),
        h('label', { class: 'pg-f' }, h('span', {}, 'по'), h('input', { type: 'date', value: q.to || td, max: td, on: { change: e => { setQ({ to: e.target.value }); renderTab(); } } })),
        h('div', { class: 'seg pg-seg', role: 'group', 'aria-label': 'Итог считается' },
          h('button', { type: 'button', 'aria-pressed': String(!conf), on: { click: () => { setQ({ basis: 'all' }); renderTab(); } } }, 'Все отметки'),
          h('button', { type: 'button', 'aria-pressed': String(conf), on: { click: () => { setQ({ basis: 'confirmed' }); renderTab(); } } }, 'Принятые (для КС)')),
        h('div', { class: 'seg pg-seg', role: 'group', 'aria-label': 'Строки ведомости' },
          h('button', { type: 'button', 'aria-pressed': String(marked), on: { click: () => { setQ({ rows: '' }); renderTab(); } } }, 'Только отмеченные'),
          h('button', { type: 'button', 'aria-pressed': String(!marked), on: { click: () => { setQ({ rows: 'all' }); renderTab(); } } }, 'Все строки'))));
    const t0 = performance.now(), Rr = sheetOf(q), ms = Math.round(performance.now() - t0), acc = modesOn(), mode = acc ? { rows: marked ? 'marked' : 'all', accept: true } : { rows: marked ? 'marked' : 'all' };   // 1.0.20 §6.6: при modes — колонки приёмки и код позиции сметы в книге
    const rowsM = AP.markedRows(Rr), sum = marked ? AP.summaryKS(Rr) : Rr.summary;
    const dl = h('div', { class: 'pg-row' },
      h('button', { type: 'button', class: 'pbtn pbtn--primary', on: { click: async e => { const b = e.currentTarget; b.disabled = true; try { const f = await AP.xlsx(Rr, metaBase(), mode); AP.save(f); toast('Выгружено: ' + f.name); } catch (x) { toast('Ведомость не выгружена (' + x.message + '). Что делать: нажмите «Повторить»; если не выходит — сохраните «JSON для PGS».', true, { label: 'Повторить', run: () => b.click() }); } b.disabled = false; } } }, 'Скачать ведомость (XLSX)'),
      h('button', { type: 'button', class: 'pbtn', on: { click: () => AP.save(AP.machineJson(Rr, metaBase(), S.plan)) } }, 'Скачать для PGS (JSON)'),
      h('button', { type: 'button', class: 'pbtn', on: { click: () => AP.save(AP.csv(Rr, items, S.events)) } }, 'Скачать по дням (CSV)'));
    if (role() === 'supervisor') dl.append(h('button', { type: 'button', class: 'pbtn', title: 'После выгрузки для КС: отметки с датой до конца периода — только с примечанием', on: { click: async () => { const d = Rr.period.to; if (!confirm('Закрыть период по ' + AP.ruDate(d) + ' включительно?')) return; try { await S.store.set('closedUntil', d); } catch (e) { toast(storeErr('Период не закрыт', e), true); return; }   /* круг 3 (Н-1) */ toast('Период закрыт по ' + AP.ruDate(d)); refresh(); } } }, 'Закрыть период'));
    body.append(dl, h('p', { class: 'muted' }, 'Строк: ' + (marked ? fmt(rowsM.length) + (conf ? ' принятых' : ' отмеченных') + (Rr.period.from ? ' с величиной за период' : '') + ' из ' + fmt(Rr.rows.length) : fmt(Rr.rows.length)) + ' · событий за период: ' + fmt(Rr.journal.length) + ' · расчёт ' + ms + ' мс. ' + (conf ? 'Итог — по принятым технадзором отметкам. ' : 'Итог — по всем отметкам. ') + 'Объёмы — по модели или источнику, «нет объёма» в суммы не входит; рабочий документ, не исполнительная документация. ' + srcText().replace(/^./, c => c.toUpperCase()) + '.'));
    if (!S.events.length) return;   // «Отметок пока нет» — сразу под заголовком
    const tb = h('tbody');
    for (const s of sum) tb.append(h('tr', {}, h('td', {}, s.stage ? stageCell(s.stage) : s.title), h('td', {}, s.unit), h('td', { class: 'num' }, fmt(s.plan)), h('td', { class: 'num' }, fmt(s.period)), h('td', { class: 'num' }, fmt(s.total)), h('td', { class: 'num' }, s.pct == null ? '—' : fmt(s.pct, 1) + ' %'), h('td', { class: 'num' }, fmt(s.totalConfirmed)), h('td', { class: 'num' }, s.noVol ? fmt(s.noVol) : '')));
    body.append(h('h2', { class: 'pg-h2' }, 'Сводка по этапам' + (marked ? ' (этапы с отметками; «шт» — только элементы, которые считаются в штуках или без объёма)' : '')), sum.length ? h('div', { class: 'card pg-tablebox' }, h('table', { class: 'pg-table' }, h('thead', {}, h('tr', {}, ['Этап', 'Ед.', 'План', 'За период', 'Нарастающим', '%', 'Принято', 'Без объёма, шт'].map(t => h('th', { scope: 'col' }, t)))), tb)) : h('p', { class: 'muted' }, 'За период отметок нет.'));
    const tr = h('tbody'), rows = (marked ? rowsM : Rr.rows.filter(r => r.state !== 'none' || r.period || r.pcsPeriod)).slice(0, 300);
    const confText = c => c === 'да' ? 'принято' : c === 'отклонено' ? 'возвращено' : c === 'требует подтверждения' ? 'изменено после приёмки' : c;   // на экране — словами словаря; в файлах — прежние значения
    for (const r of rows) tr.append(h('tr', {}, h('td', {}, stageCell(r.stage)), h('td', {}, r.title || '', h('br'), h('span', { class: 'mono muted pg-id code' }, r.key)), h('td', {}, r.q != null ? r.unit : 'шт'), h('td', { class: 'num' }, r.q != null ? fmt(r.q) : 'нет объёма'), h('td', {}, r.basis), h('td', { class: 'num' }, fmt(r.q != null ? r.period : r.pcsPeriod)), h('td', { class: 'num' }, fmt(r.q != null ? r.total : r.pcsTotal)), h('td', { class: 'num' }, fmt(r.pct, 1) + ' %'), h('td', {}, confText(r.confirmed)),
      acc ? h('td', {}, r.acceptedBy || '') : null, acc ? h('td', {}, r.acceptedDate ? AP.ruDate(r.acceptedDate) : '') : null));
    const cmx = acc ? AP.costMapOf() : null;   // 1.0.20 §6.6 п. 3: одна строка про позиции сметы над таблицей, не в каждой строке
    app(body, h('h2', { class: 'pg-h2' }, 'Отмеченные элементы' + (rows.length === 300 ? ' (первые 300 — полностью в XLSX)' : '')), acc ? h('p', { class: 'muted pg-est' }, 'Позиции сметы: ' + AP.weightsLabel(cmx.map, cmx.est) + (cmx.map && cmx.est ? ' — код позиции по этапу в XLSX (колонка «Код позиции сметы»).' : '. Код позиции сметы в XLSX — «не сопоставлено».')) : null,
      h('div', { class: 'card pg-tablebox' }, h('table', { class: 'pg-table' }, h('thead', {}, h('tr', {}, ['Этап', 'Элемент', 'Ед.', 'Объём', 'Основание', 'За период', 'Нарастающим', '%', 'Принято'].concat(acc ? ['Принял', 'Дата приёмки'] : []).map(t => h('th', { scope: 'col' }, t)))), tr)));
  }

  /* ---------- запуск ---------- */
  (async () => {
    try { S.store = await AP.openStore(pid); } catch (e) { sub.textContent = 'Хранилище браузера недоступно (' + (e && e.message || e) + '). Что делать: откройте страницу в обычном (не частном) окне или разрешите хранение данных для сайта.'; done(); return; }
    await load(); renderHead(); renderTab(); done(); HOST.ready = true;
    // 1.0.20: смена режима — первая вкладка нового режима; atlas-modes.js, вставленный после разбора, — вкладки по режиму после загрузки страницы
    document.addEventListener('atlas:mode', () => { if (!modesOn()) return; setQ({ tab: firstTab() }); renderHead(); renderTab(); });   // П3-3: в адресе — #tab=<главная вкладка нового режима> (replaceState: hashchange нет, петли нет)
    if (document.readyState !== 'complete') addEventListener('load', () => { if (modesOn()) renderTab(); }, { once: true });
    // П1 (F1): кнопка режима в шапке (PROGRESS.html#tab=today|accept|summary) на открытой странице меняет только хэш — вкладка по #tab, без перезагрузки;
    // только при modesOn (без ключа — как 1.0.19). go() и setQ() пишут адрес replaceState — hashchange от них нет, петли нет
    addEventListener('hashchange', () => { if (!modesOn()) return; S.more = 300; renderTab(); });
    S.store.on(m => { if (!m.local) refresh(); });
    // 1.0.19a, Б5: «Покинуть сайт?» — только если отметки можно потерять: хранилище в памяти или несохранённые в файл и неотправленные
    addEventListener('beforeunload', e => { if (S.unsaved && (S.store.memory || !(S.online && S.online.user && !S.online.pending))) { e.preventDefault(); e.returnValue = ''; } });
    if (window.AtlasProgressSync && AtlasProgressSync.httpPage()) {
      document.addEventListener('atlas:progresssync', async e => {
        const previous = S.online;
        const changed = !previous || previous.anon !== e.detail.anon || previous.online !== e.detail.online || previous.needLogin !== e.detail.needLogin || previous.imported !== e.detail.imported || previous.others !== e.detail.others || previous.user !== e.detail.user || previous.role !== e.detail.role || previous.preUser !== e.detail.preUser || previous.preOther !== e.detail.preOther || previous.seq !== e.detail.seq || previous.pending !== e.detail.pending || Object.keys(e.detail.rejected || {}).length !== S.rejected;
        S.online = e.detail;
        // Pull/attestation updates this tab's store too; repaint the body after data or role changes.
        // Unchanged background heartbeats leave filters and any open editor intact.
        if (changed) await refresh(); else { renderHead(); renderTabs(); }
      });
      S.sync = await AtlasProgressSync.start(S.store, { project_id: pid, slug: cfg.slug });
      S.online = S.sync.state(); await refresh();
    }
  })();
})();
