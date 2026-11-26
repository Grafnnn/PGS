/* Shared scene commands. Existing engine selection, visibility and ruler remain authoritative. */
'use strict';
(() => {
  const canvas = document.getElementById('canvas');
  const stage = canvas?.closest('.stage');
  const tools = stage?.querySelector('.tools');
  if (!stage || !tools || window.AtlasActions) return;

  const byId = id => document.getElementById(id);
  const engine = () => window.__ATLAS;
  const settings = () => window.AtlasViewSettings;
  const phone = matchMedia('(max-width:850px)');
  const namespace = 'scene-actions';
  const selected = () => engine()?.selection?.() || null;
  const body = id => id ? engine()?.get?.(id) : null;
  const point = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  const number = value => value.toLocaleString('ru-RU', {maximumFractionDigits:3});
  const metres = value => number(value) + ' м';
  const notify = text => settings()?.toast?.(text);
  const put = (parent, child) => { if (parent && child && child.parentElement !== parent) parent.append(child); };
  const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const make = (tag, opts = {}, text = '') => {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(opts)) element.setAttribute(key, value);
    element.textContent = text;
    return element;
  };
  const button = (id, title, icon, handler) => {
    const b = make('button', {type:'button', id, class:'atb-b action-button', 'aria-label':title, title});
    if (window.AtlasIcons) {
      const t = document.createElement('template');
      t.innerHTML = window.AtlasIcons.use(icon);
      if (t.content.firstElementChild) b.append(t.content.firstElementChild);
    }
    b.append(make('span', {class:'atb-t'}, title));
    b.addEventListener('click', handler);
    return b;
  };

  const more = button('atlasActionMore', 'Ещё', 'more', () => toggleMenu(menu.hidden));
  more.setAttribute('aria-label', 'Команды модели');
  more.title = 'Команды модели';
  const mobileRuler = button('actionRulerMobile', 'Линейка', 'ruler', () => byId('quickMeasure')?.click());
  const throughButton = button('atbThrough', 'Сквозь', 'xray', () => through(!throughState));
  const cardThrough = button('cardThrough', 'Сквозь', 'xray', () => through(!throughState));
  const cardSlice = button('cardSceneSlice', 'Сечение', 'section', openSection);
  cardThrough.classList.add('card-dims');
  cardSlice.classList.add('card-dims');
  const pairButton = button('atbBetween', 'Между элементами', 'ruler', () => {
    toggleMenu(false);
    pair(!pairState);
  });
  const menu = make('section', {id:'atlasSceneActions', class:'action-panel action-menu', hidden:'',
    'aria-label':'Команды модели'});
  const closeMenu = make('button', {type:'button', class:'action-close', 'aria-label':'Закрыть команды'}, '×');
  closeMenu.onclick = () => { toggleMenu(false); more.focus(); };
  const menuThrough = make('button', {type:'button', class:'action-control action-phone-only', 'aria-pressed':'false'}, 'Сквозь');
  menuThrough.onclick = () => { toggleMenu(false); through(!throughState); };
  const menuSlice = make('button', {type:'button', class:'action-control action-phone-only'}, 'Сечение');
  menuSlice.onclick = () => { toggleMenu(false); openSection(); };
  const tint = make('select', {id:'atlasActionPalette'});
  const show = make('label', {class:'action-select', for:tint.id}, 'Цвет модели');
  const paintLegend = make('div', {class:'action-legend', role:'status', 'aria-live':'polite'});
  const row = make('div', {class:'action-menu-heading'});
  row.append(make('strong', {}, 'Команды модели'), closeMenu);
  show.append(tint);
  menu.append(row, menuThrough, menuSlice, pairButton, show, paintLegend);
  more.setAttribute('aria-controls', menu.id);
  more.setAttribute('aria-expanded', 'false');

  const pairPanel = make('section', {id:'atlasPairMeasure', class:'action-panel action-pair', hidden:'',
    'aria-label':'Замер между элементами'});
  const pairTitle = make('strong', {}, 'Между элементами');
  const pairText = make('p', {role:'status', 'aria-live':'polite'});
  const pairClose = make('button', {type:'button', class:'action-close', 'aria-label':'Закрыть замер'}, '×');
  pairClose.onclick = () => { pair(false); more.focus(); };
  const pairTop = make('div', {class:'action-menu-heading'});
  pairTop.append(pairTitle, pairClose);
  const pairReset = make('button', {type:'button', class:'action-control', hidden:''}, 'Новый замер');
  pairReset.onclick = () => { pairHits.length = 0; updatePair(); };
  pairPanel.append(pairTop, pairText, pairReset);

  const layer = make('canvas', {class:'action-layer', 'aria-hidden':'true'});
  const loupe = make('div', {class:'action-loupe', 'aria-hidden':'true', hidden:''});
  const zoom = make('canvas', {width:128,height:128});
  const loupeText = make('span');
  loupe.append(zoom,loupeText);
  stage.append(layer, menu, pairPanel, loupe);
  layer.hidden = true;

  const sectionTag = make('p', {class:'action-section-tag'});
  const sectionSwatch = make('i', {'aria-hidden':'true'});
  const sectionText = make('span');
  sectionTag.append(sectionSwatch, sectionText);

  const axisOption = make('label', {class:'adim-chk action-axes-option'});
  const axisCheck = make('input', {type:'checkbox', id:'atlasAxesDistances'});
  axisOption.append(axisCheck, document.createTextNode('До осей'));
  const axisPanel = make('section', {class:'action-panel action-axis', 'aria-label':'Привязка к основным осям', hidden:''});
  stage.append(axisPanel);
  axisCheck.onchange = () => updateAxis();

  let throughState = false;
  let throughIds = [];
  let xrayTimer = 0;
  let pairState = false;
  const pairHits = [];
  let paintMode = 'materials';
  let ownProgress = false;
  let axisLinks = [];
  let drawFrame = 0;
  let reorganizeFrame = 0;

  function toggleMenu(open) {
    menu.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
    if (open) {
      legend();
      (phone.matches ? menuThrough : pairButton).focus();
    }
  }

  function openSection() {
    if (!phone.matches) { byId('atbSlice')?.click(); return; }
    settings()?.open?.(true);
    const section = [...(byId('viewSettings')?.querySelectorAll('details') || [])].find(detail =>
      detail.firstElementChild?.textContent.trim().startsWith('Сечение'));
    if (section) {
      const panel = section.parentElement?.closest('details');
      if (panel) panel.open = true;
      section.open = true;
    }
  }

  function regroup() {
    const display = tools.querySelector('.atb-g--view');
    const examine = tools.querySelector('.atb-g--measure');
    const share = tools.querySelector('.atb-g--last');
    const slice = byId('atbSlice');
    if (display) display.setAttribute('aria-label', 'Показать');
    if (examine) {
      examine.setAttribute('aria-label', 'Разобрать');
      put(examine, throughButton);
      if (slice && examine.firstElementChild !== slice) examine.prepend(slice);
      if (slice && slice.nextElementSibling !== throughButton) slice.after(throughButton);
    }
    if (share) {
      share.setAttribute('aria-label', 'Поделиться');
      if (!phone.matches) put(share, more);
    }
    const zoomTools = stage.querySelector('.zoom-controls');
    const ruler = byId('quickMeasure');
    if (ruler) {
      ruler.classList.add('atb-b');
      ruler.querySelector('span')?.classList.add('atb-t');
      const localDock = phone.matches ? byId('pdNetworkMeasurements') : null;
      const quickRuler = localDock && ruler.parentElement !== zoomTools ? mobileRuler : ruler;
      if (quickRuler !== mobileRuler) mobileRuler.remove();
      put(phone.matches ? zoomTools : examine, quickRuler);
      const dimensions = byId('quickDims');
      if (phone.matches && dimensions?.parentElement === zoomTools && dimensions.nextElementSibling !== quickRuler) {
        dimensions.after(quickRuler);
      }
      mobileRuler.setAttribute('aria-pressed',String(!!window.AtlasMeasure?.on?.()));
    }
    if (phone.matches) put(zoomTools, more);

    const dimBar = byId('atlasDimsBar');
    put(dimBar?.querySelector('.adim-bar-main'), axisOption);
    const card = byId('right');
    const dimsButton = byId('cardDims');
    if (card && dimsButton && dimsButton.offsetParent && selected()) {
      if (cardThrough.parentElement !== dimsButton.parentElement) dimsButton.after(cardThrough, cardSlice);
    } else {
      cardThrough.remove();
      cardSlice.remove();
    }
    cardSlice.setAttribute('aria-pressed', slice?.getAttribute('aria-pressed') || 'false');
    cardSlice.setAttribute('aria-expanded', slice?.getAttribute('aria-expanded') || 'false');
    cardSlice.setAttribute('aria-controls',phone.matches ? 'viewSettings' : 'atbSlicePop');
    updateSectionIndicator();
    const availability = !!(engine()?.occlusion && settings()?.ghost);
    throughButton.disabled = cardThrough.disabled = menuThrough.disabled = !availability;
    stage.classList.add('atlas-actions');
  }

  function organizeSoon() {
    if (reorganizeFrame) return;
    reorganizeFrame = requestAnimationFrame(() => { reorganizeFrame = 0; regroup(); });
  }

  const inspected = ['atlas:ready','atlas:selectionchange','atlas:scope','atlas:section','atlas:sheet','atlas:dims','atlas:card','atlas:toolmode'];
  for (const name of inspected) document.addEventListener(name, organizeSoon);
  phone.addEventListener('change', organizeSoon);
  new MutationObserver(organizeSoon).observe(tools, {childList:true,subtree:true,attributes:true,attributeFilter:['aria-pressed','aria-expanded']});
  new MutationObserver(organizeSoon).observe(document.body, {attributes:true,attributeFilter:['data-atlas-workspace']});
  const zoomDock = stage.querySelector('.zoom-controls');
  if (zoomDock) new MutationObserver(organizeSoon).observe(zoomDock,{childList:true});
  new MutationObserver(organizeSoon).observe(stage,{childList:true});
  const right = byId('right');
  if (right) new MutationObserver(organizeSoon).observe(right,{childList:true,subtree:true});
  const viewSettings = byId('viewSettings');
  if (viewSettings) new MutationObserver(organizeSoon).observe(viewSettings,{childList:true,subtree:true});

  // Reveal only occluders reported for the selected object. The owner is independent of other ghost layers.
  function xrayRepaint() {
    xrayTimer = 0;
    const v = settings();
    if (!v?.ghost) return;
    v.ghost(namespace, null);
    throughIds = [];
    const id = selected();
    if (!throughState || !id) return;
    const found = new Set();
    for (let pass = 0; pass < 3; pass++) {
      const before = found.size;
      for (const item of engine()?.occlusion?.(id,{silent:true,samples:12})?.by || []) {
        if (item.id !== id) found.add(item.id);
      }
      if (found.size === before) break;
      v.ghost(namespace, [...found], {alpha:.19,pick:false});
    }
    throughIds = [...found];
  }

  function xraySoon() {
    if (!throughState) return;
    clearTimeout(xrayTimer);
    xrayTimer = setTimeout(xrayRepaint, 140);
  }

  function through(value) {
    const on = !!value;
    if (on && !(settings()?.ghost && engine()?.occlusion)) return false;
    throughState = on;
    for (const target of [throughButton, cardThrough, menuThrough]) {
      target.setAttribute('aria-pressed', String(on));
    }
    clearTimeout(xrayTimer);
    xrayRepaint();
    if (on) notify(selected() ? 'Сквозь: препятствия выбранного элемента прозрачны' : 'Сквозь: сначала выберите элемент в составе модели');
    return throughState;
  }

  for (const ev of ['atlas:camera','atlas:section','atlas:selectionchange','atlas:visibility','atlas:scope']) {
    document.addEventListener(ev, xraySoon);
  }

  // The existing scene pointer decides clicks, drags and snaps. Do not install competing click handlers on the canvas.
  function updatePair(message) {
    const [first, second] = pairHits;
    if (message) setText(pairText, message);
    else if (second) {
      const length = Math.hypot(...first.point.map((v,k) => v - second.point[k]));
      setText(pairText, metres(length) + ' между точками на поверхностях. ' + first.name + ' — ' + second.name + '. По модели.');
    } else setText(pairText, first ? first.name + '. Выберите поверхность другого элемента.' : 'Выберите поверхности двух разных элементов.');
    pairReset.hidden = !first;
    paintSoon();
  }

  function pair(value, keepTool) {
    const on = !!value;
    if (on === pairState || (on && !engine()?.setToolMode)) return pairState;
    if (on) {
      window.AtlasMeasure?.set?.(false);
      pairState = true;
      pairHits.length = 0;
      engine().setToolMode('measure');
    } else {
      pairState = false;
      pairHits.length = 0;
      if (!keepTool && engine()?.toolMode?.() === 'measure') engine().setToolMode(null);
    }
    pairButton.setAttribute('aria-pressed', String(pairState));
    pairPanel.hidden = !pairState;
    updatePair();
    return pairState;
  }

  document.addEventListener('atlas:toolmode', e => {
    if (pairState && (e.detail?.mode !== 'measure' || window.AtlasMeasure?.on?.())) pair(false,true);
  });
  document.addEventListener('atlas:measurepoint', e => {
    if (!pairState || e.defaultPrevented || pairHits.length === 2) return;
    const {clientX,clientY} = e.detail || {};
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const hit = engine().pickSurface(clientX,clientY,{snap:false,radiusPx:0,track:false});
    if (!hit?.id || !point(hit.point)) { updatePair('Точка вне видимой поверхности. Выберите элемент.'); return; }
    if (pairHits[0]?.id === hit.id) { updatePair('Выберите другой элемент. Первая точка сохранена.'); return; }
    pairHits.push({id:hit.id,point:hit.point.slice(),name:hit.name || body(hit.id)?.name || hit.id});
    updatePair();
  });
  document.addEventListener('atlas:scope', () => { if (pairState) pair(false); });

  function axisDistances(id = selected()) {
    const ref = window.ATLAS_AXIS_REFERENCE;
    if (ref?.verified !== true || typeof ref.datum !== 'string' || !ref.datum.trim() ||
        typeof ref.source !== 'string' || !ref.source.trim()) return {state:'unverified',items:[]};
    if (!id) return {state:'empty',items:[]};
    const object = body(id);
    const anchor = ref.items?.[id];
    const b = object?.bounds;
    const route = point(anchor?.point) && typeof anchor?.label === 'string' && anchor.label.trim();
    if (!route && (!Array.isArray(b) || b.length !== 2 || !b.every(point))) return {state:'empty',items:[]};
    const center = route ? anchor.point : b[0].map((v,k) => (v+b[1][k])/2);
    const axes = window.AtlasBuildingAxes?.axes || [];
    const result = axes.filter(a => (a.direction === 'X' || a.direction === 'Y') &&
      Number.isFinite(a.metres) && a.label).map(a => {
      const d = a.direction === 'X' ? 0 : 1;
      const closest = route ? center[d] : Math.max(b[0][d], Math.min(b[1][d], a.metres));
      const p = center.slice(); p[d] = closest;
      const q = p.slice(); q[d] = a.metres;
      const distance = Math.abs(a.metres - closest);
      return {label:a.label,distance,points:[p,q],onAxis:distance <= .001};
    }).sort((a,b) => a.distance-b.distance).slice(0,2);
    return {state:result.length ? 'ok' : 'unverified',items:result,datum:ref.datum,source:ref.source,
      basis:route ? anchor.label : 'От границы габарита по модели'};
  }

  function updateAxis() {
    const on = axisCheck.checked && !!window.AtlasDims?.state?.().on;
    const result = axisDistances();
    axisLinks = on ? result.items : [];
    axisPanel.hidden = !on;
    if (on) {
      const note = result.state === 'unverified' ? 'Нет подтверждённой осевой сетки. Показанные оси справочные.' :
        result.state === 'empty' ? 'Выберите элемент или участок с подтверждённой привязкой.' :
          result.basis + ' · ' + result.datum + ' · ' + result.source;
      axisPanel.replaceChildren(make('strong', {}, 'До основных осей'), make('p', {}, note));
      for (const item of axisLinks) axisPanel.append(make('p', {}, item.label + ' · ' + (item.onAxis ? 'На оси' : metres(item.distance))));
    }
    paintSoon();
  }
  for (const ev of ['atlas:dims','atlas:selectionchange','atlas:scope']) document.addEventListener(ev,updateAxis);

  const NETWORK_SECTIONS = {
    NET:[46,118,171], WEL:[81,132,141], CTX:[144,113,91],
    EXC:[154,121,83], TER:[104,133,106], REF:[102,110,160],
  };
  const ORIGINS = {
    codex:['Геометрия из пакета',[49,130,166]], atlas:['Геометрия восстановлена',[155,114,190]],
    codex_archive_unverified:['Архивный источник',[176,125,83]], void:['Геометрии нет',[123,134,143]],
    other:['Источник не указан',[123,134,143]],
  };
  const palette = {
    materials:'Материалы', sections:'По разделам', sources:'Происхождение данных', progress:'Ход работ',
  };
  for (const [value,label] of Object.entries(palette)) {
    const o = make('option',{value},label);
    if (value === 'progress') o.hidden = !(window.ATLAS_PROJECT?.progress?.enabled);
    tint.append(o);
  }
  tint.onchange = () => applyPalette(tint.value);
  const scene = () => (engine()?.sceneObjects?.() || []).map(x => body(x.renderId)).filter(Boolean);
  const owners = () => window.ATLAS_PROJECT?.owners || [];
  const ownerCode = object => object?.albumRecord?.module || object?.group || '';
  const cssColor = color => 'rgb(' + color.join(',') + ')';
  const NEUTRAL_SECTION = [123,134,143];
  const sectionColor = code => {
    const row = document.querySelector('.ac-eye[data-section-id="section:'+CSS.escape(code)+'"]')?.closest('.ac-row');
    const shownColor = row?.querySelector('.ac-color')?.style.backgroundColor.match(/\d+/g)?.map(Number);
    const owner = owners().find(option => option.code === code);
    const title = owner?.label || row?.querySelector('.ac-name')?.textContent || 'Прочее';
    return [title, shownColor?.length === 3 ? shownColor : NETWORK_SECTIONS[code] || NEUTRAL_SECTION];
  };

  let coloredId = null, selectedSection = null;
  function updateSectionIndicator() {
    const id = selected();
    if (coloredId !== id) {
      const code = ownerCode(body(id));
      selectedSection = code && owners().some(owner => owner.code === code) ? sectionColor(code) : null;
      coloredId = id;
    }
    const path = stage.querySelector('.stage-actions .stage-path');
    if (selectedSection) {
      const [label,color] = selectedSection;
      setText(sectionText,label);
      sectionSwatch.style.backgroundColor = cssColor(color);
      const title = byId('cardTitle');
      if (title && title.nextElementSibling !== sectionTag) title.after(sectionTag);
      if (document.body.dataset.atlasWorkspace === 'plans') path?.style.setProperty('--action-plan-color',cssColor(color));
      else path?.style.removeProperty('--action-plan-color');
    } else {
      sectionTag.remove();
      path?.style.removeProperty('--action-plan-color');
    }
  }

  function sectionEntries() {
    const labels = new Map(), tints = new Map();
    const tree = window.__FULL_ATLAS?.tree?.()?.nodes || {};
    for (const [id,node] of Object.entries(tree)) {
      if (node.kind !== 'section') continue;
      const code = node.owner || id.replace(/^section:/,'');
      const [label,color] = sectionColor(code);
      const ids = engine()?.scopeMembers?.('TREE:' + id) || [];
      if (ids.length) labels.set(label,color);
      for (const renderId of ids) tints.set(renderId,color);
    }
    if (!tints.size) for (const obj of scene()) {
      const [label,color] = sectionColor(ownerCode(obj));
      labels.set(label,color);
      tints.set(obj.renderId,color);
    }
    return {labels,tints};
  }

  let paletteLabels = new Map();

  function legend() {
    paintLegend.replaceChildren();
    if (paintMode === 'materials') return;
    if (paintMode === 'progress') {
      paintLegend.append(make('p', {}, 'Цвета и легенда показаны в разделе «Ход работ».'));
      return;
    }
    for (const [label,color] of paletteLabels) {
      const item = make('div',{class:'action-key'});
      const swatch = make('i',{'aria-hidden':'true'});
      swatch.style.backgroundColor = cssColor(color);
      item.append(swatch,make('span',{},label));
      paintLegend.append(item);
    }
  }

  function paintTint() {
    if (!engine()?.features?.tintLayers) return;
    let map = new Map();
    paletteLabels = new Map();
    if (paintMode === 'sections') {
      const section = sectionEntries();
      paletteLabels = section.labels;
      map = section.tints;
    } else if (paintMode === 'sources') {
      for (const o of scene()) {
        const [label,color] = ORIGINS[o.albumRecord?.geometry_origin] || ORIGINS.other;
        paletteLabels.set(label,color);
        map.set(o.renderId,color);
      }
    }
    engine().setTint(namespace,map.size ? map : null);
  }

  function applyPalette(kind) {
    if (!Object.prototype.hasOwnProperty.call(palette,kind)) return paintMode;
    if (kind === 'progress') {
      if (!window.AtlasProgressTab?.enter) { tint.value = paintMode; notify('Для объекта нет данных о ходе работ'); return paintMode; }
      ownProgress = !window.AtlasProgressTab.on();
      paintMode = kind;
      window.AtlasProgressTab.enter({});
    } else {
      const exitProgress = ownProgress && window.AtlasProgressTab?.on?.();
      ownProgress = false;
      paintMode = kind;
      if (exitProgress) window.AtlasProgressTab.exit();
    }
    tint.value = paintMode;
    paintTint();
    legend();
    return paintMode;
  }

  document.addEventListener('atlas:sceneready', () => {
    if (paintMode === 'sections' || paintMode === 'sources') { paintTint(); legend(); }
  });
  document.addEventListener('atlas:progress', e => {
    if (paintMode === 'progress' && !e.detail?.on) applyPalette('materials');
  });

  function lines(ctx) {
    const r = canvas.getBoundingClientRect();
    const specs = axisLinks.map(x => [x.points, x.label + ' · ' + (x.onAxis ? 'На оси' : metres(x.distance)), true]);
    if (pairHits.length === 2) {
      const pts = pairHits.map(x => x.point);
      specs.push([pts, metres(Math.hypot(...pts[0].map((v,i) => v-pts[1][i]))), false]);
    } else if (pairHits.length === 1) specs.push([[pairHits[0].point], 'A', false]);
    ctx.save();
    const hue = getComputedStyle(document.documentElement).getPropertyValue('--c-link').trim() || '#225d7b';
    ctx.strokeStyle = ctx.fillStyle = hue;
    ctx.lineWidth = 2;
    ctx.font = '600 13px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const [pts,label,dashed] of specs) {
      const coords = pts.map(p => engine()?.projectToScreen?.(p));
      if (!coords.every(p => p && p[2])) continue;
      const a = coords[0], b = coords[1] || a;
      ctx.setLineDash(dashed ? [5,4] : []);
      ctx.beginPath(); ctx.moveTo(a[0]-r.left,a[1]-r.top); ctx.lineTo(b[0]-r.left,b[1]-r.top); ctx.stroke();
      ctx.setLineDash([]);
      for (const p of coords) { ctx.beginPath();ctx.arc(p[0]-r.left,p[1]-r.top,3,0,Math.PI*2);ctx.fill(); }
      const x = (a[0]+b[0])/2-r.left,y = (a[1]+b[1])/2-r.top-8;
      ctx.strokeStyle = getComputedStyle(stage).getPropertyValue('--c-surface').trim() || '#fff';
      ctx.lineWidth = 4;
      ctx.strokeText(label,x,y); ctx.fillText(label,x,y);
      ctx.strokeStyle = hue; ctx.lineWidth = 2;
    }
    ctx.restore();
  }

  function paintSoon() {
    if (drawFrame) return;
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0;
      const visible = pairHits.length || axisLinks.length;
      layer.hidden = !visible;
      if (!visible) return;
      const r = canvas.getBoundingClientRect(), s = stage.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const dpr = Math.min(devicePixelRatio || 1,2);
      layer.style.cssText = 'left:'+(r.left-s.left)+'px;top:'+(r.top-s.top)+'px;width:'+r.width+'px;height:'+r.height+'px';
      layer.width = Math.round(r.width*dpr); layer.height = Math.round(r.height*dpr);
      const ctx = layer.getContext('2d');
      if (ctx) { ctx.setTransform(dpr,0,0,dpr,0,0); lines(ctx); }
    });
  }
  for (const ev of ['atlas:camera','atlas:section','atlas:sheet','atlas:sceneready']) document.addEventListener(ev,paintSoon);
  document.addEventListener('atlas:snapshotpaint',e => {
    if (pairHits.length || axisLinks.length) e.detail?.add?.(lines);
  });

  // Touch loupe looks at the same world point the existing ruler snaps to. No pointer capture or gesture cancellation.
  let heldTouch = null;
  let loupeFrame = 0;
  let loupeTimer = 0;
  let loupeSampledAt = -Infinity;
  function previewTouch() {
    loupeFrame = 0;
    const t = heldTouch;
    if (!t || !phone.matches || !(window.AtlasMeasure?.on?.() || pairState)) return;
    const now = performance.now();
    if (now - loupeSampledAt < 45) {
      loupeFrame = requestAnimationFrame(previewTouch);
      return;
    }
    loupeSampledAt = now;
    const parent = stage.getBoundingClientRect(), model = canvas.getBoundingClientRect();
    const h = engine()?.pickSurface?.(t.x,t.y,{snap:!pairState,radiusPx:pairState ? 0 : 24,track:false});
    if (!hitVisible(h)) { loupe.hidden = true; return; }
    const p = engine().projectToScreen(h.point);
    if (!p || !p[2]) { loupe.hidden = true; return; }
    const ctx = zoom.getContext('2d');
    if (!ctx || !model.width || !model.height) return;
    const sx = canvas.width/model.width, sy = canvas.height/model.height, sample = 31;
    // Draw and sample together: WebGL presentation and canvas resizes can clear the previous frame.
    engine()?.draw?.();
    ctx.clearRect(0,0,128,128);
    ctx.drawImage(canvas,(p[0]-model.left-sample/2)*sx,(p[1]-model.top-sample/2)*sy,sample*sx,sample*sy,0,0,128,128);
    loupe.style.left = Math.max(5,Math.min(parent.width-120,t.x-parent.left-52))+'px';
    loupe.style.top = Math.max(8,t.y-parent.top-145)+'px';
    setText(loupeText, h.snap === 'edge' ? 'Ребро' : h.snap === 'vertex' ? 'Вершина' : 'Грань');
    loupe.hidden = false;
  }
  const hitVisible = h => !!(h && point(h.point));
  function touchMove(e) {
    if (e.pointerType !== 'touch' || !e.isPrimary || !(window.AtlasMeasure?.on?.() || pairState)) return;
    heldTouch = {x:e.clientX,y:e.clientY,id:e.pointerId};
    clearTimeout(loupeTimer);
    if (!loupeFrame) loupeFrame = requestAnimationFrame(previewTouch);
  }
  function endTouch(e) {
    if (!heldTouch || e.pointerId !== heldTouch.id) return;
    heldTouch = null;
    clearTimeout(loupeTimer);
    loupeTimer = setTimeout(() => { loupe.hidden = true; },180);
  }
  canvas.addEventListener('pointerdown',touchMove,{passive:true});
  canvas.addEventListener('pointermove',e => { if (heldTouch?.id === e.pointerId) touchMove(e); },{passive:true});
  canvas.addEventListener('pointerup',endTouch,{passive:true});
  canvas.addEventListener('pointercancel',endTouch,{passive:true});

  document.addEventListener('pointerdown', e => {
    if (!menu.hidden && !menu.contains(e.target) && !more.contains(e.target)) toggleMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('#modal.open, dialog[open]')) return;
    if (!menu.hidden) { e.preventDefault(); toggleMenu(false); more.focus(); }
    else if (pairState) { e.preventDefault(); pair(false); more.focus(); }
  });

  window.AtlasActions = {
    through, pair, palette:applyPalette, axisDistances, sectionColor, refresh:regroup,
    axis(value) { axisCheck.checked = !!value; updateAxis(); return axisDistances(); },
    state:() => ({through:throughState,occluders:throughIds.slice(),pair:pairState,
      points:pairHits.map(x => ({...x,point:x.point.slice()})), palette:paintMode,axis:axisCheck.checked}),
  };
  organizeSoon();
})();
