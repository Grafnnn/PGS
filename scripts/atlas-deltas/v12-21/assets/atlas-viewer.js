/* 3D Атлас · единый просмотрщик чертежей (V11.1, п. 4) для окна на главной и для library.html.
   Один набор кнопок в одном порядке: «Закрыть · − · + · Вписать · Открыть PDF ↗», подпись под панелью,
   «← Назад к …» при переходе из замечания, щипок и перетаскивание внутри листа, фокус заперт и возвращается.
   Обработчики кнопок остаются прежними (движок на главной, library.js в чертежах) — здесь только общий вид и поведение окна. */
'use strict';
window.AtlasViewer = (() => {
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const images = new WeakMap();
  function showImage(img, src, preview) {
    const mobile = matchMedia('(max-width: 850px)').matches;
    const low = mobile && typeof preview === 'string' && preview && preview !== src ? preview : null;
    images.set(img, {full:src, low});
    img.src = low || src;
  }
  function loadOriginal(img) {
    const item = images.get(img);
    if (!item?.low || img.getAttribute('src') !== item.low) return false;
    img.src = item.full;
    return true;
  }
  function enhance(c) {
    const { root, close, minus, plus, fit, pdf, caption, img } = c;
    root.classList.add('atlas-viewer');
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    // Панель: одинаковый порядок и подписи.
    const bar = make('div', 'av-bar');
    close.textContent = 'Закрыть'; close.setAttribute('aria-label', c.closeLabel || 'Закрыть чертёж');
    minus.textContent = '−'; minus.setAttribute('aria-label', 'Уменьшить'); minus.title = 'Уменьшить';
    plus.textContent = '+'; plus.setAttribute('aria-label', 'Увеличить'); plus.title = 'Увеличить';
    fit.textContent = 'Вписать'; fit.setAttribute('aria-label', 'Вписать лист в окно');
    pdf.textContent = 'Открыть PDF ↗'; pdf.setAttribute('aria-label', 'Открыть PDF в новой вкладке');
    for (const b of [close, minus, plus, fit, pdf]) b.classList.add('av-btn');
    // Подпись кнопки PDF постоянная (прежний код меняет её на «Полный PDF ↗» / «PDF выдержки ↗»).
    new MutationObserver(() => { if (pdf.textContent !== 'Открыть PDF ↗') pdf.textContent = 'Открыть PDF ↗'; }).observe(pdf, { childList: true, characterData: true, subtree: true });
    const back = make('a', 'av-btn av-back'); back.hidden = true;
    /* 1.0.16 B3-13 (A10): пометка источника (site_note, данные объекта) строкой под панелью у «Открыть PDF ↗»; источник — noteFor() страницы или по адресу PDF среди источников движка */
    const note = make('p', 'av-note'); note.hidden = true;
    const noteOf = () => { try { if (c.noteFor) return String(c.noteFor() || '').trim(); const h = pdf.getAttribute('href'), S = window.__FULL_ATLAS && window.__FULL_ATLAS.sourceAvailability && window.__FULL_ATLAS.sourceAvailability(); if (!h || !S) return ''; for (const k in S) { const s = S[k]; if (s && (s.pdf_url === h || s.href === h) && typeof s.site_note === 'string' && s.site_note.trim()) return s.site_note.trim(); } } catch (e) { /* */ } return ''; };
    const syncNote = () => { const t = noteOf(); if (note.textContent !== t) note.textContent = t; note.hidden = !t; };
    new MutationObserver(syncNote).observe(pdf, { attributes: true, attributeFilter: ['href'] });
    bar.append(back, close, minus, plus, fit, pdf);
    for (const x of c.extra || []) { x.classList.add('av-btn', 'review-only'); bar.append(x); }
    caption.classList.add('av-caption');
    const oldBar = c.bar;
    // Лист — в отдельной области прокрутки.
    let stage = c.stage;
    if (!stage) { stage = make('div', 'av-stage'); img.before(stage); stage.append(img); } else stage.classList.add('av-stage');
    root.prepend(bar); bar.after(caption); caption.after(note);
    if (oldBar && oldBar !== bar) oldBar.remove();
    img.classList.add('av-img');
    const loading = make('p', 'av-image-loading', 'Загружаем изображение листа…');
    loading.setAttribute('role', 'status');
    loading.hidden = true;
    stage.before(loading);
    const syncImage = () => {
      const busy = img.hasAttribute('src') && !img.complete;
      loading.hidden = !c.isOpen() || !busy;
      if (busy) stage.setAttribute('aria-busy', 'true');
      else stage.removeAttribute('aria-busy');
    };
    new MutationObserver(syncImage).observe(img, {attributes:true, attributeFilter:['src']});
    img.addEventListener('load', syncImage);
    img.addEventListener('error', event => {
      if (loadOriginal(img)) event.stopImmediatePropagation();
      syncImage();
    }, true);
    plus.addEventListener('click', () => loadOriginal(img));

    // «← Назад к …»: параметр from= в адресе страницы.
    function syncBack() {
      const from = new URLSearchParams(location.hash.slice(1)).get('from');
      back.hidden = !from;
      if (!from) return;
      back.textContent = '← Назад к ' + from;
      back.href = /^Тип № /.test(from) ? 'catalogue-model.html#package/' + from.replace(/\D/g, '') : 'RD_REMARKS.html#id=' + encodeURIComponent(from);
    }
    // Щипок — масштаб листа (не страницы); перетаскивание — сдвиг листа.
    const pts = new Map(); let d0 = 0, w0 = 0, drag = null;
    img.style.touchAction = 'none'; img.draggable = false;
    img.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, e); img.setPointerCapture(e.pointerId);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); w0 = img.getBoundingClientRect().width; drag = null; }
      else drag = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    });
    img.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, e);
      if (pts.size === 2 && d0) {
        loadOriginal(img);
        const [a, b] = [...pts.values()];
        const w = Math.max(200, Math.min(8000, w0 * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / d0));
        img.style.width = w + 'px'; img.style.maxWidth = 'none';
      } else if (drag) { stage.scrollLeft = drag.l - (e.clientX - drag.x); stage.scrollTop = drag.t - (e.clientY - drag.y); }
    });
    const up = e => { pts.delete(e.pointerId); if (pts.size < 2) d0 = 0; if (!pts.size) drag = null; };
    img.addEventListener('pointerup', up); img.addEventListener('pointercancel', up);
    // Фокус: заперт в окне, после закрытия — на открывшую кнопку.
    let opener = null, wasOpen = false;
    window.AtlasShell?.registerWindow?.(() => c.isOpen());   // 1.1.1 A4: окно листа владеет клавишами (⌘K не уводит на поиск за ним)
    document.addEventListener('pointerdown', e => { const b = e.target.closest('button,a'); if (b && !root.contains(b)) opener = b; }, true);
    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && !root.contains(document.activeElement)) opener = document.activeElement;
      if (e.key !== 'Tab' || !c.isOpen()) return;
      const f = [...root.querySelectorAll('button,a[href]')].filter(x => x.offsetParent && !x.hidden);
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    }, true);
    new MutationObserver(() => {
      const open = c.isOpen();
      syncImage();
      if (open && !wasOpen) { syncBack(); syncNote(); setTimeout(() => close.focus(), 0); }
      if (wasOpen && !open) { const t = c.returnTo ? c.returnTo(opener) : opener; setTimeout(() => { if (t && t.isConnected) t.focus(); }, 0); }
      wasOpen = open;
    }).observe(root, { attributes: true, attributeFilter: ['class', 'hidden'] });
    return { syncBack };
  }
  return { enhance, showImage };
})();
