const EMBED_STYLE = `<style id="pgs-model-embed-style">
#pgsControlsToggle{display:none}
@media(max-width:720px){
  body>header{height:60px;padding:0 10px}
  body>header h1{font-size:15px}
  body>header small{font-size:9px}
  .layout{display:block;position:relative;height:calc(100vh - 60px)}
  .layout>.stage{position:absolute;inset:0;min-width:0}
  .layout>aside:not(.right){position:absolute;z-index:40;left:8px;top:52px;width:min(250px,calc(100vw - 16px));max-height:calc(100% - 60px);padding:10px;border:1px solid var(--line);border-radius:6px;box-shadow:0 12px 32px #17374430;transform:translateX(calc(-100% - 16px));transition:transform .2s ease;background:#fffffff5}
  body.pgs-model-controls-open .layout>aside:not(.right){transform:translateX(0)}
  #pgsControlsToggle{display:block;position:absolute;z-index:45;left:8px;top:8px;padding:8px 10px;background:#fffffff2;box-shadow:0 2px 10px #20364418}
  .toolbar{left:112px;right:8px;top:8px;flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px}
  .toolbar button{flex:0 0 auto;padding:8px}
}
</style>`;

const EMBED_SCRIPT = `<script id="pgs-model-embed-script">
(()=>{const stage=document.querySelector('.stage');const panel=document.querySelector('.layout>aside:not(.right)');if(!stage||!panel)return;const button=document.createElement('button');button.id='pgsControlsToggle';button.type='button';button.textContent='Режимы';button.setAttribute('aria-expanded','false');button.addEventListener('click',()=>{const open=document.body.classList.toggle('pgs-model-controls-open');button.setAttribute('aria-expanded',String(open));button.textContent=open?'Скрыть':'Режимы';});stage.appendChild(button);})();
</script>`;

export function decorateProject3dModelHtml(source: string) {
  return source.replace("</head>", `${EMBED_STYLE}</head>`).replace("</body>", `${EMBED_SCRIPT}</body>`);
}
