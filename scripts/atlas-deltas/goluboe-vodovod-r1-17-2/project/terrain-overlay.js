/* Горизонтали и вертикальный замер по поверхности рельефа Голубого. */
(() => {
  'use strict';

  const contourColor = { major: '#384f38', minor: '#4d6247', outline: '#f5f7e9' };
  const depthColor = '#126481';
  const elevatedColor = '#8b531e';
  const elevation = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always',
  });
  const contourElevation = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 1, maximumFractionDigits: 2, signDisplay: 'always',
  });
  const distance = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const obstacleSelector = [
    '.tools', '.stage-actions', '.zoom-controls', '#fit', '.atb-view',
    '#pdExcavationOverview', '.card-occl:not([hidden])', '#left.open', '#right.open',
    '.pdWorldProfileLabel:not([hidden])', '#atbIssues:not([hidden])', '.af-fab:not([hidden])',
  ].join(',');
  const styles = `
    #pdTerrainOverlay,#pdDepthOverlay{position:absolute;inset:0;z-index:3;overflow:hidden;pointer-events:none}
    #pdDepthOverlay{z-index:4}
    #pdTerrainOverlay[hidden],#pdDepthOverlay[hidden],.pdTerrainDepthNote[hidden]{display:none}
    #pdTerrainOverlay canvas,#pdDepthOverlay canvas{position:absolute;inset:0;width:100%;height:100%}
    .pdTerrainDepthNote{position:absolute;top:0;left:0;display:grid;gap:4px;box-sizing:border-box;
      width:max-content;max-width:min(235px,calc(100% - 16px));padding:7px 9px;
      border:1px solid #6c9aac;border-left:3px solid #126481;border-radius:6px;
      background:var(--c-float,#fff);color:var(--c-text,#173747);box-shadow:0 3px 12px #123c572a;
      font:12px/1.25 system-ui,sans-serif;font-variant-numeric:tabular-nums}
    .pdTerrainDepthNote[data-elevated="true"]{border-left-color:#8b531e}
    .pdTerrainDepthNote [data-part="result"]{font-weight:700;font-size:15px}
    .pdTerrainDepthNote [data-part="target"]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pdTerrainDepthNote [data-part="levels"]{white-space:pre-line;color:var(--c-text-2,#456172)}
  `;

  function intersects(a, b, gap = 4) {
    return a.left < b.right + gap && a.right + gap > b.left &&
      a.top < b.bottom + gap && a.bottom + gap > b.top;
  }

  function fits(box, viewport, occupied) {
    return box.left >= 6 && box.top >= 6 && box.right <= viewport.width - 6 &&
      box.bottom <= viewport.height - 6 && !occupied.some(other => intersects(box, other));
  }

  function labelBox(x, y, width, height) {
    const left = Math.round(x - width / 2);
    const top = Math.round(y - height / 2);
    return { left, top, right: left + width, bottom: top + height };
  }

  function noteBox(pin, width, height, viewport, occupied) {
    for (const gap of [16, 32, 52, 86, 126, 174]) {
      for (const [directionX, directionY] of [[1,-1],[-1,-1],[1,1],[-1,1],[0,-1],[0,1],[1,0],[-1,0]]) {
        const x = pin.x + directionX * (gap + width / 2);
        const y = pin.y + directionY * (gap + height / 2);
        const cx = Math.max(width / 2 + 6, Math.min(viewport.width - width / 2 - 6, x));
        const cy = Math.max(height / 2 + 6, Math.min(viewport.height - height / 2 - 6, y));
        const box = labelBox(cx, cy, width, height);
        if (fits(box, viewport, occupied)) return box;
      }
    }
    return null;
  }

  function pointOn(a, b, fraction) {
    return a.map((value, axis) => value + (b[axis] - value) * fraction);
  }

  function sectionBox(atlas) {
    const state = atlas.sectionState?.();
    if (state?.slider?.axis) return null;
    const section = state?.section;
    if (!section || section.box) return section?.box ?? [];
    const axis = 'xyz'.indexOf(section.axis);
    if (axis < 0 || !Number.isFinite(section.value)) return [];
    const box = [[-Infinity,-Infinity,-Infinity],[Infinity,Infinity,Infinity]];
    box[section.flip ? 0 : 1][axis] = section.value;
    return box;
  }

  function clipSegment(a, b, bounds) {
    let from = 0, to = 1;
    for (let axis = 0; axis < a.length; axis++) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-10) {
        if (a[axis] < bounds[0][axis] || a[axis] > bounds[1][axis]) return null;
        continue;
      }
      const t0 = (bounds[0][axis] - a[axis]) / delta;
      const t1 = (bounds[1][axis] - a[axis]) / delta;
      from = Math.max(from, Math.min(t0, t1));
      to = Math.min(to, Math.max(t0, t1));
      if (from > to) return null;
    }
    return [from, to];
  }

  function projectedSegment(a, b, project, viewport, section) {
    if (section.length) {
      const fractions = clipSegment(a, b, section);
      if (!fractions) return null;
      const start = a, end = b;
      a = pointOn(start, end, fractions[0]);
      b = pointOn(start, end, fractions[1]);
    }
    const first = project(a), last = project(b);
    if (!first || !last) return null;
    const from = [first.x, first.y], to = [last.x, last.y];
    const fractions = clipSegment(from, to, [[0,0],[viewport.width, viewport.height]]);
    if (!fractions) return null;
    if (!first.inside && !last.inside) {
      const midpoint = pointOn(a, b, (fractions[0] + fractions[1]) / 2);
      if (!project(midpoint)?.inside) return null;
    }
    const p = pointOn(from, to, fractions[0]), q = pointOn(from, to, fractions[1]);
    return { a: p, b: q, length: Math.hypot(q[0] - p[0], q[1] - p[1]) };
  }

  function terrainVisible(atlas, terrain) {
    const id = terrain.id || terrain.terrainId;
    if (!id) return true;
    if (atlas.inScene && !atlas.inScene(id)) return false;
    if (atlas.hiddenState?.()?.ids?.includes(id)) return false;
    const visibleSet = atlas.visibleSetState?.();
    if (visibleSet && !visibleSet.ids.includes(id)) return false;
    const capture = window.__R24?.capture?.();
    return !capture?.isolatedIds?.length || capture.isolatedIds.includes(id);
  }

  function drawPath(ctx, segments) {
    ctx.beginPath();
    for (const { a, b } of segments) {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
  }

  function drawContours(ctx, groups) {
    for (const major of [false, true]) {
      drawPath(ctx, groups.filter(item => item.major === major).flatMap(item => item.segments));
      ctx.strokeStyle = contourColor.outline;
      ctx.globalAlpha = major ? 0.86 : 0.48;
      ctx.lineWidth = major ? 2.8 : 1.65;
      ctx.stroke();
      ctx.strokeStyle = major ? contourColor.major : contourColor.minor;
      ctx.globalAlpha = major ? 0.91 : 0.63;
      ctx.lineWidth = major ? 1.4 : 0.78;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawContourLabels(ctx, groups, viewport, occupied) {
    const font = 'system-ui, sans-serif';
    const placed = [];
    const widthLimit = viewport.width < 500 ? 6 : 12;
    const candidates = groups.map(group => {
      const longest = group.segments.sort((a, b) => b.length - a.length)[0]?.length ?? 0;
      return { ...group, longest };
    }).sort((a, b) => Number(b.major) - Number(a.major) || b.longest - a.longest);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const group of candidates) {
      if (placed.length >= widthLimit) break;
      if (!group.major && group.longest < 37) continue;
      const label = contourElevation.format(group.level);
      ctx.font = (group.major ? '650 12px ' : '550 11px ') + font;
      const width = Math.ceil(ctx.measureText(label).width) + 9;
      const height = group.major ? 17 : 15;
      let accepted = false;
      for (const segment of group.segments.slice(0, 20)) {
        if (segment.length < 5) break;
        for (const fraction of [0.5, 0.25, 0.75]) {
          const [x, y] = pointOn(segment.a, segment.b, fraction);
          const spacing = group.major ? 34 : 70;
          if (placed.some(point => Math.hypot(x - point[0], y - point[1]) < spacing)) continue;
          const box = labelBox(x, y, width, height);
          if (!fits(box, viewport, occupied)) continue;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#f7f9ef';
          ctx.lineWidth = group.major ? 3.7 : 3.1;
          ctx.strokeText(label, x, y);
          ctx.fillStyle = group.major ? '#2b3c2b' : '#425240';
          ctx.fillText(label, x, y);
          occupied.push(box);
          placed.push([x, y]);
          accepted = true;
          break;
        }
        if (accepted) break;
      }
    }
    return placed.length;
  }

  function drawMark(ctx, point, color, solid) {
    if (!point?.inside) return;
    ctx.beginPath();
    ctx.arc(point.x, point.y, solid ? 4.9 : 4.2, 0, Math.PI * 2);
    ctx.fillStyle = solid ? color : '#f3fbff';
    ctx.fill();
    ctx.strokeStyle = solid ? '#fff' : color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  function drawMeasureLine(ctx, segment, color, dashed = false) {
    if (!segment || segment.length < 1.2) return;
    drawPath(ctx, [segment]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.1;
    if (dashed) ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawNoteLead(ctx, anchor, box, color) {
    const a = [anchor.x, anchor.y];
    const b = [
      Math.max(box.left, Math.min(box.right, anchor.x)),
      Math.max(box.top, Math.min(box.bottom, anchor.y)),
    ];
    drawMeasureLine(ctx, { a, b, length: Math.hypot(b[0] - a[0], b[1] - a[1]) }, color);
  }

  function drawSnapshotNote(ctx, anchor, caption, viewport, occupied, colors) {
    const limit = Math.min(235, viewport.width - 16);
    if (limit <= 22) return null;
    const available = limit - 22;
    const rows = [
      { text: caption.result, font: '700 15px system-ui,sans-serif', color: colors.text, height: 19, gap: 4 },
      ...(caption.target ? [{ text: caption.target, font: '12px system-ui,sans-serif', color: colors.text, height: 15, gap: 4 }] : []),
      ...caption.levels.map(text => ({ text, font: '12px system-ui,sans-serif', color: colors.levels, height: 15, gap: 0 })),
    ];
    if (caption.target) {
      const row = rows[1];
      ctx.font = row.font;
      if (ctx.measureText(row.text).width > available) {
        let text = row.text;
        while (text && ctx.measureText(text + '…').width > available) text = text.slice(0, -1);
        row.text = text + '…';
      }
    }
    const width = Math.min(limit, Math.ceil(Math.max(...rows.map(row => {
      ctx.font = row.font;
      return ctx.measureText(row.text).width;
    }))) + 22);
    const height = 16 + rows.reduce((sum, { height, gap }) => sum + height + gap, 0);
    const box = noteBox(anchor, width, height, viewport, occupied) ||
      noteBox(anchor, width, height, viewport, []);
    if (!box) return null;

    drawNoteLead(ctx, anchor, box, caption.color);
    ctx.save();
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.left, box.top, width, height, 6);
    else ctx.rect(box.left, box.top, width, height);
    ctx.clip();
    ctx.fillStyle = colors.background;
    ctx.fillRect(box.left, box.top, width, height);
    ctx.fillStyle = caption.color;
    ctx.fillRect(box.left, box.top, 3, height);
    ctx.strokeStyle = '#6c9aac';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let y = box.top + 8;
    for (const row of rows) {
      ctx.font = row.font;
      ctx.fillStyle = row.color;
      ctx.fillText(row.text, box.left + 12, y + row.height / 2, width - 22);
      y += row.height + row.gap;
    }
    ctx.restore();
    return box;
  }

  function mount(atlas, stage, terrain, { getObstacles = () => [] } = {}) {
    const format = document.createElement('style');
    format.textContent = styles;
    document.head.append(format);
    const layer = document.createElement('div');
    layer.id = 'pdTerrainOverlay';
    layer.hidden = true;
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    layer.append(canvas);
    const depthLayer = document.createElement('div');
    depthLayer.id = 'pdDepthOverlay';
    depthLayer.hidden = true;
    const depthCanvas = document.createElement('canvas');
    depthCanvas.setAttribute('aria-hidden', 'true');
    const note = document.createElement('div');
    note.className = 'pdTerrainDepthNote';
    note.hidden = true;
    const title = document.createElement('strong');
    title.dataset.part = 'result';
    const target = document.createElement('span');
    target.dataset.part = 'target';
    const levels = document.createElement('span');
    levels.dataset.part = 'levels';
    note.append(title, target, levels);
    depthLayer.append(depthCanvas, note);
    stage.append(layer, depthLayer);
    const ctx = canvas.getContext('2d');
    const depthCtx = depthCanvas.getContext('2d');
    let contoursShown = false;
    let measurement = null;
    let frame = 0;

    function measure(ink, viewport, project, occupied, section, snapshot) {
      if (!snapshot) note.hidden = true;
      if (!measurement) return;
      const { point, ground, label, reference = 'Точка' } = measurement;
      const pin = project(point);
      const groundPoint = ground === null ? null : [point[0], point[1], ground];
      const top = groundPoint && project(groundPoint);
      const segment = groundPoint && projectedSegment(point, groundPoint, project, viewport, section);
      const depth = ground === null ? null : ground - point[2];
      const above = depth !== null && depth < -0.005;
      const color = above ? elevatedColor : depthColor;
      drawMeasureLine(ink, segment, color, true);
      drawMark(ink, top, color, false);
      drawMark(ink, pin, color, true);
      if (!snapshot && innerWidth <= 850 && stage.querySelector('.pdMobileDepth[data-measured="true"]:not([hidden])')) return;
      let anchor = pin?.inside ? pin : top?.inside ? top : null;
      if (!anchor && snapshot && segment?.length >= 1.2) {
        const [x, y] = pointOn(segment.a, segment.b, 0.5);
        anchor = { x, y };
      }
      if (!anchor) return;
      const result = depth === null ? 'Нет поверхности рельефа' : above
        ? 'Выше рельефа на ' + distance.format(-depth) + ' м'
        : depth < 0.005 ? 'На поверхности рельефа' : 'Глубина ' + distance.format(depth) + ' м';
      const heights = [reference + ' ' + elevation.format(point[2]) + ' м'];
      if (ground !== null) heights.push('Рельеф ' + elevation.format(ground) + ' м');
      if (snapshot) {
        const style = getComputedStyle(note);
        const colors = { background: style.backgroundColor, text: style.color, levels: getComputedStyle(levels).color };
        const box = drawSnapshotNote(ink, anchor, { result, target: label, levels: heights, color }, viewport, occupied, colors);
        if (box) occupied.push(box);
        return;
      }
      title.textContent = result;
      target.textContent = label ?? '';
      target.hidden = !label;
      levels.textContent = heights.join('\n');
      note.dataset.elevated = String(above);
      note.hidden = false;
      const box = noteBox(anchor, note.offsetWidth, note.offsetHeight, viewport, occupied);
      if (!box) {
        note.hidden = true;
        return;
      }
      note.style.transform = 'translate(' + box.left + 'px,' + box.top + 'px)';
      occupied.push(box);
      drawNoteLead(ink, anchor, box, color);
    }

    function paint(ink, viewport, drawGround, section, { snapshot = false, depthInk = ink } = {}) {
      for (const context of new Set([ink, depthInk])) {
        if (!context) continue;
        context.lineCap = 'round';
        context.lineJoin = 'round';
      }
      function project(point) {
        const view = atlas.projectToScreen(point);
        if (!view || !Number.isFinite(view[0]) || !Number.isFinite(view[1])) return null;
        return { x: view[0] - viewport.left, y: view[1] - viewport.top, inside: view[2] !== false };
      }

      const obstacles = snapshot ? [document.getElementById('axisCanvas')] :
        [...document.querySelectorAll(obstacleSelector), ...(getObstacles() ?? [])];
      obstacles.push(...stage.querySelectorAll('.pd-datum-hit[data-form="label"]:not([hidden])'));
      const occupied = obstacles
        .map(item => item?.getBoundingClientRect?.() ?? item)
        .filter(rect => rect && rect.width > 0 && rect.height > 0 &&
          rect.right > viewport.left && rect.left < viewport.right &&
          rect.bottom > viewport.top && rect.top < viewport.bottom)
        .map(rect => ({
          left: rect.left - viewport.left, right: rect.right - viewport.left,
          top: rect.top - viewport.top, bottom: rect.bottom - viewport.top,
        }));
      const groups = [];
      if (drawGround) {
        for (const contour of terrain.contours) {
          const segments = [];
          for (const [a, b] of contour.segments) {
            const projected = projectedSegment(a, b, project, viewport, section);
            if (projected?.length > 0.3) segments.push(projected);
          }
          if (segments.length) groups.push({ level: contour.level, major: contour.major, segments });
        }
        drawContours(ink, groups);
      }
      if (depthInk) measure(depthInk, viewport, project, occupied, section, snapshot);
      const labelCount = drawGround ? drawContourLabels(ink, groups, viewport, occupied) : 0;
      if (!snapshot) {
        layer.dataset.contourLevels = String(groups.length);
        layer.dataset.contourLabels = String(labelCount);
      }
    }

    function draw() {
      frame = 0;
      const drawGround = contoursShown && terrainVisible(atlas, terrain);
      const section = sectionBox(atlas);
      layer.hidden = (!drawGround && !measurement) || !ctx || section === null;
      depthLayer.hidden = !measurement || !depthCtx || section === null;
      if (layer.hidden) {
        layer.dataset.contourLevels = '0';
        layer.dataset.contourLabels = '0';
        note.hidden = true;
        return;
      }
      const viewport = layer.getBoundingClientRect();
      const { width, height } = viewport;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const backingWidth = Math.round(width * ratio);
      const backingHeight = Math.round(height * ratio);
      for (const context of [ctx, depthCtx]) {
        if (!context) continue;
        if (context.canvas.width !== backingWidth) context.canvas.width = backingWidth;
        if (context.canvas.height !== backingHeight) context.canvas.height = backingHeight;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);
      }
      paint(ctx, viewport, drawGround, section, { depthInk: depthCtx });
    }

    // Горизонтали ниже границ участка, линия и выноска замера выше.
    document.addEventListener('atlas:snapshotpaint', event => {
      const { viewport, add } = event.detail;
      const drawGround = contoursShown && terrainVisible(atlas, terrain);
      const section = sectionBox(atlas);
      if (!drawGround || section === null || !viewport.width || !viewport.height) return;
      add(ink => paint(ink, viewport, true, section, {snapshot: true, depthInk: null}));
    }, {capture: true});
    document.addEventListener('atlas:snapshotpaint', event => {
      const { viewport, add } = event.detail;
      const section = sectionBox(atlas);
      if (!measurement || section === null || !viewport.width || !viewport.height) return;
      add(ink => paint(ink, viewport, false, section, {snapshot: true}));
    });

    function render() {
      if (!frame) frame = requestAnimationFrame(draw);
    }
    function onViewChange() {
      if (contoursShown || measurement) render();
    }
    stage.addEventListener('pd:datumlayout',onViewChange);
    for (const event of [
      'atlas:camera', 'atlas:visibility', 'atlas:section', 'atlas:sceneready',
      'atlas:sheet', 'atlas:selectionchange', 'atlas:scope',
    ]) document.addEventListener(event, onViewChange);
    for (const id of ['sliceAxis', 'sliceValue', 'r23SliceFlip']) {
      const slider = document.getElementById(id);
      slider?.addEventListener('input', onViewChange);
      slider?.addEventListener('change', onViewChange);
    }
    new ResizeObserver(onViewChange).observe(stage);
    window.visualViewport?.addEventListener('resize', onViewChange);
    document.fonts?.ready.then(onViewChange);

    return {
      showContours(enabled) {
        contoursShown = !!enabled;
        render();
      },
      setDepth(result) {
        measurement = result && Array.isArray(result.point) && result.point.length === 3 &&
          result.point.every(Number.isFinite)
          ? { ...result, ground: Number.isFinite(result.ground) ? result.ground : null } : null;
        render();
      },
      render,
    };
  }

  window.GOL_TERRAIN_OVERLAY = { mount };
})();
