(() => {
  'use strict';

  const numberFormat = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false,
  });
  const signedFormat = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false, signDisplay: 'always',
  });
  const stationFormat = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 3, useGrouping: false});
  const pickOwner = 'golTerrainDepthPoint';
  const firstHint = 'Выберите точку на модели или введите расстояние от КВ‑1.';
  const plotRange = window.ATLAS_PROFILE_WORLD?.route ?? [];
  const pilotEndM = 45;
  const pilotEdition = 'R1.2-field-1';

  function parseStation(value) {
    const raw = value.trim();
    return /^\d+(?:[.,]\d{1,3})?$/.test(raw) ? Number(raw.replace(',', '.')) : NaN;
  }

  function invertAt(station) {
    const endIndex = plotRange.findIndex(point => point.station >= station);
    const end = plotRange[endIndex];
    if (!end) return null;
    if (end.station === station) return [end.x, end.y, end.invert];
    const start = plotRange[endIndex - 1];
    if (!start) return null;
    const fraction = (station - start.station) / (end.station - start.station);
    return ['x', 'y', 'invert'].map(key => start[key] + (end[key] - start[key]) * fraction);
  }

  function addControls(menu) {
    const controls = document.createElement('section');
    controls.className = 'golTerrainTools';
    controls.setAttribute('aria-label', 'Глубина залегания');
    controls.innerHTML = `
      <div class="golTerrainActions">
        <button type="button" id="golRulerToggle">Линейка</button>
        <button type="button" id="golDepthToggle" aria-pressed="false" aria-controls="golDepthPanel" title="Измерить расстояние по вертикали до рельефа">Глубина</button>
      </div>
      <div id="golDepthPanel" hidden>
        <p id="golDepthResult" role="status" aria-live="polite"></p>
        <form aria-label="Глубина лотка по пикетажу" novalidate>
          <label>Расстояние от КВ‑1, м
            <input name="station" inputmode="decimal" type="text" placeholder="0–400" aria-describedby="golDepthResult">
          </label>
          <button type="submit">Измерить</button>
        </form>
        <div class="golFieldPassport" hidden>
          <a data-part="view">Ссылка на замер</a>
          <details data-part="details">
            <summary>Источники</summary>
            <div data-part="sources"></div>
          </details>
        </div>
      </div>
    `;
    const contours = document.createElement('button');
    contours.type = 'button';
    contours.id = 'golContourToggle';
    contours.textContent = 'Горизонтали';
    contours.title = 'Горизонтали через 0,5 м';
    contours.setAttribute('aria-pressed', 'true');
    menu.layers.querySelector('.pdLayerActions').append(contours);
    menu.measurements.append(controls);
    controls.querySelector('#golRulerToggle').addEventListener('click', () => {
      document.getElementById('quickMeasure')?.click();
      menu.close();
    });
    const style = document.createElement('style');
    style.textContent = `
      .golTerrainTools {padding:0 4px}
      .golTerrainActions {display:flex;flex-wrap:wrap;align-items:center;gap:4px}
      .golTerrainTools button {font:inherit;font-weight:600;padding:6px 8px;white-space:nowrap;
        border:1px solid var(--c-line-mid);border-radius:var(--r-s);background:var(--c-surface-2);color:var(--c-link);cursor:pointer}
      .golTerrainTools button[aria-pressed=true] {border-color:var(--c-line-mid);background:var(--c-brand-tint)}
      #golDepthPanel {border-top:1px solid var(--c-line);margin-top:4px;padding:3px 4px 4px;max-width:320px}
      #golDepthPanel[hidden] {display:none}
      #golDepthPanel form {display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:6px}
      #golDepthPanel label {display:grid;gap:2px;min-width:0;font-weight:600}
      #golDepthPanel input {font:inherit;padding:5px 8px;width:100%;min-height:44px;box-sizing:border-box;
        background:var(--c-surface);border:1px solid var(--c-line-mid);border-radius:4px;color:var(--c-text)}
      #golDepthPanel button[type=submit] {min-height:44px}
      #golDepthPanel input[aria-invalid=true] {border-color:#ab4038}
      #golDepthResult {margin:2px 0 5px;color:var(--c-text-2);font-size:13px;line-height:1.35;white-space:normal}
      #golDepthResult strong {display:block;font-size:16px;color:var(--c-text);font-variant-numeric:tabular-nums}
      #golDepthResult .golDepthLevels {display:flex;flex-wrap:wrap;gap:0 12px;font-variant-numeric:tabular-nums}
      #golDepthResult[data-state=error] {color:var(--sig-high-text)}
      .golFieldPassport {display:flex;align-items:flex-start;flex-wrap:wrap;gap:0 12px;margin-top:4px;color:var(--c-text-2);font-size:13px;line-height:1.35}
      .golFieldPassport[hidden] {display:none}
      .golFieldPassport a {color:var(--c-link)}
      .golFieldPassport [data-part="view"], .golFieldPassport summary {padding:8px 0;font-weight:600}
      .golFieldPassport summary {cursor:pointer;color:var(--c-link)}
      .golFieldPassport details[open] {flex-basis:100%}
      .golFieldPassport [data-part="sources"] a {display:inline-flex;min-height:36px;align-items:center;padding:0 5px}
      @media(max-width:850px) {
        body.golDepthOn:not(.pdInspecting) #right {display:none}
        .golTerrainActions button {min-height:44px}
        #golDepthPanel input {font-size:16px}
      }
    `;
    document.head.append(style);
    return controls;
  }

  function mount(atlas, stage, menu) {
    const terrain = window.GOL_TERRAIN?.create(atlas);
    if (!terrain || !window.GOL_TERRAIN_OVERLAY) return;
    const controls = addControls(menu);
    const showContours = menu.layers.querySelector('#golContourToggle');
    const toggle = controls.querySelector('#golDepthToggle');
    const depthPanel = controls.querySelector('#golDepthPanel');
    const status = controls.querySelector('#golDepthResult');
    const form = controls.querySelector('form');
    const input = form.elements.namedItem('station');
    const passport = controls.querySelector('.golFieldPassport');
    const passportDetails = passport.querySelector('[data-part="details"]');
    const passportView = passport.querySelector('[data-part="view"]');
    const passportSources = passport.querySelector('[data-part="sources"]');
    const profileDoc = window.ATLAS_PROJECT?.documents?.find(doc => doc.code === '19/26-2026-ППО');
    const overlay = window.GOL_TERRAIN_OVERLAY.mount(atlas, stage, terrain, {getObstacles: () => [menu.root]});
    new ResizeObserver(overlay.render).observe(menu.root);
    let enabled = false;

    function feedback(message) {
      passport.hidden = true;
      status.textContent = message;
      status.dataset.state = 'hint';
    }

    function report(point, caption, reference = 'Точка') {
      passport.hidden = true;
      const ground = terrain.heightAt(point[0], point[1]);
      overlay.setDepth({point, ground, label: caption, reference});
      if (ground === null) {
        feedback('Глубина по модели не определена. В этой точке нет поверхности рельефа.');
        status.dataset.state = 'outside';
        return ground;
      }
      const depth = ground - point[2];
      const magnitude = numberFormat.format(Math.abs(depth));
      const headline = document.createElement('strong');
      headline.textContent = Math.abs(depth) < 0.005 ? 'На поверхности · 0,00\u00a0м'
        : (depth > 0 ? 'Глубина ' : 'Выше рельефа на ') + magnitude + '\u00a0м';
      const levels = document.createElement('span');
      levels.className = 'golDepthLevels';
      for (const [name, elevation] of [[reference, point[2]], ['Рельеф', ground]]) {
        const level = document.createElement('span');
        level.textContent = name + ' ' + signedFormat.format(elevation) + '\u00a0м';
        levels.append(level);
      }
      status.replaceChildren(headline, levels);
      status.dataset.state = 'measured';
      return ground;
    }

    function fitStation(point, ground) {
      const z = ground ?? point[2];
      const view = stage.getBoundingClientRect();
      const returnButton = document.querySelector('.af-fab:not([hidden])')?.getBoundingClientRect();
      const bottom = returnButton?.height ? Math.max(73, Math.ceil(view.bottom - returnButton.top + 12)) : 73;
      atlas.fit([{bounds: [
        [point[0] - 3, point[1] - 3, Math.min(point[2], z) - 0.6],
        [point[0] + 3, point[1] + 3, Math.max(point[2], z) + 0.6],
      ]}], {insets: menu.fitInsets({top: 110, bottom, left: 20, right: 64}), pad: 1.15});
    }

    function measureInvert(station, point) {
      input.value = stationFormat.format(station);
      input.removeAttribute('aria-invalid');
      const ground = report(point, 'Лоток по профилю', 'Лоток');
      if (pilotPoint(station)) showPassport(station, ground);
      fitStation(point, ground);
      return {
        stationM: station, pointKind: 'invert', point: [...point], terrainM: ground,
        depthM: ground === null ? null : ground - point[2],
      };
    }

    function pilotPoint(station) {
      if (!Number.isFinite(station) || station < 0 || station > pilotEndM) return null;
      if (Number(station.toFixed(3)) !== station) return null;
      return invertAt(station);
    }

    function showPassport(station, ground) {
      const fromSheet = window.ATLAS_PROFILE_WORLD?.marks?.some(mark => mark.station === station);
      const link = new URLSearchParams({
        pdFieldPk: String(station), pdFieldMeasure: 'invert', pdFieldEdition: pilotEdition,
      });
      passportView.href = '?' + link;
      const originInfo = document.createElement('div');
      originInfo.textContent = fromSheet ? 'Отметка лотка по профилю' : 'Отметка лотка интерполирована по профилю';
      if (profileDoc) {
        const sourceLink = document.createElement('a');
        sourceLink.href = profileDoc.file + '#page=18';
        sourceLink.textContent = 'ППО, л. 5';
        originInfo.append(' · ', sourceLink);
      }
      passportDetails.open = false;
      passportSources.replaceChildren(originInfo);
      if (ground !== null) {
        const terrainInfo = document.createElement('div');
        terrainInfo.textContent = 'Отметка земли получена интерполяцией по модели рельефа.';
        terrainInfo.title = 'Триангуляционная модель рельефа (TIN)';
        passportSources.append(terrainInfo);
      }
      passport.hidden = false;
    }

    function setMode(next, release = true) {
      if (next === enabled) return;
      if (next) window.AtlasMeasure?.set(false);
      enabled = next;
      document.body.classList.toggle('golDepthOn', enabled);
      toggle.setAttribute('aria-pressed', String(enabled));
      toggle.textContent = enabled ? 'Закрыть замер' : 'Глубина';
      toggle.title = enabled ? 'Закрыть замер глубины' : 'Измерить расстояние по вертикали до рельефа';
      depthPanel.hidden = !enabled;
      if (enabled) {
        menu.showMeasurements();
        feedback(firstHint);
        if (atlas.selection() === terrain.terrainId) atlas.deselect();
        atlas.setToolMode('measure');
        overlay.render();
      } else {
        overlay.setDepth(null);
        input.removeAttribute('aria-invalid');
        if (release && atlas.toolMode() === 'measure' && !window.AtlasMeasure?.on()) atlas.setToolMode(null);
      }
    }

    function pickPoint(x, y) {
      const nearest = atlas.pickSurface(x, y, {snap: false, radiusPx: 0});
      if (nearest?.id !== terrain.terrainId) return nearest;
      const viewSettings = window.AtlasViewSettings;
      if (!viewSettings) return nearest;
      viewSettings.ghost(pickOwner, [terrain.terrainId], {pick: false});
      try {
        return atlas.pickSurface(x, y, {snap: false, radiusPx: 0}) ?? nearest;
      } finally {
        viewSettings.ghost(pickOwner, null);
      }
    }

    toggle.addEventListener('click', () => setMode(!enabled));
    showContours.addEventListener('click', () => {
      const next = showContours.getAttribute('aria-pressed') !== 'true';
      showContours.setAttribute('aria-pressed', String(next));
      overlay.showContours(next);
    });
    document.addEventListener('atlas:measurepoint', event => {
      if (!enabled) return;
      const {clientX, clientY} = event.detail;
      const hit = pickPoint(clientX, clientY);
      input.removeAttribute('aria-invalid');
      if (!hit) {
        overlay.setDepth(null);
        feedback('Точка не выбрана. Выберите точку на модели или введите расстояние от КВ‑1.');
      } else {
        report(hit.point, hit.name);
      }
    });
    document.addEventListener('atlas:toolmode', event => {
      if (enabled && (event.detail.mode !== 'measure' || window.AtlasMeasure?.on())) setMode(false, false);
    });
    document.addEventListener('keydown', event => {
      if (enabled && event.key === 'Escape' && !document.querySelector('#modal.open,dialog[open]')) {
        event.preventDefault();
        event.stopPropagation();
        setMode(false);
        (toggle.offsetParent ? toggle : document.getElementById('pdNetworkMeasureToggle'))?.focus();
      }
    }, true);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const station = parseStation(input.value);
      const point = Number.isFinite(station) ? invertAt(station) : null;
      if (!point) {
        input.setAttribute('aria-invalid', 'true');
        feedback('Укажите расстояние от 0 до 400 м.');
        status.dataset.state = 'error';
        input.focus();
        return;
      }
      measureInvert(station, point);
    });
    window.ATLAS_FIELD_LOCATE = station => {
      const point = pilotPoint(station);
      if (!point) return false;
      document.querySelector('[data-view="iso"]')?.click();
      fitStation(point, terrain.heightAt(point[0], point[1]));
      return true;
    };
    window.ATLAS_FIELD_MEASURE_INVERT = station => {
      const point = pilotPoint(station);
      if (!point) return null;
      setMode(true);
      return measureInvert(station, point);
    };
    const query = new URLSearchParams(location.search);
    if (!query.has('pdLocate') && query.has('pdFieldPk')) {
      const station = parseStation(query.get('pdFieldPk'));
      if (window.ATLAS_FIELD_LOCATE(station) && query.get('pdFieldMeasure') === 'invert') {
        if (query.get('pdFieldEdition') === pilotEdition) window.ATLAS_FIELD_MEASURE_INVERT(station);
        else {
          setMode(true);
          feedback('Ссылка на замер относится к другой редакции полевого комплекта.');
        }
      }
    }
    overlay.showContours(true);
  }

  window.GOL_TERRAIN_TOOLS = {mount};
})();
