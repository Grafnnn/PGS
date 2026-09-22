function replace(source, old, next, count = 1) {
  if (source.split(old).length !== count + 1) throw Error('Unexpected Atlas state patch anchor: ' + old.slice(0, 70));
  return source.split(old).join(next);
}

export function patchEngine(source) {
  source = replace(source, "scope=s;$('search').value='';", "scope=s;V.resetSearch();");
  source = replace(source, "$('modal').classList.add('open');", "openDrawingModal();", 3);
  source = replace(source, "let modalZoom=1;function zoomDrawing", "let modalZoom=1;function resetDrawingView(){modalZoom=1;$('drawingImg').style.width='100%';$('drawingImg').style.maxWidth='1600px';$('modal').scrollTop=0;$('modal').scrollLeft=0;}\nfunction openDrawingModal(){$('modal').classList.add('open');resetDrawingView();}\nfunction zoomDrawing");
  return replace(source, "$('drawingReset').onclick=()=>{modalZoom=1;$('drawingImg').style.width='100%';$('drawingImg').style.maxWidth='1600px';};", "$('drawingReset').onclick=resetDrawingView;");
}

export function patchSettings(source) {
  source = replace(source, "function search(){if(!api)return;", "function resetSearch(){clearTimeout(searchTimer);searchTimer=0;$('search').value='';$('viewSearchResults').replaceChildren();$('r23SearchCount').textContent='';}\n function search(){clearTimeout(searchTimer);searchTimer=0;if(!api)return;");
  source = replace(source, "if(panel.hidden)return;const s=api.summary();", "const s=api.summary();for(const id of ['isolate','r23Isolate']){const b=$(id),label=s.isolated?'Вернуть окружение':'Изолировать';if(b&&b.textContent!==label)b.textContent=label;}if(panel.hidden)return;");
  return replace(source, 'open,toast,sync,download,attach(a)', 'open,toast,sync,resetSearch,download,attach(a)');
}

export function patchPrototype(source) {
  return replace(source, "if(!search.value)$('r23SearchCount').textContent='Введите название, марку или ID. Можно искать по всему зданию.';", "if(!search.value.trim()){window.AtlasViewSettings.resetSearch();$('r23SearchCount').textContent='Введите название, марку или ID. Можно искать по всему зданию.';}");
}
