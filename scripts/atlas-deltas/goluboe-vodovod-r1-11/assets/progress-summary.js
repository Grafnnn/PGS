/* 1.0.20 (§6.8 задания с поправкой §13 п. 6, b4) · PROGRESS.html — вкладка «Итог» (режим «Обзор») и чистая функция среза.
   window.AtlasProgressSummary.digest({items, plan, events, asOf, source, project, release, remarks, bodyIds, capturedAt}) → объект
   schemas/progress-digest.schema.json (тот же расчёт — tools/build/progress_digest.py; паритет — tests/progress/test_digest.py).
   Строк ведомости не строит: только AP.fold, AP.stagesOf и счёт по ключам этапов. Определения (одинаковые в JS и Python):
   элемент «готов» — st = done в свёртке на asOf; этап «готов» — готовы все его ids, «в работе» — есть done или partial, но не все готовы;
   «принято» — conf = confirmed и cv.st = done; «приёмка снята» — conf = rejected сразу после confirm (s.wd свёртки ядра);
   неделя — свёртка на asOf минус свёртка на asOf − 7. Объёмы по единицам — без перевода единиц, q = null не суммируется (no_qty).
   Веса (§14, 23:30): только при window.ATLAS_PROGRESS_ESTIMATE и window.ATLAS_PROGRESS_COST_MAP (оба) — basis 'estimate':
   вес этапа = Σ allocation × стоимость работы (только kind = 'work'), готовность = Σ вес × доля готовых элементов этапа / Σ вес.
   Целочисленно (BigInt): qty × 1000, цена × 100, доля × 1e6 — как int в Python. Без обоих файлов — basis 'count', weights null,
   «веса из сметы не сопоставлены с этапами». Имён и почты в срезе нет.
   Вкладку регистрирует хост B (§5.2) — показывается только при AtlasShell.modesOn(). При загрузке файл ничего не пишет в DOM и в хранилище;
   запросов нет (file://). */
