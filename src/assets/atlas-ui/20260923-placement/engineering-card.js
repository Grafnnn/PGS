(function () {
  'use strict';
  const box = document.createElement('section');
  box.className = 'engineering-card';
  box.setAttribute('aria-label', 'Инженерные сведения');
  const placementBox = document.createElement('section');
  placementBox.className = 'engineering-placement';
  placementBox.setAttribute('aria-label', 'Габарит и привязка');
  document.getElementById('elementContext')?.after(placementBox);
  const oldNotes = document.querySelector('#right .element-notes');
  const notes = document.createElement('section');
  notes.className = 'element-notes';
  const heading = document.createElement('h3');
  heading.textContent = 'Сведения и ограничения';
  notes.append(heading);
  if (oldNotes) {
    for (const child of [...oldNotes.children]) if (child.tagName !== 'SUMMARY') notes.append(child);
    oldNotes.remove();
  }
  placementBox.after(notes);
  const extraNotes = document.createElement('div');
  extraNotes.className = 'passport-extra-notes';
  document.querySelector('#right .element-notes')?.append(extraNotes);
  document.querySelectorAll('#right details').forEach(detail => { detail.open = false; });
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
      placementBox.replaceChildren();
      placementBox.hidden = result.state === 'empty';
      extraNotes.replaceChildren();
      box.hidden = result.state === 'empty';
      if (result.state === 'empty') return;
      if (result.state === 'loading') { box.append(el('p', 'Загрузка паспорта…', 'engineering-muted')); return; }
      if (result.state === 'error') {
        box.append(el('p', 'Паспорт временно недоступен', 'engineering-muted'));
        const retry = el('button', 'Повторить'); retry.type = 'button';
        retry.addEventListener('click', () => refresh(true)); box.append(retry); return;
      }
      const d = result.data;
      const placement = [...(d.modelBounds ? [{label:d.modelBoundsLabel,value:d.modelBounds}] : []), ...d.position];
      if (placement.length) placementBox.append(rows(placement));
      if (d.fabricationIncomplete) extraNotes.append(el('p', 'Геометрия неполная. Не использовать для изготовления.', 'engineering-warning'));
      const existing = document.getElementById('objectWarning')?.textContent || '';
      for (const note of d.notes) if (!existing.includes(note)) extraNotes.append(el('p', note, 'engineering-warning'));
      const dimensions = d.dimensions.map(row => ({...row,label:row.label.replace(/ \(length_mm?\)$/, '')}));
      const specification = [...d.materials, ...dimensions, ...d.specification];
      if (specification.length) {
        const more = el('details'); more.append(el('summary', 'Спецификация и источник'), rows(specification)); box.append(more);
      }
    }
  );
  function refresh(force) {
    const anchor = document.querySelector('#right .actions');
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
