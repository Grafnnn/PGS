/* atlas-field-print.js — печать полевого комплекта (ядро Atlas 1.1, полевой комплект, этап 1). Формат данных: ATLAS_FIELD v1 (Codex, CONTRACT.md).
   API: window.AtlasFieldPrint = { sheet(intervalId), well(nodeId) }.
   Каждый вызов открывает новое окно (window.open('', '_blank')) и пишет в него самодостаточный HTML:
   без внешних файлов, стили внутри, кнопки «Печать» и «Закрыть». Данные — только window.ATLAS_FIELD
   (название объекта для шапки — из ATLAS_FIELD.title или ATLAS_PROJECT.title, если есть).
   Ничего не отправляет наружу, без fetch/XHR, работает из file:// и с https.
   Правила: зелёный — только complies с distance и threshold, у которых refs со страницей; иначе «недостаточно данных».
   Чего нет в источнике — так и пишется (missingReason), значения не достраиваются. */
(function () {
  'use strict';

  /* ---------- справочники ---------- */
  var ORIGIN = { document: 'лист', survey: 'съёмка', exposure: 'шурф', graphic: 'графически', interpolation: 'интерп.', model_calculation: 'расчёт', unavailable: 'нет данных' };
  var FIRM = { document: 1, survey: 1, exposure: 1 };
  var LABEL = {
    terrainM: 'Земля', invertM: 'Лоток', crownM: 'Верх трубы', crown: 'Верх трубы', sleeveM: 'Футляр, верх', sleeve: 'Футляр, верх',
    localGroundwaterM: 'УГВ', constructionMethod: 'Способ', nextConstructionMethod: 'Способ далее',
    chamberInnerDiameterMm: 'Камера, Ø в свету', neckInnerDiameterMm: 'Горловина, Ø в свету', fullStructuralDepthMm: 'Полная конструктивная глубина',
    workingPartHeightMm: 'Высота рабочей части', profileWellDepthMm: 'Глубина колодца по профилю', neckAndCoverHeightMm: 'Горловина с люком, высота',
    bottomSlabType: 'Плита днища', bottomSlabCount: 'Плита днища, шт.', coverSlabType: 'Плита перекрытия', coverSlabCount: 'Плита перекрытия, шт.',
    neckRingType: 'Опорное кольцо', neckRingCount: 'Опорное кольцо, шт.', manholeCover: 'Люк', ladderType: 'Стремянка', assemblyGroups: 'Порядок сборки',
    sandBeddingMm: 'Песчаная подготовка', sandBeddingCondition: 'Условие подготовки', soilDesignCondition: 'Грунтовые условия',
    absoluteWellBottomM: 'Абс. отметка днища', absoluteRimM: 'Абс. отметка люка', tieInDiameterPlanMm: 'Врезка, Ø по плану',
    tieInDiameterSpecMm: 'Врезка, Ø по спецификации', tieInDiameterApprovedMm: 'Врезка, Ø к исполнению', outletDiameterMm: 'Выпуск, Ø',
    glandsDiameterMm: 'Гильзы, Ø', glandsCount: 'Гильзы, шт.', hydroProtection: 'Гидроизоляция',
    planLengthM: 'Длина в плане', planWidthM: 'Ширина в плане', profileLengthM: 'Длина по профилю', profileWidthM: 'Ширина по профилю',
    excavationDepthM: 'Глубина выемки', excavationVolumePdM3: 'Объём выемки по ПД', contourConflict: 'Расхождение контура',
    absolutePitBottomM: 'Абс. отметка дна', nominalPitBottomM: 'Номинальное дно', nominalPrismVolumeM3: 'Объём по габаритам', volumeConflict: 'Расхождение объёма',
    shoringMethod: 'Крепление', shoringPileDiameterMm: 'Стойки, Ø', shoringPileWallMm: 'Стойки, стенка', shoringPilePitchM: 'Стойки, шаг', shoringPileEmbedM: 'Стойки, длина',
    backfill: 'Обратная засыпка', lengthM: 'Длина', widthAtBottomM: 'Ширина по дну', widthAtTopM: 'Ширина по верху', sandFoundationM: 'Песчаное основание',
    bendAngle: 'Угол поворота', pipeOuterDiameterMm: 'Труба, Ø наружный', pipeWallMm: 'Труба, стенка', casingOuterDiameterMm: 'Футляр, Ø наружный', casingWallMm: 'Футляр, стенка',
    lengthHddFromKv1PlanM: 'Длина ГНБ в плане', lengthHddFromKv1BoreM: 'Длина ГНБ по скважине',
    existingNetworkMark: 'Обозначение сети', printedElevationUpperM: 'Отметка на профиле, верхняя', printedElevationLowerM: 'Отметка на профиле, нижняя',
    elevationMeaning: 'Смысл отметок', owner: 'Владелец', dispatcherContact: 'Контакт дежурного', posRule: 'Порядок работ (ПОС)', positionMethod: 'Как определён ПК', quality: 'Качество сведений'
  };
  var UNIT = { m: 'м', mm: 'мм', m2: 'м²', m3: 'м³', count: 'шт.' };
  var KIND = { water_well: 'колодец водопроводный', well: 'колодец', pit: 'котлован', excavation: 'котлован', trench: 'траншея', bend: 'угол поворота' };
  function kindName(k) { return KIND[k] || 'узел'; }
  var CYR = { a: 'А', b: 'В', c: 'С', e: 'Е', h: 'Н', k: 'К', m: 'М', o: 'О', p: 'Р', t: 'Т', x: 'Х', y: 'У' };
  function routeName(r) {
    var id = r && r.id != null ? String(r.id) : '';
    return id ? 'трасса ' + id.replace(/[a-z]/gi, function (c) { return CYR[c.toLowerCase()] || c.toUpperCase(); }).toUpperCase() : 'трасса';
  }
  function editionLabel(D) {
    var P = window.ATLAS_PROJECT || {}, R = window.ATLAS_RELEASE || {};
    return D.releaseTitle || P.release_label || P.edition || (P.title && P.title.edition) || R.release_label || null;
  }
  function designRevisions(D) {
    return Array.from(new Set((D.sources || []).map(function (s) { return s.revision; }).filter(Boolean)));
  }
  var LAT = { K: 'К', S: 'С', P: 'П', N: 'Н', O: 'О', V: 'В', A: 'А', B: 'В', T: 'Т', a: 'а', b: 'б', v: 'в' };

  /* ---------- общие ---------- */
  function F() { return window.ATLAS_FIELD || null; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function has(o) { return !!(o && typeof o === 'object' && o.value != null); }
  function num(v, min, max) {
    if (!isNum(v)) return '—';
    var s = String(+v.toFixed(max)), i = s.indexOf('.'), d = Math.max(min, Math.min(max, i < 0 ? 0 : s.length - i - 1));
    return v.toFixed(d).replace('-', '−').replace('.', ',');
  }
  function elev(v) { return isNum(v) ? (v >= 0 ? '+' : '') + num(v, 2, 3) : '—'; }
  function pkLabel(m) {
    if (!isNum(m)) return '—';
    var h = Math.floor(m / 100 + 1e-9), r = Math.round((m - h * 100) * 100) / 100, ri = Math.floor(r + 1e-9);
    var rs = (ri < 10 ? '0' : '') + ri, fr = Math.round((r - ri) * 100);
    if (fr > 0) rs += ',' + (fr < 10 ? '0' + fr : String(fr)).replace(/0$/, '');
    return 'ПК' + h + '+' + rs;
  }
  function nowRu() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function abs(href) {
    if (!href) return '';
    try { return new URL(href, document.baseURI || location.href).href; } catch (e) { return href; }
  }
  function labelOf(key, o) {
    if (LABEL[key]) return LABEL[key];
    if (o && o.label) return o.label;
    var m = /^ring([A-Z]+)(\d+)([a-z]?)Count$/.exec(key);
    if (m) return 'Кольца ' + ringMark(m) + ', шт.';
    return key;
  }
  function ringMark(m) {
    var L = m[1].split('').map(function (c) { return LAT[c] || c; }).join(''), dg = m[2];
    return L + '-' + (dg.length > 2 ? dg.slice(0, 2) + '-' + dg.slice(2) : dg) + (m[3] ? (LAT[m[3]] || m[3]) : '');
  }
  function fmt(key, o) {
    if (!has(o)) return null;
    var v = o.value, u = o.unit;
    if (u === 'bool' || typeof v === 'boolean') return v ? 'да' : 'нет';
    if (u === 'text' || typeof v !== 'number') return String(v);
    if (u === 'm' && o.pointKind) return elev(v);
    if (u === 'mm') return num(v, 0, 1) + ' мм';
    if (u === 'count') return num(v, 0, 0) + ' шт.';
    return num(v, 0, 3) + (UNIT[u] ? ' ' + UNIT[u] : '');
  }

  /* ---------- источники ---------- */
  function source(id) { var s = (F() && F().sources) || []; for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i]; return null; }
  function srcCode(id) {
    var s = source(id), t = s && s.title ? String(s.title) : '';
    var m = /-([А-ЯЁA-Z]{2,6})\s*(?:·|$)/.exec(t.split('·')[0] + '·');
    return m ? m[1] : (t ? t.split('·')[0].trim() : String(id || '').toUpperCase());
  }
  function refShort(r) {
    if (!r) return '';
    var s = source(r.sourceId);
    if (s && s.kind === 'record') return srcCode(r.sourceId) + (r.locator ? ' ' + r.locator : '');
    return srcCode(r.sourceId) + (r.pdfPage != null ? '\u00a0PDF\u00a0с.\u00a0' + r.pdfPage : '');
  }
  function refsShort(refs, max) {
    var seen = {}, out = [];
    (refs || []).forEach(function (r) { var k = refShort(r); if (k && !seen[k]) { seen[k] = 1; out.push(k); } });
    max = max || 3;
    return out.length > max ? out.slice(0, max).join(', ') + ' +' + (out.length - max) : out.join(', ');
  }
  function refHref(r) {
    var s = source(r && r.sourceId);
    if (!s || !s.path) return '';
    return abs(s.path) + (r.pdfPage != null && s.kind !== 'record' ? '#page=' + r.pdfPage : '');
  }
  /* значок происхождения: «лист ППО с. 18», «расчёт · ППО с. 18» … */
  var BMAX = 2;
  function badge(o) {
    if (!o || typeof o !== 'object') return '';
    var lab = ORIGIN[o.origin] || o.origin || '', rs = refsShort(o.refs, BMAX);
    if (!lab && !rs) return '';
    var t = o.origin === 'document' ? rs || lab : lab + (rs ? ' · ' + rs : '');
    return '<span class="src src-' + esc(o.origin || 'x') + '">' + esc(t) + '</span>';
  }
  /* сноски «нет данных: причина» — одна причина печатается один раз */
  var FN = { list: [], map: {}, done: 0 };
  function fnReset() { FN = { list: [], map: {}, done: 0 }; }
  function fnRef(t) {
    if (!t) return '';
    if (!FN.map[t]) { FN.list.push(t); FN.map[t] = FN.list.length; }
    return '<sup>' + FN.map[t] + '</sup>';
  }
  function fnHtml() {
    if (FN.list.length <= FN.done) return '';
    var h = '<ol class="fn" start="' + (FN.done + 1) + '">' + FN.list.slice(FN.done).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol>';
    FN.done = FN.list.length;
    return h;
  }
  /* ячейка значения; нет значения — «—», «нет данных» и причина (opt.fn — причина сноской) */
  function cellObs(key, o, opt) {
    opt = opt || {};
    if (opt.fn && o && typeof o === 'object' && !has(o)) {
      var rs = o.refs && o.refs.length ? refsShort(o.refs, 2) : '';
      return '<span class="nd">нет данных</span>' + fnRef((o.missingReason || 'причина не указана') + (rs ? ' (' + rs + ')' : '')) + ' ';
    }
    if (!o || typeof o !== 'object') return '<span class="nil">—</span>';
    var f = fmt(key, o);
    if (f == null) {
      return '<span class="nd">нет данных</span>' + (o.missingReason && !opt.shortWhy ? '<span class="why">' + esc(o.missingReason) + '</span>' : '') +
        (o.refs && o.refs.length ? '<span class="src">' + esc(refsShort(o.refs, 2)) + '</span>' : '');
    }
    if (o.unit === 'text' || typeof o.value !== 'number') {
      if (opt.longFn && f.length > opt.longFn) return '<span class="t">' + esc(f.slice(0, Math.min(60, opt.longFn)).replace(/\s+\S*$/, '')) + '…</span>' + fnRef(f) + badge(o);
      return '<span class="t">' + esc(f) + '</span>' + badge(o);
    }
    return '<span class="v">' + esc(f) + '</span>' + badge(o);
  }
  function refList(refs) {
    var seen = {}, list = [];
    (refs || []).forEach(function (r) {
      if (!r) return;
      var k = r.sourceId + '|' + (r.pdfPage != null ? r.pdfPage : r.locator);
      if (seen[k]) { if (r.sheet && seen[k].sheets.indexOf(r.sheet) < 0) seen[k].sheets.push(r.sheet); return; }
      seen[k] = { r: r, sheets: r.sheet ? [r.sheet] : [] }; list.push(seen[k]);
    });
    var order = {}; ((F() && F().sources) || []).forEach(function (s, i) { order[s.id] = i; });
    list.sort(function (a, b) { return (order[a.r.sourceId] - order[b.r.sourceId]) || ((a.r.pdfPage || 0) - (b.r.pdfPage || 0)); });
    return list;
  }
  function refListHtml(refs, compact) {
    var list = refList(refs);
    if (!list.length) return '<p class="small">нет в источнике</p>';
    var bySrc = {}, srcs = [];
    list.forEach(function (x) { if (!bySrc[x.r.sourceId]) { bySrc[x.r.sourceId] = []; srcs.push(x.r.sourceId); } bySrc[x.r.sourceId].push(x); });
    if (compact) return '<p class="inl">' + srcs.map(function (id) {
      return bySrc[id].map(function (x) {
        var t = srcCode(id) + (x.r.pdfPage != null ? ', PDF с. ' + x.r.pdfPage : x.r.locator ? ', ' + x.r.locator : ''), hh = refHref(x.r);
        var sheets = Array.from(new Set(x.sheets.flatMap(function (s) { return s.match(/(?:л\.|лист)\s*\d+/gi) || []; })));
        if (sheets.length) t += ', ' + sheets.map(function (s) { return s.toLowerCase(); }).join(', ');
        return hh ? '<a class="ref" href="' + esc(hh) + '" target="_blank" title="' + esc(x.sheets.join(' · ')) + '">' + esc(t) + '</a>' : esc(t);
      }).join(', ');
    }).join(' · ') + '</p>';
    return '<ul class="sheets">' + srcs.map(function (id) {
      var s = source(id);
      return '<li><b>' + esc(s ? (compact ? srcCode(id) : s.title) : id) + '</b>' + (s && s.revision && !compact ? ' <span class="small">(' + esc(s.revision) + ')</span>' : '') + ': ' +
        bySrc[id].map(function (x) {
          var t = (x.r.pdfPage != null ? 'с. ' + x.r.pdfPage : (x.r.locator || '')) + (x.sheets.length && !compact ? ' — ' + x.sheets.join('; ') : '');
          var h = refHref(x.r);
          return h ? '<a href="' + esc(h) + '" target="_blank">' + esc(t) + '</a>' : esc(t);
        }).join(' · ') + '</li>';
    }).join('') + '</ul>';
  }

  /* ---------- проверка пересечения ---------- */
  function paged(o) { return !!(o && o.refs && o.refs.some(function (r) { return r && r.pdfPage != null; })); }
  function checkState(x) {
    var c = (x && x.clearance) || {}, st = c.status, missing = (c.missing || []).slice();
    if (st === 'complies') {
      var bad = [];
      if (!has(c.distance) || !paged(c.distance)) bad.push('у зазора нет значения со ссылкой на страницу');
      if (!has(c.threshold) || !paged(c.threshold)) bad.push('у порога нет значения со ссылкой на страницу');
      if (bad.length) { st = 'insufficient_data'; missing = missing.concat(bad); }
    }
    if (st !== 'complies' && st !== 'does_not_comply') st = 'insufficient_data';
    return { state: st, distance: c.distance || null, threshold: c.threshold || null, metric: c.metric || null, missing: missing };
  }
  var METRIC = { vertical: 'по вертикали', horizontal: 'по горизонтали', minimum_3d: 'наименьший в пространстве' };
  function stateHtml(x) {
    var s = checkState(x), nums = '';
    if (has(s.distance) || has(s.threshold)) {
      nums = '<div class="cmp">зазор' + (s.metric ? ' ' + esc(METRIC[s.metric] || s.metric) : '') + ' ' +
        (has(s.distance) ? esc(num(s.distance.value, 2, 3)) + ' м' + badge(s.distance) : '—') +
        (s.state === 'does_not_comply' ? ' &lt; ' : s.state === 'complies' ? ' ≥ ' : ' · ') +
        'порог ' + (has(s.threshold) ? esc(num(s.threshold.value, 2, 3)) + ' м' + badge(s.threshold) : '—') + '</div>';
    }
    if (s.state === 'does_not_comply') return '<div class="st st-bad"><b>✕ Зазор меньше нормы</b>' + nums + '</div>';
    if (s.state === 'complies') return '<div class="st st-ok"><b>✓ Зазор в норме</b> (норма ' + esc(num(s.threshold.value, 2, 3)) + ' м, ' + esc(refsShort(s.threshold.refs, 1)) + ')' + nums + '</div>';
    return '<div class="st st-un"><b>Недостаточно данных для проверки зазора</b>' + (s.missing.length ? '<ul>' + s.missing.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' : '') + nums + '</div>';
  }

  /* ---------- окно ---------- */
  var CSS = [
    '*{box-sizing:border-box}',
    'html{-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    'body{margin:0;background:#e9ebee;color:#111;font:9pt/1.28 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}',
    '.bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 12px;background:#fff;border-bottom:1px solid #c9cdd3}',
    '.bar button{min-height:44px;min-width:44px;padding:0 18px;font:600 15px/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;border:1px solid #333;border-radius:6px;background:#fff;color:#111;cursor:pointer}',
    '.bar button.pri{background:#111;color:#fff}',
    '.bar .hint{color:#555;font-size:12px}',
    '.page{width:210mm;min-height:297mm;margin:12px auto;padding:8mm;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25)}',
    'h1{font-size:12pt;margin:0}',
    'h2{font-size:8.6pt;margin:1.1mm 0 .5mm;border-bottom:1px solid #111;padding-bottom:.4mm;break-after:avoid;page-break-after:avoid}',
    '.hd{display:flex;justify-content:space-between;gap:6mm;border-bottom:2px solid #111;padding-bottom:1.5mm}',
    '.hd .meta{text-align:right;font-size:8pt;flex:0 0 auto}',
    '.hd .obj{font-size:8.5pt;color:#333}',
    '.snap{display:inline-block;border:1px solid #111;padding:0 1.5mm;font-weight:700}',
    '.notes{margin-top:1mm;border:1.4px solid #111;padding:.4mm 1.6mm;font-size:8pt;line-height:1.15}',
    '.notes div+div{margin-top:.5mm}',
    'table{width:100%;border-collapse:collapse;font-size:8.25pt;line-height:1.15;table-layout:fixed}',
    'td,th{overflow-wrap:break-word}',
    'sup{font-size:6pt;font-weight:700;line-height:0}',
    'ol.fn{margin:.6mm 0 0;padding-left:5mm;font-size:7pt;line-height:1.08;color:#222;columns:2;column-gap:4mm}',
    'ol.fn li{margin:0}',
    'thead{display:table-header-group}',
    'tr{break-inside:avoid;page-break-inside:avoid}',
    'th,td{border:.6px solid #555;padding:.2mm .7mm;vertical-align:top;text-align:left}',
    'th{background:#eceef1;font-weight:600;font-size:8pt}',
    'td.n{white-space:nowrap}','td.ni .src{display:inline;margin-left:.8mm}',
    '.v{font-variant-numeric:tabular-nums;font-weight:600}','.t{font-weight:400}',
    '.src{display:block;font-size:7pt;line-height:1.1;color:#444;white-space:normal}',
    '.src-interpolation,.src-graphic,.src-model_calculation{font-style:italic}',
    '.src-survey,.src-exposure{text-decoration:underline}',
    '.nil{color:#555}',
    '.why{display:block;font-size:7pt;line-height:1.15;color:#333;white-space:normal}','.nd{color:#666;font-style:italic}',
    '.kv{margin:0;padding:0;list-style:none;font-size:8pt}','td .kv{font-size:inherit}',
    '.kv li+li{margin-top:.4mm}','.kv .src{display:inline;margin-left:1mm}','.kv .why{display:inline}',
    '.kv .k{color:#333}',
    '.small{font-size:7.5pt;line-height:1.18;color:#333}',
    '.st{padding:.6mm 1mm;border-radius:1mm}',
    '.st ul{margin:.2mm 0 0;padding-left:3.5mm;line-height:1.12}',
    '.st-bad{border:1.6px solid #b00000;color:#8a0000;background:#fde8e8}',
    '.st-ok{border:1px solid #1d6b2d;color:#14501f;background:#e6f4e8}',
    '.st-un{border:1px dashed #777;color:#333;background:#f2f2f2}',
    '.cmp{font-weight:400;font-size:8pt;color:#111}',
    '.cmp .src{display:inline;margin-left:.8mm}',
    '.legend{font-size:7.5pt;color:#333;margin-top:.6mm}','.lg span{display:inline-flex;align-items:center;gap:.8mm;margin-right:2.2mm}','.sw{display:inline-block;vertical-align:middle;width:30px;height:12px}',
    '.legend span{margin-right:3mm}',
    'svg{display:block;width:100%;height:auto}',
    'ul.sheets{margin:0;padding-left:4mm;font-size:7.4pt}',
    'a{color:#111}',
    '.sign td{height:4.6mm}','.inl{margin:0;font-size:8pt}','.ref,.mark{white-space:nowrap}',
    '.foot{margin-top:1.2mm;font-size:7.5pt}','.code{font-size:7pt;color:#666}','.fw{font-size:7.5pt;font-weight:600;padding:.3mm 1.5mm;line-height:1.15}','.foot .warn{margin:0 0 .5mm}',
    '.warn{font-weight:700;border:1.4px solid #111;padding:.6mm 2mm;margin-top:1mm}',
    '.big{font-size:11pt;font-weight:700}',
    '.cols{display:flex;gap:5mm;align-items:flex-start}',
    '.cols>div{flex:1 1 0;min-width:0}',
    '.pgbrk{break-before:page;page-break-before:always;height:0}',
    '.ph{font-size:7.6pt;color:#333;border-bottom:1.4px solid #111;padding-bottom:.6mm}',
    '.keep{break-inside:avoid;page-break-inside:avoid}',
    '@media screen{.pgbrk{border-top:2px dashed #9aa0a6;margin:6mm 0}}',
    '@page{size:A4;margin:7mm 8mm 8mm;@bottom-right{content:"лист " counter(page) " из " counter(pages);font:7pt Arial,sans-serif;color:#333}}',
    '@media print{body{background:#fff}.bar{display:none}.page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}a{text-decoration:none}}',
    '@media screen and (max-width:820px){.page{width:auto;min-height:0;margin:0;padding:12px;box-shadow:none}.hd,.cols{flex-direction:column}.hd .meta{text-align:left;white-space:normal}.wrapx{overflow-x:auto}.wrapx table{min-width:640px}.cols>div{flex:1 1 auto!important;width:100%}.page svg{max-width:100%;height:auto!important}}'
  ].join('\n');

  function cssStr(t) { return '"' + String(t || '').replace(/[\\"]/g, '\\$&').replace(/[\n\r]+/g, ' ').replace(/</g, '\\3C ') + '"'; }
  function openDoc(title, body, pageLabel) {
    var w = window.open('', '_blank');
    if (!w) { console.warn('AtlasFieldPrint: окно не открылось (блокировка всплывающих окон)'); return null; }
    var html = '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + esc(title) + '</title><style>' + CSS + (pageLabel ? '\n@page{@top-left{content:' + cssStr(pageLabel) + ';font:7pt Arial,sans-serif;color:#333}}' : '') + '</style></head><body>' +
      '<div class="bar"><button class="pri" type="button" onclick="window.print()">Печать</button>' +
      '<button type="button" onclick="window.close()">Закрыть</button>' +
      '<span class="hint">A4, книжная. Полоса с кнопками не печатается.</span></div>' +
      '<div class="page">' + body + '</div></body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
    try { w.focus(); } catch (e) { /* без фокуса — не важно */ }
    return w;
  }
  function errDoc(title, msg) { return openDoc(title, '<h1>' + esc(title) + '</h1><p>' + esc(msg) + '</p>'); }

  function objectName(D) {
    var P = window.ATLAS_PROJECT || {};
    return D.title || D.object || (P.title && (P.title.object || P.title.short)) || D.projectId || '';
  }
  /* предупреждения трассы — тексты route.xyNote и verticalDatumNote как есть, каждый на своей строке */
  function routeWarnings(D) {
    var r = D.route || {}, w = [];
    if (r.xyNote) w.push(String(r.xyNote));
    if (r.verticalDatumNote) w.push(String(r.verticalDatumNote));
    else if (r.verticalDatum == null) w.push('Система высот не указана.');
    return w;
  }
  function notesHtml(D) {
    var w = routeWarnings(D);
    return w.length ? '<div class="notes">' + w.map(function (t) { return '<div>⚠ ' + esc(t) + '</div>'; }).join('') + '</div>' : '';
  }
  function header(D, title, sub) {
    return '<div class="hd"><div><div class="obj">' + esc(objectName(D)) + '</div><h1>' + esc(title) + '</h1>' + (sub ? '<div>' + sub + '</div>' : '') + '</div>' +
      '<div class="meta"><span class="snap">' + esc(editionLabel(D) || 'Редакция атласа не указана') + '</span>' +
      designRevisions(D).map(function (label) { return '<br>' + esc(label); }).join('') +
      '<br>Печать ' + esc(nowRu()) + '</div></div>';
  }
  function signBlock(label, rows) {
    var r = '<tr><td></td><td></td><td></td></tr>', b = '';
    for (var i = 0; i < (rows || 3); i++) b += r;
    return (label ? '<h2>' + esc(label) + '</h2>' : '') + '<table class="sign"><thead><tr><th style="width:50%">Ответственный (должность, ФИО)</th><th style="width:28%">Подпись</th><th>Дата</th></tr></thead><tbody>' + b + '</tbody></table>';
  }
  function legendSrc() {
    return '<div class="legend">Обозначения источников: ПД (PDF с. — страница файла), съёмка, шурф, <i>графически</i>, <i>интерп.</i>, <i>расчёт</i>. «Нет данных» — причина в сноске.</div>';
  }
  function footer(D, what, warningsAlreadyPrinted) {
    var w = warningsAlreadyPrinted ? [] : routeWarnings(D);
    return '<div class="foot">' + (w.length ? '<div class="warn fw">' + w.map(function (t) { return '<div>⚠ ' + esc(t) + '</div>'; }).join('') + '</div>' : '') +
      '<div class="small">' + esc([objectName(D), what].filter(Boolean).join(' · ')) + (D.release ? ' <span class="code">· набор данных ' + esc(D.release) + '</span>' : '') + '</div></div>';
  }

  /* ---------- поля станции ---------- */
  function byKind(fields, kind, keys) {
    fields = fields || {};
    for (var i = 0; i < keys.length; i++) if (fields[keys[i]]) return { key: keys[i], o: fields[keys[i]] };
    for (var k in fields) if (fields[k] && fields[k].pointKind === kind && fields[k].unit === 'm') return { key: k, o: fields[k] };
    return null;
  }
  var SERIES = [
    { kind: 'terrain', keys: ['terrainM'], name: 'земля' },
    { kind: 'invert', keys: ['invertM'], name: 'лоток' },
    { kind: 'crown', keys: ['crownM', 'crown'], name: 'верх трубы' },
    { kind: 'sleeve', keys: ['sleeveM', 'sleeve'], name: 'футляр' }
  ];
  function seriesVal(st, s) { var x = byKind(st.fields, s.kind, s.keys); return x ? x.o : null; }

  /* ---------- SVG профиля ---------- */
  function niceStep(range) {
    var steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20];
    for (var i = 0; i < steps.length; i++) if (range / steps[i] <= 9) return steps[i];
    return 50;
  }
  function crossMarks(c) {
    var out = [], f = c.fields || {};
    for (var k in f) if (has(f[k]) && f[k].unit === 'm' && isNum(f[k].value) && f[k].pointKind && f[k].pointKind !== 'invert') out.push({ key: k, v: f[k].value });
    (c.networks || []).forEach(function (n) { if (n && has(n.elevation) && n.elevation.pointKind !== 'invert' && isNum(n.elevation.value)) out.push({ key: n.name || n.id, v: n.elevation.value }); });
    return out;
  }
  function crossShort(c) {
    var f = c.fields || {};
    if (has(f.existingNetworkMark)) return String(f.existingNetworkMark.value);
    var n = (c.networks || []).filter(function (x) { return x && x.name; });
    return n.length > 1 ? n[n.length - 1].name : (c.title || c.id);
  }
  function zRange(st, xs) {
    var used = SERIES.filter(function (s) { return st.some(function (x) { return seriesVal(x, s); }); });
    var zs = [];
    st.forEach(function (x) { used.forEach(function (s) { var o = seriesVal(x, s); if (has(o) && isNum(o.value)) zs.push(o.value); }); });
    xs.forEach(function (c) { crossMarks(c).forEach(function (m) { zs.push(m.v); }); });
    if (!zs.length) zs = [0, 1];
    var zmin = Math.min.apply(null, zs), zmax = Math.max.apply(null, zs);
    var step = niceStep(zmax - zmin + 0.6);
    return [Math.floor((zmin - 0.25) / step) * step, Math.ceil((zmax + 0.45) / step) * step, step];
  }
  /* подпись в две строки: перенос по словам, сокращается только вторая */
  function wrap2(t, maxc) {
    t = String(t || '');
    if (t.length <= maxc) return [t];
    var cut = t.lastIndexOf(' ', maxc);
    if (cut < maxc * 0.4) cut = maxc;
    var a = t.slice(0, cut).trim(), b = t.slice(cut).trim();
    if (b.length > maxc) b = b.slice(0, maxc - 1).trim() + '…';
    return [a, b];
  }
  /* opt: {zr:[zmin,zmax,step] — общий масштаб, ph — высота поля, overview — обзор всей трассы, bands — участки, xnum — номера пересечений} */
  function profileSvg(from, to, st, xs, opt) {
    opt = opt || {};
    if (!(to > from)) to = from + 1;
    var ov = !!opt.overview;
    var used = SERIES.filter(function (s) { return st.some(function (x) { return seriesVal(x, s); }); });
    var zr = opt.zr || zRange(st, xs), zmin = zr[0], zmax = zr[1], step = zr[2];
    while ((zmax - zmin) / step > 10) step *= 2;
    var minGap = Infinity;
    for (var i = 1; i < st.length; i++) minGap = Math.min(minGap, st[i].stationM - st[i - 1].stationM);
    var W = 700, L = 50, R = 16, T = 24, PH = opt.ph || 60;
    var vert = !ov && st.length > 1 && (minGap / (to - from)) * (W - L - R) < 62;
    var BAND = ov && opt.bands ? 16 : 0;
    var B = (vert ? 74 : 44) + BAND, H = T + PH + B;
    var X = function (pk) { return L + (pk - from) / (to - from) * (W - L - R); };
    var Y = function (z) { return T + (zmax - z) / (zmax - zmin) * PH; };
    var N = 10.5;
    function labelBaseline(y, offset) {
      var baseline = y + offset, min = T + 11, max = T + PH - 4;
      if (baseline < min || baseline > max) baseline = y - (offset > 0 ? 6 : -12);
      return Math.max(min, Math.min(max, baseline));
    }
    var o = [];
    o.push('<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif" role="img" aria-label="Продольный профиль">');
    for (var z = zmin; z <= zmax + 1e-6; z += step) {
      var y = Y(z).toFixed(1);
      o.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#d4d7db" stroke-width=".6"/>');
      o.push('<text x="' + (L - 4) + '" y="' + (+y + 3) + '" font-size="' + N + '" text-anchor="end">' + esc(num(+z.toFixed(3), 1, 2)) + '</text>');
    }
    o.push('<text x="2" y="' + (T - 9) + '" font-size="' + N + '">Отметки, м</text>');
    o.push('<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + PH + '" fill="none" stroke="#111" stroke-width=".8"/>');
    /* вертикали и подписи ПК без наложений */
    var ly = T + PH + 4, placed = [];
    var free = function (x, gap) { return placed.every(function (p) { return Math.abs(p - x) >= gap; }); };
    if (ov) {
      var cand = [];
      (opt.bands || []).forEach(function (b) { cand.push(b.from, b.to); });
      cand.push(from, to);
      var kstep = (to - from) > 300 ? 50 : (to - from) > 120 ? 20 : 10;
      for (var g = Math.ceil(from / kstep) * kstep; g <= to; g += kstep) cand.push(g);
      st.forEach(function (s) { o.push('<line x1="' + X(s.stationM).toFixed(1) + '" x2="' + X(s.stationM).toFixed(1) + '" y1="' + (T + PH - 4) + '" y2="' + (T + PH) + '" stroke="#555" stroke-width=".6"/>'); });
      cand.forEach(function (pk, ci) {
        var x = X(pk);
        if (!free(x, 50)) return;
        placed.push(x);
        var major = ci < ((opt.bands || []).length * 2 + 2);
        o.push('<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + T + '" y2="' + (T + PH) + '" stroke="' + (major ? '#555' : '#c3c7cc') + '" stroke-width="' + (major ? 0.9 : 0.5) + '"' + (major ? '' : ' stroke-dasharray="2 2"') + '/>');
        o.push('<text x="' + x.toFixed(1) + '" y="' + (ly + 9) + '" font-size="' + N + '" text-anchor="' + (x - L < 20 ? 'start' : W - R - x < 20 ? 'end' : 'middle') + '"' + (major ? ' font-weight="700"' : '') + '>' + esc(pkLabel(pk)) + '</text>');
      });
    } else {
      st.forEach(function (s, si) {
        var x = X(s.stationM), sub = String(s.title || '').split(' · ').slice(1).join(' · ');
        var gl = si > 0 ? x - X(st[si - 1].stationM) : 2 * (x - L) + 40, gr = si < st.length - 1 ? X(st[si + 1].stationM) - x : 2 * (W - R - x) + 40;
        var room = si === 0 ? gr : si === st.length - 1 ? gl : Math.min(gl, gr);
        o.push('<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + T + '" y2="' + (T + PH) + '" stroke="#9aa0a6" stroke-width=".6" stroke-dasharray="2 2"/>');
        if (!free(x, vert ? 14 : 48)) return;
        placed.push(x);
        var anc = si === 0 ? 'start' : si === st.length - 1 ? 'end' : 'middle';
        if (vert) {
          o.push('<text transform="translate(' + (x + 4).toFixed(1) + ',' + ly + ') rotate(90)" font-size="' + N + '" font-weight="700">' + esc(pkLabel(s.stationM)) + '</text>');
          if (sub && room >= 24) {
            var vl = wrap2(sub, Math.floor((B - 8) / 5.6));
            o.push('<text transform="translate(' + (x - 7).toFixed(1) + ',' + ly + ') rotate(90)" font-size="' + N + '">' + esc(vl[0]) + '</text>');
          }
        } else {
          o.push('<text x="' + x.toFixed(1) + '" y="' + (ly + 10) + '" font-size="11" text-anchor="' + anc + '" font-weight="700">' + esc(pkLabel(s.stationM)) + '</text>');
          if (sub) {
            var maxc = Math.max(8, Math.floor(room / 5.6)), ln = wrap2(sub, maxc);
            ln.forEach(function (t, li) { if (t) o.push('<text x="' + x.toFixed(1) + '" y="' + (ly + 22 + li * 11.5) + '" font-size="' + N + '" text-anchor="' + anc + '">' + esc(t) + '</text>'); });
          }
        }
      });
    }
    /* полоса участков (обзор) */
    if (BAND) {
      var by = H - BAND + 1;
      opt.bands.forEach(function (b, bi) {
        var x1 = X(Math.max(from, b.from)), x2 = X(Math.min(to, b.to)), wpx = x2 - x1, t = b.label;
        var maxc = Math.floor((wpx - 4) / 5.2);
        if (t.length > maxc) t = maxc > 3 ? t.slice(0, maxc - 1) + '…' : '';
        o.push('<rect x="' + x1.toFixed(1) + '" y="' + by + '" width="' + wpx.toFixed(1) + '" height="' + (BAND - 3) + '" fill="' + (bi % 2 ? '#eceef1' : '#fff') + '" stroke="#111" stroke-width=".6"/>');
        if (t) o.push('<text x="' + ((x1 + x2) / 2).toFixed(1) + '" y="' + (by + 9.5) + '" font-size="' + N + '" text-anchor="middle">' + esc(t) + '</text>');
      });
    }
    var style = { terrain: { w: ov ? 1.4 : 2, dash: '' }, invert: { w: 1.2, dash: '6 2 1.5 2' }, crown: { w: 1.3, dash: '' }, sleeve: { w: 1, dash: '3 2' } };
    used.forEach(function (s) {
      var stl = style[s.kind];
      for (var i = 0; i < st.length - 1; i++) {
        var a = seriesVal(st[i], s), b = seriesVal(st[i + 1], s);
        if (!has(a) || !has(b)) continue;
        var dash = stl.dash || (s.kind === 'terrain' && !(FIRM[a.origin] && FIRM[b.origin]) ? '5 3' : '');
        o.push('<line x1="' + X(st[i].stationM).toFixed(1) + '" y1="' + Y(a.value).toFixed(1) + '" x2="' + X(st[i + 1].stationM).toFixed(1) + '" y2="' + Y(b.value).toFixed(1) + '" stroke="#111" stroke-width="' + stl.w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
      }
    });
    var occ = [];
    /* «нет данных» — одна подпись на серию подряд идущих ПК без значения */
    if (!ov) used.forEach(function (sr, j) {
      if (sr.kind !== 'terrain' && sr.kind !== 'invert' && !st.some(function (x) { return seriesVal(x, sr) && !has(seriesVal(x, sr)); })) return;
      var i = 0, lastEnd = -Infinity;
      while (i < st.length) {
        if (has(seriesVal(st[i], sr))) { i++; continue; }
        var a = i; while (i + 1 < st.length && !has(seriesVal(st[i + 1], sr))) i++;
        var xa = X(st[a].stationM), xb = X(st[i].stationM), xm = (xa + xb) / 2;
        var lbl = a !== i ? sr.name + ': нет данных (' + pkLabel(st[a].stationM) + '–' + pkLabel(st[i].stationM) + ')' : sr.name + ': нет данных';
        var wl = lbl.length * 5.4, anc = a === 0 && xm - L < wl / 2 ? 'start' : i === st.length - 1 && W - R - xm < wl / 2 ? 'end' : 'middle';
        var tx = anc === 'start' ? xa + 3 : anc === 'end' ? xb - 3 : xm, x0 = anc === 'start' ? tx : anc === 'end' ? tx - wl : tx - wl / 2;
        if (x0 < lastEnd + 4) { lbl = '× нет'; wl = 22; x0 = tx - (anc === 'end' ? wl : anc === 'start' ? 0 : wl / 2); }
        if (x0 >= lastEnd + 2) {
          var yy = sr.kind === 'terrain' ? T + 12 : T + PH - 5 - Math.max(0, j - 1) * 11;
          occ.push([x0, x0 + wl, yy]);
          o.push('<text x="' + tx.toFixed(1) + '" y="' + yy + '" font-size="' + N + '" font-style="italic" text-anchor="' + anc + '" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(lbl) + '</text>');
          lastEnd = x0 + wl;
        }
        i++;
      }
    });
    /* точки и подписи значений (подпись — только если не наезжает на соседнюю) */
    var lastLbl = {};
    st.forEach(function (s, i) {
      var x = X(s.stationM);
      used.forEach(function (sr) {
        var ob = seriesVal(s, sr);
        if (!has(ob)) return;
        var y = Y(ob.value), firm = FIRM[ob.origin], r = ov ? 1.6 : 2.6;
        if (ov && !firm) return;
        if (sr.kind === 'terrain') o.push('<rect x="' + (x - r).toFixed(1) + '" y="' + (y - r).toFixed(1) + '" width="' + 2 * r + '" height="' + 2 * r + '" fill="' + (firm ? '#111' : '#fff') + '" stroke="#111"/>');
        else o.push('<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + (firm ? '#111' : '#fff') + '" stroke="#111"/>');
        if (ov) return;
        var end = i === st.length - 1, tx = x + (end ? -4 : 4), txt = num(ob.value, 2, 3), wl = txt.length * 5.9 + 3;
        var x0 = end ? tx - wl : tx;
        if (lastLbl[sr.kind] != null && x0 < lastLbl[sr.kind]) return;
        var ly2 = labelBaseline(y, sr.kind === 'terrain' ? -6 : 12);
        if (occ.some(function (q) { return x0 < q[1] && x0 + wl > q[0] && Math.abs(ly2 - q[2]) < 11; })) return;
        lastLbl[sr.kind] = x0 + wl;
        occ.push([x0, x0 + wl, ly2]);
        o.push('<text x="' + tx.toFixed(1) + '" y="' + ly2.toFixed(1) + '" font-size="' + N + '" text-anchor="' + (end ? 'end' : 'start') + '" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(num(ob.value, 2, 3)) + '</text>');
      });
    });
    /* пересечения */
    var xin = xs.filter(function (c) { return isNum(c.stationM) && c.stationM >= from - 1e-6 && c.stationM <= to + 1e-6; });
    var lastX = -Infinity;
    xin.forEach(function (c, ci) {
      var x = X(c.stationM), s = checkState(c).state;
      var mk = s === 'does_not_comply' ? '✕' : s === 'complies' ? '✓' : '?';
      var col = s === 'does_not_comply' ? '#b00000' : s === 'complies' ? '#1d6b2d' : '#444';
      o.push('<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + (T - 6) + '" y2="' + (T + PH) + '" stroke="' + col + '" stroke-width="1.1" stroke-dasharray="1 2"/>');
      crossMarks(c).sort(function (p, q) { return q.v - p.v; }).forEach(function (m, k) {
        var y = Y(m.v), right = k % 2 === 1;
        o.push('<line x1="' + (x - 6).toFixed(1) + '" x2="' + (x + 6).toFixed(1) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + col + '" stroke-width="1.6"/>');
        if (!ov) o.push('<text x="' + (right ? x + 9 : x - 9).toFixed(1) + '" y="' + labelBaseline(y, right ? 10 : 0).toFixed(1) + '" font-size="' + N + '" text-anchor="' + (right ? 'start' : 'end') + '" fill="' + col + '" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(num(m.v, 2, 3)) + '</text>');
      });
      /* значок — в верхнем поле; близкие значки — во второй ряд */
      var row = x - lastX < 15 ? 1 : 0, cy = T - 12 - row * 0;
      if (row) cy = T + 10;
      lastX = row ? lastX : x;
      o.push('<circle cx="' + x.toFixed(1) + '" cy="' + cy + '" r="6.5" fill="#fff" stroke="' + col + '" stroke-width="' + (s === 'does_not_comply' ? 2.2 : 1.3) + '"/>');
      o.push('<text x="' + x.toFixed(1) + '" y="' + (cy + 3.5) + '" font-size="11" font-weight="700" text-anchor="middle" fill="' + col + '">' + mk + '</text>');
      var lab = opt.xnum ? String(opt.xnum[c.id] || '') : crossShort(c);
      var room = (ci + 1 < xin.length ? X(xin[ci + 1].stationM) - 9 : W - 2) - (x + 9), maxc = Math.max(1, Math.floor(room / 5.9));
      if (lab.length > maxc) lab = maxc > 2 ? lab.slice(0, maxc - 1) + '…' : '';
      if (lab) o.push('<text x="' + (x + 8).toFixed(1) + '" y="' + (cy + 3.5) + '" font-size="' + N + '" font-weight="700" fill="' + col + '" paint-order="stroke" stroke="#fff" stroke-width="3">' + esc(lab) + '</text>');
    });
    o.push('</svg>');
    var soft = st.some(function (x) { var g = seriesVal(x, SERIES[0]); return has(g) && !FIRM[g.origin]; });
    return { svg: o.join(''), used: used, soft: soft, nx: xin.length };
  }

  /* ---------- лист на смену ---------- */
  var SHORT_MAX = 8;     /* до стольких ПК — один лист, как в пилоте */
  var ROWS_PER_PAGE = 12;
  function resolveInterval(D, id) {
    var ivs = D.intervals || [], r = D.route || {};
    if (ivs.length) {
      var iv = id == null ? ivs[0] : ivs.filter(function (i) { return i && i.id === id; })[0];
      if (iv) return { id: iv.id, from: iv.startM, to: iv.endM, title: iv.title, refs: iv.refs || [] };
      if (id !== r.id) return null;
    }
    if (id != null && r.id != null && id !== r.id && ivs.length) return null;
    return { id: r.id || 'route', from: isNum(r.startM) ? r.startM : 0, to: isNum(r.endM) ? r.endM : 0, title: r.title || null, refs: r.refs || [] };
  }
  function nodeById(D, id) { var n = D.nodes || []; for (var i = 0; i < n.length; i++) if (n[i].id === id) return n[i]; return null; }
  function firstText(objs, keys) {
    for (var i = 0; i < objs.length; i++) for (var j = 0; j < keys.length; j++) { var o = objs[i] && objs[i].fields && objs[i].fields[keys[j]]; if (o) return { key: keys[j], o: o }; }
    return null;
  }
  function inRange(m, a, b) { return isNum(m) && m >= a - 1e-6 && m <= b + 1e-6; }
  function stationsIn(D, a, b) {
    return (D.stations || []).filter(function (s) { return inRange(s.stationM, a, b); }).sort(function (p, q) { return p.stationM - q.stationM; });
  }
  function crossingsIn(D, st, a, b) {
    var ref = {};
    st.forEach(function (s) { (s.crossingIds || []).forEach(function (id) { ref[id] = 1; }); });
    return (D.crossings || []).filter(function (c) { return ref[c.id] || inRange(c.stationM, a, b); }).sort(function (p, q) { return (p.stationM || 0) - (q.stationM || 0); });
  }
  function ivTitleOf(D, iv) { return iv.title || (pkLabel(iv.from) + '–' + pkLabel(iv.to) + ' · ' + routeName(D.route)); }
  /* легенда профиля — образцы линий в SVG */
  function sw(inner) { return '<svg class="sw" viewBox="0 0 30 12" width="30" height="12" aria-hidden="true">' + inner + '</svg>'; }
  function profileLegend(P, ov) {
    var it = [];
    it.push(sw('<line x1="1" y1="6" x2="29" y2="6" stroke="#111" stroke-width="2"/><rect x="12" y="3" width="6" height="6" fill="#111"/>') + 'земля по листу');
    if (!P || P.soft) it.push(sw('<line x1="1" y1="6" x2="29" y2="6" stroke="#111" stroke-width="2" stroke-dasharray="5 3"/><rect x="12" y="3" width="6" height="6" fill="#fff" stroke="#111"/>') + 'земля по расчёту');
    it.push(sw('<line x1="1" y1="6" x2="9" y2="6" stroke="#111" stroke-width="2"/><line x1="21" y1="6" x2="29" y2="6" stroke="#111" stroke-width="2"/>') + 'нет данных — разрыв');
    it.push(sw('<line x1="1" y1="6" x2="29" y2="6" stroke="#111" stroke-width="1.3" stroke-dasharray="6 2 1.5 2"/><circle cx="15" cy="6" r="2.6" fill="#111"/>') + 'лоток');
    if (P && P.used.some(function (s) { return s.kind === 'crown'; })) it.push(sw('<line x1="1" y1="6" x2="29" y2="6" stroke="#111" stroke-width="1.3"/>') + 'верх трубы');
    if (P && P.used.some(function (s) { return s.kind === 'sleeve'; })) it.push(sw('<line x1="1" y1="6" x2="29" y2="6" stroke="#111" stroke-width="1" stroke-dasharray="3 2"/>') + 'футляр');
    if (!P || P.nx) it.push(sw('<line x1="15" y1="0" x2="15" y2="12" stroke="#444" stroke-width="1" stroke-dasharray="1 2"/><circle cx="15" cy="6" r="5" fill="#fff" stroke="#444"/><text x="15" y="8.6" font-size="7.5" text-anchor="middle" font-weight="700" fill="#444">?</text>') +
      'пересечение: ✓ норма, ✕ меньше нормы, ? не проверено' + (ov ? ', № — в таблице' : ''));
    return '<div class="legend lg">' + it.map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div>';
  }
  function pkTableOpen(hasCrown) {
    return '<div class="wrapx"><table class="pk"><colgroup><col style="width:16%"><col style="width:12%"><col style="width:12%">' + (hasCrown ? '<col style="width:11%">' : '') +
      '<col style="width:10%"><col><col style="width:20%"><col style="width:12%"></colgroup><thead><tr><th>ПК</th><th>Земля</th><th>Лоток</th>' +
      (hasCrown ? '<th>Верх трубы / футляра</th>' : '') + '<th>Глубина до лотка, м</th><th>Способ</th><th>Узлы и выемки</th><th>Прочее</th></tr></thead><tbody>';
  }
  function stationRow(D, s, hasCrown, acc) {
    var f = s.fields || {}, used = {};
    var g = byKind(f, 'terrain', ['terrainM']), inv = byKind(f, 'invert', ['invertM']);
    if (g) used[g.key] = 1; if (inv) used[inv.key] = 1;
    var cr = hasCrown ? [byKind(f, 'crown', ['crownM', 'crown']), byKind(f, 'sleeve', ['sleeveM', 'sleeve'])].filter(Boolean) : [];
    cr.forEach(function (x) { used[x.key] = 1; });
    var dep = g && inv && has(g.o) && has(inv.o) ? '<span class="v">' + esc(num(g.o.value - inv.o.value, 2, 2)) + '</span><span class="src src-model_calculation">расчёт</span>' : '<span class="nil">—</span>';
    var nodes = (s.nodeIds || []).map(function (id) { return nodeById(D, id); }).filter(Boolean);
    nodes.forEach(function (n) { if (!acc.seen[n.id]) { acc.seen[n.id] = 1; acc.nodes.push(n); } });
    var m = f.constructionMethod ? { key: 'constructionMethod', o: f.constructionMethod } : f.nextConstructionMethod ? { key: 'nextConstructionMethod', o: f.nextConstructionMethod } : firstText(nodes, ['constructionMethod']);
    if (m && f[m.key] === m.o) used[m.key] = 1;
    var nh = nodes.map(function (n) { return esc(String(n.title || n.id).split(' · ')[0]); }).join('; ');
    var rest = [];
    Object.keys(f).forEach(function (k) { if (!used[k]) rest.push('<li><span class="k">' + esc(labelOf(k, f[k])) + ':</span> ' + cellObs(k, f[k], { fn: 1 }) + '</li>'); });
    return '<tr><td><b>' + esc(pkLabel(s.stationM)) + '</b><div class="small">' + esc(String(s.title || '').split(' · ').slice(1).join(' · ')) + '</div>' +
      (s.stationing && s.stationing.origin && s.stationing.origin !== 'document' ? '<span class="src src-' + esc(s.stationing.origin) + '">ПК: ' + esc(ORIGIN[s.stationing.origin] || s.stationing.origin) + '</span>' : '') + '</td>' +
      '<td class="n">' + cellObs('terrainM', g && g.o, { fn: 1 }) + '</td>' +
      '<td class="n">' + cellObs('invertM', inv && inv.o, { fn: 1 }) + '</td>' +
      (hasCrown ? '<td class="n">' + (cr.length ? cr.map(function (x) { return cellObs(x.key, x.o, { fn: 1 }); }).join('') : '<span class="nil">—</span>') + '</td>' : '') +
      '<td class="n">' + dep + '</td>' +
      '<td>' + (m ? cellObs(m.key, m.o, { fn: 1 }) : '<span class="nil">—</span>') + '</td>' +
      '<td>' + (nh || '<span class="nil">—</span>') + '</td>' +
      '<td>' + (rest.length ? '<ul class="kv">' + rest.join('') + '</ul>' : '') + '</td></tr>';
  }
  function excavationHtml(nodes) {
    var h = [];
    var exc = nodes.filter(function (n) { var nf = n.fields || {}; return nf.excavationDepthM || nf.shoringMethod || /excav|trench|pit/.test(n.kind || ''); });
    if (!exc.length) return '';
    var shor = exc.map(function (n) { return n.fields && has(n.fields.shoringMethod) ? String(n.fields.shoringMethod.value) : null; });
    var same = shor[0] && shor.every(function (t) { return t === shor[0]; });
    h.push('<h2>Выемки и крепление</h2><div class="wrapx"><table><colgroup><col style="width:23%"><col style="width:8%"><col style="width:15%"><col style="width:16%"><col style="width:16%"><col></colgroup>' +
      '<thead><tr><th>Выемка</th><th>ПК</th><th>Размеры, м</th><th>Глубина</th><th>Объём по ПД</th><th>' + (same ? 'Шаг и длина стоек' : 'Крепление') + '</th></tr></thead><tbody>');
    exc.forEach(function (n) {
      var nf = n.fields || {};
      var size = has(nf.planLengthM) && has(nf.planWidthM) ? num(nf.planLengthM.value, 0, 2) + '×' + num(nf.planWidthM.value, 0, 2) + ' (в плане)' + badge(nf.planLengthM) :
        has(nf.lengthM) ? 'L ' + num(nf.lengthM.value, 0, 2) + (has(nf.widthAtBottomM) ? ', по дну ' + num(nf.widthAtBottomM.value, 0, 2) : '') + badge(nf.lengthM) : '—';
      var conf = nf.contourConflict || nf.volumeConflict;
      var sh = same ? [nf.shoringPilePitchM && has(nf.shoringPilePitchM) ? 'шаг ' + fmt('shoringPilePitchM', nf.shoringPilePitchM) : '', nf.shoringPileEmbedM && has(nf.shoringPileEmbedM) ? 'длина ' + fmt('shoringPileEmbedM', nf.shoringPileEmbedM) : ''].filter(Boolean).join(', ') + badge(nf.shoringPilePitchM || nf.shoringMethod)
        : (nf.shoringMethod ? cellObs('shoringMethod', nf.shoringMethod, { fn: 1 }) : '—');
      h.push('<tr><td><b>' + esc(n.title || n.id) + '</b>' + (conf ? '<span class="why">⚠ расхождение в источниках' + fnRef(has(conf) ? conf.value : conf.missingReason) + '</span>' : '') + '</td><td class="n">' + esc(pkLabel(n.stationM)) + '</td><td>' + size + '</td>' +
        '<td class="ni">' + (nf.excavationDepthM ? cellObs('excavationDepthM', nf.excavationDepthM, { fn: 1 }) : '—') + '</td><td class="ni">' + (nf.excavationVolumePdM3 ? cellObs('excavationVolumePdM3', nf.excavationVolumePdM3, { fn: 1 }) : '—') + '</td><td>' + (sh || '—') + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    if (same) h.push('<div class="small" style="margin-top:.8mm">' + esc(shor[0]) + ' ' + badge(exc[0].fields.shoringMethod).replace('class="src', 'style="display:inline" class="src') + '</div>');
    return h.join('');
  }
  function crossingsHtml(xs, st) {
    st = st || [];
    var h = ['<h2>Пересечения</h2>'];
    if (!xs.length) return h[0] + '<p class="small">В интервале пересечений в данных нет.</p>';
    h.push('<div class="wrapx"><table class="xs"><thead><tr><th style="width:8%">ПК</th><th style="width:16%">Пересечение</th><th>Сведения</th><th style="width:33%">Проверка зазора</th></tr></thead><tbody>');
    xs.forEach(function (c) {
      var f = c.fields || {};
      var own = '<div class="small">' + (has(f.owner) ? 'Владелец: ' + esc(fmt('owner', f.owner)) + badge(f.owner) : 'Владелец не подтверждён') + '</div>' +
        '<div class="small">' + (has(f.dispatcherContact) ? 'Контакт: ' + esc(fmt('dispatcherContact', f.dispatcherContact)) + badge(f.dispatcherContact) : 'Номер дежурного не указан в листах') + '</div>';
      /* лоток трассы в створе — уже в таблице пикетов */
      var info = Object.keys(f).filter(function (k) { return k !== 'owner' && k !== 'dispatcherContact' && k !== 'existingNetworkMark' && !(f[k] && f[k].pointKind === 'invert' && st.some(function (q) { var o = byKind(q.fields, 'invert', ['invertM']); return Math.abs(q.stationM - c.stationM) < 1e-6 && o && has(o.o) && o.o.value === f[k].value; })); })
        .map(function (k) { return '<li><span class="k">' + esc(labelOf(k, f[k])) + ':</span> ' + cellObs(k, f[k], { longFn: 42, fn: 1 }) + '</li>'; }).join('');
      var mark = has(f.existingNetworkMark) ? f.existingNetworkMark.value : crossShort(c);
      var markHtml = '<b class="mark">' + esc(mark) + '</b>';
      var title = String(c.title || c.id);
      var titleHtml = mark ? title.split(mark).map(esc).join('<span class="mark">' + esc(mark) + '</span>') : esc(title);
      h.push('<tr><td class="n"><b>' + esc(pkLabel(c.stationM)) + '</b>' + (c.stationing && c.stationing.origin && c.stationing.origin !== 'document' ? '<span class="src src-' + esc(c.stationing.origin) + '">ПК: ' + esc(ORIGIN[c.stationing.origin] || c.stationing.origin) + '</span>' : '') + '</td>' +
        '<td>' + markHtml + '<div class="small">' + titleHtml + '</div>' + own + '</td>' +
        '<td><ul class="kv">' + (info || '<li class="nil">—</li>') + '</ul></td>' +
        '<td>' + stateHtml(c) + '</td></tr>');
    });
    h.push('</tbody></table></div>');
    return h.join('');
  }
  function tailHtml(D, iv, st, xs, label) {
    var allRefs = [].concat(iv.refs || []);
    st.forEach(function (s) { allRefs = allRefs.concat(s.refs || []); });
    xs.forEach(function (c) { allRefs = allRefs.concat(c.refs || []); });
    return '<div class="cols keep" style="margin-top:1.5mm"><div style="flex:0 0 42%"><div class="small"><b>Листы ПД участка</b></div>' + refListHtml(allRefs, true) + '</div><div>' + signBlock('', 2) + '</div></div>' +
      footer(D, label, true);
  }
  /* разбивка ПК на листы: равные части не длиннее ROWS_PER_PAGE */
  function chunks(st, size) {
    var k = Math.ceil(st.length / size), n = Math.ceil(st.length / k), out = [];
    for (var i = 0; i < st.length; i += n) out.push(st.slice(i, i + n));
    return out;
  }
  function sheet(intervalId) {
    var D = F();
    if (!D) return errDoc('Лист на смену', 'Нет данных полевого комплекта (window.ATLAS_FIELD).');
    BMAX = 1; fnReset();
    if (intervalId === 'all') return sheetAll(D);
    var iv = resolveInterval(D, intervalId);
    if (!iv) return errDoc('Лист на смену', 'Интервал «' + intervalId + '» не найден в данных.');
    var from = iv.from, to = iv.to, st = stationsIn(D, from, to), xs = crossingsIn(D, st, from, to);
    var ivTitle = ivTitleOf(D, iv), h = [], acc = { nodes: [], seen: {} };
    var hasCrown = st.some(function (s) { return seriesVal(s, SERIES[2]) || seriesVal(s, SERIES[3]); });
    var range = pkLabel(from) + '–' + pkLabel(to);
    h.push(header(D, 'Лист на смену · ' + ivTitle, '<b>' + esc(range) + '</b>'));
    h.push(notesHtml(D));
    if (st.length <= SHORT_MAX) {
      /* короткий участок — один лист (как пилот) */
      h.push('<h2>Продольный профиль</h2>');
      var P = st.length ? profileSvg(from, to, st, xs) : null;
      h.push(P ? P.svg + profileLegend(P) : '<p class="nil">В интервале нет пикетов.</p>');
      h.push('<h2>Пикеты</h2>' + pkTableOpen(hasCrown) + st.map(function (s) { return stationRow(D, s, hasCrown, acc); }).join('') + '</tbody></table></div>');
    } else {
      /* длинный участок — по листам: на каждом свой отрезок профиля (общий вертикальный масштаб) и его ПК */
      var zr = zRange(st, xs), parts = chunks(st, ROWS_PER_PAGE);
      parts.forEach(function (part, k) {
        var a = part[0].stationM, nxt = parts[k + 1] ? parts[k + 1][0] : null, b = nxt ? nxt.stationM : Math.max(part[part.length - 1].stationM, k === parts.length - 1 ? to : 0);
        var pst = nxt ? part.concat([nxt]) : part;
        if (k > 0) h.push('<div class="pgbrk"></div><div class="ph">' + esc(objectName(D)) + ' · <b>Лист на смену · ' + esc(ivTitle) + '</b></div>');
        h.push('<h2>Продольный профиль · часть ' + (k + 1) + ' из ' + parts.length + ': ' + esc(pkLabel(a)) + '–' + esc(pkLabel(b)) + '</h2>');
        var Pk = profileSvg(a, b, pst, xs.filter(function (c) { return inRange(c.stationM, a, b); }), { zr: zr, ph: 110 });
        h.push(Pk.svg + profileLegend(Pk));
        h.push('<h2>Пикеты ' + esc(pkLabel(part[0].stationM)) + '–' + esc(pkLabel(part[part.length - 1].stationM)) + '</h2>' + pkTableOpen(hasCrown) +
          part.map(function (s) { return stationRow(D, s, hasCrown, acc); }).join('') + '</tbody></table></div>');
        h.push(fnHtml());
      });
      h.push('<div class="pgbrk"></div><div class="ph">' + esc(objectName(D)) + ' · <b>Лист на смену · ' + esc(ivTitle) + '</b></div>');
    }
    h.push(excavationHtml(acc.nodes));
    h.push(crossingsHtml(xs, st));
    if (FN.list.length) h.push(fnHtml());
    h.push(tailHtml(D, iv, st, xs, 'Лист на смену ' + ivTitle));
    return openDoc('Лист на смену · ' + ivTitle + ' · ' + range, h.join(''), 'Лист на смену · ' + range);
  }

  /* ---------- вся трасса: обзор ---------- */
  function sheetAll(D) {
    var r = D.route || {}, from = isNum(r.startM) ? r.startM : 0, to = isNum(r.endM) ? r.endM : 0;
    var ivs = (D.intervals && D.intervals.length) ? D.intervals.map(function (i) { return { id: i.id, from: i.startM, to: i.endM, title: i.title, refs: i.refs || [] }; }) : [resolveInterval(D, null)];
    var st = stationsIn(D, from, to), xs = crossingsIn(D, st, from, to), xnum = {};
    xs.forEach(function (c, i) { xnum[c.id] = i + 1; });
    var title = 'Вся ' + routeName(r) + ' · ' + pkLabel(from) + '–' + pkLabel(to);
    var h = [];
    h.push(header(D, 'Сводный лист · ' + title, ''));
    h.push(notesHtml(D));
    h.push('<h2>Обзорный профиль</h2>');
    var P = st.length ? profileSvg(from, to, st, xs, { overview: true, ph: 135, xnum: xnum, bands: ivs.map(function (i, k) { return { from: i.from, to: i.to, label: (k + 1) + '. ' + (i.title || i.id) }; }) }) : null;
    h.push(P ? P.svg + profileLegend(P, true) : '<p class="nil">Пикетов нет.</p>');
    /* таблица по участкам */
    h.push('<h2>Участки</h2><div class="wrapx"><table><colgroup><col style="width:4%"><col style="width:27%"><col style="width:9%"><col style="width:8%"><col style="width:13%"><col style="width:13%"><col style="width:12%"><col></colgroup>' +
      '<thead><tr><th>№</th><th>Участок</th><th>Длина</th><th>ПК в данных</th><th>Земля, мин–макс (лист/съёмка)</th><th>Лоток, мин–макс (лист)</th><th>Пересечения: меньше нормы / в норме / не проверено</th><th>Узлы; нет данных</th></tr></thead><tbody>');
    ivs.forEach(function (iv, k) {
      var s = stationsIn(D, iv.from, iv.to), x = crossingsIn(D, s, iv.from, iv.to).filter(function (c) { return inRange(c.stationM, iv.from, iv.to); });
      var rng = function (kind, keys) {
        var v = []; s.forEach(function (q) { var o = byKind(q.fields, kind, keys); if (o && has(o.o) && FIRM[o.o.origin]) v.push(o.o.value); });
        return v.length ? elev(Math.min.apply(null, v)) + (v.length > 1 ? '…' + elev(Math.max.apply(null, v)) : '') + '<span class="src">' + v.length + ' из ' + s.length + ' ПК</span>' : '<span class="nil">нет</span>';
      };
      var cnt = { does_not_comply: 0, complies: 0, insufficient_data: 0 };
      x.forEach(function (c) { cnt[checkState(c).state]++; });
      var nodes = {}; s.forEach(function (q) { (q.nodeIds || []).forEach(function (id) { var n = nodeById(D, id); if (n) nodes[id] = String(n.title || id).split(' · ')[0]; }); });
      var miss = 0; s.forEach(function (q) { var f = q.fields || {}; Object.keys(f).forEach(function (kk) { if (f[kk] && !has(f[kk])) miss++; }); });
      h.push('<tr><td class="n"><b>' + (k + 1) + '</b></td><td><b>' + esc(iv.title || iv.id) + '</b></td>' +
        '<td class="n">' + esc(num(iv.to - iv.from, 0, 1)) + ' м</td><td class="n">' + s.length + '</td><td class="n">' + rng('terrain', ['terrainM']) + '</td><td class="n">' + rng('invert', ['invertM']) + '</td>' +
        '<td class="n">' + (x.length ? (cnt.does_not_comply ? '<b style="color:#8a0000">✕ ' + cnt.does_not_comply + '</b> ' : '✕ 0 ') + '· ✓ ' + cnt.complies + ' · ? ' + cnt.insufficient_data : '—') + '</td>' +
        '<td>' + (Object.keys(nodes).map(function (id) { return esc(nodes[id]); }).join('; ') || '—') + '<span class="src">полей без значения: ' + miss + '</span></td></tr>');
    });
    h.push('</tbody></table></div>');
    /* пересечения кратко */
    if (xs.length) {
      h.push('<h2>Пересечения трассы</h2><div class="wrapx"><table><colgroup><col style="width:5%"><col style="width:11%"><col style="width:20%"><col></colgroup><thead><tr><th>№</th><th>ПК</th><th>Сеть</th><th>Проверка зазора</th></tr></thead><tbody>');
      xs.forEach(function (c, i) {
        var s = checkState(c), f = c.fields || {};
        var stt = s.state === 'does_not_comply' ? '<b style="color:#8a0000">✕ Зазор меньше нормы</b>' : s.state === 'complies' ? '<b style="color:#14501f">✓ Зазор в норме</b> (норма ' + esc(num(s.threshold.value, 2, 3)) + ' м, ' + esc(refsShort(s.threshold.refs, 1)) + ')' :
          '○ Зазор не проверен — не хватает данных' + (s.missing.length ? ': <span class="small">' + esc(s.missing.join('; ')) + '</span>' : '');
        h.push('<tr><td class="n"><b>' + (i + 1) + '</b></td><td class="n">' + esc(pkLabel(c.stationM)) + '</td><td><b>' + esc(has(f.existingNetworkMark) ? f.existingNetworkMark.value : crossShort(c)) + '</b></td><td>' + stt + '</td></tr>');
      });
      h.push('</tbody></table></div>');
    }
    var allIv = { refs: [] }; ivs.forEach(function (i) { allIv.refs = allIv.refs.concat(i.refs || []); });
    h.push('<div class="small" style="margin-top:1mm">Подробно по участку — лист на смену участка; по колодцу — монтажная карта.</div>');
    h.push(tailHtml(D, allIv, st, xs, 'Сводный лист ' + title));
    return openDoc('Сводный лист · ' + title, h.join(''), 'Сводный лист · ' + title);
  }

  /* ---------- монтажная карта колодца ---------- */
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9а-яё]/g, '').replace(/кв/g, 'kv'); }
  function findNode(D, id) {
    var n = D.nodes || [], k = norm(id);
    for (var i = 0; i < n.length; i++) if (n[i].id === id) return n[i];
    for (var j = 0; j < n.length; j++) if (norm(n[j].id) === k) return n[j];
    return null;
  }
  function fv(f, k) { return f[k] && has(f[k]) ? f[k].value : null; }

  /* разрез по высотам из полей, в относительных отметках от низа рабочей части; ширина svg — 86 мм (левая колонка) */
  function wellSvgFields(f) {
    var Hw = fv(f, 'workingPartHeightMm'), Hn = fv(f, 'neckAndCoverHeightMm'), Hs = fv(f, 'sandBeddingMm');
    var Dc = fv(f, 'chamberInnerDiameterMm'), Dn = fv(f, 'neckInnerDiameterMm');
    if (!isNum(Hw)) return '<p class="nil">Высота рабочей части — нет в источнике' + (f.workingPartHeightMm && f.workingPartHeightMm.missingReason ? ' (' + esc(f.workingPartHeightMm.missingReason) + ')' : '') + '. Разрез не построен.</p>';
    var top = Hw + (isNum(Hn) ? Hn : 0);
    var M = 60, S = 1 / M, Wmm = 86, cx = 36, padT = 8;
    var below = (3 + 1.2 + 2.2) / S + (isNum(Hs) ? Hs : 0);   /* условная плита днища и разрыв — в мм натуры для расчёта высоты */
    var Hmm = (top + below) * S + padT + 7;
    var Y = function (mm) { return padT + (top - mm) * S; };
    var rIn = (isNum(Dc) ? Dc : 1500) / 2 * S, rN = (isNum(Dn) ? Dn : 700) / 2 * S, wall = 1.8;
    var dash = ' stroke="#111" stroke-width=".3" stroke-dasharray="1 .6"';
    var o = [];
    o.push('<svg viewBox="0 0 ' + Wmm + ' ' + Hmm.toFixed(1) + '" style="width:' + Wmm + 'mm;height:' + Hmm.toFixed(1) + 'mm" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif" role="img" aria-label="Разрез колодца в относительных отметках">');
    o.push('<defs><pattern id="conc" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.6" height="1.6" fill="#e3e5e8"/><line x1="0" y1="0" x2="0" y2="1.6" stroke="#555" stroke-width=".25"/></pattern>' +
      '<pattern id="sand" width="1.4" height="1.4" patternUnits="userSpaceOnUse"><rect width="1.4" height="1.4" fill="#fff"/><circle cx=".7" cy=".7" r=".22" fill="#333"/></pattern>' +
      '<marker id="ar" viewBox="0 0 6 6" refX="3" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L6,3 L0,6 z" fill="#111"/></marker></defs>');
    /* шкала относительных отметок */
    o.push('<line x1="12" x2="12" y1="' + Y(top).toFixed(2) + '" y2="' + Y(0).toFixed(2) + '" stroke="#111" stroke-width=".3"/>');
    for (var z = 0; z <= top + 1e-6; z += 500) {
      var y = Y(z).toFixed(2);
      o.push('<line x1="10.8" x2="12" y1="' + y + '" y2="' + y + '" stroke="#111" stroke-width=".3"/><text x="10.4" y="' + (+y + 0.8) + '" font-size="2.8" text-anchor="end">' + (z ? '+' : '') + num(z / 1000, 3, 3) + '</text>');
    }
    o.push('<text x="0.5" y="' + (padT - 2) + '" font-size="2.8">отн. отм., м</text>');
    var y0 = Y(Hw), y1 = Y(0), hW = y1 - y0;
    /* рабочая часть — стенки условной толщины */
    o.push('<rect x="' + (cx - rIn - wall).toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + wall + '" height="' + hW.toFixed(2) + '" fill="url(#conc)"' + dash + '/>');
    o.push('<rect x="' + (cx + rIn).toFixed(2) + '" y="' + y0.toFixed(2) + '" width="' + wall + '" height="' + hW.toFixed(2) + '" fill="url(#conc)"' + dash + '/>');
    var my = (y0 + y1) / 2;
    o.push('<text x="' + cx + '" y="' + (my - 2.4).toFixed(2) + '" font-size="2.8" text-anchor="middle" font-weight="700">рабочая часть</text>');
    o.push('<text x="' + cx + '" y="' + (my + 0.6).toFixed(2) + '" font-size="2.8" text-anchor="middle">порядок колец</text>');
    o.push('<text x="' + cx + '" y="' + (my + 3.2).toFixed(2) + '" font-size="2.8" text-anchor="middle">не указан</text>');
    if (isNum(Dc)) {
      var dy = y1 - 5;
      o.push('<line x1="' + (cx - rIn).toFixed(2) + '" x2="' + (cx + rIn).toFixed(2) + '" y1="' + dy.toFixed(2) + '" y2="' + dy.toFixed(2) + '" stroke="#111" stroke-width=".25" marker-start="url(#ar)" marker-end="url(#ar)"/>');
      o.push('<text x="' + cx + '" y="' + (dy - 1).toFixed(2) + '" font-size="2.8" text-anchor="middle">Ø' + Dc + ' в свету</text>');
    }
    /* днище — толщина не задана: условно + разрыв; подготовка в масштабе */
    var zx0 = cx - rIn - wall - 1.5, zx1 = cx + rIn + wall + 1.5;
    o.push('<rect x="' + zx0.toFixed(2) + '" y="' + y1.toFixed(2) + '" width="' + (zx1 - zx0).toFixed(2) + '" height="3" fill="url(#conc)"' + dash + '/>');
    var zz = y1 + 3, zig = '';
    for (var q = 0; q <= 8; q++) zig += (zx0 + (zx1 - zx0) * q / 8).toFixed(2) + ',' + (zz + (q % 2 ? 1.2 : 0)).toFixed(2) + ' ';
    o.push('<polyline points="' + zig + '" fill="none" stroke="#111" stroke-width=".25"/>');
    o.push('<text x="' + (zx1 + 1).toFixed(2) + '" y="' + (y1 + 2.4).toFixed(2) + '" font-size="2.8">Толщина не указана</text>');
    if (isNum(Hs)) {
      var ys = zz + 2.2, hs = Hs * S;
      o.push('<rect x="' + (zx0 - 1).toFixed(2) + '" y="' + ys.toFixed(2) + '" width="' + (zx1 - zx0 + 2).toFixed(2) + '" height="' + hs.toFixed(2) + '" fill="url(#sand)" stroke="#111" stroke-width=".3"/>');
      o.push('<text x="' + (zx1 + 2).toFixed(2) + '" y="' + (ys + hs / 2 + 0.8).toFixed(2) + '" font-size="2.8">подготовка ' + Hs + ' мм</text>');
    }
    /* плита перекрытия (условно) и горловина с люком */
    if (isNum(Hn)) {
      var yt = Y(top), yb = Y(Hw);
      o.push('<rect x="' + (cx - rIn - wall).toFixed(2) + '" y="' + (yb - 1.1).toFixed(2) + '" width="' + (rIn - rN + wall).toFixed(2) + '" height="1.1" fill="url(#conc)"' + dash + '/>');
      o.push('<rect x="' + (cx + rN).toFixed(2) + '" y="' + (yb - 1.1).toFixed(2) + '" width="' + (rIn - rN + wall).toFixed(2) + '" height="1.1" fill="url(#conc)"' + dash + '/>');
      o.push('<rect x="' + (cx - rN - 1.3).toFixed(2) + '" y="' + yt.toFixed(2) + '" width="1.3" height="' + (yb - 1.1 - yt).toFixed(2) + '" fill="url(#conc)"' + dash + '/>');
      o.push('<rect x="' + (cx + rN).toFixed(2) + '" y="' + yt.toFixed(2) + '" width="1.3" height="' + (yb - 1.1 - yt).toFixed(2) + '" fill="url(#conc)"' + dash + '/>');
      o.push('<rect x="' + (cx - rN - 1.3).toFixed(2) + '" y="' + (yt - 0.8).toFixed(2) + '" width="' + (2 * rN + 2.6).toFixed(2) + '" height=".8" fill="#444"/>');
      if (isNum(Dn)) o.push('<text x="' + cx + '" y="' + (yt + 3).toFixed(2) + '" font-size="2.8" text-anchor="middle">Ø' + Dn + '</text>');
    }
    /* размерные линии слева от стенки */
    var dx = cx - rIn - wall - 3.2;
    function dim(a, b, label) {
      var ya = Y(a), yb2 = Y(b);
      o.push('<line x1="' + dx.toFixed(2) + '" x2="' + dx.toFixed(2) + '" y1="' + yb2.toFixed(2) + '" y2="' + ya.toFixed(2) + '" stroke="#111" stroke-width=".25" marker-start="url(#ar)" marker-end="url(#ar)"/>');
      o.push('<text transform="translate(' + (dx - 0.8).toFixed(2) + ',' + ((ya + yb2) / 2).toFixed(2) + ') rotate(-90)" font-size="2.8" text-anchor="middle">' + label + '</text>');
    }
    dim(0, Hw, Hw + ' мм');
    if (isNum(Hn)) dim(Hw, top, Hn + ' мм');
    var lx = cx + rIn + wall + 1.5;
    function mark(zmm, txt) {
      var y = Y(zmm).toFixed(2);
      o.push('<line x1="' + (cx + rN + 1.5).toFixed(2) + '" x2="' + (Wmm - 0.5) + '" y1="' + y + '" y2="' + y + '" stroke="#777" stroke-width=".2" stroke-dasharray=".8 .6"/>');
      o.push('<text x="' + lx.toFixed(2) + '" y="' + (+y - 0.7).toFixed(2) + '" font-size="2.8">' + txt + '</text>');
    }
    if (isNum(Hn)) mark(top, '<tspan font-weight="700">+' + num(top / 1000, 3, 3) + '</tspan> верх люка');
    mark(Hw, '<tspan font-weight="700">+' + num(Hw / 1000, 3, 3) + '</tspan> верх камеры');
    mark(0, '<tspan font-weight="700">0,000</tspan> низ камеры');
    o.push('<text x="' + (Wmm - 0.5) + '" y="' + (Hmm - 1.2).toFixed(1) + '" font-size="2.8" text-anchor="end">М 1:' + M + ' по высоте; пунктир — толщины условно</text>');
    o.push('</svg>');
    return o.join('');
  }

  /* разрез по rings[] с высотами (на будущее: fields.heightMm у каждого кольца) */
  function wellSvgRings(rings) {
    var hs = rings.map(function (r) { return fv(r.fields || {}, 'heightMm'); });
    if (!hs.every(isNum)) return null;
    var tot = hs.reduce(function (a, b) { return a + b; }, 0), S = 1 / 60, Hmm = tot * S + 10, cx = 30, o = [], acc = 0;
    o.push('<svg viewBox="0 0 86 ' + Hmm.toFixed(1) + '" style="width:86mm;height:' + Hmm.toFixed(1) + 'mm" xmlns="http://www.w3.org/2000/svg" font-family="Arial,sans-serif">');
    rings.forEach(function (r, i) {
      var y = 5 + (tot - acc - hs[i]) * S;
      o.push('<rect x="' + (cx - 14) + '" y="' + y.toFixed(2) + '" width="28" height="' + (hs[i] * S).toFixed(2) + '" fill="#eee" stroke="#111" stroke-width=".3"/>');
      o.push('<text x="' + (cx + 16) + '" y="' + (y + hs[i] * S / 2 + 0.8).toFixed(2) + '" font-size="2.8">' + (i + 1) + ' ' + esc(r.title || '') + ' · +' + num((acc + hs[i]) / 1000, 3, 3) + '</text>');
      acc += hs[i];
    });
    o.push('<text x="85.5" y="' + (Hmm - 1.2).toFixed(1) + '" font-size="2.8" text-anchor="end">М 1:60, отметки от низа</text></svg>');
    return o.join('');
  }

  function kvList(f, keys) {
    return '<ul class="kv">' + keys.map(function (k) { return '<li><span class="k">' + esc(labelOf(k, f[k])) + ':</span> ' + cellObs(k, f[k], { fn: 1 }) + '</li>'; }).join('') + '</ul>';
  }

  function well(nodeId) {
    var D = F();
    if (!D) return errDoc('Монтажная карта', 'Нет данных полевого комплекта (window.ATLAS_FIELD).');
    var n = findNode(D, nodeId);
    BMAX = 2; fnReset();
    if (!n) return errDoc('Монтажная карта', 'Узел «' + nodeId + '» не найден в данных.');
    var f = n.fields || {}, used = {}, h = [];
    var use = function (k) { used[k] = 1; return f[k]; };
    h.push(header(D, 'Монтажная карта · ' + (n.title || n.id), '<b>' + esc(pkLabel(n.stationM)) + '</b> · ' + esc(kindName(n.kind))));
    /* абсолютные отметки */
    var absK = Object.keys(f).filter(function (k) { return f[k] && (f[k].pointKind === 'well_bottom' || f[k].pointKind === 'rim'); });
    var absMissing = absK.filter(function (k) { return !has(f[k]); });
    var notes = [];
    if (!Object.keys(f).length && !(n.rings || []).length) notes.push('<div><b>У узла нет полей в данных — состав, размеры и отметки: нет в источнике.</b></div>');
    else if (!absK.length) notes.push('<div><b>Абсолютные отметки днища и люка — нет в источнике.</b></div>');
    var kindsHave = {}; absK.forEach(function (k) { kindsHave[f[k].pointKind] = 1; });
    var noField = [kindsHave.well_bottom ? '' : 'днища', kindsHave.rim ? '' : 'люка'].filter(Boolean);
    if (absK.length && noField.length) notes.push('<div><b>Абсолютная отметка ' + noField.join(' и ') + ' — нет в источнике.</b></div>');
    if (absMissing.length) notes.push('<div><b>Абсолютных отметок ' + absMissing.map(function (k) { return f[k].pointKind === 'rim' ? 'люка' : 'днища'; }).join(' и ') + ' в источнике нет.</b> ' +
      absMissing.map(function (k) { use(k); return esc(f[k].missingReason || '') + ' <span class="small">(' + esc(refsShort(f[k].refs, 2)) + ')</span>'; }).join(' ') + '</div>');
    absK.filter(function (k) { return has(f[k]); }).forEach(function (k) { use(k); notes.push('<div>' + esc(labelOf(k, f[k])) + ': <b>' + esc(fmt(k, f[k])) + '</b>' + badge(f[k]) + '</div>'); });
    var tg = f.terrainM, iv = f.invertM;
    if (tg || iv) {
      notes.push('<div>По продольному профилю на ' + esc(pkLabel(n.stationM)) + ': земля ' + (has(tg) ? '<b>' + esc(fmt('terrainM', tg)) + '</b> (' + esc(refsShort(tg.refs, 1)) + ')' : 'нет данных') +
        ', лоток трубы ' + (has(iv) ? '<b>' + esc(fmt('invertM', iv)) + '</b> (' + esc(refsShort(iv.refs, 1)) + ')' : 'нет данных') + ' — отметки трассы, не элементов колодца.</div>');
      used.terrainM = used.invertM = 1;
    }
    h.push('<div class="notes">' + notes.join('') + '</div>');
    /* разрез | порядок монтажа */
    var rings = (n.rings || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var left = [], right = [];
    left.push('<h2>Разрез</h2>');
    var svg = rings.length ? wellSvgRings(rings) : null;
    if (svg) left.push(svg);
    else {
      left.push(wellSvgFields(f));
      left.push('<div class="small"><b>Отметки относительные, от низа рабочей части (0,000).</b> Высоты — из полей карточки; абсолютная привязка — по месту.</div>');
      if (isNum(fv(f, 'workingPartHeightMm'))) ['workingPartHeightMm', 'neckAndCoverHeightMm', 'chamberInnerDiameterMm', 'neckInnerDiameterMm'].forEach(function (k) { if (f[k]) used[k] = 1; });
    }
    right.push('<h2>Порядок монтажа (снизу вверх)</h2>');
    if (rings.length) {
      right.push('<table><colgroup><col style="width:8%"><col style="width:40%"><col></colgroup><thead><tr><th>№</th><th>Элемент</th><th>Сведения</th></tr></thead><tbody>' + rings.map(function (r, i) {
        var rf = r.fields || {};
        return '<tr><td class="n"><b>' + (i + 1) + '</b></td><td><b>' + esc(r.title || '') + '</b><span class="src">' + esc(refsShort(r.refs, 2)) + '</span></td><td>' + kvList(rf, Object.keys(rf)) + '</td></tr>';
      }).join('') + '</tbody></table>');
    } else {
      var Hw = fv(f, 'workingPartHeightMm'), Hn = fv(f, 'neckAndCoverHeightMm');
      var ringKeys = Object.keys(f).filter(function (k) { return /^ring[A-Z]+\d+[a-z]?Count$/.test(k); });
      var markWithCount = function (mark, k) {
        var label = '<b>' + esc(mark || '—') + '</b>';
        return has(f[k]) ? '<span class="mark">' + label + ' × ' + num(f[k].value, 0, 0) + '</span>' :
          label + ' <span class="nil">количество не указано</span>';
      };
      var rel = function (mm) { return isNum(mm) ? (mm ? '+' : '') + num(mm / 1000, 3, 3) : '—'; };
      var srcOf = function (keys) {
        var r = []; keys.forEach(function (k) { if (f[k]) r = r.concat(f[k].refs || []); });
        return '<span class="src src-document">' + esc(refsShort(r, 2)) + '</span>';
      };
      var nd = '<span class="why">не указана</span>';
      var rows = [];
      if (f.sandBeddingMm) { use('sandBeddingMm'); rows.push(['Подготовка: песок', '—', '—', has(f.sandBeddingMm) ? num(f.sandBeddingMm.value, 0, 0) : '—', srcOf(['sandBeddingMm'])]); }
      if (f.bottomSlabType || f.bottomSlabCount) { use('bottomSlabType'); use('bottomSlabCount'); rows.push(['Днище: ' + markWithCount(fmt('', f.bottomSlabType), 'bottomSlabCount'), '—', rel(0), nd, srcOf(['bottomSlabType', 'bottomSlabCount'])]); }
      if (ringKeys.length || isNum(Hw)) {
        var list = ringKeys.map(function (k) { use(k); return markWithCount(ringMark(/^ring([A-Z]+)(\d+)([a-z]?)Count$/.exec(k)), k); }).join(', ');
        rows.push(['Рабочая часть: ' + (list || '—') + '<div class="warn" style="font-size:7pt;padding:.4mm 1.2mm;margin-top:.6mm">Порядок колец в источнике не указан</div>', rel(0), rel(Hw), isNum(Hw) ? num(Hw, 0, 0) : '—', srcOf(ringKeys.concat(['workingPartHeightMm']))]);
      }
      if (f.coverSlabType || f.coverSlabCount) { use('coverSlabType'); use('coverSlabCount'); rows.push(['Плита перекрытия: ' + markWithCount(fmt('', f.coverSlabType), 'coverSlabCount') + '<span class="why">положение по высоте в источнике не задано</span>', '—', '—', nd, srcOf(['coverSlabType', 'coverSlabCount'])]); }
      if (f.neckRingType || f.neckRingCount || f.manholeCover) {
        use('neckRingType'); use('neckRingCount'); use('manholeCover');
        var nt = f.neckRingType && has(f.neckRingType) ? markWithCount(fmt('', f.neckRingType), 'neckRingCount') : 'опорное кольцо — нет в источнике';
        var mh = f.manholeCover && has(f.manholeCover) ? '<span class="mark">люк <b>' + esc(fmt('', f.manholeCover)) + '</b></span>' : 'марка люка — нет в источнике';
        rows.push(['Горловина и люк: ' + nt + ', ' + mh +
          (f.neckInnerDiameterMm ? '<span class="why">Ø в свету ' + esc(fmt('neckInnerDiameterMm', f.neckInnerDiameterMm)) + '</span>' : ''), rel(Hw), isNum(Hw) && isNum(Hn) ? rel(Hw + Hn) : '—', isNum(Hn) ? num(Hn, 0, 0) + '<span class="why">вместе</span>' : '—', srcOf(['neckRingType', 'manholeCover', 'neckAndCoverHeightMm'])]);
      }
      if (!rows.length) right.push('<p class="small"><b>Состав колодца (днище, кольца, плиты, горловина) — нет в источнике.</b></p>');
      else right.push('<table><colgroup><col style="width:7%"><col><col style="width:14%"><col style="width:14%"><col style="width:13%"></colgroup><thead><tr><th>№</th><th>Элемент, марка × кол-во</th><th>Низ, отн.</th><th>Верх, отн.</th><th>Высота, мм</th></tr></thead><tbody>' +
        rows.map(function (r, i) { return '<tr><td class="n"><b>' + (i + 1) + '</b></td><td>' + r[0] + r[4] + '</td><td class="n">' + r[1] + '</td><td class="n">' + r[2] + '</td><td class="n">' + r[3] + '</td></tr>'; }).join('') + '</tbody></table>');
      var tot = fv(f, 'fullStructuralDepthMm');
      if (isNum(tot) && isNum(Hw) && isNum(Hn)) {
        use('fullStructuralDepthMm');
        right.push('<div class="small" style="margin-top:.8mm">Проверка: ' + num(Hw, 0, 0) + ' + ' + num(Hn, 0, 0) + ' = ' + num(Hw + Hn, 0, 0) + ' мм; полная конструктивная глубина ' + num(tot, 0, 0) + ' мм (' + esc(refsShort(f.fullStructuralDepthMm.refs, 1)) + ')' +
          (Hw + Hn === tot ? ' — <b>сходится</b>.' : ' — <b>не сходится, сверить</b>.') + '</div>');
      }
      if (f.assemblyGroups) right.push('<div class="small" style="margin-top:.8mm"><b>Порядок сборки по источнику:</b> ' + esc(fmt('', use('assemblyGroups'))) + ' (' + esc(refsShort(f.assemblyGroups.refs, 1)) + ')</div>');
    }
    /* люк */
    var hatch = f.manholeCover, rimK = absK.filter(function (k) { return f[k].pointKind === 'rim'; })[0];
    right.push('<h2>Люк</h2><div><span class="big mark">' + (has(hatch) ? esc(fmt('', hatch)) : 'Марка не указана') + '</span></div>' +
      (rimK && has(f[rimK]) ? '<div>Отметка люка <b>' + esc(fmt(rimK, f[rimK])) + '</b>' + badge(f[rimK]) + '</div>' :
        '<div class="warn">Отметка люка в ПД не указана. Привязку к покрытию нужно уточнить.</div>'));
    h.push('<div class="cols"><div style="flex:0 0 86mm">' + left.join('') + '</div><div>' + right.join('') + '</div></div>');
    /* вводы и гильзы | прочее */
    var inK = ['outletDiameterMm', 'tieInDiameterPlanMm', 'tieInDiameterSpecMm', 'tieInDiameterApprovedMm', 'glandsDiameterMm', 'glandsCount'].filter(function (k) { return f[k]; });
    inK.forEach(use);
    var inl = (n.inlets || []).map(function (x) { return '<li><b>' + esc(x.title || '') + '</b>' + kvList(x.fields || {}, Object.keys(x.fields || {})) + '</li>'; }).join('');
    var rest = Object.keys(f).filter(function (k) { return !used[k]; });
    h.push('<div class="cols"><div><h2>Вводы, врезка, гильзы</h2>' + (inl ? '<ul class="kv">' + inl + '</ul>' : '') + (inK.length ? kvList(f, inK) : (inl ? '' : '<p class="small">нет в источнике</p>')) +
      '<div class="small">Отметки осей вводов в источнике не указаны — на разрезе не показаны.</div></div>' +
      '<div><h2>Прочие сведения карточки</h2>' + (rest.length ? kvList(f, rest) : '<p class="small">—</p>') + '</div></div>');
    h.push(fnHtml());
    h.push(legendSrc());
    h.push('<div class="cols"><div style="flex:0 0 42%"><h2>Листы ПД</h2>' + refListHtml(n.refs, true) +
      (n.sectionHref || n.viewHref ? '<div class="small">В атласе: ' + [n.viewHref ? '<a href="' + esc(abs(n.viewHref)) + '" target="_blank">3D</a>' : '', n.sectionHref ? '<a href="' + esc(abs(n.sectionHref)) + '" target="_blank">разрез</a>' : ''].filter(Boolean).join(' · ') + '</div>' : '') +
      '</div><div>' + signBlock('Монтаж выполнил / принял', 2) + '</div></div>');
    h.push(footer(D, 'Монтажная карта ' + (n.title || n.id)));
    return openDoc('Монтажная карта · ' + (n.title || n.id), h.join(''), 'Монтажная карта · ' + (n.title || n.id));
  }

  window.AtlasFieldPrint = { sheet: sheet, well: well, _checkState: checkState };
})();
