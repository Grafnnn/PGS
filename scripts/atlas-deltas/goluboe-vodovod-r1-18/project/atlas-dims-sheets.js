// Голубое · открывает точную страницу ПД поверх текущей сцены.
(function () {
  'use strict';
  const checkedSheets = new Map([
    ['SRC:19/26-2026-ТКР|-|p37|s-#9694567370','ТКР · лист 8 · бетонные упоры'],
    ['SRC:19/26-2026-ТКР|нет в источнике|p32|s-#503e71c39f','ТКР · лист 3 · план водовода'],
    ['SRC:19/26-2026-ТКР|нет в источнике|p21|s-#0a7021c5a7','ТКР · текстовая часть · футляр'],
    ['SRC:19/26-2026-ТКР|-|p35|s-#585f9ccac7','ТКР · лист 6 · разрез КВ‑1'],
    ['SRC:19/26-2026-ТКР|нет в источнике|p38|s1#b50823d22f','ТКР · спецификация, лист 1 · гильзы'],
    ['SRC:19/26-2026-ППО|-|p18|s-#255db1ed7c','ППО · лист 5 · продольный профиль В1']
  ]);

  function resolve(key) {
    if (!checkedSheets.has(key)) return null;
    const source = window.__FULL_ATLAS?.sourceAvailability?.()?.[key];
    const result = source && window.AtlasStatus?.resolveSource(source);
    if (!result?.exact || result.kind !== 'pdf' || !result.href || !Number.isInteger(result.page) || result.page < 1) return null;
    const url = new URL(result.href, document.baseURI);
    const albums = new URL('albums/', document.baseURI);
    if (url.origin !== albums.origin || url.protocol !== albums.protocol || !url.pathname.startsWith(albums.pathname) ||
        !url.pathname.toLowerCase().endsWith('.pdf') || url.hash !== '#page=' + result.page) return null;
    const volume = key.includes('ППО|') ? 'ppo' : 'tkr';
    const preview = 'project/atlas-dims-sheets/' + volume + '-' + result.page + '.png';
    return {href: url.href, page: result.page, title: checkedSheets.get(key), preview};
  }

  function insertStyles() {
    if (document.getElementById('pdDimSheetStyle')) return;
    const style = document.createElement('link');
    style.id = 'pdDimSheetStyle';
    style.rel = 'stylesheet';
    style.href = 'project/atlas-dims-sheets.css';
    document.head.append(style);
  }

  function open(key) {
    const file = resolve(key);
    if (!file || typeof HTMLDialogElement !== 'function') return false;
    document.getElementById('pdDimSheet')?.close();
    const previousFocus = document.activeElement;
    insertStyles();
    const dialog = document.createElement('dialog');
    dialog.id = 'pdDimSheet';
    dialog.className = 'pd-dim-sheet';
    dialog.setAttribute('aria-labelledby','pdDimSheetTitle');
    dialog.innerHTML = '<div class="pd-dim-sheet-heading"><div><strong id="pdDimSheetTitle"></strong><small></small></div>' +
      '<button type="button" aria-label="Вернуться к модели">К модели</button></div>' +
      '<div class="pd-dim-sheet-scroll"><img alt=""></div>' +
      '<div class="pd-dim-sheet-actions"><button type="button" id="pdDimSheetZoom" aria-pressed="false">Увеличить</button>' +
      '<a target="_blank" rel="noopener">Открыть PDF на странице ' + file.page + ' ↗</a></div>';
    dialog.querySelector('strong').textContent = file.title;
    dialog.querySelector('small').textContent = 'Страница ' + file.page + ' исходного PDF';
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.querySelector('a').href = file.href;
    const image = dialog.querySelector('img');
    image.src = file.preview;
    image.alt = file.title + ', страница PDF ' + file.page;
    const zoom = dialog.querySelector('#pdDimSheetZoom');
    zoom.addEventListener('click', () => {
      const enlarged = dialog.classList.toggle('pd-dim-sheet-enlarged');
      zoom.setAttribute('aria-pressed', String(enlarged));
      zoom.textContent = enlarged ? 'Уместить' : 'Увеличить';
    });
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('close', () => {
      dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({preventScroll:true});
    }, {once:true});
    document.body.append(dialog);
    dialog.showModal();
    return true;
  }

  window.AtlasSheets = {open, resolve};
})();