'use strict';
(() => {
  const AP = window.AtlasProgress;
  if (!AP || typeof AP.fold !== 'function') return;
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const r9 = v => Math.floor(v * 1e9 + 0.5) / 1e9;   // только шум float; в Python то же выражение (math.floor) — без расхождения Math.round / round
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const remIds = v => Array.isArray(v) ? v.map(x => isObj(x) ? String(x.id ?? '') : String(x)).filter(Boolean) : v == null || v === '' ? [] : [String(v)];

  /* ---------- смета (§14): целые числа, одинаково с progress_digest.py ---------- */
  const DEC = /^-?[0-9]+(?:\.[0-9]+)?$/, E6 = 1000000n;
  // строка Decimal → BigInt × 10^k (лишние знаки — половина от нуля); не строка или не число — null
  function scaled(v, k) {
    if (typeof v !== 'string' || !DEC.test(v)) return null;
    const neg = v[0] === '-', p = (neg ? v.slice(1) : v).split('.'), b = p[1] || '';
    let n = BigInt(p[0] + (b + '0'.repeat(k)).slice(0, k));
    if (b.length > k && b.charCodeAt(k) >= 53) n += 1n;
    return neg ? -n : n;
  }
  // доля 0…1 → миллионные: число — floor(a·1e6 + 0,5) (IEEE, как math.floor), строка — scaled(a, 6); иначе null
  function ppm(a) {
    let n = null;
    if (typeof a === 'number' && Number.isFinite(a)) n = BigInt(Math.floor(a * 1e6 + 0.5)); else if (typeof a === 'string') n = scaled(a, 6);
    return n != null && n >= 0n && n <= E6 ? n : null;
  }
  const fdiv = (a, b) => { const q = a / b; return (a % b !== 0n && ((a < 0n) !== (b < 0n))) ? q - 1n : q; };   // как // в Python
  const rdiv = (a, b) => fdiv(2n * a + b, 2n * b);   // округление половины вверх
  const kop = x => Number(rdiv(x, 1000000000n));      // ₽ × 1e11 (qty·1e3 × цена·1e2 × доля·1e6) → копейки
  function estimateOf(E, M, stages) {
    if (!isObj(E) || !Array.isArray(E.items) || !isObj(M) || !Array.isArray(M.rows)) return null;
    const work = new Map(); let noPrice = 0;
    for (const it of E.items) {
      if (!isObj(it)) continue;
      if (it.kind === 'material') { const pr = scaled(it.unitPrice, 2); if (pr == null || pr === 0n) noPrice++; continue; }
      const id = it.budgetItemId == null ? '' : String(it.budgetItemId);
      if (it.kind !== 'work' || !id || work.has(id)) continue;
      const q = scaled(it.qty, 3), pr = scaled(it.unitPrice, 2);
      work.set(id, { cost: q == null || pr == null ? 0n : q * pr, alloc: 0n });   // ₽ × 1e5
    }
    const ix = new Map(stages.map((s, i) => [s.id, i])), W = stages.map(() => 0n); let skipped = 0;
    for (const r of M.rows) {
      const sid = isObj(r) && r.stageId != null ? String(r.stageId) : '', w = work.get(isObj(r) && r.budgetItemId != null ? String(r.budgetItemId) : ''), a = isObj(r) ? ppm(r.allocation) : null;
      if (!w || !ix.has(sid) || a == null) { skipped++; continue; }
      w.alloc += a; W[ix.get(sid)] += a * w.cost;
    }
    let mw = 0, mc = 0n, uw = 0, uc = 0n, over = 0;
    for (const w of work.values()) {
      if (w.alloc > 0n) { mw++; mc += (w.alloc > E6 ? E6 : w.alloc) * w.cost; }
      if (w.alloc < E6) { uw++; uc += (E6 - w.alloc) * w.cost; }
      if (w.alloc > E6) over++;
    }
    const sum = W.reduce((a, b) => a + b, 0n);
    let P = 0n; stages.forEach((s, i) => { P += fdiv(W[i] * BigInt(s.done) * E6, BigInt(s.total)); });
    const pm = sum > 0n ? Number(rdiv(P, sum * 1000n)) : null;
    const weights = pm == null ? null : stages.map((s, i) => ({ stage: s.id, cost: kop(W[i]), share: Number(rdiv(W[i] * E6, sum)), done: kop(fdiv(W[i] * BigInt(s.done), BigInt(s.total))) }));
    const str = v => typeof v === 'string' && v ? v : null;
    return { weights, est: { sourceRef: str(E.sourceRef), capturedAt: str(E.capturedAt), currency: str(E.currency), mapStatus: M.status === 'confirmed' ? 'confirmed' : 'draft',
      mapped: { works: mw, cost: kop(mc) }, unmapped: { works: uw, cost: kop(uc) }, materialsNoPrice: noPrice, overallocated: over, rowsSkipped: skipped, donePermille: pm } };
  }

  // состояние ключа в свёртке: готов / частично / принят / приёмка снята
  const look = (S, k) => { const x = S.get(k); return x ? { done: x.st === 'done', part: x.st === 'partial', acc: x.conf === 'confirmed' && !!x.cv && x.cv.st === 'done', rev: x.conf === 'rejected' && !!x.wd } : { done: false, part: false, acc: false, rev: false }; };

  function stagesFor(plan) {
    const out = [];
    for (const s of AP.stagesOf(plan)) {
      if (!isObj(s)) continue;
      const id = s.id == null ? '' : String(s.id), seen = new Set(), ids = [];
      for (const k of Array.isArray(s.ids) ? s.ids : []) if (typeof k === 'string' && k && !seen.has(k)) { seen.add(k); ids.push(k); }
      if (id && ids.length) out.push({ s, id, ids });
    }
    return out;
  }
  function tally(stages, S) {
    const all = new Map(); let sd = 0, sw = 0, sa = 0;
    const per = stages.map(z => {
      let d = 0, p = 0, a = 0, r = 0;
      for (const k of z.ids) { const x = look(S, k); all.set(k, x); if (x.done) d++; if (x.part) p++; if (x.acc) a++; if (x.rev) r++; }
      const st = d === z.ids.length ? 'done' : d + p > 0 ? 'work' : 'none';
      if (st === 'done') sd++; else if (st === 'work') sw++;
      if (a === z.ids.length) sa++;
      return { d, p, a, r, st };
    });
    let ed = 0, ep = 0, ea = 0, er = 0;
    for (const x of all.values()) { if (x.done) ed++; if (x.part) ep++; if (x.acc) ea++; if (x.rev) er++; }
    return { per, all, sd, sw, sa, ed, ep, ea, er };
  }

  function digest(o) {
    o = o || {};
    const items = isObj(o.items) ? o.items : {}, plan = isObj(o.plan) ? o.plan : null;
    const ev = (Array.isArray(o.events) ? o.events : []).filter(isObj);
    const asOf = AP.isDate(o.asOf) ? o.asOf : AP.today(), from = AP.addDays(asOf, -7);
    const stages = stagesFor(plan), T1 = tally(stages, AP.fold(ev, asOf)), T0 = tally(stages, AP.fold(ev, from));
    const unknown = new Set();
    const out = stages.map((z, i) => {
      const t = T1.per[i], U = new Map();
      for (const k of z.ids) {
        const it = items[k];
        if (!isObj(it) || typeof it.u !== 'string' || !it.u) { unknown.add(k); continue; }
        let u = U.get(it.u); if (!u) U.set(it.u, u = { unit: it.u, n: 0, plan: 0, no_qty: 0, done: 0, accepted: 0, revoked: 0 });
        const q = num(it.q), x = T1.all.get(k);
        u.n++;
        if (q == null) { u.no_qty++; continue; }
        u.plan += q; if (x.done) u.done += q; if (x.acc) u.accepted += q; if (x.rev) u.revoked += q;
      }
      const units = [...U.values()].map(u => Object.assign(u, { plan: r9(u.plan), done: r9(u.done), accepted: r9(u.accepted), revoked: r9(u.revoked) }));
      return { id: z.id, title: typeof z.s.title === 'string' && z.s.title.trim() ? z.s.title.trim() : z.id, n: Number.isInteger(z.s.n) && z.s.n >= 0 ? z.s.n : 0, total: z.ids.length, done: t.d, partial: t.p, accepted: t.a, revoked: t.r, state: t.st, units };
    });
    const X = estimateOf(o.estimate, o.costMap, out);
    let unmapped = 0; for (const k of Object.keys(items)) if (!T1.all.has(k)) unmapped++;
    let rd = null;
    const R = o.remarks, B = isObj(R) && isObj(R.by_element) ? R.by_element : null;
    if (B) {
      const known = new Set(Object.keys(items)), rem = new Set(); let el = 0;
      for (const k of Object.keys(items)) { const v = items[k]; if (isObj(v) && typeof v.bd === 'string' && v.bd) known.add(v.bd); }
      for (const b of Array.isArray(o.bodyIds) ? o.bodyIds : []) if (typeof b === 'string') known.add(b);
      for (const k of T1.all.keys()) {
        const v = items[k], bd = isObj(v) && typeof v.bd === 'string' && v.bd ? v.bd : null;
        const ids = remIds(bd && has(B, bd) ? B[bd] : has(B, k) ? B[k] : null);
        if (ids.length) { el++; for (const r of ids) rem.add(r); }
      }
      let unl = 0; for (const k of Object.keys(B)) if (!known.has(k)) unl++;
      rd = { elements: el, remarks: rem.size, unlinked: unl };
    }
    return {
      schema: 1, kind: 'atlas-progress-digest', project: o.project == null ? null : String(o.project), release: o.release == null ? null : String(o.release),
      planRevision: plan && Number.isInteger(plan.rev) && plan.rev >= 0 ? plan.rev : 0, plan_status: plan && plan.status === 'approved' ? 'approved' : 'draft',
      as_of: asOf, capturedAt: typeof o.capturedAt === 'string' && o.capturedAt ? o.capturedAt : AP.nowIso(), source: ['snapshot', 'browser', 'server'].includes(o.source) ? o.source : 'browser',
      basis: X && X.weights ? 'estimate' : 'count', weights: X ? X.weights : null, weights_confirmed: !!(X && X.weights && X.est.mapStatus === 'confirmed'), estimate: X ? X.est : null, conditional: true,
      stages_total: stages.length, stages_done: T1.sd, stages_work: T1.sw, stages_accepted: T1.sa,
      elements_total: T1.all.size, elements_done: T1.ed, elements_partial: T1.ep, elements_accepted: T1.ea, elements_revoked: T1.er,
      week: { from, to: asOf, stages_done_delta: T1.sd - T0.sd, elements_done_delta: T1.ed - T0.ed },
      stages: out, unmapped, unknown: unknown.size, rdBlockers: rd
    };
  }

  /* ---------- экран «Итог» ---------- */
  const STATE = { done: 'готово', work: 'в работе', none: 'не начат' };
  const fmt = n => Number(n || 0).toLocaleString('ru-RU');
  const plus = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
  const rub = k => { const a = Math.abs(Math.round(k || 0)); return (k < 0 ? '−' : '') + fmt(Math.floor(a / 100)) + ',' + String(a % 100).padStart(2, '0') + ' ₽'; };
  const pct = pm => (pm / 10).toFixed(1).replace('.', ',') + ' %';
  const MAPST = { draft: 'черновик', confirmed: 'подтверждена' };
  const NOMAP = 'Веса из сметы не сопоставлены с этапами';
  // строки «По смете» (§14): есть снимок сметы и карта — проценты по весам; иначе — подпись «не сопоставлены»
  function estLines(D, h, el) {
    const X = isObj(D.estimate) ? D.estimate : null;
    if (!X) return [h('p', { class: 'pt-sum-w' }, NOMAP + ' · счёт по этапам')];
    const map = 'карта: ' + (MAPST[X.mapStatus] || X.mapStatus);
    return [
      h('p', { class: 'pt-sum-est' }, X.donePermille == null ? 'По смете: вес этапов 0 ₽ — доли не считаются · ' + map : 'По смете: ' + pct(X.donePermille) + ' · ' + map + ' · условно'),
      h('p', { class: 'pt-sum-w' }, 'не сопоставлено: ' + fmt(X.unmapped.works) + ' ' + el(X.unmapped.works, ['работа', 'работы', 'работ']) + ' на ' + rub(X.unmapped.cost)
        + ' · материалы без цены: ' + fmt(X.materialsNoPrice) + ' ' + el(X.materialsNoPrice, ['строка', 'строки', 'строк']) + ' (цена 0 в источнике)')];
  }
  function estHow(D, h) {
    const X = isObj(D.estimate) ? D.estimate : null;
    if (!X) return h('li', {}, NOMAP + ': снимка сметы и карты соответствия нет, доли этапов не считаются, все этапы равны по счёту.');
    return h('li', {}, 'По смете' + (X.sourceRef ? ' ' + X.sourceRef : '') + (X.capturedAt ? ' (снимок на ' + AP.ruDate(String(X.capturedAt).slice(0, 10)) + ')' : '') + ': вес этапа — сумма долей карты × стоимость работы (количество × цена; материалы не входят); готовность — сумма веса × доля готовых элементов этапа / сумма весов. Карта соответствия — ' + (MAPST[X.mapStatus] || X.mapStatus) + '. Сопоставлено работ: ' + fmt(X.mapped.works) + ' на ' + rub(X.mapped.cost) + (X.overallocated ? '; доли больше 1: ' + fmt(X.overallocated) : '') + (X.rowsSkipped ? '; строк карты не учтено: ' + fmt(X.rowsSkipped) : '') + '. Суммы — в копейках, без округления по пути.');
  }
  const isLocal = e => isObj(e) && e.src !== 'выпуск' && e.src !== 'server';
  // что показывать: срез выпуска (нет локальных событий, есть ctx.digestSnapshot) или расчёт по данным страницы (source browser)
  function pick(ctx) {
    const snap = isObj(ctx.digestSnapshot) && ctx.digestSnapshot.kind === 'atlas-progress-digest' && Array.isArray(ctx.digestSnapshot.stages) ? ctx.digestSnapshot : null;
    const evs = Array.isArray(ctx.events) ? ctx.events : [], local = evs.some(isLocal), online = typeof ctx.online === 'function' && !!ctx.online();
    if (snap && !local && !online) return { D: snap, src: 'срез выпуска на ' + AP.ruDate(snap.as_of), snap: true, any: snap.elements_done + snap.elements_partial > 0 || snap.stages_done + snap.stages_work > 0 };
    const pub = typeof AP.published === 'function' ? AP.published() : {}, meta = pub.itemsMeta || {};
    const D = digest({ items: ctx.items, plan: ctx.plan, events: evs, asOf: AP.today(), source: 'browser', project: meta.project_id, release: meta.release, remarks: window.ATLAS_REMARKS, bodyIds: pub.bodyIds, estimate: window.ATLAS_PROGRESS_ESTIMATE, costMap: window.ATLAS_PROGRESS_COST_MAP });
    const st = typeof ctx.srcText === 'function' ? ctx.srcText() : 'данные этого браузера';
    return { D, src: /^данные этого браузера$/.test(st) ? st + ' на ' + AP.ruDate(D.as_of).slice(0, 5) : st, snap: false, any: evs.length > 0 };
  }
  function render(body, ctx) {
    const h = ctx.h, t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    const P = pick(ctx), D = P.D, N = D.stages_total, el = AP.plural;
    const root = h('section', { class: 'pt-sum', 'aria-labelledby': 'ptSumH' });
    if (!N) {
      root.append(h('h2', { class: 'pt-sum-big', id: 'ptSumH' }, 'Итог'), h('p', { class: 'pt-sum-src' }, 'Порядка работ (плана этапов) нет · ' + P.src));
      body.append(root); return;
    }
    root.append(h('div', { class: 'pt-sum-head' },
      h('h2', { class: 'pt-sum-big', id: 'ptSumH' }, 'Этапов готово ' + fmt(D.stages_done) + ' из ' + fmt(N) + ' · в работе ' + fmt(D.stages_work) + ' · условно'),
      h('span', { class: 'pt-sum-src' }, P.src)));
    root.append(...estLines(D, h, el));
    if (!P.any) root.append(h('p', { class: 'pt-sum-empty' }, h('strong', {}, 'Отметок пока нет'), ' · ' + P.src));
    const w = D.week || {};
    root.append(h('p', { class: 'pt-sum-week' }, 'За неделю: ' + plus(w.stages_done_delta || 0) + ' ' + el(Math.abs(w.stages_done_delta || 0), ['этап', 'этапа', 'этапов']) + ', ' + plus(w.elements_done_delta || 0) + ' ' + el(Math.abs(w.elements_done_delta || 0), ['элемент', 'элемента', 'элементов']) + ' · с ' + AP.ruDate(w.from).slice(0, 5) + ' по ' + AP.ruDate(w.to).slice(0, 5)));
    root.append(h('p', { class: 'pt-sum-acc' }, 'Принято технадзором: этапов ' + fmt(D.stages_accepted) + ' из ' + fmt(N) + (D.elements_revoked ? ' · приёмка снята: ' + fmt(D.elements_revoked) + ' ' + el(D.elements_revoked, ['элемент', 'элемента', 'элементов']) : '')));
    if (isObj(D.rdBlockers)) root.append(h('p', { class: 'pt-sum-rd' }, 'Замечания к РД: ' + fmt(D.rdBlockers.remarks) + ' у ' + fmt(D.rdBlockers.elements) + ' ' + el(D.rdBlockers.elements, ['элемента', 'элементов', 'элементов']) + (D.rdBlockers.unlinked ? ' · связь не проверена: ' + fmt(D.rdBlockers.unlinked) : '')));
    root.append(h('ol', { class: 'pt-sum-list' }, D.stages.map(s => h('li', { class: 'pt-sum-row' },
      h('span', { class: 'pt-sum-name' }, s.title),
      h('span', { class: 'pt-sum-n' }, 'готово ' + fmt(s.done) + ' из ' + fmt(s.total)),
      h('span', { class: 'pt-sum-chip pt-sum-chip--' + s.state }, STATE[s.state] || s.state)))));
    root.append(h('details', { class: 'pt-sum-how' }, h('summary', {}, 'Как посчитано'), h('ul', {},
      h('li', {}, 'Элемент готов — последняя отметка на дату «выполнено». Этап готов — готовы все его элементы; в работе — есть отметки «выполнено» или «частично», но готовы не все.'),
      h('li', {}, 'Принято — последнее решение технадзора «принято» по готовому элементу. Приёмка снята — «возвращено» сразу после «принято».'),
      h('li', {}, 'За неделю — разность на ' + AP.ruDate(w.to) + ' и на ' + AP.ruDate(w.from) + '. Считаются этапы плана, где есть элементы: ' + fmt(N) + '; элементов в них — ' + fmt(D.elements_total) + ', готово ' + fmt(D.elements_done) + ', частично ' + fmt(D.elements_partial) + '.'),
      h('li', {}, 'Условно: объёмы и состав этапов — черновик атласа' + (D.plan_status === 'approved' ? ' (порядок утверждён, объёмы — по модели)' : '') + '.'),
      estHow(D, h),
      D.unmapped || D.unknown ? h('li', {}, 'Вне этапов: ' + fmt(D.unmapped) + ' ' + el(D.unmapped, ['элемент', 'элемента', 'элементов']) + ' ведомости; ключей плана без строки ведомости: ' + fmt(D.unknown) + '.') : null,
      h('li', {}, 'Источник: ' + P.src + '.'))));
    body.append(root);
    // «Замечания к РД» (§14, 23:30): набор не загружен — ctx.loadRemarks() B (тот же <script src>, что на «Принять»; → 'ok' | 'load' | 'fail' | 'none').
    // При 'load' вкладку по окончании перерисовывает B; если вернулся Promise — перерисовка через ctx.go('summary'), пока вкладка открыта. Набор не объявлен — строки нет
    if (!P.snap && !window.ATLAS_REMARKS && typeof ctx.loadRemarks === 'function') {
      let pr = null; try { pr = ctx.loadRemarks(); } catch (e) { pr = null; }
      if (pr && typeof pr.then === 'function') pr.then(() => setTimeout(() => { if (root.isConnected && window.ATLAS_REMARKS && typeof ctx.go === 'function') ctx.go('summary'); }, 0), () => {});
    }
    const ms = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0;
    root.dataset.ms = String(Math.round(ms));
  }

  window.AtlasProgressSummary = { digest, render, pick };
  const PG = window.AtlasProgressPage;
  if (PG && typeof PG.register === 'function') PG.register('summary', { title: 'Итог', render });
})();
