(() => {
  let state = 'loading';
  let assembled = false;
  const render = () => {
    document.documentElement.dataset.atlasBoot = state;
    const message = document.getElementById('atlasBootMessage');
    if (message) message.textContent = state === 'error'
      ? 'Не удалось загрузить интерфейс. Проверьте соединение и повторите попытку.'
      : 'Открываем Атлас…';
  };
  const fail = () => { state = 'error'; render(); };
  const ready = () => {
    assembled = true;
    if (getComputedStyle(document.documentElement).getPropertyValue('--atlas-shell-style-ready').trim() !== '1') return;
    clearTimeout(timeout);
    state = 'ready';
    render();
  };
  const timeout = setTimeout(fail, 20000);
  window.AtlasBoot = { ready, fail };
  window.addEventListener('error', event => {
    if (state === 'ready') return;
    const target = event.target;
    if (target === window || target?.tagName === 'SCRIPT' || target?.tagName === 'LINK') fail();
  }, true);
  document.addEventListener('load', event => {
    if (assembled && event.target?.tagName === 'LINK') ready();
  }, true);
  document.addEventListener('DOMContentLoaded', () => { render(); if (assembled) ready(); });
  render();
})();
