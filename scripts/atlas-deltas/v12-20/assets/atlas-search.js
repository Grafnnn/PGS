/* 3D Атлас · общий поиск шапки (п. 2в отчёта дизайнера): группы «Замечания / Типы / Листы» из уже имеющихся данных.
   Тяжёлые данные подключаются при первом вводе, только через <script> (работает из file://, без fetch). */
'use strict';
window.AtlasSearch = (() => {
  const S = window.AtlasShell;
  const DASH = /[‐-―−‑­-]/g;
  // Свёртка: регистр, ё/е, все дефисы и тире → «-», «№» и лишние пробелы убираются.
  const fold = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(DASH, '-').replace(/№\s*/g, '').replace(/\s+/g, ' ').trim();
  const tight = s => fold(s).replace(/([a-zа-я])[\s-]+(\d)/g, '$1$2').replace(/(\d)[\s-]+([a-zа-я])/g, '$1$2');
  const loaded = new Map();
  function script(src) {
    if (loaded.has(src)) return loaded.get(src);
    const pr = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('Не загружено: ' + src)); document.head.append(s); });
    loaded.set(src, pr);
    return pr;
  }
  let remarks = null, types = null, sheets = null;
  async function getRemarks() {
    if (remarks) return remarks;
    if (!window.ATLAS_REMARKS) { if (window.AtlasData) await window.AtlasData.load('remarks'); else await script('data/rd_remarks_final.js'); }
    return (remarks = (window.ATLAS_REMARKS && window.ATLAS_REMARKS.items) || []);
  }
  async function decode(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
  }
  async function getTypes() {
    if (types) return types;
    if (!window.ATLAS_CATALOGUE_GZIP && !window.__atlasCatalogueDecoded) await script('data/catalogue_library.js');
    if (!window.__atlasCatalogueDecoded) window.__atlasCatalogueDecoded = await decode(window.ATLAS_CATALOGUE_GZIP);
    return (types = window.__atlasCatalogueDecoded.objects || []);
  }
  async function getSheets() {
    if (sheets) return sheets;
    if (!window.ATLAS_LIBRARY_GZIP && !window.__atlasLibraryDecoded) await script('data/library.js');
    if (!window.__atlasLibraryDecoded) window.__atlasLibraryDecoded = await decode(window.ATLAS_LIBRARY_GZIP);
    return (sheets = Object.values(window.__atlasLibraryDecoded.sources || {}));
  }
  /* К1: объектное — из window.ATLAS_PROJECT.search / .catalogue; нет ключа — функции нет (ядро универсальное) */
  const PJ = () => window.ATLAS_PROJECT || {}, SC = () => PJ().search || {};
  const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // замечание «АС2-23»: коды и написания разделов — search.rd_sections (только буквы и цифры, как в запросе без пробелов); номер — код раздела
  const RD = (() => { const m = new Map(); for (const x of (SC().rd_sections || [])) for (const a of [x && x.code].concat((x && x.aliases) || [])) { const k = String(a || '').toLowerCase().replace(/ё/g, 'е'); if (/^[a-zа-я0-9]+$/.test(k)) m.set(k, String(x.code).toUpperCase()); } return m; })();
  const REMARK_ID = RD.size ? new RegExp('^(' + [...RD.keys()].sort((a, b) => b.length - a.length).map(reEsc).join('|') + ')-?(\\d{1,2})$', 'i') : null;
  // «№ N» — тип каталога, если N в catalogue.type_range [от, до]
  const TYPE_RANGE = (() => { const r = (PJ().catalogue || {}).type_range; return Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) ? r : null; })();
  // коды, которые пишут слитно с номером листа («АР5» = «АР 5») — search.glued_codes; шифр-марка «Л-N» (выше листа N в «Листах») — search.mark_codes
  const GLUED = (SC().glued_codes || []).map(x => String(x).toLowerCase()).filter(x => /^[a-zа-я]+$/.test(x));
  const MARKS = (SC().mark_codes || []).map(x => String(x).toLowerCase()).filter(x => /^[a-zа-я]+$/.test(x));
  const GL_RE = new RegExp('(^|[^A-Za-zА-Яа-яЁё])(' + ['лист'].concat(GLUED).join('|') + ')(?=\\d)', 'gi');
  const GLN_RE = new RegExp('(^|[^a-zа-я])(' + ['лист'].concat(GLUED, ['л']).join('|') + ')(?=\\d)', 'g');
  // синонимы search.aliases {слово: [написания]} и шифры search.cipher_patterns [{pattern, flags, strip}] — варианты запроса
  const CIPH = (SC().cipher_patterns || []).filter(c => c && c.strip && c.pattern).map(c => { try { return new RegExp(c.pattern, String(c.flags || '').replace(/g/g, '') + 'g'); } catch (e) { return null; } }).filter(Boolean);
  const ALIAS = (() => { const m = new Map(), a = SC().aliases || {}; for (const [w, vs] of Object.entries(a)) { const g = [w].concat(vs || []).map(x => String(x).toLowerCase().replace(/ё/g, 'е')); for (const x of g) m.set(x, g); } return m; })();
  const QVC = new Map();   // варианты запроса — один раз на запрос
  // 1.0.19a A-04 (О-6): та же таблица латинских двойников, что в общей свёртке (AtlasShell.latFold): «AP-01» → «ар-01», «AC2-23» → «ас2-23»; «АС.2» → «АС2».
  // Вариант добавляется к исходному запросу (строки данных не сворачиваются — «PDF», «DN», коды с «_» находятся как раньше)
  const latQ = q => { const L = S && S.latFold; return L ? L(String(q).toLowerCase().replace(/ё/g, 'е')) : String(q).toLowerCase(); };
  function qVariants(q) {
    const k0 = String(q); if (QVC.has(k0)) return QVC.get(k0); if (QVC.size > 256) QVC.clear();
    let out = [String(q)];
    { const lq = latQ(q); if (lq !== String(q).toLowerCase().replace(/ё/g, 'е')) out.push(lq); }
    if (CIPH.length) { const s = CIPH.reduce((v, re) => v.replace(re, ' '), String(q)).replace(/\s+/g, ' ').trim(); if (s && s !== out[0]) out.push(s); }
    if (ALIAS.size) for (const v of out.slice()) { const ws = v.toLowerCase().replace(/ё/g, 'е').split(/\s+/); ws.forEach((w, i) => { for (const x of ALIAS.get(w) || []) if (x !== w) { const c = ws.slice(); c[i] = x; out.push(c.join(' ')); } }); }
    const res = [...new Set(out)]; QVC.set(k0, res); return res;
  }
  // Прямой переход: «АС2-23» → замечание, «№ 742» / «742» → тип каталога.
  function direct(q) {
    const t0 = tight(q).replace(/\s/g, ''), t1 = tight(latQ(q)).replace(/\s/g, '');   // 1.0.19a A-04: и латиницей («AC2-23»), и с точкой («АС.2-23»)
    const m = REMARK_ID && (REMARK_ID.exec(t0) || REMARK_ID.exec(t1));
    if (m) return { href: 'RD_REMARKS.html#id=' + encodeURIComponent(m[1].toUpperCase() + '-' + m[2].padStart(2, '0')), label: 'Замечание ' + m[1].toUpperCase() + '-' + m[2].padStart(2, '0') };
    const n = /^(?:№|n)?\s*(\d{1,4})$/i.exec(String(q).trim());
    if (n && TYPE_RANGE && Number(n[1]) >= TYPE_RANGE[0] && Number(n[1]) <= TYPE_RANGE[1]) return { href: 'catalogue-model.html#package/' + Number(n[1]), label: 'Тип № ' + Number(n[1]) };
    return null;
  }
  const matchAll = (hay, q) => { const f = fold(q), t = tight(q); const h = fold(hay), ht = tight(hay); return f.split(' ').every(w => h.includes(w)) || (t && ht.includes(t.replace(/\s/g, ''))); };
  // V12.8 · U5: «Листы» — по номеру листа: точное совпадение, затем начало, затем подстрока; совпадение только по странице PDF («PDF-стр. N» в названии) — ниже; при равенстве — порядок data/library.js
  // V12.8c: в названии — только заглавный шифр («АС.2» → «АС2»), «л.11» не трогать (иначе «Л-1»/«л1» находили «л.11»); в запросе — любой регистр («ас.2» = «АС.2»)
  const codeNorm = s => String(s || '').replace(/([A-ZА-ЯЁ])\.(\d)/g, '$1$2');
  const codeNormQ = s => String(s || '').replace(/([A-Za-zА-Яа-яЁё]{2,})\.(\d)/g, '$1$2');   // в запросе — шифр из 2+ букв (ас.2), «л.» — через lAsList
  // V12.8b: совпадение — по исходной строке ИЛИ по нормализованной (иначе «л.22» в названии → «л22», и запрос «л. 22» терял результаты)
  const lAsList = q => String(q || '').replace(/(^|[^A-Za-zА-Яа-яЁё])[лЛ]\s*\.\s*(?=\d)/g, '$1лист ').replace(GL_RE, '$1$2 ');   // «л. 2» = «лист 2»; V12.8c: слитные «лист5», «АР5», «ГП5» = «… 5»
  // общее правило совпадения для шапки («Листы») и реестра (library.js берёт AtlasSearch.match): исходная строка ИЛИ шифр без точки ИЛИ «л. N» = «лист N»; fold убирает «№», tight склеивает «лист5» = «лист 5», «PDF13» = «PDF 13»
  // V12.9 · W3: «лN» без точки — и шифр «Л-N» (обозначение лестницы Л-1 в проекте; так находил V12.7), и «лист N»; шифр — первым (rankSheets)
  const lGlued = q => String(q || '').replace(/(^|[^A-Za-zА-Яа-яЁё])[лЛ](?=\d)/g, '$1лист ');
  // V12.10 · Y7: «лист N» совпадает, если N — лист записи рядом со словом «лист»/«л.»: одиночный номер (содержит N), перечень или диапазон из названия («11–13,16–19», «140–141 и 144», «11, 51, 53–56», «39.9»); цифры ключа/страницы PDF/шифра — нет
  // V12.10 · Y7b: «техлист 7.55» — тоже лист записи; в запросе «л. N», «л.N», «АС.2 л. N» = «лист N» (lAsList), «лN» без точки — нет (шифр Л-N, W3)
  // V12.11 · Z5: «лист 100×100×12» — материал (размеры), не номер листа: число перед «×» номером не считается
  const NUM_ = '[\\d.]+(?![\\d.]|\\s*[×xх*]\\s*\\d)';
  const LIST_RE = new RegExp('(?:^|[^a-zа-я]|тех)лист\\s*(' + NUM_ + '(?:\\s*-\\s*' + NUM_ + ')?(?:\\s*(?:,|и)\\s*' + NUM_ + '(?:\\s*-\\s*' + NUM_ + ')?)*)', 'g');
  // V12.11 · предпроверка: номер листа в запросе — один раз на запрос (кэш), а не на каждую строку реестра
  const LQ = new Map(), listQ = qv => { const k = String(qv); if (LQ.has(k)) return LQ.get(k); if (LQ.size > 256) LQ.clear(); const r = /(?:^|[^a-zа-я]|тех)лист\s*(\d+(?:\.\d+)?[а-яa-z]?)(?![\d.]|\s*[×xх*]\s*\d)/.exec(fold(lAsList(qv))); LQ.set(k, r); return r; };
  // диапазоны и чип «л. N» как «лист N» — только если в запросе есть номер листа (иначе «лист» без номера находил весь реестр, а поиск шёл вдвое медленнее)
  // V12.11 · повторная предпроверка: «лN» без точки — это и шифр Л-N (W3): номер листа виден только через lGlued — чипы «л. N» и точный лист не включаем
  const qSheet = q => !!listQ(q);
  // V12.11 · предпроверка: строка записи как «лист N» и её листы (перечни/диапазоны) — один раз на строку (кэш), а не на каждое нажатие
  // кэши по тексту строки: неизменённые строки второй раз не храним (true), пустые списки листов — общий EMPTY (память страницы реестра)
  const EMPTY = [], hayL = hay => lAsList(hay);   // строка «как лист N» не кэшируется (память); её листы — кэш HI
  const HI = new Map(), hayItems = hay => { const k = String(hay); let v = HI.get(k); if (v === undefined) { if (HI.size > 20000) HI.clear(); v = []; const h = fold(hayL(k)); let x; LIST_RE.lastIndex = 0;
    while ((x = LIST_RE.exec(h))) for (const it of x[1].split(/\s*(?:,|и)\s*/)) v.push({ it, r: it.split(/\s*-\s*/) }); HI.set(k, v.length ? v : EMPTY); } return v; };
  const listOk = (hay, qv) => {
    const m = listQ(qv); if (!m) return true;
    const N = m[1], n = parseFloat(N), whole = /^\d+$/.test(N);
    for (const { it, r } of hayItems(hay)) {
      if (r.length === 2) { const a = parseFloat(r[0]), b = parseFloat(r[1]); if (whole && a <= n && n <= b) return true; if (r[0].includes(N) || r[1].includes(N)) return true; }
      else if (it.includes(N)) return true;
    }
    return false;
  };
  // V12.10 · Y8: «стр. PDF N», «PDF-стр. N» = «pdf N» (и в запросе, и в названиях «PDF-стр. N»)
  const pdfNormQ = q => String(q || '').replace(/(?:стр\.?\s*pdf|pdf\s*-?\s*стр\.?)\s*(?=\d)/gi, 'pdf ');
  const pdfNormH = h => String(h || '').replace(/pdf\s*-?\s*стр\.?\s*(?=\d)/gi, 'PDF ');
  // V12.11 · Z5: склейка буквы с числом («ст 1» → «ст1») ищется только с начала слова: «Ст1» не находит «лист1…»
  const tightAt = (ht, t) => { if (!/^[a-zа-я]/.test(t)) return ht.includes(t); for (let i = ht.indexOf(t); i >= 0; i = ht.indexOf(t, i + 1)) if (!i || !/[a-zа-я]/.test(ht[i - 1])) return true; return false; };
  // V12.11 · предпроверка: свёртка строки записи — один раз на строку (кэш по тексту)
  // свёртка строки — кэш (одна копия); «слитная» форма — из неё, без второго кэша; шифр без точки — кэш, только если строка изменилась
  // одна запись кэша на строку записи: её свёртка f и свёртка шифра без точки cf (если строка без шифра — та же строка); «слитная» форма — из f, без кэша.
  // Строку «как лист N» (проход для «лист N») не кэшируем (nc) — память страницы реестра.
  const BUN = new Map(), bun = (hay, nc) => { const k = String(hay); let b = nc ? null : BUN.get(k); if (!b) { const f = fold(k), c = codeNorm(k); b = { f, cf: c === k ? f : fold(c) }; if (!nc) { if (BUN.size > 30000) BUN.clear(); BUN.set(k, b); } } return b; };
  const tightF = f => f.replace(/([a-zа-я])[\s-]+(\d)/g, '$1$2').replace(/(\d)[\s-]+([a-zа-я])/g, '$1$2');
  // V12.11 · предпроверка (Z5): часть запроса «буква+цифра» (марка: «Б1», «Б-1», «П 2») — одно правило в любом написании: ищется слитно и только с начала слова
  // («Б1» не находит «МБ1», «П-2» не находит «Фп-2»); остальные слова — как раньше, вхождением
  const JOINT = /[a-zа-я][-\s]?\d|\d[-\s]?[a-zа-я]/;
  const QP = new Map(), qParse = q => { const k = String(q); let v = QP.get(k); if (!v) { if (QP.size > 256) QP.clear(); v = { ws: fold(k).split(' ').map(w => JOINT.test(w) ? { j: tight(w).replace(/\s/g, '') } : { w }), t: tight(k).replace(/\s/g, '') }; QP.set(k, v); } return v; };   // разбор запроса — один раз
  // «слитная» форма — лениво, в той же записи кэша строки (B.t для f, B.ct для cf; одна строка, если совпадает с f)
  const tightB = (B, k) => { const tk = k === 'f' ? 't' : 'ct'; let v = B[tk]; if (v === undefined) { v = tightF(B[k]); B[tk] = v === B[k] ? B[k] : v; } return v; };
  const matchB = (B, k, q) => { const P = qParse(q), h = B[k]; let ht = null; return P.ws.every(x => x.j !== undefined ? tightAt(ht || (ht = tightB(B, k)), x.j) : h.includes(x.w)) || (!!P.t && tightAt(ht || tightB(B, k), P.t)); };
  // V12.11 · Z5: «лист N» внутри диапазона из названия («лист 18» → «л.11–13,16–19») — совпадение и без цифры N в строке; остальные слова запроса — как обычно
  const listRange = (hay, qv, nc) => {
    const m = listQ(qv); if (!m || !/^\d+$/.test(m[1])) return false;
    const n = Number(m[1]); let hit = false;
    for (const { r } of hayItems(hay)) if (r.length === 2 && parseFloat(r[0]) <= n && n <= parseFloat(r[1])) { hit = true; break; }
    if (!hit) return false;
    const f = fold(lAsList(qv)), rest = (f.slice(0, m.index) + ' ' + f.slice(m.index + m[0].length)).trim();
    const B = bun(hay, nc); return !rest || matchB(B, 'f', rest) || matchB(B, 'cf', codeNormQ(rest));
  };
  const sheetMatch1 = (hay, q, nc) => { const B = bun(hay, nc); return (matchB(B, 'f', q) && listOk(hay, q)) || (matchB(B, 'cf', codeNormQ(q)) && listOk(hay, q))
    || (lAsList(q) !== String(q) && matchB(B, 'cf', codeNormQ(lAsList(q))) && listOk(hay, lAsList(q)))
    || (lGlued(q) !== String(q) && matchB(B, 'cf', codeNormQ(lAsList(lGlued(q)))) && listOk(hay, lAsList(lGlued(q))))
    || (qSheet(q) && listRange(hay, q, nc)); };   // диапазоны — только при явном номере листа; «лN» без точки (и шифр Л-N, W3) — без разворота диапазонов, как V12.10
  // V12.11 · Z4: строка записи с чипом «АС.2 л. N» — и как «АС.2 лист N» (иначе «лист N», «л.N», «Лист N» не находили запись, только «л. N»)
  const sheetMatch0 = (hay, q) => { if (sheetMatch1(hay, q)) return true; if (!qSheet(q)) return false; if (!listOk(hay, q)) return false; const hl = hayL(hay); return hl !== String(hay) && sheetMatch1(hl, q, true); };   // листа N в строке нет (кэш листов) — второй проход не нужен
  const sheetMatch = (hay, q) => sheetMatch0(hay, q) || (pdfNormQ(q) !== String(q) && sheetMatch0(pdfNormH(hay), pdfNormQ(q)));
  // номер листа из запроса: «л. 22», «л.22», «лист 22», «22»; число после «PDF» (страница) и в шифре (АС2, АС.2, ОВ1) номером листа не считается
  function sheetNum(q) {
    const t = fold(pdfNormQ(q)).replace(/pdf(?:-стр\.?)?\s*\d+/g, ' ').replace(/(^|[^a-zа-я])л\s*\.\s*(?=\d)/g, '$1лист ')
      .replace(GLN_RE, '$1$2 ');   // V12.8c: слитные «лист22», «АР5», «ГП5» — номер листа (АС2 — шифр, не номер); V12.9: и «л22»
    const nums = [...t.matchAll(/(?:^|[^a-zа-я\d.])(\d+(?:\.\d+)?[а-яa-z]?)(?![\d.])/g)].map(m => m[1]);
    return nums.length ? nums[nums.length - 1] : null;
  }
  // V12.9b: страница PDF — как в реестре (library.js pdfOf): при полях A — section_pdf_page, иначе pdf_page своего PDF; без полей A — pdf_page
  const sppOf = list => (list || []).some(v => v && 'section_pdf_page' in v);
  const pdfPageOf = (x, spp) => spp ? (x.section_pdf_page || (x.pdf_page && x.pdf_url ? x.pdf_page : null)) : (x.pdf_page || null);
  const PDF_PAGE = /PDF(?:-стр\.?)?\s*\d+/gi;   // «PDF-стр. 7», «PDF 6»
  function rankSheets(list, q) {
    const num = sheetNum(q);   // число не в составе шифра (АС2, АС.2, ОВ1); номера вида 24.1
    // V12.9 · W3: «pdf N» — страница PDF N первой; «лN» — шифр «Л-N» первым, затем лист N
    const fq = fold(q), pm = /pdf(?:-стр\.?)?\s*(\d+)/.exec(fold(pdfNormQ(q))), pdf = pm ? Number(pm[1]) : null;
    const lm = MARKS.length ? new RegExp('(?:^|[^a-zа-я])(' + MARKS.join('|') + ')-?(\\d+)(?![\\d.])').exec(fq.replace(/(^|[^a-zа-я])л\s*\.\s*\d+/g, ' ')) : null, lcode = lm ? new RegExp('(^|[^a-zа-я])' + lm[1] + '-' + lm[2] + '(?![\\d.])') : null;
    const spp = sppOf(list);
    const lead = x => (pdf != null ? (Number(pdfPageOf(x, spp)) === pdf ? 0 : 1) : 0) + (lcode ? (lcode.test(fold(x.title)) ? 0 : 2) : 0);
    const score = x => {
      const ps = fold(x.printed_sheet || '');
      if (num && ps) { if (ps === num) return 0; if (ps.startsWith(num)) return 1; if (ps.includes(num)) return 2; }
      return sheetMatch([String(x.title || '').replace(PDF_PAGE, ''), x.printed_sheet ? 'лист ' + x.printed_sheet : ''].join(' '), q) ? 3 : 4;   // 4 — совпало только по странице PDF
    };
    // V12.11 · Z7: «основание навигации по нескольким листам» (mapping_basis) — после источников этого листа с тем же счётом (только при совпадении по номеру листа, счёт 0–2) («56» → сначала «АС.2 · лист 56», затем NAV_AS2_PDF66)
    const nav = x => x.mapping_basis === 'preserved_navigation_evidence' || /основание навигации/.test(String(x.title || '')) ? 1 : 0;
    return list.map((x, i) => ({ x, i, l: lead(x), s: score(x), n: nav(x) })).sort((a, b) => a.l - b.l || a.s - b.s || (a.s <= 2 ? a.n - b.n : 0) || a.i - b.i).map(o => o.x);
  }
  /* 1.0.11: «Типы» находятся и по отображаемому имени (display_titles) записи и её частей (render_ids, scene_render_ids) — только поиск, подпись группы не меняется.
     Имя — AtlasStatus.displayTitle; на странице без atlas-status — та же проверка набора (capability display_titles_v1, schema, generation = build_id / data_slice выпуска) */
  const dispSet = () => { const P = window.ATLAS_PROJECT || {}, C = P.capabilities, d = window.__ATLAS_DISPLAY__, R = window.ATLAS_RELEASE || {}, g = R.build_id || R.data_slice; return (P.display_titles_v1 === true || (Array.isArray(C) && C.includes('display_titles_v1'))) && d && typeof d === 'object' && d.schema === 'ATLAS.display_titles/1' && g && d.generation && String(d.generation) === String(g) ? d : null; };
  const dispT = k => { if (window.AtlasStatus && window.AtlasStatus.displayTitle) return window.AtlasStatus.displayTitle(k); const d = dispSet(); if (!d || typeof k !== 'string') return null; const f = d.full && d.full[k] && typeof d.full[k].title === 'string' ? d.full[k].title : null, t = f || (d.title_only && typeof d.title_only[k] === 'string' ? d.title_only[k] : null); return t && t.trim() ? t : null; };
  const DHS = new WeakMap(), dispOf = x => { if (!window.__ATLAS_DISPLAY__ || !x || typeof x !== 'object') return []; let a = DHS.get(x); if (!a) { a = [...new Set([x.id].concat(x.render_ids || [], x.scene_render_ids || []).map(dispT).filter(Boolean))]; DHS.set(x, a); } return a; };
  async function groups(q, limit = 6) {
    q = String(q || '').trim();
    if (!q) return [];
    const out = [];
    const [rs, ts, ss] = await Promise.all([getRemarks().catch(() => []), getTypes().catch(() => []), getSheets().catch(() => [])]);
    const QV = qVariants(q), anyQ = (f, hay) => QV.some(v => f(hay, v));
    const r = rs.filter(x => anyQ(matchAll, [x.id, x.prev_id, x.what, x.sheet, x.section, (x.packages || []).join(' ')].join(' ')));
    if (r.length) out.push({ title: 'Замечания', total: r.length, more: 'RD_REMARKS.html#q=' + encodeURIComponent(q), items: r.slice(0, limit).map(x => ({ label: x.id + ' · ' + x.what, sub: (x.section || '') + ' · ' + (x.sheet || ''), href: 'RD_REMARKS.html#id=' + encodeURIComponent(x.id) })) });
    const tHay = x => [x.name, x.mark].concat(x.package_no != null ? [x.package_no, 'тип ' + x.package_no] : []).join(' '), tName = new Map();
    const t = ts.filter(x => { if (x.history_only) return false; if (anyQ(matchAll, tHay(x))) return true; const n = dispOf(x).find(v => anyQ(matchAll, v)); if (n) tName.set(x, n); return !!n; });   // К1-д: номер типа — только если есть; 1.0.11 — и по отображаемому имени записи / части
    if (t.length) out.push({ title: 'Типы', total: t.length, more: 'catalogue.html#q=' + encodeURIComponent(q), items: t.slice(0, limit).map(x => ({ label: String((window.AtlasStatus && window.AtlasStatus.displayTitle && window.AtlasStatus.displayTitle(x.id)) /* 1.0.9 */ || x.name || x.mark).replace(/[\u2300\u2205]/g, 'Ø'), sub: (x.package_no != null ? 'Тип № ' + x.package_no : (x.owner_label || '')) + (x.mark && x.mark !== x.name ? ' · ' + x.mark : '') + (tName.has(x) && tName.get(x) !== dispT(x.id) ? ' · по имени части: ' + tName.get(x) : ''), href: x.package_no != null ? 'catalogue-model.html#package/' + x.package_no : (x.viewer_key ? 'catalogue-model.html#key/' + encodeURIComponent(x.viewer_key) : null) })) });   // К1-д: без номера — владелец и ключ просмотра (как catalogue.js)
    const mr = window.AtlasRebar && window.AtlasRebar.active() ? window.AtlasRebar.search(q) : [];
    if (mr.length) out.unshift({ title: ['Армирование', ((window.ATLAS_PROJECT || {}).rebar || {}).unit].filter(Boolean).join(' '), total: mr.length, more: mr[0].href, items: mr.slice(0, limit) });
    const sp = sppOf(ss), s = rankSheets(ss.filter(x => anyQ(sheetMatch, [x.title, x.printed_sheet ? 'лист ' + x.printed_sheet : '', pdfPageOf(x, sp) ? 'pdf ' + pdfPageOf(x, sp) : ''].join(' '))), q);   // V12.10 · Y8: страница PDF записи — в строке поиска («pdf N»)
    if (s.length) out.push({ title: 'Листы', total: s.length, more: 'library.html#q=' + encodeURIComponent(q), items: s.slice(0, limit).map(x => ({ label: x.title, sub: (x.printed_sheet ? 'лист ' + x.printed_sheet : 'лист не указан') + (pdfPageOf(x, sppOf(ss)) ? ' · стр. PDF ' + pdfPageOf(x, sppOf(ss)) : ''), href: 'library.html#source=' + encodeURIComponent(x.key) })) });
    return out;
  }
  function renderGroups(host, gs, opts = {}) {
    host.replaceChildren();
    for (const g of gs) {
      const sec = S.make('section', { class: 'sg' });
      const h = S.make('h3', { class: 'sg-h' }, g.title + ' · ' + S.fmt(g.total));
      sec.append(h);
      for (const it of g.items) {
        const a = S.make('a', { class: 'sg-item', href: it.href });
        a.append(S.make('span', { class: 'sg-label' }, it.label));
        if (it.sub) a.append(S.make('span', { class: 'sg-sub' }, it.sub));
        sec.append(a);
      }
      if (g.total > g.items.length) sec.append(S.make('a', { class: 'sg-more', href: g.more }, 'Показать все ' + S.fmt(g.total) + ' →'));
      host.append(sec);
    }
    if (opts.modelLink && (window.ATLAS_RELEASE || {}).elements !== 0) { /* 1.0.1 (B2): тел на модели нет (release-info elements = 0) — строки «Искать в модели здания» нет */
      const sec = S.make('section', { class: 'sg' });
      sec.append(S.make('h3', { class: 'sg-h' }, 'Элементы'));
      const a = S.make('a', { class: 'sg-item', href: 'index.html#q=' + encodeURIComponent(opts.modelLink) });
      a.append(S.make('span', { class: 'sg-label', 'data-no-abbr': '' }, 'Искать «' + opts.modelLink + '» в модели здания →'));   // запрос пользователя — без подсказки
      sec.append(a);
      host.prepend(sec);
    }
    abbr(host);
  }
  // 1.0.19a к3 (владелец 24.10, п. 13): КС-2/КС-3, RFI, PGS в найденных строках (тексты замечаний, типов, листов) — с расшифровкой
  // в подсказке через общий assets/atlas-abbr.js (модуль C; «ТС» и марки вида «КС1» он не трогает). Нет модуля — строки как были.
  function abbr(host) {
    try {
      if (window.AtlasAbbr) { window.AtlasAbbr.apply(host); return; }
      let s = document.querySelector('script[src$="assets/atlas-abbr.js"]');
      if (!s) { s = document.createElement('script'); s.src = 'assets/atlas-abbr.js'; document.head.append(s); }
      s.addEventListener('load', () => { try { if (window.AtlasAbbr && host.isConnected) window.AtlasAbbr.apply(host); } catch (e) { /* без подсказок */ } }, { once: true });
    } catch (e) { /* без подсказок */ }
  }
  return { fold, tight, direct, groups, renderGroups, match: (h, q) => qVariants(q).some(v => sheetMatch(h, v)), rank: rankSheets, sheetOf: q => { const m = listQ(q); return m ? m[1] : null; },
   sheetRest: q => { const m = listQ(q); if (!m) return ''; return fold(lAsList(q)).split(' ').filter(w => w && w !== m[1]).join(' '); },   // слова нормализованного запроса, кроме номера листа: у всех форм «лист» («опорный лист» выше трубы)
     // V12.11: номер листа из запроса (реестр ставит точный лист первым)
    variants: q => {
    const v = new Set();
    for (const d of ['-', '‑', '‐', '–', '—', '−']) v.add(String(q).replace(DASH, d));
    v.add(String(q).replace(/([A-Za-zА-Яа-яЁё])[\s‐-―−-]+(\d)/g, '$1$2'));
    v.add(String(q).replace(/([A-Za-zА-Яа-яЁё])(\d)/g, '$1‑$2'));
    v.add(String(q).replace(/([A-Za-zА-Яа-яЁё])(\d)/g, '$1-$2'));
    v.delete(String(q));
    return [...v];
  } };
})();
