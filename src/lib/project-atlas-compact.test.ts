import {readFile} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
import {projectAtlasR25Response} from './project-atlas-r25-response';
describe('compact Atlas UI6',()=>{
  it('preserves sealed UI5 data and serves the new immutable UI scope',async()=>{
    const base=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui5/index.json','utf8'));
    const next=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui6/index.json','utf8'));
    const changed=new Set(['assets/prototype.js','assets/prototype.css','CURRENT_RELEASE.json','UI_RELEASE.json','assets/offline-manifest.js','MANIFEST.json']);
    for(const [n,a]of Object.entries(base.files))if(!changed.has(n))expect(next.files[n].sha256).toBe((a as {sha256:string}).sha256);
    const get=(n:string)=>projectAtlasR25Response(new Request('https://pgs.local/model-assets/troitsk-r25v8-ui6/'+n),n.split('/'),'v8-ui6');
    expect((await(await get('CURRENT_RELEASE.json')).json()).ui_revision).toBe('20260923-7-compact-type');
    const js=await(await get('assets/prototype.js')).text();
    expect(js).toContain('warning.open=false');expect(js).toContain('sources.open=false');expect(js).not.toContain('warning.open=true');
    expect(js).toContain('AtlasEngineeringFields.selectionLoader');expect(js).toContain('window.AtlasBoot?.ready()');
  });
  it('keeps material and dimensions in disclosure without missing-data placeholders',async()=>{
    const js=await readFile('src/assets/atlas-ui/20260923-compact/engineering-card.js','utf8');
    expect(js).toContain('const specification = [...d.materials, ...dimensions, ...d.specification]');
    expect(js).not.toContain('missingMaterial');expect(js).not.toContain("value:'Не указаны'");
    expect(js).toContain("document.querySelector('#right .actions')");
    expect(js).toContain('if (!force && last === object) return');
  });
});
