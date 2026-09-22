import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {describe,it,expect} from 'vitest';
const context=vm.createContext({});
vm.runInContext(await readFile('src/assets/atlas-ui/20260922-card/engineering-fields.js','utf8'),context);
const {fields,selectionLoader}=context.AtlasEngineeringFields;
describe('explicit Atlas engineering fields',()=>{
  it('does not invent roof material or turn model volume into procurement volume',()=>{
    const p={note:'Уклоны не доработаны без согласованных высот Пп-1.',confidence:'V / габарит кровельного пирога',model_volume_m3:2.494485};
    const r=fields(p,{bounds:[[42.5,-0.13,13.75],[45.09,6.48,13.9]]});
    expect(r.materials).toHaveLength(0);expect(r.dimensions).toHaveLength(0);
    expect(r.modelBounds).toBe('2,59 × 6,61 × 0,15 м');expect(r.modelBoundsLabel).toContain('не для изготовления');
    expect(r.notes).toContain(p.note);expect(JSON.stringify(r)).not.toContain('2.494485');
  });
  it('does not parse MB2 free text or use parent nominal dimensions as fabrication dimensions',()=>{
    const r=fields({assembly_mark:'МБ2',confidence:'P1 / длина 2830 и h270',nominal_body_size_mm:[2800,500],hole_d_mm:18},{});
    expect(r.dimensions).toHaveLength(0);expect(r.materials).toHaveLength(0);
    expect(r.specification[0].value).toBe('МБ2');
  });
  it('keeps source and modeled bar lengths distinct and respects incomplete geometry',()=>{
    const r=fields({material:'А240',source_length_mm:715,bar_length_mm:708,bar_diameter_mm:6,source_unit_mass_kg:.16,fabrication_geometry_complete:false},{});
    expect(r.dimensions.map((x:{field:string})=>x.field)).toEqual(['source_length_mm','bar_length_mm','bar_diameter_mm']);
    expect(r.fabricationIncomplete).toBe(true);expect(r.materials[0].value).toBe('А240');
    expect(r.specification[0].field).toBe('source_unit_mass_kg');
  });
  it('rejects invalid dimensions and does not mutate the source',()=>{
    const p={thickness_mm:-5,steel_grade:'С255'};const before=JSON.stringify(p);
    expect(fields(p,{bounds:[[0,0,0],[NaN,2,3]]}).modelBounds).toBeNull();
    expect(fields(p,{}).dimensions).toHaveLength(0);expect(JSON.stringify(p)).toBe(before);
  });
  it('shows explicit plate dimensions, steel grade, orientation and signed elevations',()=>{
    const r=fields({dimensions_mm:[100,150,6],steel_grade:'С255',nominal_orientation:'150-mm direction Y',bottom_level_m:-.45,anchor_hole_not_modeled:true},{});
    expect(r.materials[0].value).toBe('С255');
    expect(r.dimensions[0].value).toBe('100 × 150 × 6 мм');
    expect(r.position.map((x:{value:string})=>x.value)).toEqual(['150-mm direction Y','-0,45 м']);
    expect(r.notes).toContain('Отверстия анкеров не моделировались.');
  });
  it('ignores stale success and stale failure after rapid selection changes',async()=>{
    const pending=new Map();const events:Array<{state:string;object:{id:string}}> = [];
    const select=selectionLoader((o:{id:string})=>new Promise((resolve,reject)=>pending.set(o.id,{resolve,reject})),(e:{state:string;object:{id:string}})=>events.push(e));
    const a=select({id:'A'}),b=select({id:'B'});pending.get('B').resolve({material:'С255'});await b;pending.get('A').resolve({material:'Wrong'});await a;
    expect(events.filter(e=>e.state==='ready').map(e=>e.object.id)).toEqual(['B']);
    const c=select({id:'C'}),d=select({id:'D'});pending.get('C').reject(Error('old'));await c;pending.get('D').resolve({});await d;
    expect(events.filter(e=>e.state==='error')).toHaveLength(0);
  });
});
