/* 3D Атлас · режимы работы «Площадка / Технадзор / Обзор» (ядро 1.0.20, b1; §5.1 задания).
   Грузится только при AtlasShell.modesOn() (ключи progress и modes конфига объекта): тег пишет atlas-shell.js при разборе страницы
   (document.write), запасной путь — вставка <script> и пересборка шапки после загрузки. Без ключей файл не загружается и ничего не меняет.
   Режим — это вид, а не права: права записи и приёмки — по «Кто отмечает» (роль журнала) или PGS, как в 1.0.19 (§13.1).
   Выбор режима помнится на устройстве: localStorage AtlasShell.storageKey('mode'), чтение и запись — в try/catch.
   Здесь только API (LIST, current, set, mainOf, progressTab, fromRole). Вид режимов — чип, шапка, нижняя панель, строки «Ещё» — строит atlas-shell.js. */
'use strict';
(function () {
  const S = window.AtlasShell;
  if (!S || typeof S.modesOn !== 'function' || !S.modesOn() || window.AtlasModes) return;
  const LIST = Object.freeze([
    Object.freeze({ id: 'site', label: 'Площадка' }),
    Object.freeze({ id: 'supervisor', label: 'Технадзор' }),
    Object.freeze({ id: 'overview', label: 'Обзор' })
  ]);
  const IDS = LIST.map(m => m.id);
  const valid = id => IDS.indexOf(id) >= 0;
  const cfg = () => ((window.ATLAS_PROJECT || {}).modes) || {};
  const fallback = () => valid(cfg().default) ? cfg().default : 'overview';
  const KEY = S.storageKey('mode');
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const write = v => { try { localStorage.setItem(KEY, v); return true; } catch (e) { return false; } };
  // Режим без записи в хранилище (запрет хранилища) — на время страницы
  let memo = null;
  function current() {
    const v = read();
    if (valid(v)) return v;
    return valid(memo) ? memo : fallback();
  }
  function set(id, opt) {
    if (!valid(id)) return current();
    const prev = current(), by = opt && (opt.by === 'chip' || opt.by === 'role') ? opt.by : 'chip';
    memo = id;
    write(id);
    document.dispatchEvent(new CustomEvent('atlas:mode', { detail: { mode: id, prev, by } }));
    return id;
  }
  // Главные кнопки режима (§6.1): ПК — в шапке, телефон — в нижней панели (плюс «Ещё»). Остальное из шапки 1.0.19 — в «Ещё».
  const MAIN = {
    site: [{ key: 'today', label: 'Сегодня', href: 'PROGRESS.html#tab=today' }, { key: 'model', label: 'Модель', href: 'index.html' }, { key: 'docs', label: 'Чертежи', href: 'library.html' }],
    supervisor: [{ key: 'accept', label: 'Принять', href: 'PROGRESS.html#tab=accept' }, { key: 'model', label: 'Модель', href: 'index.html' }, { key: 'remarks', label: 'Замечания', href: 'RD_REMARKS.html' }],
    overview: [{ key: 'summary', label: 'Итог', href: 'PROGRESS.html#tab=summary' }, { key: 'model', label: 'Модель', href: 'index.html' }, { key: 'remarks', label: 'Замечания', href: 'RD_REMARKS.html' }]
  };
  const TAB = { site: 'today', supervisor: 'accept', overview: 'summary' };
  const mainOf = id => (MAIN[valid(id) ? id : current()] || []).map(x => Object.assign({}, x));
  const progressTab = id => TAB[valid(id) ? id : current()];
  // Заготовка (§5.1, §13.1): к серверу не подключена, на выбор режима не влияет; в 1.0.20 её вызывают только тесты.
  // Правило на будущее: выбор чипом на устройстве главнее роли сервера.
  function fromRole(role, orgRole) {
    if (role === null) return 'overview';
    if (role === 'supervisor') return 'supervisor';
    if (role === 'operator' && (orgRole === 'site_engineer' || orgRole === 'subcontractor')) return 'site';
    return null;
  }
  window.AtlasModes = Object.freeze({ LIST, current, set, mainOf, progressTab, fromRole });
})();
