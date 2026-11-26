/* 3D Атлас · Планы, листы и реестр поверх действующей сцены. */
(() => {
  'use strict';

  const cfg = { ...document.currentScript?.dataset };
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const btn = (text, fn, cls = 'aws-button') => {
    const node = el('button', cls, text);
    node.type = 'button';
    node.addEventListener('click', fn);
    return node;
  };
  const link = (text, href, cls = 'aws-text-link') => {
    const node = el('a', cls, text);
    node.href = href;
    return node;
  };
  const P = () => window.ATLAS_PROJECT || {};
  const A = () => window.__ATLAS;
  const F = () => window.__FULL_ATLAS;
  const parameters = () => new URL(location.href).searchParams;
  const norm = term => String(term ?? '').normalize('NFKC').toLocaleLowerCase('ru')
    .replace(/ё/g, 'е').replace(/[‐‑–—−]/g, '-').trim();
  const fmt = value => Number(value).toLocaleString('ru-RU');
  const tabs = [
    { key: 'overview', label: 'Обзор', href: 'OVERVIEW.html', icon: 'overview' },
    { key: 'model', label: 'Модель', href: 'index.html', icon: 'model' },
    { key: 'plans', label: 'Планы', href: cfg.plansHref || 'index.html?aws=plans', icon: 'layers' },
    { key: 'drawings', label: 'Чертежи', href: 'index.html?aws=drawings', icon: 'drawings' },
    { key: 'registry', label: 'Реестр', href: 'index.html?aws=registry', icon: 'catalogue' }
  ];
  const registerTabs = [
    ['elements', 'Элементы', 'catalogue-model.html'],
    ['specification', 'Спецификация', cfg.specHref || 'catalogue.html'],
    ['remarks', 'Замечания', 'RD_REMARKS.html']
  ];
  const modelPage = () => document.body?.dataset.nav === 'model' && !!document.getElementById('canvas');
  const store = () => 'atlas:' + (P().project_id || location.pathname) + ':workspace:last-view';
  const tabsOnPhone = new Set(['model', 'plans', 'drawings']);
  const scriptLoads = new Map();
  const decodedData = new Map();
  const registryFilters = new Map();

  let active = 'model';
  let sceneMode = 'model';
  let planCamera = null;
  let regTab = 'elements';
  let previousPane = 'model';
  let selectedSheet = null;
  let searchFocus = null;
  let pane, head, heading, headMeta, body, returnButton;

  function ownURL(raw, base = './') {
    if (typeof raw !== 'string' || !raw) return null;
    try {
      const root = new URL('./', document.baseURI);
      const url = new URL(raw, new URL(base, root));
      if (url.protocol !== root.protocol || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
      return url;
    } catch { return null; }
  }

  async function data(global, path) {
    if (!global) return null;
    if (window[global]) return decode(global);
    const src = ownURL(path);
    if (!src || !src.pathname.endsWith('.js')) return null;
    if (!scriptLoads.has(src.href)) {
      scriptLoads.set(src.href, new Promise(resolve => {
        const script = el('script');
        script.async = true;
        script.src = src.href;
        script.onload = resolve;
        script.onerror = () => {
          scriptLoads.delete(src.href);
          script.remove();
          resolve(null);
        };
        document.head.append(script);
      }));
    }
    await scriptLoads.get(src.href);
    return decode(global);
  }

  function decode(global) {
    const packed = window[global];
    if (typeof packed !== 'string') return packed || null;
    if (!decodedData.has(global)) {
      decodedData.set(global, (async () => {
        const bytes = Uint8Array.from(atob(packed), value => value.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).json();
      })().catch(() => null));
    }
    return decodedData.get(global);
  }

  function lastView() {
    try {
      const code = localStorage.getItem(store());
      return code && window.AtlasViewLink?.decode ? (window.AtlasViewLink.decode(code) ? code : null) : code;
    } catch { return null; }
  }

  function saveView() {
    if (sceneMode === 'plans' || !A()?.ready?.() || !window.AtlasViewLink?.encode) return;
    try {
      const capture = A().capture();
      capture.dims = window.AtlasDims?.code?.() || '';
      const encoded = window.AtlasViewLink.encode(capture);
      if (encoded) localStorage.setItem(store(), encoded);
    } catch { /* Может быть недоступно в приватном режиме. */ }
  }

  function updateOverview() {
    if (document.body.dataset.nav !== 'overview') return;
    const command = document.getElementById('ovOpen');
    const code = lastView();
    if (command && code && /^[A-Za-z0-9_-]{1,12000}$/.test(code)) {
      command.href = 'index.html#view=' + code;
      const text = [...command.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (text) text.textContent = 'Продолжить с последнего вида';
      const scene = document.getElementById('ovScene');
      if (scene) scene.href = command.href;
    }
  }

  function sourceFor(o) {
    const record = o?.albumRecord;
    const links = F()?.sourceLinks?.(o) ?? record?.sources ?? [];
    const sources = F()?.sourceAvailability?.() || {};
    for (const key of [...new Set([...links, ...(record?.sources || [])].map(item => item.key).filter(Boolean))]) {
      const known = window.AtlasSheets?.resolve?.(key);
      const source = sources[key];
      const info = source && window.AtlasStatus?.resolveSource?.(source);
      const href = known?.href || (info?.kind === 'pdf' && info.exact === true ? info.href : source?.pdf_url);
      const sheet = href && sheetFromURL(href, {
        title: known?.title || source?.title || info?.title, sheet: info?.sheet || source?.printed_sheet,
        code: info?.code || source?.section, preview: known?.preview || source?.image_preview || source?.image,
        revision: source?.revision
      });
      if (sheet) return sheet;
      const image = ownURL(known?.preview || source?.image_preview || source?.image);
      if (image && /\.(?:jpe?g|png|webp)$/i.test(image.pathname)) {
        return { kind: 'image', href: image.href, preview: image.href, title: source?.title, sheet: source?.printed_sheet, code: source?.section, revision: source?.revision };
      }
    }
    return null;
  }

  function sheetFromURL(href, details = {}, base) {
    let mapped;
    try { mapped = window.AtlasPackageLinks?.map?.(href); } catch { /* Локальная ссылка. */ }
    if (mapped?.arc) return null;
    const url = ownURL(mapped?.href || href, base);
    const page = Number(new URLSearchParams(url?.hash.slice(1)).get('page'));
    if (!url || !/\.pdf$/i.test(url.pathname) || !Number.isInteger(page) || page < 1) return null;
    return { ...details, href: url.href, page, kind: 'pdf' };
  }

  function sheetHref(file, page, base) {
    const url = ownURL(file, base);
    if (!url) return null;
    url.hash = 'page=' + page;
    return url.href;
  }

  function enterModel(id) {
    show('model');
    if (window.__R24?.jump) return window.__R24.jump(id);
    if (A()?.select?.(id, { quiet: true })) A().focus?.(id);
  }

  function addPane() {
    if (pane) return;
    pane = el('section', 'aws-pane');
    pane.id = 'atlasWorkspacePane';
    pane.hidden = true;
    pane.setAttribute('aria-labelledby', 'atlasWorkspaceTitle');
    head = el('header', 'aws-pane-head');
    const titles = el('div');
    heading = el('h2');
    heading.id = 'atlasWorkspaceTitle';
    heading.tabIndex = -1;
    headMeta = el('p', 'aws-pane-meta');
    titles.append(heading, headMeta);
    returnButton = btn('К модели', () => {
      if (active === 'drawings' && previousPane === 'registry') show('registry');
      else show(sceneMode);
      searchFocus?.focus?.({ preventScroll: true });
    }, 'aws-button aws-close');
    head.append(titles, returnButton);
    body = el('div', 'aws-pane-body');
    pane.append(head, body);
    document.body.append(pane);
    pane.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      returnButton.click();
    });
  }

  function updateNav() {
    const native = document.body.dataset.nav;
    const key = native === 'overview' ? 'overview'
      : native === 'docs' ? 'drawings'
      : native === 'remarks' || native === 'catalogue' ? 'registry' : modelPage() ? active : native;
    document.querySelectorAll('[data-aws-page]').forEach(node => {
      if (node.dataset.awsPage === key) node.setAttribute('aria-current', 'page');
      else node.removeAttribute('aria-current');
    });
  }

  function writeRoute(next) {
    const url = new URL(location.href);
    if (next === 'model') {
      url.searchParams.delete('aws');
      if (url.searchParams.get('pdPlan') === '1') url.searchParams.delete('pdPlan');
    }
    else url.searchParams.set('aws', next);
    if (next === 'registry' && regTab !== 'elements') url.searchParams.set('awsTab', regTab);
    else url.searchParams.delete('awsTab');
    if (next !== 'drawings') {
      url.searchParams.delete('awsVolume');
      url.searchParams.delete('awsPage');
    }
    try { history.replaceState(history.state, '', url.href); } catch { /* file:// */ }
  }

  function show(next, options = {}) {
    if (!modelPage() || !A()) return;
    const prior = active;
    active = next;
    if (next === 'model' || next === 'plans') sceneMode = next;
    if (options.from) searchFocus = options.from;
    if (next === 'model' && prior !== 'model') {
      if (planCamera) A().setCamera(planCamera);
      else if (Math.abs((A().capture?.()?.camera?.el ?? 0) - Math.PI / 2) < 0.001)
        document.querySelector('[data-view="iso"]')?.click();
      planCamera = null;
    } else if (next === 'plans' && prior !== 'plans' && !planCamera) {
      const camera = A().capture?.()?.camera;
      if (camera && Math.abs(camera.el - Math.PI / 2) > 0.001) {
        planCamera = camera;
        document.querySelector('[data-view="plan"]')?.click();
      }
    }
    if (next === 'drawings' || next === 'registry') {
      addPane();
      pane.dataset.page = next;
      pane.hidden = false;
      heading.textContent = next === 'drawings' ? 'Чертежи' : 'Реестр';
      const projectEdition = window.ATLAS_RELEASE || {};
      headMeta.textContent = [projectEdition.release_label, projectEdition.date_label ? 'ред. ' + projectEdition.date_label : ''].filter(Boolean).join(' · ');
      returnButton.textContent = next === 'drawings' && previousPane === 'registry' ? 'К реестру' : sceneMode === 'plans' ? 'К плану' : 'К модели';
      if (next === 'drawings') renderDrawings(options.sheet);
      else renderRegistry();
      if (options.focus !== false) heading.focus({ preventScroll: true });
    } else if (pane) {
      pane.hidden = true;
      body.replaceChildren();
    }
    document.body.dataset.atlasWorkspace = next;
    updateNav();
    if (!options.fromURL) writeRoute(next);
    if (next === 'model') saveView();
  }

  function navigate(event, tab, node) {
    if (event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || !modelPage() || !A()) return;
    if (tab.key === 'overview') { saveView(); return; }
    event.preventDefault();
    if (tab.key === 'drawings') previousPane = 'model';
    show(tab.key, { from: node });
  }

  function navLink(tab, mobile) {
    const node = link(tab.label, tab.href, mobile ? 'as-tab aws-tab' : 'as-link aws-nav-link');
    node.dataset.awsPage = tab.key;
    if (mobile && window.AtlasShell?.icon) node.insertAdjacentHTML('afterbegin', window.AtlasShell.icon(tab.icon, 'icon--24'));
    node.addEventListener('click', event => navigate(event, tab, node));
    return node;
  }

  function installNav() {
    const nav = document.querySelector('header.atlas-shell > .as-nav');
    const phone = document.querySelector('body > nav.as-tabbar');
    if (!nav || !phone) return;
    if (!nav.querySelector('.aws-nav-link')) {
      const before = nav.querySelector('.as-more');
      for (const tab of tabs) nav.insertBefore(navLink(tab, false), before);
      const more = nav.querySelector('#asMoreMenu');
      if (more) {
        for (const tab of [tabs.at(-1), tabs[0]]) {
          const node = link(tab.label, tab.href, 'as-mi aws-more-entry');
          node.dataset.awsPage = tab.key;
          node.setAttribute('data-phone-only', '');
          node.addEventListener('click', event => navigate(event, tab, node));
          more.prepend(node);
        }
        if (modelPage()) {
          const archive = link('Все альбомы', cfg.drawingsHref || 'library.html', 'as-mi aws-more-entry');
          more.append(archive);
        }
      }
    }
    if (!phone.querySelector('.aws-tab')) {
      const more = phone.querySelector('button.as-tab');
      for (const tab of tabs.filter(item => tabsOnPhone.has(item.key))) phone.insertBefore(navLink(tab, true), more);
    }
    document.body.classList.add('aws-ready');
    updateOverview();
    updateNav();
  }

  function searchField(label, placeholder, onInput) {
    const input = el('input', 'aws-filter');
    input.type = 'search';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', label);
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function preview(container, selected) {
    container.replaceChildren();
    if (!selected) {
      container.append(el('p', 'aws-empty', 'Выберите лист в дереве, чтобы открыть его рядом с моделью.'));
      return;
    }
    const top = el('div', 'aws-sheet-head');
    const label = el('div');
    label.append(el('strong', null, selected.title || 'Лист проекта'));
    const details = [selected.code, selected.sheet ? 'лист ' + selected.sheet : '', selected.kind === 'pdf' ? 'PDF · с. ' + selected.page : 'Изображение источника'];
    if (selected.kind === 'pdf' && selected.originalPage && selected.originalPage !== selected.page) details.push('исходная с. ' + selected.originalPage);
    if (selected.revision && !/нет в источнике/i.test(selected.revision)) details.push(String(selected.revision));
    label.append(el('small', 'aws-muted', details.filter(Boolean).join(' · ')));
    const download = link(selected.kind === 'pdf' ? 'Открыть PDF' : 'Открыть изображение', selected.href, 'aws-button');
    download.target = '_blank';
    download.rel = 'noopener';
    top.append(label, download);
    container.append(top);
    const imageURL = ownURL(selected.preview);
    if (imageURL) {
      const image = el('img', 'aws-preview-image');
      image.alt = [selected.title, selected.kind === 'pdf' ? 'страница PDF ' + selected.page : null].filter(Boolean).join(', ');
      image.src = imageURL.href;
      image.addEventListener('error', () => {
        if (selected.kind === 'pdf') image.replaceWith(pdfFrame(selected));
        else image.replaceWith(el('p', 'aws-empty', 'Изображение не загрузилось.'));
      }, { once: true });
      container.append(image);
    } else container.append(pdfFrame(selected));
  }

  function pdfFrame(selected) {
    const frame = el('iframe', 'aws-pdf');
    frame.src = selected.href;
    frame.title = [selected.title, 'страница PDF ' + selected.page].filter(Boolean).join(', ');
    return frame;
  }

  function samePDF(left, right) {
    if (!left || !right) return false;
    try { return decodeURIComponent(left) === decodeURIComponent(right); }
    catch { return left === right; }
  }

  function renderDrawings(initial) {
    const tree = el('div', 'aws-tree');
    const details = el('aside', 'aws-sheet');
    const column = el('div', 'aws-tree-col');
    const matches = el('p', 'aws-result-count');
    matches.setAttribute('aria-live', 'polite');
    const loadTime = el('p', 'aws-muted', 'Загружаем содержание альбомов…');
    const archive = link('Альбомы проекта', cfg.drawingsHref || 'library.html');
    let volumes = [];
    let chosen = initial || selectedSheet;
    let activeButton;
    const select = (sheet, button, scroll = false) => {
      chosen = selectedSheet = sheet;
      if (activeButton) activeButton.removeAttribute('aria-current');
      if (button) {
        button.setAttribute('aria-current', 'true');
        activeButton = button;
      }
      details.classList.toggle('aws-sheet-selected', !!sheet);
      preview(details, sheet);
      if (scroll && matchMedia('(max-width: 1000px)').matches) details.scrollIntoView({ block: 'start' });
    };
    const search = searchField('Поиск по чертежам', 'Номер листа, название или шифр', draw);
    const tools = el('div', 'aws-tools');
    tools.append(search, archive);
    column.append(tools, matches, tree);
    const split = el('div', 'aws-drawings');
    split.append(column, details);
    tree.append(loadTime);
    body.replaceChildren(split);
    select(chosen);
    function draw(term = search.value) {
      const normalized = norm(term);
      let pageNumber = null, printed = null;
      const tokens = normalized.replace(/(?:pdf|страница|стр\.?)\s*(\d+)/g, (_, n) => { pageNumber = +n; return ''; })
        .replace(/(?:лист|л\.)\s*(\d+(?:[.,]\d+)?)/g, (_, n) => { printed = n.replace(',', '.'); return ''; }).split(/\s+/).filter(Boolean);
      let count = 0;
      const bookList = [];
      for (const volume of volumes) {
        const book = el('details', 'aws-book');
        book.append(el('summary', null, [volume.code, volume.title].filter(Boolean).join(' · ')));
        const groups = new Map();
        for (const page of volume.pages) {
          if (pageNumber !== null && page.page !== pageNumber && page.originalPage !== pageNumber ||
              printed !== null && ![page.sheet, ...(page.sheetAliases || [])].some(value => String(value).replace(',', '.') === printed)) continue;
          const hay = norm([volume.code, volume.title, page.title, page.group, page.terms, page.page, page.sheet].join(' '));
          if (!tokens.every(token => hay.includes(token))) continue;
          const href = page.href || sheetHref(volume.file, page.page, volume.base);
          const props = { code: volume.code, title: page.title, sheet: page.sheet, preview: page.preview, originalPage: page.originalPage, revision: page.revision || volume.revision };
          const image = page.kind === 'image' ? ownURL(href, volume.base) : null;
          const sheet = image ? { ...props, kind: 'image', href: image.href, preview: image.href } : sheetFromURL(href, props, page.href ? volume.base : undefined);
          if (!sheet) continue;
          const groupName = page.group || 'Листы';
          if (!groups.has(groupName)) {
            const group = el('details', 'aws-sheet-group');
            group.append(el('summary', null, groupName));
            groups.set(groupName, group);
            book.append(group);
          }
          const group = groups.get(groupName);
          const button = btn(page.title, () => {
            const known = Object.keys(F()?.sourceAvailability?.() || {}).map(key => window.AtlasSheets?.resolve?.(key)).find(item => samePDF(item?.href, sheet.href));
            if (known?.preview) sheet.preview = known.preview;
            select(sheet, button, true);
          }, 'aws-tree-leaf');
          button.append(el('small', 'aws-muted', [page.sheet ? 'Лист ' + page.sheet : '', page.kind === 'image' ? 'Изображение' : 'PDF ' + (page.originalPage || page.page)].filter(Boolean).join(' · ')));
          const isChosen = samePDF(sheet.href, chosen?.href);
          if (normalized || isChosen) { book.open = true; group.open = true; }
          if (isChosen) {
            button.setAttribute('aria-current', 'true');
            activeButton = button;
          }
          group.append(button);
          count++;
        }
        if (groups.size) bookList.push(book);
      }
      if (!bookList.length) bookList.push(el('p', 'aws-empty', 'Листы по этому запросу не найдены.'));
      tree.replaceChildren(...bookList);
      matches.textContent = 'Найдено листов · ' + fmt(count);
    }
    void data(cfg.drawingsGlobal, cfg.drawingsSrc).then(dataset => {
      if (!split.isConnected) return;
      if (dataset?.volumes?.length) {
        const base = cfg.drawingsBase || 'project/';
        volumes = dataset.volumes.map(volume => ({ ...volume, base }));
        if (dataset.supplement?.file && Number.isInteger(dataset.supplement.pages) && dataset.supplement.pages > 0) {
          const { title, file, pages } = dataset.supplement;
          volumes.push({ title, file, base, pages: Array.from({ length: pages }, (_, i) => ({ page: i + 1, title: 'Страница ' + (i + 1) })) });
        }
      } else {
        const groups = new Map();
        for (const source of Object.values(F()?.sourceAvailability?.() || {})) {
          const resolved = window.AtlasStatus?.resolveSource?.(source);
          const href = resolved?.kind === 'pdf' && resolved.exact ? resolved.href : source.pdf_url;
          const sheet = sheetFromURL(href, { title: source.title, code: resolved?.code || source.section, sheet: source.printed_sheet, revision: source.revision });
          if (!sheet) continue;
          const url = new URL(sheet.href);
          url.hash = '';
          if (!groups.has(url.href)) groups.set(url.href, { code: sheet.code, title: resolved?.title || source.title, file: url.href, pages: [] });
          const pages = groups.get(url.href).pages;
          if (!pages.some(page => page.page === sheet.page)) pages.push(sheet);
        }
        volumes = [...groups.values()];
      }
      draw();
    });
  }

  function relation(sheet, model, old) {
    const actions = el('div', 'aws-relations');
    const actual = model && A()?.get?.(model)?.renderId;
    if (actual) actions.append(btn('В модели', () => enterModel(actual), 'aws-text-button'));
    if (sheet) actions.append(btn(sheet.page ? 'Лист · с. ' + sheet.page : 'Изображение листа', () => {
      previousPane = 'registry';
      show('drawings', { sheet });
    }, 'aws-text-button'));
    if (old) actions.append(link(old.label, old.href));
    return actions;
  }

  function renderRegistry() {
    const nav = el('div', 'aws-register-tabs');
    nav.setAttribute('role', 'group');
    nav.setAttribute('aria-label', 'Разделы реестра');
    for (const [key, label] of registerTabs) {
      const tab = btn(label, () => {
        regTab = key;
        writeRoute('registry');
        renderRegistry();
        body.querySelector('.aws-register-tabs [aria-pressed="true"]')?.focus();
      }, 'aws-button');
      tab.setAttribute('aria-pressed', String(key === regTab));
      nav.append(tab);
    }
    const current = regTab;
    const saved = registryFilters.get(current) || {};
    const slot = el('div', 'aws-reg-list');
    const footer = el('div', 'aws-pages');
    const count = el('p', 'aws-result-count');
    count.setAttribute('aria-live', 'polite');
    const old = registerTabs.find(item => item[0] === current)[2];
    const tools = el('div', 'aws-tools');
    const filter = el('select', 'aws-filter aws-filter-category');
    const byGroup = current === 'specification';
    const whole = byGroup ? 'Все ведомости' : 'Все статусы';
    filter.setAttribute('aria-label', byGroup ? 'Ведомость' : 'Статус');
    filter.append(new Option(whole, ''));
    filter.addEventListener('change', () => { offset = 0; draw(); });
    const field = searchField('Поиск по реестру', 'Название, марка, позиция или ID', () => {
      offset = 0;
      draw();
    });
    field.value = saved.term || '';
    tools.append(field, filter, link('Открыть полный раздел', old));
    body.replaceChildren(nav, tools, count, slot, footer);
    let dataRows = [];
    let offset = saved.offset || 0;
    const rowCount = 45;
    function draw() {
      const tokens = norm(field.value).split(/\s+/).filter(Boolean);
      const matches = dataRows.filter(row => (!filter.value || row.filter === filter.value) && tokens.every(token => row.index.includes(token)));
      if (offset >= matches.length) offset = 0;
      const visible = matches.slice(offset, offset + rowCount);
      registryFilters.set(current, { term: field.value, filter: filter.value, offset });
      count.textContent = matches.length > rowCount ? fmt(offset + 1) + '–' + fmt(offset + visible.length) + ' из ' + fmt(matches.length)
        : 'Найдено · ' + fmt(matches.length);
      if (!visible.length) {
        slot.replaceChildren(el('p', 'aws-empty', 'Записей по этому запросу нет.'));
      } else {
        const table = el('table', 'aws-table');
        const columns = el('tr');
        for (const title of ['Наименование', 'Марка', 'Поз.', 'Статус', 'Источник и модель']) {
          const field = el('th', null, title);
          field.scope = 'col';
          columns.append(field);
        }
        table.createTHead().append(columns);
        const rows = table.createTBody();
        for (const row of visible) {
          const tr = rows.insertRow();
          const title = tr.insertCell();
          title.append(el('strong', null, row.name));
          if (row.detail) title.append(el('small', 'aws-muted', row.detail));
          for (const [name, value] of [['Марка', row.mark], ['Поз.', row.position], ['Статус', row.status]]) {
            const cell = tr.insertCell();
            cell.dataset.label = name;
            cell.toggleAttribute('data-empty', !value);
            cell.textContent = value || '—';
          }
          tr.insertCell().append(relation(row.sheet?.(), row.model, row.old));
        }
        slot.replaceChildren(table);
      }
      footer.replaceChildren();
      if (matches.length > rowCount) {
        const back = btn('Назад', () => { offset -= rowCount; draw(); });
        const next = btn('Дальше', () => { offset += rowCount; draw(); });
        back.disabled = offset === 0;
        next.disabled = offset + rowCount >= matches.length;
        footer.append(back, next);
      }
    }
    const update = rows => {
      if (!slot.isConnected) return;
      dataRows = rows.map(row => ({ ...row, filter: row.filter || row.status, index: norm([row.name, row.detail, row.mark, row.position, row.status].filter(Boolean).join(' ')) }));
      const choices = [...new Set(dataRows.map(row => row.filter).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'ru'));
      filter.replaceChildren(new Option(whole, ''), ...choices.map(value => new Option(value, value)));
      if (choices.includes(saved.filter)) filter.value = saved.filter;
      filter.hidden = choices.length < 2;
      draw();
    };
    if (current === 'elements') {
      update((F()?.allWorld?.() || []).filter(o => o.albumRecord?.bucket === 'active' || o.albumRecord?.bucket === undefined).map(o => ({
        name: window.atlasDisplayName?.(o) || o.name,
        detail: o.id,
        mark: o.albumRecord?.mark || null, position: o.albumRecord?.position ?? null,
        status: window.AtlasStatus?.label?.(o.albumRecord?.status?.readiness) || '',
        model: o.renderId, sheet: () => sourceFor(o)
      })));
    } else if (current === 'specification') {
      slot.append(el('p', 'aws-muted', 'Загружаем спецификацию…'));
      void data(cfg.specGlobal, cfg.specSrc).then(spec => update((spec?.rows || []).map(row => {
        const path = spec.albums?.[row.doc];
        const placed = row.places?.[0]?.[1];
        const place = ownURL(placed || row.link?.[1], 'project/');
        return {
          name: row.name, detail: [row.group, row.detail].filter(Boolean).join(' · '), mark: row.mark,
          position: row.displayPos ?? row.pos, filter: row.group, model: row.model,
          status: row.status || (row.checkOnly ? 'Требует уточнения' : row.qty ? [row.qty, row.unit].filter(Boolean).join(' ') : 'Количество не указано'),
          sheet: () => {
            if (row.sheetHref) return sheetFromURL(row.sheetHref, { code: row.doc, title: row.sheet, originalPage: row.originalPage, preview: row.preview });
            if (row.model) return sourceFor(A()?.get?.(row.model));
            return path ? sheetFromURL(sheetHref('albums/' + encodeURIComponent(path), row.page), { code: row.doc, title: row.sheet }) : null;
          },
          old: row.catalogueHref && ownURL(row.catalogueHref) ? { label: 'Тип в каталоге', href: row.catalogueHref }
            : place ? { label: 'Привязка', href: place.href } : null
        };
      })));
    } else {
      slot.append(el('p', 'aws-muted', 'Загружаем замечания…'));
      const remarks = window.ATLAS_REMARKS ? Promise.resolve(window.ATLAS_REMARKS) : window.AtlasData?.load?.('remarks');
      void Promise.resolve(remarks).catch(() => null).then(result => update((result?.items || []).map(row => ({
        name: row.what, detail: [row.section_code, row.category].filter(Boolean).join(' · '),
        position: row.id, status: [row.significance, row.status].filter(Boolean).join(' · '), filter: row.significance,
        model: row.building_links?.find(item => A()?.has?.(item.id))?.id,
        sheet: () => (row.sheet_links || []).map(item => sheetFromURL(item.href, { code: row.section_code, title: item.title })).find(Boolean),
        old: { label: 'Замечание', href: 'RD_REMARKS.html#id=' + encodeURIComponent(row.id) }
      }))));
    }
  }

  function initModel() {
    if (!modelPage() || !A() || initModel.done) return;
    initModel.done = true;
    const params = parameters();
    const route = params.get('aws') || (params.get('pdPlan') === '1' ? 'plans' : 'model');
    if (registerTabs.some(item => item[0] === params.get('awsTab'))) regTab = params.get('awsTab');
    if (['plans', 'drawings', 'registry'].includes(route)) {
      void A().whenReady().then(() => show(route, { fromURL: true, focus: false }));
    }
    if (cfg.profile) {
      const href = ownURL(cfg.profile);
      if (href && !document.querySelector('.aws-plan-profile')) {
        const profile = link('Профиль трассы', href.href, 'aws-button aws-plan-profile');
        document.querySelector('main.shell .stage')?.append(profile);
      }
    }
    addEventListener('pagehide', saveView);
  }

  function boot() {
    if (!document.body) return;
    installNav();
    const observer = new MutationObserver(installNav);
    observer.observe(document.body, { childList: true });
    document.addEventListener('atlas:ready', initModel, { once: true });
    initModel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
  window.AtlasWorkspace = { show, current: () => active };
})();
