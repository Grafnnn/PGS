import {readFile} from 'node:fs/promises';
import {describe,it,expect} from 'vitest';
import {projectAtlasR25Response} from './project-atlas-r25-response';

describe('visible Atlas UI7 placement',()=>{
  it('preserves engineering assets and serves the immutable placement release',async()=>{
    const base=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui6/index.json','utf8'));
    const next=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui7/index.json','utf8'));
    const changed=new Set(['assets/prototype.js','assets/prototype.css','CURRENT_RELEASE.json','UI_RELEASE.json','assets/offline-manifest.js','MANIFEST.json']);
    for(const [name,asset] of Object.entries(base.files))if(!changed.has(name))expect(next.files[name].sha256).toBe((asset as {sha256:string}).sha256);
    const get=(name:string)=>projectAtlasR25Response(new Request('https://pgs.local/model-assets/troitsk-r25v8-ui7/'+name),name.split('/'),'v8-ui7');
    expect((await(await get('CURRENT_RELEASE.json')).json()).ui_revision).toBe('20260923-8-visible-placement');
    const js=await(await get('assets/prototype.js')).text();
    expect(js).toContain('window.AtlasBoot?.ready()');
    expect(js).toContain('AtlasEngineeringFields.selectionLoader');
    expect(js).toContain('if (!force && last === object) return');
  });

  it('places open details outside the context replaced by engine sync',async()=>{
    const js=await readFile('src/assets/atlas-ui/20260923-placement/engineering-card.js','utf8');
    expect(js).toContain("document.getElementById('elementContext')?.after(placementBox)");
    expect(js).toContain("const notes = document.createElement('section')");
    expect(js).toContain('placementBox.after(notes)');
    expect(js).toContain("if (child.tagName !== 'SUMMARY') notes.append(child)");
    expect(js).toContain('placementBox.replaceChildren()');
    expect(js).toContain('extraNotes.replaceChildren()');
    expect(js).toContain('if (placement.length) placementBox.append(rows(placement))');
    expect(js).toContain('const specification = [...d.materials, ...dimensions, ...d.specification]');
    expect(js).toContain('detail.open = false');
    expect(js).not.toContain("el('summary', 'Габарит");
  });
});
