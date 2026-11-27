/* Нижняя граница всей шапки для настроек, легенды и экранных подписей. */
(function () {
  'use strict';

  function mount() {
    const stage = document.querySelector('body.atlas-prototype .stage.atb');
    const header = stage?.querySelector(':scope > .stage-actions');
    const path = header?.querySelector(':scope > .stage-path');
    if (!header || !path) return;

    const mobileTools = stage.querySelector(':scope > .tools');
    const phone = matchMedia('(max-width: 850px)');
    let scheduled = false;

    function update() {
      scheduled = false;
      const stageTop = stage.getBoundingClientRect().top;
      const nodes = [header, path];
      if (phone.matches && mobileTools) {
        const controls = Math.ceil(mobileTools.getBoundingClientRect().bottom - header.getBoundingClientRect().top) + 'px';
        if (stage.style.getPropertyValue('--am-controls-h') !== controls) stage.style.setProperty('--am-controls-h', controls);
        nodes.push(mobileTools);
      }
      const bottom = Math.ceil(Math.max(...nodes.map(node => node.getBoundingClientRect().bottom)) - stageTop);
      if (bottom <= 0) return;
      const value = bottom + 'px';
      if (stage.style.getPropertyValue('--am-head-b') !== value) stage.style.setProperty('--am-head-b', value);
    }

    function queueUpdate() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(update);
    }

    const observer = new ResizeObserver(queueUpdate);
    for (const element of [stage, header, path, mobileTools]) if (element) observer.observe(element);
    phone.addEventListener('change', queueUpdate);
    queueUpdate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
