import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { projectAtlasR25Response } from './project-atlas-r25-response';
describe('Atlas engineering card release',()=>{
  it('preserves every sealed engineering asset and source preview from UI3',async()=>{
    const base=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui3/index.json','utf8'));
    const next=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui4/index.json','utf8'));
    const edited=new Set(['assets/prototype.js','assets/prototype.css','CURRENT_RELEASE.json','UI_RELEASE.json','assets/offline-manifest.js','MANIFEST.json']);
    expect(Object.keys(next.files).sort()).toEqual(Object.keys(base.files).sort());
    for(const [name,a] of Object.entries(base.files)) {
      if(!edited.has(name)) expect(next.files[name].sha256).toBe((a as {sha256:string}).sha256);
    }
  });
  it('serves the new scope including inherited boot and source recovery',async()=>{
    const get=(name:string)=>projectAtlasR25Response(new Request('https://pgs.local/model-assets/troitsk-r25v8-ui4/'+name),name.split('/'),'v8-ui4');
    const html=await(await get('index.html')).text();
    expect(html).toContain('window.AtlasBoot');expect(html).toContain('assets/source-recovery/registry.js');
    const script=await(await get('assets/prototype.js')).text();
    expect(script).toContain('window.AtlasBoot?.ready()');expect(script).toContain('AtlasEngineeringFields.selectionLoader');
    expect((await(await get('CURRENT_RELEASE.json')).json()).ui_revision).toBe('20260922-5-engineering-card');
  });
});
