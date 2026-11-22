'use strict';

(() => {
  const AP = window.AtlasProgress;
  const project = window.ATLAS_PROJECT || {};
  const element = id => document.getElementById(id);
  const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
  const planDescriptions = new Map([
    ['м', 'Укладка с изгибами ГНБ (400 м в плане)'],
    ['шт', 'Изделия КВ-1, узлов и заделки'],
    ['м2', 'Бетонное покрытие у ВЗУ']
  ]);
  const statuses = [
    ['accepted', 'Принято'],
    ['executed', 'Выполнено по журналу'],
    ['partial', 'Частично'],
    ['returned', 'На исправление'],
    ['unmarked', 'Нет отметок']
  ];

  const model = element('wd-model');
  const modelStatus = element('wd-view-status');
  const origin = location.protocol === 'file:' ? 'null' : location.origin;
  let modelReady = false;
  let modelStates = {};
  let plannedBodies = [];
  const query = new URLSearchParams(location.search);
  let sample = query.get('sample') === '1';
  const samplePartialBody = 'NET-V-PIPE-HDD-2';
  const samplePartialMetres = 75;
  const sampleToggle = element('wd-sample-toggle');
  const sampleLabel = element('wd-sample-label');
  const sampleProgress = element('wd-sample-progress');
  const factLabel = element('wd-fact').previousElementSibling;
  function sendStates() {
    if (!modelReady) return;
    const partialMetres = sample && modelStates[samplePartialBody] === 'partial'
      ? { [samplePartialBody]: samplePartialMetres }
      : {};
    model.contentWindow.postMessage({ type: 'atlas-progress-demo:states', states: modelStates,
      planned: plannedBodies, sample, partialMetres }, origin === 'null' ? '*' : origin);
  }
  addEventListener('message', event => {
    if (event.source !== model.contentWindow || event.origin !== origin || event.data?.type !== 'atlas-progress-demo:ready') return;
    clearTimeout(modelTimeout);
    modelReady = true;
    modelStatus.hidden = true;
    sendStates();
  });
  const modelTimeout = setTimeout(() => {
    if (!modelReady) modelStatus.textContent = '3D-модель не открылась. Нажмите «К модели» вверху.';
  }, 15000);
  const modelUrl = new URL('../index.html?pdDemo=1', location.href);
  if (query.get('renderer') === 'canvas') modelUrl.searchParams.set('renderer', 'canvas');
  model.src = modelUrl.href;

  if (project.title?.short) element('wd-object').textContent = project.title.short;

  const legend = element('wd-legend');
  for (const [id, label] of statuses) {
    const item = document.createElement('li');
    item.dataset.state = id;
    item.textContent = label;
    legend.append(item);
  }

  function volumes(rows, states, accepted) {
    const result = { plan: new Map(), fact: new Map(), accepted: new Map() };
    const add = (key, unit, value) => result[key].set(unit, (result[key].get(unit) || 0) + value);
    for (const row of rows) {
      const state = states.get(row.key);
      if (published.items[row.key]?.f?.includes('quantity_excluded')) continue;
      if (row.q != null && Number.isFinite(row.q) && row.unit) add('plan', row.unit, row.q);
      if (state?.st !== 'done' && state?.st !== 'partial') continue;
      // A partial volume with a unit other than the planned one has no comparable total in the core sheet.
      const matchesPlan = state.st === 'done' || state.pct != null || state.unit === row.unit;
      if (row.q != null && matchesPlan && row.unit && Number.isFinite(row.total)) add('fact', row.unit, row.total);
      if (state.st === 'partial' && state.qty != null && state.unit && (row.q == null || !matchesPlan)) add('fact', state.unit, state.qty);
      const acceptedRow = accepted.get(row.key);
      if (!acceptedRow || !matchesPlan) continue;
      const { q, total, totalUnit } = acceptedRow;
      if (Number.isFinite(total) && totalUnit && (q != null || state.qty != null)) add('accepted', totalUnit, total);
    }
    return result;
  }

  const unitName = unit => ({ 'м2': 'м²', 'м3': 'м³', 'шт': 'шт.' })[unit] || unit;
  const quantityText = (value, unit) => number.format(value) + '\u00a0' + unitName(unit);

  function metric(id, quantities) {
    const el = element(id);
    el.replaceChildren();
    for (const [unit, value] of quantities) {
      const group = document.createElement('span');
      const label = document.createElement('small');
      label.textContent = unitName(unit);
      group.append(number.format(value) + '\u00a0', label);
      if (id === 'wd-plan' && planDescriptions.has(unit)) {
        const description = document.createElement('span');
        description.className = 'wd-quantity-label';
        description.textContent = planDescriptions.get(unit);
        group.append(description);
      }
      if (el.childElementCount) el.append(' ');
      el.append(group);
    }
    if (!el.childElementCount) el.textContent = '—';
  }

  function statusOf(row, accepted) {
    if (row.confirmed === 'отклонено' && row.state !== 'none') return 'returned';
    if (accepted.has(row.key)) return 'accepted';
    if (row.state === 'done') return 'executed';
    if (row.state === 'partial') return 'partial';
    return 'unmarked';
  }

  function stageRow(title, rows, states, accepted) {
    const row = document.createElement('li');
    row.className = 'wd-stage';
    const name = document.createElement('h3');
    name.textContent = title;
    const comparison = document.createElement('div');
    const detail = document.createElement('p');
    detail.className = 'wd-stage-status';
    const counts = new Map(statuses.map(([id]) => [id, 0]));
    for (const entry of rows) {
      const state = statusOf(entry, accepted);
      counts.set(state, counts.get(state) + 1);
    }
    if (rows.length) {
      const bar = document.createElement('div');
      bar.className = 'wd-bar';
      bar.setAttribute('aria-hidden', 'true');
      for (const [id] of statuses) {
        if (!counts.get(id)) continue;
        const segment = document.createElement('span');
        segment.dataset.state = id;
        segment.style.flexGrow = counts.get(id);
        bar.append(segment);
      }
      comparison.append(bar);
    }
    detail.textContent = rows.length
      ? statuses.filter(([id]) => counts.get(id)).map(([id, label]) => number.format(counts.get(id)) + ' ' + (id === 'unmarked' ? 'без отметок' : label.toLowerCase())).join(' · ')
      : 'Без привязки к 3D';
    comparison.append(detail);

    const qty = document.createElement('p');
    qty.className = 'wd-stage-qty';
    const { plan, fact } = volumes(rows, states, accepted);
    const units = new Set([...plan.keys(), ...fact.keys()]);
    for (const unit of units) {
      const line = document.createElement('span');
      line.textContent = 'План ' + (plan.has(unit) ? quantityText(plan.get(unit), unit) : '—')
        + ' · Учтено\u00a0' + (fact.has(unit) ? quantityText(fact.get(unit), unit) : '—');
      qty.append(line);
    }
    if (!units.size && rows.length) qty.textContent = 'Объём не указан';
    row.append(name, comparison, qty);
    return row;
  }

  function journalStatus(event, published, localAvailable, plan) {
    const journal = element('wd-journal');
    if (event) {
      const source = event.src === 'server' || event.seq != null
        ? 'Журнал PGS'
        : published.journal.some(item => item.eid === event.eid) ? 'Журнал выпуска' : 'Журнал этого браузера';
      journal.textContent = 'Последняя отметка ' + AP.ruDate(event.date) + ' · ' + source;
    } else {
      journal.textContent = localAvailable ? 'Фактические данные не внесены' : 'Журнал браузера недоступен';
    }
    if (plan && plan.status !== 'approved') {
      const stagePlan = document.createElement('span');
      stagePlan.className = 'wd-fine';
      stagePlan.textContent = plan._local ? 'План работ · местный черновик' : 'План работ · черновик по проекту';
      journal.append(stagePlan);
    }
  }

  const config = AP?.config();
  const report = document.querySelector('.wd-results');
  const stagesList = element('wd-stages');
  if (!config?.project_id) {
    element('wd-journal').textContent = 'Данные хода работ недоступны';
    report.removeAttribute('aria-busy');
    return;
  }
  const published = AP.published();
  const keys = AP.keyResolver(published.items, { bodyIds: published.bodyIds });
  let readRevision = 0;
  let journalSnapshot = [[], null, false];

  // Preview events stay in memory and are never added to the project's journal.
  const sampleCompletedIds = [
    'NET-V-PIPE-OPEN-1', 'NET-GOL-PD-NODE-CASING-OPEN-1',
    'NET-V-PIPE-HDD-1', 'NET-V-CASING-HDD-1',
    'NET-V-SEAL-HDD-1-A', 'NET-V-SEAL-HDD-1-B', 'NET-V-BEND-UP-1',
    'NET-V-PIPE-OPEN-2', 'NET-GOL-PD-NODE-CASING-OPEN-2'
  ];
  const sampleEvents = sampleCompletedIds.flatMap(id => {
    const event = Object.hasOwn(published.items, id) && AP.make('done', id, { by: 'Тестовый пример', role: 'operator' }).event;
    return event ? [event] : [];
  });
  if (published.items[samplePartialBody]?.q >= samplePartialMetres && published.items[samplePartialBody].u === 'м') {
    const partial = AP.make('partial', samplePartialBody, {
      qty: samplePartialMetres, unit: 'м', by: 'Тестовый пример', role: 'operator'
    }).event;
    if (partial) sampleEvents.push(partial);
  }

  function render(local, localPlan, available) {
    const plan = AP.effectivePlan(published.plan, sample ? null : localPlan);
    const events = (sample ? sampleEvents : AP.merge(published.journal, local).events)
      .filter(event => Object.hasOwn(published.items, event.id));
    const asOf = AP.today();
    const states = AP.fold(events, asOf);
    const period = { items: published.items, plan, events, isBody: keys, to: asOf };
    const { rows } = AP.sheet(period);
    const accepted = new Map(AP.sheet({ ...period, basis: 'confirmed' }).rows
      .filter(row => row.confirmed === 'да' && row.state !== 'none')
      .map(row => [row.key, row]));
    const totals = volumes(rows, states, accepted);
    metric('wd-plan', totals.plan);
    metric('wd-fact', totals.fact);
    metric('wd-accepted', totals.accepted);

    const current = AP.sorted(events).filter(event => event.date <= asOf && (event.op === 'done' || event.op === 'partial')).at(-1);
    sampleToggle.setAttribute('aria-pressed', String(sample));
    sampleToggle.textContent = sample ? 'Вернуться к журналу' : 'Тестовый пример';
    sampleLabel.hidden = !sample;
    sampleProgress.hidden = !sample;
    factLabel.textContent = sample ? 'Выполнено в примере' : 'Учтено по журналу';
    if (sample) {
      const planMetres = totals.plan.get('м') || 0;
      const finishedMetres = totals.fact.get('м') || 0;
      const percent = planMetres ? Math.round(100 * finishedMetres / planMetres) : 0;
      const completed = rows.filter(row => row.state === 'done').length;
      sampleProgress.textContent = quantityText(finishedMetres, 'м') + ' из ' + quantityText(planMetres, 'м')
        + ' · ' + number.format(percent) + '% длины укладки · ' + completed + ' из ' + rows.length + ' позиций выполнены полностью';
      element('wd-journal').textContent = 'Пробные отметки показаны только на этом экране.';
    } else {
      sampleProgress.textContent = '';
      journalStatus(current, published, available, plan);
    }

    const stages = AP.stagesOf(plan);
    const statusByBody = Object.create(null);
    const storeStateName = { accepted: 'accepted', executed: 'done', partial: 'partial', returned: 'redo' };
    const priority = ['accepted', 'done', 'partial', 'redo'];
    for (const row of rows) {
      if (row.part && !keys.bodies.has(row.id)) continue;
      const state = storeStateName[statusOf(row, accepted)];
      if (state && priority.indexOf(state) > priority.indexOf(statusByBody[row.id])) statusByBody[row.id] = state;
    }
    modelStates = statusByBody;
    plannedBodies = [...new Set(rows.map(row => row.id))];
    sendStates();

    const fragments = stages.map(stage => stageRow(AP.stageName(stage), rows.filter(row => row.stage === stage.id), states, accepted));
    const outside = rows.filter(row => !row.stage);
    if (outside.length) fragments.push(stageRow('Вне плана', outside, states, accepted));
    if (!fragments.length) fragments.push(stageRow('План работ не загружен', [], states, accepted));
    stagesList.replaceChildren(...fragments);
    report.removeAttribute('aria-busy');
  }

  function applyJournal(events, plan, available) {
    journalSnapshot = [events, plan, available];
    render(...journalSnapshot);
  }

  sampleToggle.addEventListener('click', () => {
    sample = !sample;
    const url = new URL(location.href);
    if (sample) url.searchParams.set('sample', '1');
    else url.searchParams.delete('sample');
    history.replaceState(history.state, '', url);
    render(...journalSnapshot);
  });
  if (sample) render(...journalSnapshot);

  function reportRefresh(store) {
    const revision = ++readRevision;
    return Promise.all([store.active(), store.get('plan')]).then(([events, plan]) => {
      if (revision === readRevision) applyJournal(events, plan, !store.memory);
    }).catch(() => {
      if (revision === readRevision) applyJournal([], null, false);
    });
  }

  AP.openStore(config.project_id).then(store => {
    store.on(change => {
      if (!change.local) reportRefresh(store);
    });
    reportRefresh(store);
  }).catch(() => applyJournal([], null, false));
})();
