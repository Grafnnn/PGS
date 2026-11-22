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

  let sceneIds = [];
  let plannedIds = new Set();
  let statuses = {};

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
    view.ghost('golDemoPending', transparent, { alpha: 0.22, pick: false });
    view.ghost('golDemoPartial', partial, { alpha: 0.44, pick: false });
  }

  addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== origin) return;
    const message = event.data;
    if (message?.type !== 'atlas-progress-demo:states' || !Array.isArray(message.planned) ||
        !message.states || typeof message.states !== 'object') return;
    plannedIds = new Set(message.planned.filter(id => typeof id === 'string'));
    statuses = message.states;
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
      displayProgress();
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event('resize'));
        window.parent.postMessage({ type: 'atlas-progress-demo:ready' }, origin === 'null' ? '*' : origin);
      });
    });
  }, { once: true });
})();
