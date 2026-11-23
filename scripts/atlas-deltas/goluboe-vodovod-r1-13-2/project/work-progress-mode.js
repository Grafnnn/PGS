'use strict';

(() => {
  const query = new URLSearchParams(location.search);
  if (query.get('pdDemo') !== '1' || window.parent === window) {
    document.addEventListener('atlas:shell', () => {
      for (const link of document.querySelectorAll('a[href="project/work-progress-demo.html"]')) {
        link.target = '_blank';
        link.rel = 'noopener';
      }
    });
    let notice;
    let noticeTimer;
    document.addEventListener('atlas:markpick', event => {
      const { id, part } = event.detail || {};
      if (!id) return;
      const items = window.ATLAS_PROGRESS_ITEMS?.items || {};
      const key = part ? id + '::' + part : id;
      if (Object.hasOwn(items, key)) return;
      event.stopImmediatePropagation();
      if (!notice) {
        notice = document.createElement('p');
        notice.className = 'gol-progress-notice';
        notice.setAttribute('role', 'status');
        document.body.append(notice);
      }
      notice.hidden = false;
      notice.textContent = 'Этот элемент не входит в план работ.';
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
    }, { capture: true });
    return;
  }

  document.documentElement.classList.add('gol-progress-demo');
  const origin = location.protocol === 'file:' ? 'null' : location.origin;
  const terrainId = 'NET-GOL-PD-TERRAIN-1';
  const planSurface = id => id.includes('-RESTORE-PLAN-');
  const surveySymbol = id =>
    /^NET-GOL-PD-(?:CTX-|REF-|POS-R12-(?:ALLOTMENT|CRANE-POINT|FENCE-AXIS|WORKZONE)-)/.test(id) ||
    id === 'NET-GOL-PD-NODE-R12-KV1-EXIST-WATER-AXIS';

  // Keep the presentation camera and restoration surfaces local to the embedded viewer.
  const project = window.ATLAS_PROJECT;
  project.reference_bodies = project.reference_bodies.filter(id => !planSurface(id));
  if (innerWidth >= 700) project.camera = { ...project.camera, az: -0.08, el: 0.88 };

  const pipeSpans = [
    ['NET-V-PIPE-OPEN-1', 0, 7],
    ['NET-V-PIPE-HDD-1', 7, 31],
    ['NET-V-PIPE-HDD-2', 31, 390],
    ['NET-V-PIPE-OPEN-2', 390, 400]
  ];
  let sceneIds = [];
  let plannedIds = new Set();
  let statuses = {};
  let sampleMetres = null;
  let refreshRoute = () => {};

  function splitLine(points, metres) {
    if (!Number.isFinite(metres) || metres <= 0) return [[], points];
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1];
      const next = points[i];
      const delta = next.map((value, axis) => value - previous[axis]);
      const length = Math.hypot(...delta);
      if (metres < length) {
        const end = previous.map((value, axis) => value + delta[axis] * metres / length);
        return [[...points.slice(0, i), end], [end, ...points.slice(i)]];
      }
      metres -= length;
    }
    return [points, []];
  }

  function mountRoute(atlas) {
    const profile = window.ATLAS_PROFILE_WORLD;
    const stage = document.querySelector('#atlasMain > .stage');
    if (!profile?.route?.length || !stage) return;

    // The profile is tied to the model's pipe rings. The drawn line has a
    // screen-space width only and does not change the pipe or its dimensions.
    const sections = pipeSpans.filter(([id]) => atlas.inScene(id)).map(([id, from, to]) => ({
      id,
      color: atlas.get(id)?.originalColor?.slice(0, 7) || '#547581',
      points: profile.route.filter(point => point.station >= from && point.station <= to)
        .map(point => [point.x, point.y, point.invert + profile.insideRadius])
    })).filter(section => section.points.length > 1);
    if (!sections.length) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'golDemoRoute';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    stage.append(canvas);
    let frame = 0;

    function draw() {
      frame = 0;
      const area = canvas.getBoundingClientRect();
      if (!area.width || !area.height) return;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const width = Math.round(area.width * ratio);
      const height = Math.round(area.height * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, area.width, area.height);

      const centre = sections[0].points[0];
      const origin = atlas.projectToScreen(centre);
      const unitX = atlas.projectToScreen([centre[0] + 1, centre[1], centre[2]]);
      const unitY = atlas.projectToScreen([centre[0], centre[1] + 1, centre[2]]);
      const pixels = 0.225 * Math.max(Math.hypot(unitX[0] - origin[0], unitX[1] - origin[1]),
        Math.hypot(unitY[0] - origin[0], unitY[1] - origin[1]));
      const opacity = 1 - Math.max(0, Math.min(1, (pixels - 0.8) / 2.4));
      if (!opacity) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const completed = [];
      const pending = [];
      for (const {id, color, points} of sections) {
        const state = plannedIds.has(id) ? statuses[id] : null;
        if (state === 'done' || state === 'accepted') {
          completed.push({color, points});
          continue;
        }
        const [done, rest] = splitLine(points, state === 'partial' ? sampleMetres?.[id] : 0);
        if (done.length > 1) completed.push({color, points: done});
        if (rest.length > 1) pending.push({color, points: rest, partial: state === 'partial' && !done.length});
      }

      function stroke(line, finished) {
        ctx.beginPath();
        for (const [i, point] of line.points.entries()) {
          const [x, y] = atlas.projectToScreen(point);
          if (i) ctx.lineTo(x - area.left, y - area.top);
          else ctx.moveTo(x - area.left, y - area.top);
        }
        ctx.globalAlpha = opacity * (finished ? 0.93 : 0.12);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = finished ? 6.5 : 3.75;
        ctx.stroke();
        ctx.globalAlpha = opacity * (finished ? 1 : line.partial ? 0.32 : 0.18);
        ctx.strokeStyle = line.color;
        ctx.lineWidth = finished ? 4.5 : 2.25;
        ctx.stroke();
      }

      pending.forEach(line => stroke(line, false));
      completed.forEach(line => stroke(line, true));
    }

    refreshRoute = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    document.addEventListener('atlas:camera', refreshRoute);
    new ResizeObserver(refreshRoute).observe(stage);
  }

  function displayProgress() {
    const atlas = window.__ATLAS;
    const view = window.AtlasViewSettings;
    const transparent = [];
    const partial = [];

    for (const id of sceneIds) {
      if (id === terrainId) continue;
      const state = plannedIds.has(id) ? statuses[id] : null;
      if (state === 'done' || state === 'accepted') continue;
      if (state === 'partial') partial.push(id);
      else transparent.push(id);
    }

    atlas.setTint('pdNetworkTypes', null);
    view.ghost('golDemoTerrain', [terrainId], { alpha: 0.18, pick: false });
    view.ghost('golDemoPending', transparent, { alpha: 0.10, pick: false });
    view.ghost('golDemoPartial', partial, { alpha: 0.27, pick: false });
    refreshRoute();
  }

  addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== origin) return;
    const message = event.data;
    if (message?.type !== 'atlas-progress-demo:states' || !Array.isArray(message.planned) ||
        !message.states || typeof message.states !== 'object') return;
    plannedIds = new Set(message.planned.filter(id => typeof id === 'string'));
    statuses = message.states;
    sampleMetres = message.sample === true ? message.partialMetres : null;
    if (sceneIds.length) displayProgress();
  });

  document.addEventListener('atlas:ready', () => {
    // The plan module also configures the axes during atlas:ready.
    queueMicrotask(() => {
      if (window.AtlasBuildingAxes) window.AtlasBuildingAxes.draw = () => 0;
    });

    const atlas = window.__ATLAS;
    void atlas.whenReady().then(result => {
      if (result?.error) return;
      sceneIds = atlas.sceneObjects().map(object => object.renderId).filter(id => !surveySymbol(id));
      atlas.setVisibleSet(sceneIds, { keepOnScope: true });
      mountRoute(atlas);
      displayProgress();
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        window.parent.postMessage({ type: 'atlas-progress-demo:ready' }, origin === 'null' ? '*' : origin);
      });
    });
  }, { once: true });
})();
