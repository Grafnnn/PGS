/* Access to this release's local cache and comparison of two Atlas registers. */
'use strict';
(() => {
  const shell = window.AtlasShell;
  if (!shell?.make) return;
  const P = () => window.ATLAS_PROJECT || {};
  const engine = () => window.__ATLAS;
  const model = () => window.__FULL_ATLAS;
  const scopeURL = new URL(shell.offlineScope());
  const element = (tag, attrs, text) => shell.make(tag, attrs || {}, text);
  const sameReleaseURL = value => {
    try {
      const url = new URL(value, location.href);
      return url.protocol === scopeURL.protocol && url.host === scopeURL.host && url.pathname.startsWith(scopeURL.pathname) ? url : null;
    } catch { return null; }
  };
  const directPDF = source => window.AtlasStatus?.sourceDoc?.(source)?.href;
  function windowPanel(title) {
    const dialog = element('dialog', { class: 'release-tools' });
    const close = element('button', { type: 'button', class: 'release-tools-close', 'aria-label': 'Закрыть' }, '×');
    close.onclick = () => dialog.close();
    dialog.append(element('header'), element('section', { class: 'release-tools-body' }));
    dialog.firstChild.append(element('h2', {}, title), close);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
    return dialog.lastChild;
  }
  const row = (name, state) => {
    const item = element('li');
    item.append(element('span', {}, name), element('strong', {}, state));
    return item;
  };
  const available = (hrefs, cached) => hrefs.some(href => {
    const u = sameReleaseURL(href);
    return u && cached.has(decodeURIComponent(u.pathname));
  });
  function selectedPDFs() {
    const M = model(), o = M?.selected?.();
    if (!o) return [];
    const catalog = M.sourceAvailability();
    return [...new Set(M.sourceLinks(o).map(l => directPDF(catalog[l.key])).filter(Boolean))];
  }
  async function activeCache(cacheName) {
    if (!cacheName || !('caches' in window) || !await caches.has(cacheName)) return null;
    return caches.open(cacheName);
  }
  async function readCache(cacheName) {
    const cache = await activeCache(cacheName);
    if (!cache) return new Set();
    return new Set((await cache.keys()).map(r => sameReleaseURL(r.url))
      .filter(Boolean).map(u => decodeURIComponent(u.pathname)));
  }
  function offline() {
    const body = windowPanel('Работа без сети');
    const status = element('p', { role: 'status' });
    const list = element('ul', { class: 'release-tools-status' });
    const onFile = location.protocol === 'file:';
    const save = element('button', { type: 'button' }, 'Сохранить атлас');
    const saveSheets = element('button', { type: 'button', disabled: true }, 'Сохранить листы выбранного');
    const refresh = element('button', { type: 'button' }, 'Обновить');
    for (const button of [save, saveSheets, refresh]) button.hidden = onFile;
    body.append(status, list, element('footer'));
    body.lastChild.append(save, saveSheets, refresh);
    let inspection = 0;

    async function inspect(confirmed) {
      const attempt = ++inspection;
      try {
        const state = confirmed || await shell.offlineStatus();
        const cached = await readCache(state.cacheName), sheets = selectedPDFs();
        if (attempt !== inspection) return;
        const saved = onFile ? 'Файлы на устройстве' :
          state.ready ? 'Раздел сохранён' : 'Требуется загрузка';
        list.replaceChildren(
          row('Модель и карточки', saved),
          row('Планы', saved),
          row('Листы выбранного элемента', !sheets.length ? 'Выберите элемент с листами' :
            onFile ? sheets.length + ' в локальном пакете' : sheets.filter(h => available([h], cached)).length + ' из ' + sheets.length)
        );
        status.textContent = onFile ? 'Атлас открыт из локальной папки.' :
          state.ready ? 'Атлас сохранён для работы без сети.' :
            'Сохраните атлас перед работой без сети.';
        saveSheets.disabled = !state.ready || !sheets.length || !navigator.onLine;
      } catch {
        if (attempt !== inspection) return;
        status.textContent = 'Не удалось проверить хранилище браузера.';
        list.replaceChildren();
        saveSheets.disabled = true;
      }
    }

    function begin(message) {
      inspection++;
      for (const button of [save, saveSheets, refresh]) button.disabled = true;
      status.textContent = message;
    }
    function end() {
      save.disabled = refresh.disabled = false;
    }

    save.onclick = async () => {
      begin('Загружаем пакет атласа…');
      list.replaceChildren();
      try {
        const saved = await shell.saveOffline();
        await inspect({ ...saved, ready: true });
      } catch {
        status.textContent = 'Не удалось сохранить атлас. Проверьте сеть и свободное место.';
      } finally {
        end();
      }
    };
    refresh.onclick = () => inspect();
    saveSheets.onclick = async () => {
      const sheets = selectedPDFs();
      begin('Сохраняем связанные листы…');
      let ready = false;
      try {
        const state = await shell.offlineStatus();
        const cache = state.ready && await activeCache(state.cacheName);
        if (!cache) throw new Error('No cache');
        ready = true;
        let used = 0;
        for (const existing of await cache.keys()) {
          const cached = await cache.match(existing);
          if (!cached) continue;
          const size = Number(cached.headers.get('content-length'));
          used += size > 0 ? size : (await cached.blob()).size;
        }
        for (const href of sheets) {
          const url = sameReleaseURL(href);
          if (!url || !/\.pdf$/i.test(url.pathname)) continue;
          url.hash = ''; url.search = '';
          if (await cache.match(url)) continue;
          const response = await fetch(url, { cache: 'reload' });
          const bytes = Number(response.headers.get('content-length'));
          if (response.status !== 200 || !Number.isFinite(bytes) || bytes <= 0 || bytes > 32 * 1024 * 1024) throw new Error('Invalid PDF response');
          if (used + bytes > 64 * 1024 * 1024) throw new Error('Offline capacity limit');
          await cache.put(url, response);
          used += bytes;
        }
        await inspect(state);
      } catch {
        status.textContent = 'Часть листов не удалось сохранить. Проверьте сеть и размер файла.';
        saveSheets.disabled = !ready || !sheets.length || !navigator.onLine;
      } finally {
        end();
      }
    };
    inspect();
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = element('a', { download: name, href: url });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  const coord = value => Number.isFinite(value) ? Math.round(value * 1000) : null;
  function register() {
    const E = engine(), M = model();
    const ids = E?.scopeMembers?.(E.scope()) || [];
    const members = new Set(ids);
    const all = M?.allWorld?.() || [];
    const sources = M?.sourceAvailability?.() || {};
    const records = Object.create(null);
    for (const o of all) {
      if (members.size && !members.has(o.renderId)) continue;
      const b = o.bounds;
      if (!Array.isArray(b) || b.length !== 2 || b.some(x => !Array.isArray(x) || x.length !== 3)) continue;
      records[o.renderId] = {
        name: o.name,
        center_mm: b[0].map((x, i) => coord((x + b[1][i]) / 2)),
        size_mm: b[0].map((x, i) => coord(b[1][i] - x)),
        elevations_mm: [coord(b[0][2]), coord(b[1][2])],
        sheets: (M?.sourceLinks?.(o) || []).map(l => {
          const s = sources[l.key] || {};
          return [s.section || s.code, s.printed_sheet, s.pdf_page, s.revision].filter(x => x != null && x !== '').join('/');
        }).filter(Boolean).sort()
      };
    }
    const release = shell.release?.() || {};
    return { schema: 'atlas-register-1', project: P().project_id, release: release.revision || release.label || '', scope: E?.scope?.() || '', records };
  }
  function diffRegistry(before, after) {
    if (!before || before.schema !== after.schema || before.project !== after.project || before.scope !== after.scope ||
        !before.records || typeof before.records !== 'object' || Array.isArray(before.records)) throw new Error('Выберите реестр этого объекта и того же раздела');
    const differences = [];
    const fields = { center_mm:'Положение', size_mm:'Габарит', elevations_mm:'Отметки', sheets:'Листы' };
    for (const id of new Set([...Object.keys(before.records), ...Object.keys(after.records)])) {
      const a = Object.hasOwn(before.records, id) ? before.records[id] : null, b = after.records[id];
      if (!a || !b) { differences.push({id, name: b?.name || a?.name || id, change: a ? 'Убран' : 'Добавлен'}); continue; }
      const change = Object.keys(fields).filter(key => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map(key => fields[key]);
      if (change.length) differences.push({id, name:b.name || id, change:change.join(' · ')});
    }
    return differences;
  }
  function compare() {
    const body = windowPanel('Сверка редакций');
    const status = element('p', { role:'status' }, 'Сравниваются записи текущего раздела с реестром прежней редакции.');
    const save = element('button', {type:'button'}, 'Скачать реестр текущего раздела');
    const choose = element('input', {type:'file',accept:'.json,application/json','aria-label':'Реестр прежней редакции'});
    const table = element('ul', {class:'release-tools-status release-tools-diff'});
    body.append(status, save, choose, table);
    save.onclick = () => download([P().project_id || 'atlas', 'register', 'json'].join('.'), new Blob([JSON.stringify(register())], {type:'application/json'}));
    choose.onchange = async () => {
      const file = choose.files[0];
      if (!file) return;
      table.replaceChildren();
      try {
        if (file.size > 20*1024*1024) throw new Error('Реестр превышает 20 МБ');
        const before = JSON.parse(await file.text()), after = register(), rows = diffRegistry(before, after);
        status.textContent = rows.length ?
          'Изменилось записей: ' + rows.length.toLocaleString('ru-RU') + (rows.length > 200 ? '. Показаны первые 200.' : '') :
          'По ID, положению, габариту, отметкам и листам отличий нет.';
        table.append(...rows.slice(0, 200).map(item => row(item.name + ' · ' + item.id, item.change)));
      } catch (error) {
        status.textContent = error instanceof SyntaxError ? 'Выбранный файл не является реестром Атласа.' : error.message;
      }
    };
  }
  function mount() {
    if (!document.querySelector('#atlasOfflineStatus')) shell.addMenuItem?.({id:'atlasOfflineStatus',title:'Работа без сети',onClick:offline});
    if (document.querySelector('#canvas') && !document.querySelector('#atlasRevisionCheck')) {
      shell.addMenuItem?.({id:'atlasRevisionCheck',title:'Сверка редакций',onClick:compare});
    }
  }
  document.addEventListener('DOMContentLoaded', mount, {once:true});
  if (document.readyState !== 'loading') mount();
  window.AtlasReleaseTools = {offline, compare, register, diffRegistry};
})();
