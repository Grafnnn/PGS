import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
import {projectAtlasR25Response} from './project-atlas-r25-response';
const context=vm.createContext({});
vm.runInContext(await readFile('src/assets/atlas-ui/20260922-card-fix/engineering-fields.js','utf8'),context);
const {fields}=context.AtlasEngineeringFields;
describe('explicit lengths and registry axes',()=>{
  it('shows length in mm or metres without inferring installation approval',()=>{
    expect(fields({length_mm:1100},{}).dimensions[0].value).toBe('1 100 мм');
    expect(fields({length_m:.735},{}).dimensions[0].value).toBe('0,735 м');
    expect(fields({length_mm:NaN,length_m:-3},{}).dimensions).toHaveLength(0);
  });
  it('keeps both explicit fields and their labels if source values differ',()=>{
    const d=fields({length_mm:1100,length_m:1.2},{}).dimensions;
    expect(d.map((x:{field:string})=>x.field)).toEqual(['length_mm','length_m']);
  });
  it('shows the registry axis, not guessed coordinates',()=>{
    expect(fields({}, {albumRecord:{axis:'1–2/Б–В'}}).position[0]).toMatchObject({label:'Оси по реестру',value:'1–2/Б–В'});
    expect(fields({}, {albumRecord:{axis:null}}).position).toHaveLength(0);
  });
  it('shows verified own MU56 concrete body but never its rebar parent dimensions',()=>{
    const p={id:'R10L_ROOF_MU56_CONCRETE',position:'Бетон',material:'Бетон B20',nominal_body_size_mm:[1800,5800,220]};
    expect(fields(p,{}).dimensions[0].value).toBe('1 800 × 5 800 × 220 мм');
    expect(fields({...p,id:'REBAR',material:'А500С'},{}).dimensions).toHaveLength(0);
  });
  it('serves UI5 while keeping all sealed data and prior UI4 byte identities',async()=>{
    const base=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui4/index.json','utf8'));
    const next=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v8-ui5/index.json','utf8'));
    const changed=new Set(['assets/prototype.js','CURRENT_RELEASE.json','UI_RELEASE.json','assets/offline-manifest.js','MANIFEST.json']);
    for(const [n,a] of Object.entries(base.files))if(!changed.has(n))expect(next.files[n].sha256).toBe((a as {sha256:string}).sha256);
    const r=await projectAtlasR25Response(new Request('https://pgs.local/model-assets/troitsk-r25v8-ui5/CURRENT_RELEASE.json'),['CURRENT_RELEASE.json'],'v8-ui5');
    expect((await r.json()).ui_revision).toBe('20260922-6-explicit-dimensions');
  });
});
