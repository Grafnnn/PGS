/* 3D Атлас · «Обзор проекта» (V12.0 · B4). Всё — из window.ATLAS_RELEASE (data/release-info.js) при открытии страницы.
   Чисел в разметке нет. Нет ключа в данных — блок не показывается. Сетевых запросов нет: данные — только через <script>. */
'use strict';
(function () {
  const S = window.AtlasShell, R = (S && S.release()) || window.ATLAS_RELEASE || {};
  const fmt = S ? S.fmt : String, make = S.make, plural = S.plural;
  const $ = id => document.getElementById(id);
  // Значки — через оболочку: спрайт грузится асинхронно, до него S.icon отдаёт <svg><use href="#i-…">, который оживает сам.
  const icon = (name, cls) => (S && S.icon ? S.icon(name, cls || null) : window.AtlasIcons ? window.AtlasIcons.use(name, null, cls || null)
    : '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false" viewBox="0 0 24 24"><use href="#i-' + name + '"/></svg>');
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const add = (parent, tag, attrs, text) => { const e = make(tag, attrs, text); parent.append(e); return e; };
  // К1: подписи разделов — search.rd_sections (code → label); название и шифр — title; подпись осей — axes.label_text
  const PJ = (S && S.project && S.project()) || window.ATLAS_PROJECT || {}, TT = PJ.title || {};
  const SEC_LABEL = {}; for (const x of ((PJ.search || {}).rd_sections || [])) if (x && x.code && x.label) SEC_LABEL[x.code] = x.label;

  /* ---------- заголовок ---------- */
  if (TT.object) { const h = document.querySelector('.ov-head h1'); if (h) h.textContent = TT.object; }
  const sub = (TT.subtitle ? [TT.subtitle] : []).concat(TT.code ? [TT.code] : []);   // К1: подзаголовок — title.subtitle конфига
  if (R.release_label) sub.push(R.release_label);
  if (R.date_label) sub.push('ред. ' + R.date_label);
  $('ovSub').textContent = sub.join(' · ');
  $('ovOpen').insertAdjacentHTML('afterbegin', icon('model'));

  /* ---------- разделы модели: только из C-ключа sections ([[название, число], …]); сумма должна быть = elements ---------- */
  const sections = Array.isArray(R.sections) ? R.sections.filter(s => Array.isArray(s) && s[0] && num(s[1])) : [];
  const secSum = sections.reduce((a, s) => a + s[1], 0);
  const sectionsOk = sections.length > 0 && num(R.elements) && secSum === R.elements;
  if (sections.length && !sectionsOk) console.warn('Обзор: сумма sections ' + secSum + ' ≠ elements ' + R.elements + ' — диаграмма разделов скрыта');

  /* ---------- кадр модели ---------- */
  const cap = $('ovSceneCap');
  cap.textContent = 'Модель · ' + (sectionsOk ? fmt(sections.length) + ' ' + plural(sections.length, 'раздел', 'раздела', 'разделов') + ' · ' : '') + (((PJ.axes || {}).label_text) ? PJ.axes.label_text.charAt(0).toLowerCase() + PJ.axes.label_text.slice(1) : '');
  cap.insertAdjacentHTML('afterbegin', icon('model'));
  const img = $('ovScene').querySelector('img');
  img.alt = '3D-модель, вид «' + S.siteText('whole','Всё здание') + '»';
  const noImg = () => { img.hidden = true; $('ovScene').classList.add('ov-scene--empty'); };
  { const oi = ((window.ATLAS_PROJECT || {}).overview || {}).image; if (oi) img.src = oi; }   // К1: изображение обзора — overview.image конфига; нет — картинки нет
  if (!img.getAttribute('src') || (img.complete && img.naturalWidth === 0)) noImg(); else img.addEventListener('error', noImg);

  /* ---------- 6 плиток ---------- */
  const TILES = [
    ['elements', n => plural(n, 'элемент', 'элемента', 'элементов') + ' в модели', 'index.html'],
    ['remarks', n => plural(n, 'замечание', 'замечания', 'замечаний') + ' к РД', 'RD_REMARKS.html'],
    ['sources', n => R.counts_definitions ? plural(n, 'источник', 'источника', 'источников') : plural(n, 'лист и источник', 'листа и источника', 'листов и источников'), 'library.html'], /* 1.0.5 С1 */
    ['catalogue_types', n => plural(n, 'карточка каталога', 'карточки каталога', 'карточек каталога'), 'catalogue.html'],
    ['placed_rd', n => plural(n, 'тип', 'типа', 'типов') + ' по РД', 'index.html'],
    ['unplaced', () => 'требует решения', 'UNPLACED.html', 'warn']
  ];
  const tiles = $('ovTiles');
  for (const [k, label, href, mod] of TILES) {
    const v = R[k];
    if (!num(v)) continue;
    const t = add(tiles, 'a', { class: 'ov-tile' + (mod ? ' ov-tile--' + mod : ''), href });
    add(t, 'b', null, fmt(v));
    add(t, 'span', null, label(v));
  }

  /* ---------- 1.0.20 b4 (§6.3, поправка §13 п. 6): карточка «Ход работ · Итог» — только при режимах (AtlasShell.modesOn()); без режимов «Обзор» = 1.0.19.
     Цифры — из среза window.ATLAS_PROGRESS_DIGEST (data/progress_digest.js; тег пишет загрузчик наборов из конфига объекта; формат — schemas/progress-digest.schema.json).
     Журнал этого браузера (IndexedDB) здесь не читается. Срез другого объекта (project ≠ progress.project_id) или неполный — не показывается: заглушка и ссылка на «Итог». ---------- */
  if (S && typeof S.modesOn === 'function' && S.modesOn()) {
    const D = window.ATLAS_PROGRESS_DIGEST, pid = (PJ.progress || {}).project_id || PJ.project_id;
    const W = D && typeof D === 'object' ? D.week : null;
    const okD = !!D && D.schema === 1 && D.kind === 'atlas-progress-digest' && (!pid || D.project === pid)
      && ['stages_done', 'stages_total', 'stages_work'].every(k => num(D[k])) && !!W && num(W.stages_done_delta) && num(W.elements_done_delta);
    const dmy = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; };
    const delta = (n, one, few, many) => (n < 0 ? '−' : '+') + fmt(Math.abs(n)) + '\u00a0' + plural(Math.abs(n), one, few, many);   // число и слово — без переноса между ними
    const card = make('section', { class: 'card ov-card ov-prog', id: 'ovProgress', 'aria-labelledby': 'ovProgressH' });
    add(card, 'h2', { id: 'ovProgressH' }, 'Ход работ · Итог');
    if (okD) {
      const pStages = add(card, 'p', { class: 'ov-prog-main', 'data-digest': 'stages' }, 'Этапов готово ' + fmt(D.stages_done) + ' из ' + fmt(D.stages_total) + ' · в работе ' + fmt(D.stages_work) + ' · условно');
      const SRC = { snapshot: 'Срез выпуска', server: 'Срез сервера', browser: 'Данные браузера' };
      add(card, 'p', { class: 'ov-prog-week', 'data-digest': 'week' }, (SRC[D.source] || 'Срез') + (dmy(D.as_of) ? ' на ' + dmy(D.as_of) : '') + ' · за неделю: '
        + delta(W.stages_done_delta, 'этап', 'этапа', 'этапов') + ', ' + delta(W.elements_done_delta, 'элемент', 'элемента', 'элементов'));
      /* §14 (реш. владельца 23:30): строка «По смете» — когда в срезе есть estimate (снимок сметы и карта соответствия; формат — schemas/progress-digest.schema.json, C),
         как на «Итоге» (progress-summary.js estLines). Процент не пересчитывается: estimate.donePermille (десятые доли процента); null — сумма весов 0.
         Подпись весов — по полю estimate среза (круг 5): estimate == null — «веса из сметы не сопоставлены с этапами», иначе «веса — по смете <sourceRef> (снимок ДД.ММ.ГГГГ)»,
         как AtlasProgress.weightsLabel (B) и progress-summary.js (C); progress-core.js на «Обзоре» не грузится, поэтому текст собирается здесь. */
      const E = D.estimate && typeof D.estimate === 'object' && !Array.isArray(D.estimate) ? D.estimate : null, byEst = !!E;
      if (E) {
        const map = 'карта: ' + ({ draft: 'черновик', confirmed: 'подтверждена' }[E.mapStatus] || 'черновик');
        const pm = num(E.donePermille) ? E.donePermille : null;
        pStages.after(make('p', { class: 'ov-prog-main', 'data-digest': 'estimate' },
          pm == null ? 'По смете: вес этапов 0 ₽ — доли не считаются · ' + map : 'По смете: ' + (pm / 10).toFixed(1).replace('.', ',') + ' % · ' + map + ' · условно'));
      }
      const meta = ['Считается по числу элементов и этапов', byEst ? 'веса — по смете' + (E.sourceRef ? ' ' + E.sourceRef : '') + (dmy(E.capturedAt) ? ' (снимок ' + dmy(E.capturedAt) + ')' : '') : 'веса из сметы не сопоставлены с этапами'];
      if (num(D.planRevision)) meta.push('план, ред. ' + D.planRevision + (D.plan_status === 'draft' ? ' (черновик)' : ''));
      if (dmy(D.capturedAt)) meta.push('срез собран ' + dmy(D.capturedAt));
      add(card, 'p', { class: 'ov-prog-meta', 'data-digest': 'meta' }, meta.join(' · '));
    } else {
      add(card, 'p', { class: 'ov-prog-main', 'data-digest': 'none' }, 'Ход работ: цифры — в «Итоге» (данные этого браузера)');
    }
    add(card, 'a', { class: 'ov-prog-link', href: 'PROGRESS.html#tab=summary' }, 'Итог →');
    tiles.after(card);
  }

  /* ---------- значимость замечаний ---------- */
  const SIG = [['Высокая', 'high'], ['Средняя', 'mid'], ['Низкая', 'low']];
  const bySig = R.remarks_by_significance || {};
  const sigRows = SIG.filter(([k]) => num(bySig[k]) && bySig[k] > 0);
  if (sigRows.length) {
    $('ovSig').hidden = false;
    const total = sigRows.reduce((a, [k]) => a + bySig[k], 0);
    for (const [k, c] of sigRows) {
      const i = add($('ovSigBar'), 'i', { class: 'ov-sigbar--' + c });
      i.style.flexGrow = bySig[k];
      const a = add($('ovLegend'), 'span', { class: 'ov-pill ov-pill--' + c, title: k + ' значимость: ' + fmt(bySig[k]) + ' из ' + fmt(total) });
      a.innerHTML = icon('sig-' + c);
      a.append(k + ' · ' + fmt(bySig[k]));
    }
    if (num(R.remarks_with_building_links) && num(R.remarks)) {
      const p = $('ovLinked');
      p.hidden = false;
      p.textContent = fmt(R.remarks_with_building_links) + ' из ' + fmt(R.remarks) + ' связаны с элементами модели';
    }
  }

  /* ---------- полосовые диаграммы: один ряд, один цвет, значение в конце строки, подсказка при наведении ---------- */
  function bars(list, rows, unit, hrefOf) {
    const mx = Math.max.apply(null, rows.map(r => r[1]));
    for (const [name, v] of rows) {
      const tip = name + ': ' + fmt(v) + ' ' + unit(v);
      const li = add(list, 'li', { class: 'ov-bar', title: tip });
      const row = hrefOf ? add(li, 'a', { href: hrefOf(name), 'aria-label': tip }) : add(li, 'div', { role: 'text', 'aria-label': tip });
      add(row, 'span', { class: 'ov-bar-l', 'aria-hidden': 'true' }, SEC_LABEL[name] || name);
      const track = add(row, 'span', { class: 'ov-bar-t', 'aria-hidden': 'true' });
      add(track, 'i').style.width = Math.max(1.5, v / mx * 100).toFixed(1) + '%';
      add(row, 'span', { class: 'ov-bar-v', 'aria-hidden': 'true' }, fmt(v));
    }
  }
  if (sectionsOk) {
    $('ovSections').hidden = false;
    bars($('ovSectionsBars'), sections.slice().sort((a, b) => b[1] - a[1]), n => plural(n, 'элемент', 'элемента', 'элементов'));
  }
  const bySec = R.remarks_by_section && typeof R.remarks_by_section === 'object' ? Object.entries(R.remarks_by_section).filter(([, v]) => num(v) && v > 0) : [];
  if (bySec.length) {
    $('ovRemarks').hidden = false;
    bars($('ovRemarksBars'), bySec.sort((a, b) => b[1] - a[1]), n => plural(n, 'замечание', 'замечания', 'замечаний'), k => 'RD_REMARKS.html#sec=' + encodeURIComponent(k));
    const note = $('ovRemarksNote');
    if (num(R.remarks)) {
      const a = add(note, 'a', { href: 'RD_REMARKS.html' }, 'Все замечания · ' + fmt(R.remarks));
      a.insertAdjacentHTML('beforeend', icon('chevron-right', 'icon--16'));
    }
  }
  if (!$('ovSections').hidden !== !$('ovRemarks').hidden) document.querySelector('.ov-mid').classList.add('ov-mid--one');

  /* ---------- что нового: C-ключ whats_new [[выпуск, строка], …] ---------- */
  const news = Array.isArray(R.whats_new) ? R.whats_new.filter(x => Array.isArray(x) && x[0] && x[1]) : [];
  if (news.length) {
    $('ovNews').hidden = false;
    for (const [rel, text] of news) {
      const d = add($('ovNewsRows'), 'div', { class: 'ov-rel' });
      add(d, 'span', { class: 'mono' }, rel);
      add(d, 'span', null, text);
    }
  }

  /* ---------- границы применения: пункт о моделях без места — только если число есть ---------- */
  if (num(R.unplaced)) { $('ovLimitUnplaced').textContent = 'Модели ' + fmt(R.unplaced) + ' типов не имеют подтверждённого места '+S.siteText('at_site','в здании')+' — они собраны ' + ((window.AtlasShell && AtlasShell.unplacedWhere) ? AtlasShell.unplacedWhere() : 'в разделе «Требует решения»') + '.';   /* 1.0.19a к2: имя раздела — как у пункта меню */ $('ovLimitUnplaced').hidden = false; }   // К1: без ключа unplaced — пункта нет

  /* ---------- быстрые переходы ---------- */
  const PRJ = window.ATLAS_PROJECT || {};
  const muN = (() => { const m = /(\d[\d\s  ]*)\s*$/.exec(R.mu_rebar_section || ''); return m ? Number(m[1].replace(/\D/g, '')) : null; })();
  const QUICK = [
    ...(((bySig['Высокая'] ?? R.remarks_high) > 0) ? [['sig-high', 'Замечания высокой значимости', 'RD_REMARKS.html#pri=' + encodeURIComponent('Высокая'), bySig['Высокая'] ?? R.remarks_high]] : []),   // К1: нет замечаний высокой значимости — пункта нет
    // К1: подпись и раздел армирования — из выпуска (mu_rebar_section «<подпись> · N») и конфига (rebar.scope); нет — пункта нет
    ...((PRJ.rebar && PRJ.rebar.scope && R.mu_rebar_section) ? [['rebar', String(R.mu_rebar_section).replace(/\s*·\s*[\d\s  ]*$/, ''), 'index.html#scope=' + encodeURIComponent(PRJ.rebar.scope), muN]] : []),
    ...(num(R.placed_rd) ? [['layers', 'По РД', (((window.ATLAS_REVISIONS_META || {}).layers || [])[0] || {}).href || 'index.html', R.placed_rd]] : [])   // К1: слой — только при числе placed_rd
  ];
  if (!QUICK.length) $('ovQuick').closest('section').hidden = true;   // К1: нет переходов — блока нет
  for (const [ic, label, href, n] of QUICK) {
    const a = add($('ovQuick'), 'a', { href });
    a.innerHTML = icon(ic);
    add(a, 'span', null, label);
    if (num(n)) add(a, 'b', null, fmt(n));
    else a.insertAdjacentHTML('beforeend', icon('chevron-right', 'icon--16'));
  }
})();
