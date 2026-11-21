/* Обозначение демонстрационного участка по пикетажу существующего профиля. */
(() => {
  'use strict';

  const range = window.ATLAS_FIELD?.route;
  const profile = window.ATLAS_PROFILE_WORLD;
  if (!range || !profile?.route?.length) return;

  const { startM, endM } = range;
  const route = profile.route;
  if (!Number.isFinite(startM) || !Number.isFinite(endM) || startM >= endM ||
      startM < route[0].station || endM > route.at(-1).station) return;

  const number = new Intl.NumberFormat('ru-RU', {
    minimumIntegerDigits: 2, maximumFractionDigits: 3, useGrouping: false,
  });
  const stationName = station => 'ПК' + Math.floor(station / 100) + '+' + number.format(station % 100);
  const stations = [stationName(startM), stationName(endM)];
  const color = '#b64ded';
  const outline = '#321547';
  const numberFont = '600 12px system-ui, sans-serif';
  const obstaclesSelector = [
    '#fieldPilotControls', '#pdExcavationOverview', '.tools', '.atb-view',
    '.stage-actions', '.zoom-controls', '.card-occl:not([hidden])',
    '#right.open', '.af-root:not([hidden])', '.af-fab:not([hidden])',
  ].join(',');

  function worldPoint({ x, y, invert }) {
    return [x, y, invert];
  }

  function pointAt(station) {
    const index = route.findIndex(point => point.station >= station);
    const high = route[index];
    if (high.station === station || !index) return worldPoint(high);
    const low = route[index - 1];
    const fraction = (station - low.station) / (high.station - low.station);
    const next = worldPoint(high);
    return worldPoint(low).map((value, axis) => value + fraction * (next[axis] - value));
  }

  const points = [
    pointAt(startM),
    ...route.filter(point => startM < point.station && point.station < endM).map(worldPoint),
    pointAt(endM),
  ];
  const ends = [points[0], points.at(-1)];

  function line(context, vertices, ink, width) {
    context.beginPath();
    vertices.forEach(([x, y], index) => index ? context.lineTo(x, y) : context.moveTo(x, y));
    context.strokeStyle = ink;
    context.lineWidth = width;
    context.stroke();
  }

  function marker(context, point) {
    context.beginPath();
    context.arc(point[0], point[1], 5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.strokeStyle = outline;
    context.lineWidth = 2;
    context.stroke();
  }

  function intersects(a, b) {
    return a.left < b.right + 4 && a.right > b.left - 4 &&
      a.top < b.bottom + 4 && a.bottom > b.top - 4;
  }

  function drawLabel(context, point, text, viewport, occupied) {
    const [x, y] = point;
    const width = Math.ceil(context.measureText(text).width) + 16;
    const height = 23;
    if (viewport.width < width + 12 || viewport.height < height + 12) return false;
    const offsets = [[12,-height-10], [-width-12,10], [12,10], [-width-12,-height-10],
      [-width/2,-height-24], [-width/2,24], [24,-height-26], [-width-24,26]];
    for (const [dx, dy] of offsets) {
      const left = Math.max(6, Math.min(viewport.width - width - 6, x + dx));
      const top = Math.max(6, Math.min(viewport.height - height - 6, y + dy));
      const box = { left, top, right: left + width, bottom: top + height };
      if (occupied.some(obstacle => intersects(box, obstacle))) continue;
      const edge = [Math.max(box.left, Math.min(box.right, x)), Math.max(box.top, Math.min(box.bottom, y))];
      line(context, [point, edge], outline, 1);
      context.fillStyle = '#fff';
      context.fillRect(left, top, width, height);
      context.strokeStyle = outline;
      context.lineWidth = 1;
      context.strokeRect(left, top, width, height);
      context.fillStyle = outline;
      context.fillText(text, left + 8, top + height / 2);
      occupied.push(box);
      return true;
    }
    return false;
  }

  function mount(atlas, stage) {
    const canvas = document.createElement('canvas');
    canvas.id = 'fieldPilotOverlay';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.from = String(startM);
    canvas.dataset.to = String(endM);
    canvas.hidden = true;
    const context = canvas.getContext('2d');
    if (!context) return;

    const control = document.createElement('div');
    control.id = 'fieldPilotControls';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Участок ' + stations.join('–'));
    const interval = document.createElement('span');
    interval.className = 'field-pilot-range';
    interval.textContent = stations.join('–');
    const open = document.createElement('button');
    open.id = 'fieldPilotOpen';
    open.type = 'button';
    open.textContent = 'Пикеты';
    open.setAttribute('aria-haspopup', 'dialog');
    const toggle = document.createElement('button');
    toggle.id = 'fieldPilotToggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-controls', canvas.id);
    toggle.title = 'Показать или скрыть границы участка';
    toggle.textContent = 'Границы';
    const focus = document.createElement('button');
    focus.id = 'fieldPilotFit';
    focus.type = 'button';
    focus.textContent = 'Приблизить участок';
    focus.title = 'Приблизить участок ' + stations.join('–');
    control.append(interval, open, focus);
    const root = stage.querySelector('#pdExcavationOverview');
    const field = root?.querySelector('#pdNetworkField');
    const layers = root?.querySelector('.pdLayerActions');
    const quick = document.createElement('button');
    quick.id = 'pdFieldQuick';
    quick.type = 'button';
    quick.textContent = stations.join('–');
    quick.setAttribute('aria-label', 'Пикеты ' + quick.textContent);
    quick.setAttribute('aria-haspopup', 'dialog');
    if (layers) layers.append(toggle);
    else control.append(toggle);
    root?.querySelector('.pdNetworkBar').append(quick);

    const style = document.createElement('style');
    style.textContent = `
      #fieldPilotOverlay{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none}
      #fieldPilotOverlay[hidden]{display:none}
      #fieldPilotControls{display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:3px 4px;font-size:13px}
      .field-pilot-range,#pdFieldQuick{font-variant-numeric:tabular-nums;white-space:nowrap}
      .field-pilot-range{font-weight:650;flex-basis:100%;padding:2px 0 4px}
      #fieldPilotControls button{min-height:36px;padding:5px 8px;border:1px solid var(--c-line-mid);border-radius:var(--r-s);
        background:var(--c-surface-2);color:var(--c-link);font:inherit;font-weight:650;cursor:pointer}
      #fieldPilotToggle::before{content:"";display:inline-block;width:12px;height:4px;border:1px solid var(--c-text);margin-right:6px;vertical-align:middle}
      #fieldPilotToggle[aria-pressed="true"]::before{background:#b64ded}
      #fieldPilotControls.field-pilot-floating{position:absolute;z-index:5;top:112px;left:16px;max-width:calc(100% - 32px);
        padding:4px;border:1px solid var(--c-line);border-radius:8px;background:var(--c-float)}
      @media(max-width:850px){
        #fieldPilotControls button{min-height:44px}
        #fieldPilotControls.field-pilot-floating{top:121px;left:12px;max-width:calc(100% - 24px)}
        body.fieldPilotFocused #right.is-empty{display:none}
      }`;
    document.head.append(style);
    stage.append(canvas);
    if (!field) control.classList.add('field-pilot-floating');
    (field || stage).append(control);

    let visible = true;
    let frame = 0;
    let fieldMarks;
    function sectionActive() {
      const state = atlas.sectionState?.();
      return Boolean(state?.section || state?.slider?.axis);
    }

    function paint(ink, viewport, snapshot = false) {
      const projection = points.map(world => atlas.projectToScreen(world));
      if (projection.some(point => !point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return 0;
      const screen = projection.map(([x, y]) => [x - viewport.left, y - viewport.top]);
      ink.lineCap = 'round';
      ink.lineJoin = 'round';
      if (document.body.classList.contains('golUndergroundOn')) {
        ink.save();
        ink.setLineDash([4, 7]);
        line(ink, screen, color, 2);
        ink.restore();
      } else {
        line(ink, screen, outline, 8);
        line(ink, screen, color, 5);
      }
      ink.font = numberFont;
      ink.textBaseline = 'middle';
      const occupied = (snapshot ? [] : [...document.querySelectorAll(obstaclesSelector)])
        .map(node => node.getBoundingClientRect())
        .filter(rect => rect.width && rect.height)
        .map(rect => ({ left: rect.left - viewport.left, top: rect.top - viewport.top,
          right: rect.right - viewport.left, bottom: rect.bottom - viewport.top }));
      const last = screen.length - 1;
      let labelCount = 0;
      for (const [index, label] of [[0, stations[0]], [last, stations[1]]]) {
        if (!projection[index][2]) continue;
        const pin = screen[index];
        marker(ink, pin);
        if ((!fieldMarks || fieldMarks.hidden) && drawLabel(ink, pin, label, viewport, occupied)) labelCount++;
      }
      return labelCount;
    }

    function draw() {
      frame = 0;
      canvas.hidden = !visible || sectionActive();
      canvas.dataset.drawLabels = '0';
      if (canvas.hidden) return;
      const viewport = canvas.getBoundingClientRect();
      if (!viewport.width || !viewport.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(viewport.width * ratio);
      const height = Math.round(viewport.height * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, viewport.width, viewport.height);
      canvas.dataset.drawLabels = String(paint(context, viewport));
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    function show(state) {
      visible = state;
      toggle.setAttribute('aria-pressed', String(state));
      schedule();
    }

    function releaseFocus() {
      document.body.classList.remove('fieldPilotFocused');
    }

    const closeMenu = () => root?.dispatchEvent(new Event('pdnetwork:close'));
    const openList = () => {
      closeMenu();
      window.AtlasField?.open();
    };
    open.addEventListener('click', openList);
    quick.addEventListener('click', openList);
    toggle.addEventListener('click', () => {
      show(!visible);
      if (!visible) releaseFocus();
    });
    focus.addEventListener('click', () => {
      show(true);
      document.body.classList.add('fieldPilotFocused');
      closeMenu();
      const view = stage.getBoundingClientRect();
      const panelRect = (root || control).getBoundingClientRect();
      const compact = innerWidth <= 850;
      const sheet = document.querySelector('#right.open')?.getBoundingClientRect();
      const sheetBottom = compact && sheet?.height && sheet.top < view.bottom ? view.bottom - sheet.top + 12 : 56;
      const bottom = compact ? Math.max(sheetBottom, view.bottom - panelRect.top + 12) : sheetBottom;
      const top = compact ? 110 : panelRect.bottom - view.top + 24;
      const ground = (profile.marks || [])
        .filter(mark => startM <= mark.station && mark.station <= endM && Number.isFinite(mark.ground))
        .map(mark => mark.ground);
      const low = ends[0].map((_, axis) => Math.min(...points.map(point => point[axis])) - 2);
      const high = ends[1].map((_, axis) => Math.max(...points.map(point => point[axis])) + 2);
      high[2] = Math.max(high[2], ...ground);
      atlas.fit([{ bounds: [low, high] }], {
        insets: { top: Math.min(top, Math.max(0, view.height - bottom - 56)),
          right: 66, bottom, left: 32 },
        pad: 1.25,
      });
    });
    document.addEventListener('atlas:selectionchange', event => {
      if (event.detail?.id) releaseFocus();
    });
    document.getElementById('card')?.addEventListener('click', releaseFocus);

    for (const event of ['atlas:camera', 'atlas:visibility', 'atlas:section', 'atlas:sceneready',
      'atlas:sheet', 'atlas:selectionchange', 'atlas:scope', 'golunderground:state']) {
      document.addEventListener(event, schedule);
    }
    for (const id of ['sliceAxis', 'sliceValue', 'r23SliceFlip']) {
      document.getElementById(id)?.addEventListener('input', schedule);
    }
    document.addEventListener('atlas:snapshotpaint', event => {
      if (!visible || sectionActive()) return;
      const { viewport, add } = event.detail;
      add(ink => paint(ink, viewport, true));
    }, {capture: true}); // Границы рисуются под выноской замера, как в модели.
    // A9 exposes its active setting through the mounted layer. It may mount after this overlay.
    const marksVisibility = new MutationObserver(schedule);
    function watchFieldMarks() {
      const layer = stage.querySelector('.af-mk-layer');
      if (layer === fieldMarks) return;
      marksVisibility.disconnect();
      fieldMarks = layer;
      if (fieldMarks) marksVisibility.observe(fieldMarks, { attributes: true, attributeFilter: ['hidden'] });
      schedule();
    }
    new MutationObserver(watchFieldMarks).observe(stage, { childList: true });
    watchFieldMarks();
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(stage);
    if (root) resizeObserver.observe(root);
    schedule();
  }

  function boot() {
    const stage = document.querySelector('.stage');
    const atlas = window.__ATLAS;
    if (!stage || !atlas?.whenReady || new URLSearchParams(location.search).has('pdExc')) return;
    void atlas.whenReady().then(() => mount(atlas, stage));
  }

  if (window.__ATLAS) boot();
  else document.addEventListener('atlas:ready', boot, { once: true });
})();
