/* Голубое. Условный обзорный вырез по ПК0+00–ПК0+45. Размеры модели неизменны. */
(() => {
  'use strict';

  const tintOwner = 'gol-underground-view';
  const contextOwner = 'gol-underground-cut-context';
  const cutCovers = [
    'NET-GOL-PD-NODE-CASING-OPEN-1',
    'NET-V-CASING-HDD-1',
    'NET-GOL-PD-POS-R12-VIEW-SHORING-TRENCH-1-LAGGING',
    'NET-GOL-PD-POS-R12-VIEW-RIM-TRENCH-1',
    'NET-GOL-PD-POS-R12-VIEW-CONTACT-WALL-TRENCH-1'
  ];
  const colors = {
    'NET-GOL-PD-TERRAIN-1': [181, 175, 156],
    'NET-V-PIPE-OPEN-1': [21, 110, 156],
    'NET-V-PIPE-HDD-1': [21, 110, 156],
    'NET-V-CASING-HDD-1': [82, 129, 150],
    'NET-GOL-PD-NODE-CASING-OPEN-1': [82, 129, 150],
    'NET-GOL-PD-CTX-XING-01': [136, 102, 72]
  };

  function mount(atlas, panel, fitInsets) {
    if (window.ATLAS_UNDERGROUND_VIEW) return;
    const data = window.GOL_UNDERGROUND_GEOMETRY;
    const mesh = window.GOL_UNDERGROUND_MESH;
    if (!data || !mesh) return;

    const tools = document.createElement('div');
    tools.className = 'golUndergroundTools';
    tools.innerHTML = `
      <div class="golUndergroundActions">
        <button type="button" id="golUndergroundToggle" aria-pressed="false" aria-controls="golUndergroundLegend">Подземный вид</button>
        <strong id="golUndergroundMode" hidden>Сечение для просмотра</strong>
      </div>
      <div id="golUndergroundLegend" hidden>
        <span class="golUndergroundProject">Проектируемый В1</span>
        <span class="golUndergroundExisting">Существующая сеть по ПД</span>
        <span class="golUndergroundCover">Футляр и обшивка</span>
      </div>
      <div class="golUndergroundStatus" role="status" aria-live="polite"></div>
    `;
    const style = document.createElement('style');
    style.textContent = `
      .golUndergroundTools {padding:4px 0 1px;border-top:1px solid #d9e3eb}
      .golUndergroundActions,#golUndergroundLegend {display:flex;align-items:center;gap:5px 9px;flex-wrap:wrap}
      #golUndergroundLegend {padding:5px 4px 2px;color:#2d4854}
      #golUndergroundLegend[hidden],#golUndergroundMode[hidden] {display:none}
      #golUndergroundToggle {min-height:32px;padding:5px 8px;border:1px solid #94b6c4;border-radius:5px;
        background:#f2f8fa;color:#14566c;font:inherit;font-weight:650;cursor:pointer}
      #golUndergroundToggle[aria-pressed="true"] {background:#14566c;color:#fff}
      #golUndergroundToggle:focus-visible {outline:2px solid #244e66;outline-offset:2px}
      #golUndergroundMode {color:#725235}
      #golUndergroundLegend span::before {content:"";display:inline-block;width:12px;margin-inline-end:5px;vertical-align:middle}
      .golUndergroundProject::before {border-top:3px solid #156e9c}
      .golUndergroundExisting::before {border-top:3px dashed #886648}
      .golUndergroundCover::before {border-top:3px solid #9db2bb}
      .golUndergroundStatus:not(:empty) {color:#922f2a;padding:4px;max-width:32ch}
      @media (max-width:850px) {
        #golUndergroundToggle {min-height:44px}
        body.golUndergroundOn #right.is-empty {display:none}

      }
    `;
    document.head.append(style);
    panel.append(tools);
    const button = tools.querySelector('button');
    const label = tools.querySelector('#golUndergroundMode');
    const legend = tools.querySelector('#golUndergroundLegend');
    const status = tools.querySelector('.golUndergroundStatus');
    let savedView = null;
    let queue = Promise.resolve();

    function paint() {
      const enabled = mesh.active();
      const changed = document.body.classList.contains('golUndergroundOn') !== enabled;
      document.body.classList.toggle('golUndergroundOn', enabled);
      if (changed) document.dispatchEvent(new Event('golunderground:state'));
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? 'Вернуть общий вид' : 'Подземный вид';
      label.hidden = legend.hidden = !enabled;
    }

    function focusCut() {
      const route = data.route;
      const half = data.halfWidthM + 1;
      const z = route.map(point => point.invert);
      const bounds = [
        [Math.min(...route.map(point => point.x)) - half, Math.min(...route.map(point => point.y)) - half, Math.min(...z) - 1],
        [Math.max(...route.map(point => point.x)) + half, Math.max(...route.map(point => point.y)) + half, Math.max(...z) + 5],
      ];
      atlas.fit([{bounds}], {pad: 1.1, insets: fitInsets({
        top: 110, bottom: 74, left: 12, right: 64
      })});
    }

    async function change(on, range, restore) {
      if (on && (range.fromM !== data.fromM || range.toM !== data.toM)) {
        throw new RangeError('Подземный вид подготовлен для участка ПК0+00–ПК0+45.');
      }
      if (on === mesh.active()) return mesh.active();
      status.textContent = '';
      button.disabled = true;
      try {
        if (on) {
          const initial = atlas.capture();
          await mesh.show(atlas, data);
          savedView = initial;
          // A steeper three-dimensional camera exposes the bottom between the view walls.
          await atlas.restoreView({...initial, camera: {...initial.camera, az: 2.55, el: 1.10}});
          atlas.setTint(tintOwner, colors);
          window.AtlasViewSettings.ghost(contextOwner, cutCovers.filter(id => atlas.inScene(id)), {alpha:0.3, pick:false});
          paint();
          focusCut();
        } else {
          try {
            await mesh.hide(atlas);
          } finally {
            if (!mesh.active()) {
              atlas.setTint(tintOwner, null);
              window.AtlasViewSettings.ghost(contextOwner, null);
            }
          }
          const previous = savedView;
          savedView = null;
          paint();
          if (restore && previous) await atlas.restoreView(previous);
        }
        return mesh.active();
      } catch (error) {
        if (on && mesh.active()) {
          try {
            await mesh.hide(atlas);
          } catch (rollbackError) {
            status.textContent = 'Не удалось вернуть исходный вид. Обновите страницу.';
            throw new AggregateError([error, rollbackError], status.textContent);
          } finally {
            atlas.setTint(tintOwner, null);
            window.AtlasViewSettings.ghost(contextOwner, null);
            savedView = null;
          }
        }
        status.textContent = error.message || 'Не удалось переключить подземный вид.';
        throw error;
      } finally {
        paint();
        button.disabled = false;
      }
    }

    function schedule(on, range = {fromM: data.fromM, toM: data.toM}, restore = true) {
      const t = queue.then(() => change(Boolean(on), range, restore));
      queue = t.catch(() => {});
      return t;
    }

    window.ATLAS_UNDERGROUND_VIEW = Object.assign((on, range) => schedule(on, range), {
      state: () => ({active:mesh.active(), fromM:data.fromM, toM:data.toM}),
    });
    button.addEventListener('click', () => { void schedule(!mesh.active()).catch(() => {}); });
    document.addEventListener('atlas:scope', () => {
      if (mesh.active() && savedView && atlas.scope() !== savedView.scope) {
        void schedule(false, undefined, false).catch(() => {});
      }
    });
    document.addEventListener('atlas:snapshotpaint', event => {
      if (!mesh.active()) return;
      event.detail.add(context => {
        context.save();
        context.font = '600 14px system-ui, sans-serif';
        const text = 'Сечение для просмотра · ПК0+00–ПК0+45';
        const width = context.measureText(text).width + 20;
        context.fillStyle = 'rgba(250, 247, 241, 0.93)';
        context.fillRect(12, 12, width, 28);
        context.fillStyle = '#493827';
        context.fillText(text, 22, 31);
        context.restore();
      });
    });
    paint();
  }

  window.GOL_UNDERGROUND_VIEW = { mount };
})();
