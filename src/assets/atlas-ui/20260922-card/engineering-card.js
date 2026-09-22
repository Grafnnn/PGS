(function () {
  'use strict';
  const box = document.createElement('section');
  box.className = 'engineering-card';
  box.setAttribute('aria-label', 'Инженерные сведения');
  let last, queued = false;
  const el = (tag, value, cls) => {
    const node = document.createElement(tag);
    if (value) node.textContent = value;
    if (cls) node.className = cls;
    return node;
  };
  function rows(items) {
    const list = el('dl');
    for (const row of items) { list.append(el('dt', row.label), el('dd', row.value)); }
    return list;
  }
  const select = window.AtlasEngineeringFields.selectionLoader(
    object => window.AtlasPassports.get(object),
    result => {
      box.replaceChildren();
      box.hidden = result.state === 'empty';
      if (result.state === 'empty') return;
      if (result.state === 'loading') { box.append(el('p', 'Загрузка паспорта…', 'engineering-muted')); return; }
      if (result.state === 'error') {
        box.append(el('p', 'Паспорт временно недоступен', 'engineering-muted'));
        const retry = el('button', 'Повторить'); retry.type = 'button';
        retry.addEventListener('click', () => refresh(true)); box.append(retry); return;
      }
      const d = result.data;
      box.append(rows(d.materials.length ? d.materials : [{label:'Материал',value:d.missingMaterial}]));
      box.append(rows(d.dimensions.length ? d.dimensions : [{label:'Размеры по паспорту',value:'Не указаны'}]));
      if (d.modelBounds) box.append(rows([{label:d.modelBoundsLabel,value:d.modelBounds}]));
      if (d.position.length) box.append(rows(d.position));
      if (d.fabricationIncomplete) box.append(el('p', 'Геометрия неполная. Не использовать для изготовления.', 'engineering-warning'));
      for (const note of d.notes) box.append(el('p', note, 'engineering-warning'));
      if (d.specification.length) {
        const more = el('details'); more.append(el('summary', 'Спецификация и источник'), rows(d.specification)); box.append(more);
      }
    }
  );
  function refresh(force) {
    const anchor = document.getElementById('elementContext');
    if (!anchor || !window.__FULL_ATLAS || !window.AtlasPassports) return;
    if (!box.isConnected) anchor.after(box);
    const object = window.__FULL_ATLAS.selected();
    if (!force && last === object) return;
    last = object; select(object);
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; refresh(false); });
  }
  document.addEventListener('atlas:selection', schedule);
  document.addEventListener('atlas:ready', schedule);
  // Initial/hash selections do not always emit atlas:selection; observe the title only.
  const title = document.getElementById('selectedName');
  if (title) new MutationObserver(schedule).observe(title, {childList:true,subtree:true,characterData:true});
  refresh(true);
})();
