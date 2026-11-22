/* 1.0.20 (§6.7 задания, b2) · PROGRESS.html — вкладка «Сегодня» (режим «Площадка»): отметка зоны в одно нажатие.
   Регистрация — window.AtlasProgressPage.register('today', …) (хост B, §5.2); вкладку показывает хост только при AtlasShell.modesOn().
   При загрузке файл ничего не добавляет в DOM и ничего не пишет в хранилище: без ключа modes вид и поведение — как в 1.0.19.
   Карточки: до 3 последних зон устройства (AtlasShell.storageKey('progress-today') → {recent: [{stage, lot, t}]}) и «Дальше по порядку» —
   до 3 первых зон AtlasProgress.zonesOf(plan), где готовы не все элементы. Чипы «25 %», «50 %», «75 %», «Готово» → makeZoneBatch
   (принятое пропускается, готовое не понижается) → batchRisk (окно только в рискованных случаях 1.0.19a) → ctx.addEvents.
   «Записано: N элементов · Отменить» — 10 с (undoBatch). Зона — в память вкладки и в ctx.memSet({stage, lot}) (панель на модели).
   Формат событий не меняется; запросов нет (file://). */
'use strict';
(() => {
  const PG = window.AtlasProgressPage, AP = window.AtlasProgress;
  if (!PG || typeof PG.register !== 'function' || !AP || typeof AP.zonesOf !== 'function') return;
  const UNDO_MS = 10000, RECENT_N = 3, NEXT_N = 3, CHIP_CARDS = 3;   // карточек с чипами на первом экране — не больше 3 (счёт элементов управления, §6.7 п. 8)
  const CHIPS = [['partial', 25, '25 %'], ['partial', 50, '50 %'], ['partial', 75, '75 %'], ['done', null, 'Готово']];
  // состояние вкладки (живёт до перезагрузки страницы): дата, выбор «Другой захватки», последний пакет для «Отменить»
  const M = { date: 'today', pick: null, last: null, timer: null, pending: null, busy: false };

  /* ---------- память устройства: последние зоны ---------- */
  const recentKey = () => {
    try { const SH = window.AtlasShell; if (SH && typeof SH.storageKey === 'function') return SH.storageKey('progress-today'); } catch (e) { /* нет оболочки */ }
    try { const c = AP.config && AP.config(), p = c && c.project_id; return 'atlas:' + (/^[a-z0-9-]+$/.test(p || '') ? p : 'default') + ':progress-today'; } catch (e) { return null; }
  };
  const isRec = r => r && typeof r === 'object' && typeof r.stage === 'string' && r.stage && (r.lot == null || typeof r.lot === 'string') && typeof r.t === 'number';
  function recentGet() {
    try { const k = recentKey(), v = k ? localStorage.getItem(k) : null, o = v ? JSON.parse(v) : null; return o && Array.isArray(o.recent) ? o.recent.filter(isRec).slice(0, RECENT_N) : []; } catch (e) { return []; }
  }
  function recentPut(z) {
    try {
      const k = recentKey(); if (!k) return false;
      const lot = z.lot || null, rest = recentGet().filter(r => !(r.stage === z.stage && (r.lot || null) === lot));
      localStorage.setItem(k, JSON.stringify({ recent: [{ stage: z.stage, lot, t: Date.now() }].concat(rest).slice(0, RECENT_N) }));
      return true;
    } catch (e) { return false; }   // хранилище запрещено — без памяти, без исключения
  }

  /* ---------- подписи ---------- */
  const nEl = n => n + ' ' + AP.plural(n, ['элемент', 'элемента', 'элементов']);
  const dateOf = () => M.date === 'yesterday' ? AP.addDays(AP.today(), -1) : AP.today();
  const zoneName = z => z.lot ? z.stageTitle + ' · ' + z.title : z.stageTitle + (z.rest ? ' · вне захваток' : ' · весь этап');
  const doneOf = (z, S) => z.ids.reduce((n, k) => n + ((S.get(k) || {}).st === 'done' ? 1 : 0), 0);
  const live = ctx => (PG.ctx && PG.ctx()) || ctx;   // после записи хост перерисовывает вкладку — берём свежий снимок

  /* ---------- запись по чипу ---------- */
  function riskDialog(ctx, risk, op, title) {
    const h = ctx.h;
    return new Promise(done => {
      const back = document.activeElement, d = h('dialog', { class: 'pt-dlg', 'aria-labelledby': 'ptRiskH' });
      const lines = [];
      if (risk.lower) lines.push('Понизит отметку — ' + nEl(risk.lower) + ' (было больше)');
      if (risk.outside) lines.push('Вне выбранного этапа — ' + nEl(risk.outside));
      if (risk.confirmed) lines.push('Принятых технадзором: ' + risk.confirmed);
      if (risk.cases.includes('whole')) lines.push('Весь объект или этаж без этапа');
      const close = v => { try { d.close(); } catch (e) { /* */ } d.remove(); if (back && back.isConnected) { try { back.focus(); } catch (e) { /* */ } } done(v); };
      const no = h('button', { type: 'button', class: 'pbtn pt-no', on: { click: () => close(false) } }, 'Отмена');
      d.append(h('h2', { id: 'ptRiskH' }, 'Проверьте перед записью'), h('p', {}, title), h('ul', {}, lines.map(t => h('li', {}, t))),
        h('p', { class: 'pt-muted' }, 'Будет записано: ' + nEl(risk.write) + (risk.skipDone ? ' · пропущено готовых: ' + risk.skipDone : '') + (risk.skipConf ? ' · пропущено принятых: ' + risk.skipConf : '')),
        h('div', { class: 'pt-row' }, h('button', { type: 'button', class: 'pbtn pbtn--primary pt-go', on: { click: () => close(true) } }, (op === 'done' ? 'Записать «готово»' : 'Записать «частично»') + ' (' + risk.write + ')'), no));
      d.addEventListener('cancel', e => { e.preventDefault(); close(false); });
      document.body.append(d);
      try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
      no.focus();
    });
  }
  // 1.0.20 (W1-7): одна запись за раз — двойное нажатие чипа не пишет второй пакет (иначе «Отменить» откатывает только последний)
  async function mark(zone, op, pct, ctx0) {
    if (M.busy) return false;
    M.busy = true;
    try { return await markOnce(zone, op, pct, ctx0); } finally { M.busy = false; }
  }
  async function markOnce(zone, op, pct, ctx0) {
    const ctx = live(ctx0);
    if (!ctx.writer() || !ctx.who()) { ctx.userDialog(); return false; }
    const S = ctx.states, title = zoneName(zone);
    const risk = AP.batchRisk(op, zone.ids, { states: S, pct, zone: true });
    if (!risk.write) { ctx.toast('Нечего записывать: ' + title + ' — ' + [risk.skipDone ? 'готово уже ' + nEl(risk.skipDone) : '', risk.skipConf ? 'принято технадзором ' + nEl(risk.skipConf) : ''].filter(Boolean).join(', ') + '.'); return false; }
    if (risk.cases.length && !(await riskDialog(ctx, risk, op, title))) return false;
    const r = AP.makeZoneBatch(op, zone, { date: dateOf(), by: ctx.who(), role: ctx.role(), pct: op === 'partial' ? pct : undefined, states: S }, { closedUntil: ctx.closedUntil });
    recentPut(zone); M.pick = null;   // после записи из «Другой захватки» — снова карточки (зона уже в «Последних»)
    if (typeof ctx.memSet === 'function') ctx.memSet({ stage: zone.stage, lot: zone.lot || '' });
    const rs = r.events.map(event => ({ event })).concat(r.errors.map(x => ({ errors: x.errors })));
    if (r.events.length) setLast({ batch: r.batch, n: r.events.length, t: Date.now(), zone: title });
    const ok = await ctx.addEvents(rs);
    if (!ok && M.last && M.last.batch === r.batch) clearLast();
    return ok;
  }
  async function undo(ctx0) {
    const ctx = live(ctx0), L = M.last; if (!L) return false;
    clearLast();
    const u = AP.undoBatch(ctx.events, L.batch, { by: ctx.who(), role: ctx.role() || 'operator' }, { closedUntil: ctx.closedUntil });
    if (!u.events.length && !u.errors.length) { ctx.toast('Отменять нечего: отметки пакета уже изменены.'); return false; }
    return ctx.addEvents(u.events.map(event => ({ event })).concat(u.errors.map(x => ({ errors: x.errors }))));
  }
  function setLast(o) {
    M.last = o; clearTimeout(M.timer);
    M.timer = setTimeout(() => { M.last = null; for (const el of document.querySelectorAll('.pt-undo')) el.remove(); }, UNDO_MS);
  }
  function clearLast() { M.last = null; clearTimeout(M.timer); for (const el of document.querySelectorAll('.pt-undo')) el.remove(); }

  /* ---------- отрисовка ---------- */
  function card(ctx, z, S, can) {
    const h = ctx.h, a = doneOf(z, S), b = z.ids.length;
    const chips = h('div', { class: 'pt-chips', role: 'group', 'aria-label': 'Отметить: ' + zoneName(z) },
      CHIPS.map(([op, pct, label]) => h('button', { type: 'button', class: 'pbtn pt-chip' + (op === 'done' ? ' pt-chip--done' : ''), disabled: !can, 'data-op': op, 'data-pct': pct == null ? null : String(pct),
        on: { click: () => { M.pending = mark(z, op, pct, ctx); } } }, label)));
    return h('div', { class: 'pt-card', 'data-zone': z.key },
      h('div', { class: 'pt-card-h' }, h('span', { class: 'pt-zone' }, zoneName(z)), z.draft ? h('span', { class: 'pt-draft', title: 'Захватки предложены атласом, ПТО их не утверждало' }, 'черновик атласа') : null),
      h('div', { class: 'pt-meta' }, z.level ? h('span', {}, 'этаж: ' + z.level) : null, h('span', { class: 'pt-count' }, 'готово ' + a + ' из ' + nEl(b))),
      chips);
  }
  // короткая карточка «Дальше по порядку» (когда 3 карточки с чипами уже есть): одна кнопка «Отметить» → та же зона с чипами
  function short(ctx, z, S) {
    const h = ctx.h;
    return h('div', { class: 'pt-card pt-card--short', 'data-zone': z.key },
      h('div', { class: 'pt-card-h' }, h('span', { class: 'pt-zone' }, zoneName(z)), z.draft ? h('span', { class: 'pt-draft', title: 'Захватки предложены атласом, ПТО их не утверждало' }, 'черновик атласа') : null),
      h('div', { class: 'pt-meta' }, z.level ? h('span', {}, 'этаж: ' + z.level) : null, h('span', { class: 'pt-count' }, 'готово ' + doneOf(z, S) + ' из ' + nEl(z.ids.length))),
      h('button', { type: 'button', class: 'pbtn pt-open', 'aria-label': 'Отметить: ' + zoneName(z), on: { click: () => { M.pick = { zone: z.key }; rerender(ctx); } } }, 'Отметить'));
  }
  function picker(ctx, zones, S, can) {
    const h = ctx.h, P = M.pick, box = h('section', { class: 'pt-pick', 'aria-label': 'Другая захватка' });
    const back = h('button', { type: 'button', class: 'pbtn pt-back', on: { click: () => { M.pick = P.zone ? (P.stage ? { stage: P.stage } : {}) : P.stage ? {} : null; rerender(ctx); } } }, P.stage || P.zone ? '← Назад' : '← К карточкам');
    box.append(back);
    if (P.zone) { const z = zones.find(x => x.key === P.zone); if (z) box.append(h('div', { class: 'pt-cards' }, card(ctx, z, S, can))); return box; }
    if (P.stage) {
      const zs = zones.filter(z => z.stage === P.stage);
      box.append(h('h3', { class: 'pt-h' }, (zs[0] && zs[0].stageTitle) || P.stage), h('div', { class: 'pt-big' }, zs.map(z => h('button', { type: 'button', class: 'pbtn pt-bigbtn', 'data-zone': z.key,
        on: { click: () => { M.pick = { stage: P.stage, zone: z.key }; rerender(ctx); } } }, z.lot ? z.title : z.rest ? 'вне захваток' : 'весь этап', z.level ? h('small', {}, 'этаж: ' + z.level) : null))));
      return box;
    }
    const st = []; for (const z of zones) if (!st.some(s => s.stage === z.stage)) st.push({ stage: z.stage, title: z.stageTitle, whole: zones.filter(x => x.stage === z.stage).length === 1 && !z.lot ? z : null });
    box.append(h('h3', { class: 'pt-h' }, 'Этап'), h('div', { class: 'pt-big' }, st.map(s => h('button', { type: 'button', class: 'pbtn pt-bigbtn', 'data-stage': s.stage,
      on: { click: () => { M.pick = s.whole ? { zone: s.whole.key } : { stage: s.stage }; rerender(ctx); } } }, s.title, s.whole ? h('small', {}, 'весь этап') : null))));
    return box;
  }
  let lastBody = null;
  function rerender(ctx) { const c = live(ctx); if (lastBody && lastBody.isConnected) { lastBody.textContent = ''; render(lastBody, c); } }
  function render(body, ctx) {
    lastBody = body;
    const h = ctx.h, S = ctx.states || new Map(), zones = ctx.plan ? AP.zonesOf(ctx.plan).filter(z => z.ids.length) : [];
    const can = !!(ctx.writer() && ctx.who()), who = ctx.who();
    const root = h('div', { class: 'pt-today' });
    // верх: дата и кто отмечает
    const dchip = (id, label) => h('button', { type: 'button', role: 'radio', class: 'pbtn pt-dchip', 'aria-checked': String(M.date === id), disabled: !can, 'data-date': id,
      on: { click: () => { M.date = id; rerender(ctx); } } }, label);
    root.append(h('div', { class: 'pt-head' },
      h('h2', { class: 'pt-title' }, 'Сегодня, ' + AP.ruDate(AP.today()) + ' · ', can ? who : h('button', { type: 'button', class: 'pt-link pt-user', on: { click: () => ctx.userDialog() } }, 'Чтобы отмечать — «Кто отмечает»')),
      h('div', { class: 'pt-dates', role: 'radiogroup', 'aria-label': 'Дата работ' }, dchip('today', 'Сегодня'), dchip('yesterday', 'Вчера'))));
    if (M.last && Date.now() - M.last.t < UNDO_MS) root.append(h('div', { class: 'pt-undo', role: 'status' }, 'Записано: ' + nEl(M.last.n) + ' · ', h('button', { type: 'button', class: 'pt-link pt-undo-btn', on: { click: () => { M.pending = undo(ctx); } } }, 'Отменить')));
    const fix = AP.toFix(S, who || undefined);
    if (fix.length) root.append(h('button', { type: 'button', class: 'pt-fix', on: { click: () => ctx.go('journal', { only: 'fix' }) } }, 'К исправлению: ' + fix.length + ' →'));
    if (!zones.length) { root.append(h('p', { class: 'pt-muted' }, 'Порядок работ не задан — зон для отметки нет. Что делать: откройте «Порядок».')); body.append(root); return; }
    if (M.pick) { root.append(picker(ctx, zones, S, can)); body.append(root); return; }
    const recent = [];
    for (const r of recentGet()) { const z = zones.find(x => x.stage === r.stage && (x.lot || null) === (r.lot || null)); if (z && !recent.includes(z)) recent.push(z); }
    const next = zones.filter(z => !recent.includes(z) && doneOf(z, S) < z.ids.length).slice(0, NEXT_N);
    if (recent.length) root.append(h('section', { class: 'pt-sec', 'aria-label': 'Последние зоны' }, h('h3', { class: 'pt-h' }, 'Последние зоны'), h('div', { class: 'pt-cards' }, recent.map(z => card(ctx, z, S, can)))));
    root.append(h('section', { class: 'pt-sec', 'aria-label': 'Дальше по порядку' }, h('h3', { class: 'pt-h' }, 'Дальше по порядку'),
      next.length ? h('div', { class: 'pt-cards' }, next.map((z, i) => recent.length + i < CHIP_CARDS ? card(ctx, z, S, can) : short(ctx, z, S))) : h('p', { class: 'pt-muted' }, 'Все зоны порядка отмечены готовыми.')));
    root.append(h('div', { class: 'pt-row' }, h('button', { type: 'button', class: 'pbtn pt-other', on: { click: () => { M.pick = {}; rerender(ctx); } } }, 'Другая захватка')));
    body.append(root);
  }

  PG.register('today', { title: 'Сегодня', render });
  // для тестов (tests/progress/browser/screens_tests.js): состояние вкладки и ключ памяти; в DOM ничего не добавляет
  window.AtlasProgressToday = { UNDO_MS, state: M, recentKey, recentGet, pending: () => M.pending || Promise.resolve() };
})();
