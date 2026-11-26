/* Конфиг объекта troitsk-b24 (Здание 24 ИЯИ РАН) — задание К1-A, Троицк A, 05.10.2026. Ключи — по ЯДРО_ATLAS/СХЕМА_КОНФИГА_ОБЪЕКТА.md (черновик 2; регулярки — строками pattern + flags).
   Значения воспроизводят поведение рабочей сборки V12.10 (3D_ATLAS_V10_WORK); место, откуда взято значение, — в комментарии.
   Чего нет в источниках или схема не задаёт формат — null / пусто, перечислено в ТРОИЦК_ЗАДАЧИ/СТАТУС_A.md («К1-A»). Данные и выпуск Троицка не меняются. */
window.ATLAS_PROJECT = {
  project_id: 'troitsk-b24',
  core_version: '1.4.1',                 // по схеме (план В11)
  geometry_binary_precision_v3: true,      // troitsk_mep_r1: precision v3 — блоки Codex MEP R1 (ATLAS.mesh_precision/1), ядро ≥ 1.0.7
  parts_v1: true,                          // ядро 1.0.16 · Р18: части сетей data/parts (DATA_CONTRACT §9.13), пишет troitsk_parts_v1.py
  progress: { enabled: true, project_id: 'troitsk-b24', slug: 'troitsk-building-24', server: 'pgs', units: ['м3', 'м2', 'м', 'т', 'кг', 'шт'] },   // V12.18: «Ход строительства» — как проба T17K r3 (CONFIG.md 1.0.17, DATA_CONTRACT §9.14); сервер журнала PGS
  schema_version: 1,
  // index.html:34,45 «3D Атлас · Здание 24»; atlas-shell.js / atlas-card.js «Здание 24 · ИЯИ РАН»; atlas-card.js, DOCUMENTS.html, overview.js «РД 01-2024/ИЯИ»
  title: { object: 'Здание 24 · ИЯИ РАН', code: 'РД 01-2024/ИЯИ', short: 'Здание 24', subtitle: 'Координационная модель по рабочей документации' },   // subtitle — atlas-card.js / overview.js (фрагмент B3)
  // view-settings.js (подсказка осей): «Оси 1–9 / А–К: шаг 6 м, АР л.6; в координатах исходной модели, на отметке 0»; building-axes.js: оси 1 и А — 0 м
  frame: { units: 'm', up: 'Z', origin_note: 'пересечение осей 1 и А (АР л.6), отметка 0 модели', zero_level_abs_m: null },
  camera: { center: [24, 10, 13], scale: 8, az: 1.1, el: 0.43 },             // atlas-engine.js: az=1.1, el=.43, center=[24,10,13], scale=8
  axes: {                                                                     // building-axes.js: 1–9 по X и А–К по Y через 6 м; линии от −4 до 52 м
    x: [{ label: '1', pos_m: 0 }, { label: '2', pos_m: 6 }, { label: '3', pos_m: 12 }, { label: '4', pos_m: 18 }, { label: '5', pos_m: 24 }, { label: '6', pos_m: 30 }, { label: '7', pos_m: 36 }, { label: '8', pos_m: 42 }, { label: '9', pos_m: 48 }],
    y: [{ label: 'А', pos_m: 0 }, { label: 'Б', pos_m: 6 }, { label: 'В', pos_m: 12 }, { label: 'Г', pos_m: 18 }, { label: 'Д', pos_m: 24 }, { label: 'Е', pos_m: 30 }, { label: 'Ж', pos_m: 36 }, { label: 'И', pos_m: 42 }, { label: 'К', pos_m: 48 }],
    extent_m: [-4, 52], label_text: 'Оси 1–9 / А–К', source: 'АР л.6', not_confirmed: []   // view-settings.js: «шаг 6 м, АР л.6»
  },
  levels: [                                                                   // пункт «По этажу» (atlas-toolbar.js FLOORS V12.11): label — подпись и кнопка фильтра «Уровень», sub — отметка, cut — что срезать; фильтр «Уровень» ядро строит из данных (CONFIG.md §3.2)
    { label: '1 этаж', sub: '+3,500', cut: { field: 'level', match: 'Перекрытие +3,500' } },   // срез — по низу перекрытия НАД этажом
    { label: '2 этаж', sub: '+7,100', cut: { field: 'level', match: 'Перекрытие +7,100' } },
    { label: '3 этаж', sub: '+10,700', cut: { field: 'name', match: '/^Покрытие \\+10,700/' } }   // cut L3 — регулярка по имени тела (x.name)
  ],
  scopes: null,                          // из albumScopes данных
  empty_world: null,
  files: { prefix: 'Troitsk_B24' },      // atlas-engine.js: Troitsk_B24_R21_<scope>.png, Troitsk_B24_R24_1_[HQ_]<scope>.png
  view: {                                                                    // atlas-engine.js: формат вида { schema, base }
    schema: 'troitsk-b24-view-1', base: 'R25_V8',
    // view-settings.js:13–14 — бетон по категории альбома (в названии нет слова «бетон»); для категории 'patches' — по марке МУ в названии
    concrete_categories: ['r05_mu_F1', 'r05_mu_F2', 'r10l_roof_mu_opening_envelope', 'chamber_base', 'r05_foundation'],
    mark_patterns: [{ pattern: '(^|[^A-Za-zА-Яа-я])(МУ|MU)\\s*\\d', flags: '', category: 'patches' }],   // view-settings.js V12.11: по марке МУ / MU — только в категории альбома 'patches' (ключ category — B2, утверждён координатором 05.10)
    // настройка вида, не данные РД (вырез у замечания, ядро 1.0.11; решение координатора 15.10)
    issue_crop: { steps_m: [0.75, 1.5, 3], default_m: 1.5, pair_pad_m: 0.5, max_half_m: 4, max_side_m: 8, auto: true }
  },
  storage: { prefix: 'atlas:troitsk-b24:', legacy_keys: { view: 'ATLAS_PROTOTYPE_VIEW_20260922', review: 'atlas.reviewMode' } },   // view-settings.js storageKey; atlas-shell.js REVIEW_KEY
  search: {
    // navigation-optimization-module.js atlasFold: му/п/ф → mu/p/f только перед цифрой (му12 → mu12, «музей» не трогается); ё→е, регистр, дефисы — общая нормализация ядра (atlasFoldBase, E2)
    fold_rules: [{ pattern: 'му(?=\\d)', flags: 'g', to: 'mu' }, { pattern: 'п(?=\\d)', flags: 'g', to: 'p' }, { pattern: 'ф(?=\\d)', flags: 'g', to: 'f' }],
    cipher_patterns: [],                 // в atlas-search.js шифров объекта нет (codeNorm «АС.2» → «АС2» — общее правило); «01-2024/ИЯИ-» — card.strip_prefixes
    rd_sections: [                       // atlas-search.js REMARK_ID (замечание «АС2-23» и т. п.); подпись «АС2» → «АС.2» — overview.js SEC_LABEL
      { code: 'РД', aliases: ['рд'], label: 'РД' }, { code: 'АР', aliases: ['ар'], label: 'АР' }, { code: 'АС2', aliases: ['ас2', 'АС.2'], label: 'АС.2' },
      { code: 'ВК', aliases: ['вк'], label: 'ВК' }, { code: 'НВК', aliases: ['нвк'], label: 'НВК' }, { code: 'ОВ', aliases: ['ов'], label: 'ОВ' },
      { code: 'ЭОМ', aliases: ['эом'], label: 'ЭОМ' }, { code: 'ГП', aliases: ['гп'], label: 'ГП' }, { code: 'ОДИ', aliases: ['оди'], label: 'ОДИ' }
    ],
    glued_codes: ['ар', 'гп'],           // atlas-search.js lAsList / sheetNum: слитные «АР5», «ГП5» = «… 5» (B2)
    mark_codes: ['л'],                   // atlas-search.js lGlued / rankSheets: «лN» без точки — и шифр «Л-N», и «лист N» (B2)
    aliases: {}                          // синонимов слов в V12.10 нет (catalogue.js ALIASES — старые type_id → пакет, это ID, не слова)
  },
  // atlas-card.js: cleanSource (01-2024/ИЯИ-), objGet (ALBUM2::), план чертежа («PDF альбома АС.2»). name_rules — пусто: правила имён МУ / Л-1 / ЛП
  // (monolithTitle, atlas-card.js:108–115) считают отметку и выбирают «галерея / перекрытие» — регуляркой не выражаются, в плагин troitsk_texts
  card: {
    strip_prefixes: ['01-2024/ИЯИ-'], id_prefix: 'ALBUM2::', album_pdf_label: 'PDF альбома АС.2', album_pdf_short: 'PDF АС.2',
    nominal_body_ids: ['R10L_ROOF_MU56_CONCRETE'],   // prototype.js fields(): строка «Номинальное тело МУ56 по паспорту» только у этого паспорта (B2; МУ57 под правило подходит, но в V12.11 строки нет)
    strip_codes: ['\\s*\\((?:R\\d{2}[\\w.-]*|V\\d[\\w.]*|UI\\d+)\\)', '\\b(?:R\\d{2}(?:[._-]\\d+)?(?:-local)?|V\\d+(?:\\.\\d+)*|UI\\d+|P[1-3]|Album-2|STAGE02|spec0)\\b'],   // коды этапов сборки в текстах для заказчика (atlas-card.js stripCodes)
    // L · F4-18 — правила названий (бывший monolithTitle atlas-card.js:107–115; шаблоны B3, b3_tools/K1/troitsk_config_card.js; jsc B3: 7 629 имён × 3 пути, 0 расхождений)
    name_rules: [
      { pattern: '^МУ\\s*(\\d+)\\s*·\\s*верх\\s*\\+?\\s*(4)[.,](70{0,2})$', flags: 'i', template: 'МУ {1} · галерея {elev:2,3}' },
      { pattern: '^МУ\\s*(\\d+)\\s*·\\s*верх\\s*\\+?\\s*(\\d+)[.,](\\d+)$', flags: 'i', template: 'МУ {1} · перекрытие {elev:2,3}' },
      { pattern: '^(?:Л-1\\s*\\/\\s*)?(ЛП\\s*\\d+)\\s*\\/\\s*верх\\s*\\+?\\s*(\\d+)(?:[.,](\\d+))?$', flags: 'i', template: '{1!nospace} · верх {elev:2,3}', path_add: ['Л-1'], path_add_when: '^Л-1\\s*\\/' }
    ]
  },
  catalogue: {
    type_range: [3, 2955],               // atlas-search.js: «№ N» — тип каталога при 3 ≤ N ≤ 2955
    sections: [                          // catalogue-type-card.js SECT: поле module записи каталога → раздел
      { id: 'spec0', label: 'АС.2', range: null, match: { field: 'module', pattern: '^spec0$' } },
      { id: 'spec1', label: 'ИОС4', range: null, match: { field: 'module', pattern: '^spec1$' } },
      { id: 'spec2', label: 'ВК', range: null, match: { field: 'module', pattern: '^spec2$' } },
      { id: 'spec3', label: 'ИОС3', range: null, match: { field: 'module', pattern: '^spec3$' } },
      { id: 'spec4', label: 'ЭОМ', range: null, match: { field: 'module', pattern: '^spec4$' } },
      { id: 'spec5', label: 'ЭС, ЭН', range: null, match: { field: 'module', pattern: '^spec5$' } },
      { id: 'spec6', label: 'ТХ', range: null, match: { field: 'module', pattern: '^spec6$' } },
      { id: 'spec7', label: 'АР', range: null, match: { field: 'module', pattern: '^spec7$' } },
      { id: 'spec8', label: 'УУТЭ', range: null, match: { field: 'module', pattern: '^spec8$' } },
      { id: 'spec9', label: 'НВК', range: null, match: { field: 'module', pattern: '^spec9$' } },
      { id: 'spec10', label: 'ОДИ', range: null, match: { field: 'module', pattern: '^spec10$' } },
      { id: 'spec11', label: 'ОВ.ИТП, прил. 1', range: null, match: { field: 'module', pattern: '^spec11$' } },
      { id: 'spec12', label: 'АС.1', range: null, match: { field: 'module', pattern: '^spec12$' } },
      { id: 'spec13', label: 'ВК, ИОС3, ИОС4 — демонтаж', range: null, match: { field: 'module', pattern: '^spec13$' } },
      { id: 'spec14', label: 'ГП', range: null, match: { field: 'module', pattern: '^spec14$' } }
    ],
    blocks_dir: 'provenance/stage02/data/blocks/',   // папка блоков просмотра типа (фрагмент B3)
    service_types: [3, 4, 5, 6],         // catalogue.js:14 SERVICE — служебные типы (история цепочки 3 и 4 — из history_only данных); утверждено 05.10
    original_glb_dir: 'provenance/stage02/',   // catalogue.js:85 — ссылки «Исходный GLB ↗» / «Архивный GLB ↗» ('provenance/stage02/' + original_glb); утверждено 05.10
    module_labels: { roof: 'Кровля', stair: 'Лестница Л-1', floors: 'Перекрытия · МУ34', floors_ref: 'Перекрытия · справочная ветка' },   // catalogue-view.js MODULE (фрагмент B3)
    // catalogue.js ALIASES и catalogue-view.js ALIASES: старые type_id → действующие (только для ссылок и адресов; ID в данных не меняются)
    type_aliases: {
      'CLAUDE_E1_LOCAL07_UGOLOK75_LM1_STRINGER': { package: 7 },   // пакет 7: действующего type_id нет (пуст в пакете) — ссылка ведёт на пакет 7
      'CLAUDE_E1_LOCAL1027_AS2F_Лестница_металлическая_ЛМ_1_в_сборе__тетивы_': 'CLAUDE_E1_LOCAL1027_LM_Лестница_металлическая_ЛМ_1_в_сборе___тетивы',
      'CLAUDE_E1_LOCAL1395_EOM2_Щит_силовой_навесной_на_48_модулей__ЩРн_48з_': 'CLAUDE_E1_LOCAL1395_EOM2_Щит_силовой_навесной_на_54_модуля__ЩРн_54з__'
    }
  },
  owners: [],                            // у Троицка разделов-владельцев нет
  // армирование (общий модуль): document — запись documents[] (АС.2, «АС.2, лист N»); virtual_prefixes — тела вне сцены из data/mu_rebar.js;
  // texts / kinds … — блок «Армирование и узлы» (atlas-rebar.js, фрагмент B3); spec_* / package_* / eo_* / posts_note / scope_warning — тексты движка (ключи E1)
  rebar: {
    document: 'АС.2', virtual_prefixes: ['MU_REBAR::', 'MU_DECK::', 'MU_ANGLES::'],
    scope: 'MU_REBAR', unit: 'МУ', frame: 'КР', links_source: 'mu_rebar', overlay_tree: 'Кровля', note_ref: 'прим. 9', posts_pattern: '^стойки КР',
    kinds: { deck: 'Профлист', angles: 'Уголки обрамления' }, kinds_card: { deck: 'Профнастил', angles: 'Уголки обрамления' },
    // причины по позициям (бывший WHY atlas-rebar.js, МУ 45, л. 39.3) — набор data/rebar_why.js (B3)
    texts: { section: 'Армирование МУ', block_title: 'Армирование и узлы', item_name: 'Армирование', button_title: 'Монолитные участки покрытия +10,700 по листам АС.2: ', button_suffix: ' покрытия',
      early: ' — по ранней редакции листа 38.1', overlay_aria: 'Показать армирование и узлы МУ в здании', overlay_label: 'Показать армирование и узлы МУ',
      holes_label: 'У отверстий', holes: 'по прим. 9 листа: «арматуру в пределах отверстий обрезать по месту и загнуть в тело плиты». Загиб в модели не показан.',
      eo_label: 'Отв. ЭО', eo_suffix: ' · размер в РД не задан (вопрос проектировщику)' },
    // тексты движка (atlas-engine.js; ключи — E1, 05.10; дословно V12.10, {…} — подстановки, пробелы в начале нужны); уровень и «Армирование и узлы МУ N» движок собирает из mu_rebar.section / level
    spec_deck: 'Н75-750-0,8 ГОСТ 24045-2016, ',                                                    // :23 SPEC.deck
    spec_angles_suffix: ' — уголок 75×5 ГОСТ 8509-93, С245',                                        // :26
    package_source: 'ДОРАБОТКА8_20260928/CLAUDE_E1_OUTPUT_{package}.zip',                           // :27
    package_name: 'CLAUDE_E1_OUTPUT_{package}',                                                     // :32–33
    eo_warning: ' «Отв. ЭО»: {n} шт. — размер в РД не задан, в модели условно ∅30 (вопрос проектировщику).',   // :29
    eo_label: 'Отв. ЭО', eo_prop_suffix: ', размер в РД не задан',                                  // :32
    posts_note: ' по листу 39 (в отверстиях не ставятся)',                                          // :32
    links_note: 'Связи бетон → армирование и узлы: МУ кровли (задача G.2)',                          // :67 — __ATLAS.rebarLinks().note до загрузки связей (E1, утверждено 05.10)
    scope_warning: 'Армирование и узлы МУ покрытия +10,700: {bodies} тел армирования (по одному на МУ), профлист Н75 и уголки обрамления отверстий — {count} тел. Огибающие МУ — полупрозрачно, ригели опирания — серым, для контекста. Не входят в {building} действующих тел. МУ 38, 39 — по ранней редакции АС.2, лист 38.1 (АС2-06). «Отв. ЭО» — размер в РД не задан, в модели условно ∅30 (вопрос проектировщику).'   // :370
  },
  nodes: {                               // особенности узлов (assets/atlas-nodes.js, V12.10); согласовано A и B2, утверждено координатором 05.10
    rebar_role: 'Армирование',           // :104, :272, :650, :656–662, :749–751, :848, :918, :951; prototype.js — счёт «арм. N», состав, подсказки, кнопка и вкладка «Армирование»
    role_short: { 'Бетон': 'бетон', 'Профлист': 'профлист', 'Б1': 'Б1', 'Уголки': 'уголки', 'Армирование': null, 'Прочее': 'прочее', 'Б1, тел': 'Б1, тел', 'Швеллер 27П': 'Швеллер 27П' },   // :270 ROLE_SHORT
    role_abbr: { 'Армирование': 'арм.', 'Обвязка': 'обв.', 'Покрытие': 'покр.', 'Анкеры': 'анк.', 'Уголки': 'уг.' },                      // :661 SHORT
    paged_groups: [{ type: 'win', field: 'group', label_split: ' / ', fallback: 'Окна', page: 40 }],   // :233–238 — окна по фасадам (общий PAGE = 40 — ядро)
    cross_links: [{ section: 'section:foundations', node: 'L1_Фп-1', label: 'Фп-1, Т-образная фундаментная плита Л-1', note: 'в разделе «Лестница Л-1» →' }]   // :213 FP1, :241–242
  },
  library: { nonworld_page: 'auxiliary.html' },   // library.js route(): записи ns ≠ world (local / reference / proposal / test) → auxiliary.html#key/… (B2)
  loader: { splash: 'data/overview-model.jpg' },   // 1.1.1 A1 (проба K-A): заставка под ходом загрузки — та же картинка «Обзора»
  overview: { image: 'data/overview-model.jpg' },   // изображение страницы «Обзор» (overview.js); файл объекта data/overview-model.jpg (клон C); assets/ — пространство ядра (решение координатора 05.10)
  documents: [                           // DOCUMENTS.html ALBUMS (подписи, страницы, раздел замечаний) и build/КЛЮЧИ_СБОРКИ_для_config.md от C (src — путь в данных, file — в пакете)
    { src: 'source_album/documents/AS2_last_full.pdf', file: 'albums/AS2_last_full.pdf', code: 'АС.2', title: 'Архитектурно-строительные решения', pages: 162, remarks_section: 'АС2' },
    { src: 'rd_remarks_v93/АР_полный.pdf', file: 'albums/АР_полный.pdf', code: 'АР', title: 'Архитектурные решения', pages: 146, remarks_section: 'АР' },
    { src: 'rd_remarks_v93/ВК_спецификация.pdf', file: 'albums/ВК_спецификация.pdf', code: 'ВК', title: 'Внутренние водопровод и канализация', pages: 72, remarks_section: 'ВК' },
    { src: 'rd_remarks_v93/НВК_изм1.pdf', file: 'albums/НВК_изм1.pdf', code: 'НВК', title: 'Наружные сети водопровода и канализации, изм. 1', pages: 16, remarks_section: 'НВК' },
    { src: 'source_album/01-2024_ИЯИ-ОВ.ИТП.pdf', file: 'albums/01-2024_ИЯИ-ОВ.ИТП.pdf', code: 'ОВ.ИТП', title: 'Отопление, вентиляция, тепловой пункт (скан)', pages: 222, remarks_section: 'ОВ', note: ' (группа ОВ)' },   // V12.15b шаг 9 (troitsk_ovitp_lossless.py): site_note «4 уровня серого, 150 dpi» снят — на сайте первичный PDF по частям без потерь (build/pdf_site/PDF_SITE.json)
    { src: 'source_album/УУТЭ_спецификация.pdf', file: 'albums/УУТЭ_спецификация.pdf', code: 'УУТЭ', title: 'Узел учёта тепловой энергии (скан)', pages: 41, remarks_section: null, remarks_group: 'ОВ', note: 'в группе ОВ' },
    { src: 'source_album/ОДИ_спецификация.pdf', file: 'albums/ОДИ_спецификация.pdf', code: 'ОДИ', title: 'Обеспечение доступа инвалидов (скан)', pages: 10, remarks_section: 'ОДИ' },
    { src: 'rd_remarks_v93/ГП.pdf', file: 'albums/ГП.pdf', code: 'ГП', title: 'Генеральный план', pages: 8, remarks_section: 'ГП' }
  ],
  plugins: [                             // наборы данных и текстов для общих модулей ядра, без кода (решение владельца 05.10; ОБЪЕКТЫ/troitsk-b24/ДАННЫЕ_И_ТЕКСТЫ.md)
    // global — имя глобальной переменной, которую объявляет файл (по факту файлов); pages (правило B2 / E1): нет поля — тег на всех страницах; ['index.html', …] — только на этих; [] — набор объявлен, модуль ядра грузит его сам по требованию
    { name: 'rebar', data: [{ src: 'data/mu_rebar.js', global: 'ATLAS_MU_REBAR', pages: ['index.html'] }, { src: 'data/rebar_links.js', global: 'ATLAS_REBAR_LINKS_GZIP', pages: [] }, { src: 'data/rebar_ondemand.js', global: 'ATLAS_REBAR_OD_GZIP', pages: [] }, { src: 'data/rebar_why.js', global: 'ATLAS_REBAR_WHY', pages: ['index.html'] }] },   // links / ondemand движок грузит сам по требованию
    { name: 'revisions_meta', data: [{ src: 'data/revisions_meta.js', global: 'ATLAS_REVISIONS_META', pages: ['index.html', 'library.html', 'ABOUT.html', 'catalogue.html', 'catalogue-model.html'] }] },   // тексты и параметры ревизий и слоёв (новый набор, К1)
    { name: 'revisions', data: [{ src: 'data/world_revision_config.js', global: 'AtlasWorldRevisionData', pages: ['index.html', 'library.html'] }, { src: 'data/world_revision_packed.js', global: 'AtlasWorldRevisionPacked', pages: [] }] },
    { name: 'layers', data: [{ src: 'data/world_revision_config.js', global: 'AtlasWorldRevisionData', pages: ['index.html', 'library.html'] }] },   // placedLayer
    { name: 'review_sections', data: [{ src: 'data/metadata-light.js', global: 'ATLAS_METADATA_GZIP', pages: ['index.html'] }, { src: 'data/review_sections.js', global: 'ATLAS_REVIEW_SECTIONS', pages: ['index.html'] }] },   // ДАННЫЕ_И_ТЕКСТЫ.md § 1
    { name: 'remarks', data: [{ src: 'data/rd_remarks_final.js', global: 'ATLAS_REMARKS', pages: [] }] },   // грузят atlas-data / atlas-search / atlas-issues сами
    { name: 'nodes', data: [{ src: 'data/nodes.js', global: 'ATLAS_NODES_GZIP', pages: [] }] },   // грузит atlas-nodes после первого кадра
    { name: 'source_recovery', data: [{ src: 'data/source_recovery.js', global: 'AtlasSourceRecoveryData', pages: ['index.html'] }] },   // восстановленные листы АС.2 (43 источника): прежний assets/source-recovery/registry.js, пути 31 картинки assets/source-recovery/ → data/source-recovery/ (файлы объекта — только в data/, решение координатора 05.10), остальное без изменений; runtime.js — ядро
    { name: 'unplaced', data: [{ src: 'data/unplaced.js', global: 'ATLAS_UNPLACED', pages: ['UNPLACED.html'] }] },   // «Требует решения»: 47 моделей из UNPLACED.html V12.11 (генератор B2 make_unplaced_troitsk.py)
    { name: 'progress', data: [{ src: 'data/progress_items.js', global: 'ATLAS_PROGRESS_ITEMS', pages: ['PROGRESS.html'] }, { src: 'data/progress_plan.js', global: 'ATLAS_PROGRESS_PLAN', pages: ['PROGRESS.html'] }] },   // V12.18: данные модуля — progress_items.py / progress_plan_draft.py ядра на данных после B+N; журнала нет — progress_journal.js не подключён
    { name: 'texts', data: [{ src: 'project/texts.js', global: 'ATLAS_TEXTS' }] }   // тексты объекта — на всех страницах
  ],
  status_labels: null,                   // у Троицка своих подписей статусов нет — по умолчанию ядра
  build: {                               // от C: ОБЪЕКТЫ/troitsk-b24/build/КЛЮЧИ_СБОРКИ_для_config.md (проба сборки на ядре — пакет V12.10 побайтно); читают инструменты ЯДРО_ATLAS/РАБОЧАЯ_ЯДРА_ИНСТРУМЕНТЫ/build/
    package_name: '3D_Атлас_Здание24', archive_name: '3D_Атлас_Здание24_архив', release_id_prefix: '3D_ATLAS_',
    archive_dirs: ['provenance', 'engineering', 'history_recovered', 'qa', 'qa_unified', 'tools', 'docs', 'v9_build_scripts', 'v9_source_packages',
                   'v92_source_packages', 'v93_source_packages', 'v94_source_packages', 'rev04_source_packages', 'rd_remarks_v9', 'rd_remarks_v92',
                   'rd_remarks_v93', 'rd_remarks_v94', 'source_album'],
    nested_archive_dirs: ['qa', 'tools'], archive_path_prefixes: ['assets/data-fallback/'], seed_dirs: ['rd_remarks_final/', 'provenance/stage02/data/blocks/'], keep_doc_prefixes: ['rd_remarks_final/'],
    force_include: ['data/rebar_links.js', 'data/rebar_ondemand.js', 'data/overview-model.jpg'],   // overview-model.jpg — путь берётся из конфига на лету (C)
    expect_in_source: ['rd_remarks_final', 'ABOUT.html'],
    size_targets_mb: { without_pdf: 130, with_pdf: 400 },   // отметка в отчёте сборки (цели сняты владельцем 27.09; оставлено для побайтного отчёта)
    check_pages_extra: ['auxiliary.html', 'packages/ALBUM2_AUXILIARY_RECOVERY_01/auxiliary/index.html'],
    site: {
      pdf_site_dir: 'build/pdf_site',   // копии PDF сайта (с PDF_SITE.json) — внутри объекта (клон ТРОИЦК_ЗАДАЧИ/pdf_site, 08.10); путь от папки объекта
      drawing_prefixes: ['engineering/sources/', 'source_album/', 'rd_remarks_v93/'], bucket_example: 'atlas-zdanie24'
    },
    offline: { cache_prefix: 'troitsk-r25-final-v8-', precache: ['data/source_recovery.js'] },   // service-worker.js: префикс кэша V12.11; precache — набор восстановленных листов объекта (К1, C, утверждено 05.10)
    hooks: { release_fields: 'build/release_v12_fields.py', after_package: ['build/after_package.py'] }   // after_package — шаги выпуска Троицка (скрипт ведёт C; координатор 05.10)
  },
  passport: { labels: { dwg_pdf_discrepancy: 'Расхождение DWG и PDF', R1_3_slab_channel_restoration: 'Восстановление каналов шахт в плите (R1.3 Codex)', r13_slab_channels_row: 'Проходы шахт в плите (R1.3)', r13_openings_row: 'Отверстия по собственным выноскам РД', connections_row: 'Соединения' } },   // V12.17 (Р24): подписи полей паспорта — прежде строки-патчи после литерала (troitsk_patch_group, troitsk_mep_r1)
  graphics: { smooth_render_ids: ["ALBUM2::R07_VC_C11_AN1_1", "ALBUM2::R07_VC_C11_AN1_1_W", "ALBUM2::R09L_E5_PILE_01", "ALBUM2::R10L_RM3_WASHER_01_1"],   /* 1.1.1 D1 (Codex, объект): 4 тела — гладкие нормали, геометрия и ID те же */ materials: { default: 'neutral', rules: [ { field: 'category', pattern: 'rebar|hoops|steel|fastener|profiles|plates|nut|washer|bolt|ties|rods|anchor', class: 'metal' }, { field: 'category', pattern: 'concrete|masonry|foundation|slab', class: 'concrete' }, { field: 'name', pattern: 'стекл|окн|витраж', class: 'glass' }, { field: 'name', pattern: 'грунт|песо?к|щеб|засыпк', class: 'soil' }, { field: 'name', pattern: 'бетон|ж/б|плит|кладк|МУ\\d|ростверк|сва[ия]|мембран|Техноэласт', class: 'concrete' }, { field: 'name', pattern: 'стал|арматур|болт|гайк|шайб|швеллер|уголок|двутавр|анкер|А500|А240|хомут', class: 'metal' } ] } }   // 1.1 G: гладкое освещение — только для перечисленных тел; список Троицка пока пуст (кандидаты — в ОТЧЁТ_G.md, после согласования с Codex). 1.1 G4: классы материалов — порядок = приоритет: категория записи, затем имя (слово «профил» не признак металла); иначе neutral
};

window.ATLAS_SHEET_PREVIEWS={"source_album/previews/AR_full_page_016.jpg":"source_album/previews/AR_full_page_016-w864.jpg"};
