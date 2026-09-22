import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {describe,it,expect,vi} from 'vitest';
import {projectAtlasR25Response} from './project-atlas-r25-response';

const get=(name:string)=>projectAtlasR25Response(new Request('https://pgs.local/model-assets/troitsk-r25v8-ui8/'+name),name.split('/'),'v8-ui8');
const source=async(name:string)=>(await get('assets/'+name)).text();

describe('Atlas audit regressions',()=>{
  it('synchronizes both isolation actions, including while tools are hidden',async()=>{
    const js=await source('view-settings.js');
    const fragment=js.slice(js.indexOf('const isolated=api.isIsolated();'),js.indexOf('if(panel.hidden)return;const s=api.summary();')+'if(panel.hidden)return;const s=api.summary();'.length);
    expect(fragment).toContain("['isolate','r23Isolate']");
    const buttons:Record<string,{textContent:string}>={isolate:{textContent:'stale'},r23Isolate:{textContent:'stale'}};
    for(const isolated of [true,false]){
      const summary=vi.fn();
      vm.runInNewContext('(function(){'+fragment+'})();',{$:(id:string)=>buttons[id],panel:{hidden:true},api:{isIsolated:()=>isolated,summary}});
      expect(summary).not.toHaveBeenCalled();
      expect(buttons.isolate.textContent).toBe(isolated?'Вернуть окружение':'Изолировать');
      expect(buttons.r23Isolate.textContent).toBe(buttons.isolate.textContent);
    }
    expect(await source('atlas-engine.js')).toContain('isIsolated:()=>isolated');
  });
  it('clears query, result buttons and pending debounce on scope reset',async()=>{
    const settings=await source('view-settings.js'),engine=await source('atlas-engine.js'),prototype=await source('prototype.js');
    expect(engine).toContain('scope=s;V.resetSearch();');
    expect(prototype).toContain('window.AtlasViewSettings.resetSearch();');
    const reset=settings.match(/function resetSearch\(\)\{[^\n]+\}/)?.[0];
    expect(reset).toBeTruthy();
    const host={replaceChildren:vi.fn()},count={textContent:'10 результатов'},input={value:'кирпичная стена'};
    const elements:Record<string,unknown>={search:input,viewSearchResults:host,r23SearchCount:count};
    vi.useFakeTimers();
    try{
      const stale=vi.fn(),timer=setTimeout(stale,90);
      vm.runInNewContext(reset+';resetSearch();',{$:(id:string)=>elements[id],searchTimer:timer,clearTimeout});
      vi.advanceTimersByTime(200);
      expect(stale).not.toHaveBeenCalled();expect(input.value).toBe('');expect(count.textContent).toBe('');expect(host.replaceChildren).toHaveBeenCalledOnce();
    }finally{vi.useRealTimers();}
  });
  it('resets numerical zoom and scroll for all three drawing entry paths',async()=>{
    const js=await source('atlas-engine.js');
    expect(js.match(/openDrawingModal\(\);/g)).toHaveLength(3);
    const fragment=js.slice(js.indexOf('let modalZoom=1;'),js.indexOf("window.addEventListener('keydown'",js.indexOf('let modalZoom=1;')));
    const image={style:{width:'',maxWidth:''}},modal={classList:{add:vi.fn()},scrollTop:0,scrollLeft:0};
    const elements:Record<string,unknown>={drawingImg:image,modal,drawingZoomIn:{},drawingZoomOut:{},drawingReset:{}};
    const ctx=vm.createContext({$:(id:string)=>elements[id]});vm.runInContext(fragment,ctx);
    vm.runInContext('openDrawingModal();zoomDrawing(1.25);zoomDrawing(1.25);',ctx);
    expect(image.style.width).toBe('156.25%');modal.scrollTop=250;modal.scrollLeft=100;
    vm.runInContext('openDrawingModal();zoomDrawing(1.25);',ctx);
    expect(image.style.width).toBe('125%');expect(modal.scrollTop).toBe(0);expect(modal.scrollLeft).toBe(0);
  });
  it('preserves UI7 design, geometry and V5 history while reporting current limits',async()=>{
    const base=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui7/index.json','utf8'));
    const next=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui8/index.json','utf8'));
    const changed=new Set(['assets/atlas-engine.js','assets/view-settings.js','assets/prototype.js','CURRENT_RELEASE.json','UI_RELEASE.json','assets/offline-manifest.js','MANIFEST.json']);
    for(const [name,a]of Object.entries(base.files))if(!changed.has(name))expect(next.files[name].sha256).toBe((a as {sha256:string}).sha256);
    const release=await(await get('CURRENT_RELEASE.json')).json(),coverage=await(await get(release.coverage_report)).json();
    expect(coverage.historical_coverage_report).toBe('FINAL_COVERAGE_REPORT.json');
    expect(coverage.unverified_world_placements).toBe(47);expect(coverage.unrecovered_historical_R11_CF_profiles).toBe(4);
    expect(coverage.new_world_placements).toBe(0);expect(coverage.independent_source_acceptance).toMatch(/Not claimed/);
    expect(coverage.sources.original+coverage.sources.recovered+coverage.sources.remaining_without_source).toBe(10412);
    expect(release.base_qa_summary).not.toBe(release.ui_qa_summary);
    expect(await source('prototype.js')).toContain('placementBox.after(notes)');
  });
});
