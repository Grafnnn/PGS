import {describe, expect, it} from 'vitest';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {projectAtlasR25Response} from './project-atlas-r25-response';

const base='https://pgs.local/model-assets/troitsk-r25v12-18/';
const get=(name:string, init?:RequestInit)=>projectAtlasR25Response(new Request(base+name,init),name.split('/'),'v12-18');
type Source={image?:string;pdf_url?:string;pdf_page?:number;printed_sheet?:string};
const ovParts = [[1,16],[17,31],[32,60],[61,110],[111,158],[159,222]];
function decode(text:string,key:string) {
  const window:Record<string,string>={};
  vm.runInNewContext(text,{window},{timeout:10000});
  return JSON.parse(gunzipSync(Buffer.from(window[key],'base64')).toString());
}

describe('sealed V12.18 website delivery',()=>{
  it('publishes the supplied construction progress plan without inventing server records',async()=>{
    const window:any={};
    for(const name of ['project/config.js','data/progress_items.js','data/progress_plan.js','assets/progress-core.js']) {
      vm.runInNewContext(await (await get(name)).text(),{window},{timeout:10000});
    }
    expect(window.ATLAS_PROJECT.core_version).toBe('1.0.18');
    expect(window.AtlasProgress.config()).toMatchObject({enabled:true,project_id:'troitsk-b24',slug:'troitsk-building-24'});
    const published=window.AtlasProgress.published();
    expect(Object.keys(published.items)).toHaveLength(20840);
    expect(published.bodyIds).toHaveLength(10961);
    expect(published.plan.stages).toHaveLength(14);
    expect(window.AtlasProgress.planCheck(published.plan)).toEqual({errors:[],warnings:[]});
    expect(published.journal).toEqual([]);
    expect((await get('PROGRESS.html',{method:'HEAD'})).status).toBe(200);
    expect((await get('assets/progress-sync.js',{method:'HEAD'})).status).toBe(200);
  });
  it('starts whether navigation is nested or has already been moved by the UI',async()=>{
    const engine=await (await get('assets/atlas-engine.js')).text();
    expect(engine).not.toContain("$('left').insertBefore(reviewControls,$('studyNavigation'))");
    const insertion=engine.split('\n').find(line=>line.includes("$('left').insertBefore(reviewControls,(e=>e&&e.parentNode===$('left')?e:null)"));
    expect(insertion).toBeDefined();
    for(const parent of ['atlas-navigation','left','reviewBlock']) {
      const children:unknown[]=[];
      const controls={id:'review-controls'};
      const left={insertBefore(node:unknown,before:unknown){children.splice(before?children.indexOf(before):children.length,0,node);}};
      const navigation={parentNode:parent==='left'?left:{}};
      if(parent==='left')children.push(navigation);
      const call="$('left').insertBefore(reviewControls,(e=>e&&e.parentNode===$('left')?e:null)(document.getElementById('studyNavigation')));";
      expect(insertion).toContain(call);
      vm.runInNewContext(call,{$:()=>left,document:{getElementById:()=>navigation},reviewControls:controls},{timeout:1000});
      expect(children).toEqual(parent==='left'?[controls,navigation]:[controls]);
    }
  });
  it('uses a fresh immutable URL and matching CSP for the startup repair',async()=>{
    const prefix='https://pgs.local/model-assets/troitsk-r25v12-18/';
    const html=await projectAtlasR25Response(new Request(prefix+'index.html',{method:'HEAD'}),['index.html'],'v12-18');
    expect(html.status).toBe(200);
    expect(html.headers.get('cache-control')).toBe('public, no-cache');
    expect(html.headers.get('content-security-policy')).toContain(prefix);
    const script=await projectAtlasR25Response(new Request(prefix+'assets/atlas-engine.js'),['assets','atlas-engine.js'],'v12-18');
    expect(await script.text()).toContain("e.parentNode===$('left')?e:null");
  });
  it('identifies the source and preserves known limitations',async()=>{
    const release=await (await get('CURRENT_RELEASE.json')).json();
    expect(release).toMatchObject({release:'V12_18',geometryChangedFromSuppliedRelease:false,elementAssignmentsChanged:false,newEngineeringApproval:false,elements:10795,rebarOnDemand:13325,sources:396,nodes:559});
    expect(release.sourceTreeSha256).toBe('5c8acf1ec95b5524e18923b765e9d4b46da3c0c2e570fba1cecbbe18def1cf15');
    expect(release.restoredPublicExcerpt.sha256).toBe('2afa4d7c3b1bb2fed48d3de1be3bc6e75add72b15b306ca4bd08db6eced6349f');
    expect(release.limitations.join(' ')).toContain('47');
    const index=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v12-18/index.json','utf8'));
    expect(Object.keys(index.files)).toHaveLength(4661);
    expect(index.archiveSha256).toBe('329b84daa82dbd74b1b7153dc0ccb891a3f27dbab9f1f0a9d3cd22eac7c407f5');
  });
  it('keeps all 396 drawing previews and PDF targets inside the published release',async()=>{
    const library=decode(await (await get('data/library.js')).text(),'ATLAS_LIBRARY_GZIP');
    const recoveryWindow:any={};vm.runInNewContext(await (await get('data/source_recovery.js')).text(),{window:recoveryWindow},{timeout:1000});
    const recovery=recoveryWindow.AtlasSourceRecoveryData;
    const sources:Record<string,Source>={...library.sources,...recovery.sources};
    expect(Object.keys(sources)).toHaveLength(396);
    const window:{AtlasPackageLinks?:{map:(s:string)=>{href?:string;arc?:boolean}|null}}={};
    const document={readyState:'loading',currentScript:{src:base+'assets/package-links.js'},baseURI:base+'index.html',addEventListener(){},querySelectorAll(){return [];}};
    vm.runInNewContext(await (await get('assets/package-links.js')).text(),{window,document,URL},{timeout:10000});
    const targets=new Set<string>();
    for(const source of Object.values(sources)) for(const raw of [source.image,source.pdf_url]) {
      if(!raw)continue;
      const mapped=window.AtlasPackageLinks!.map(raw);
      expect(mapped?.arc,raw).not.toBe(true);
      const url=new URL(mapped?.href||raw,document.baseURI);
      expect(url.href.startsWith(base),raw).toBe(true);
      targets.add(decodeURIComponent(url.pathname.slice(new URL(base).pathname.length)));
      if(raw===source.pdf_url) {
        let expectedPage=source.pdf_page;
        if(decodeURIComponent(new URL(raw,base).pathname).endsWith('/01-2024_ИЯИ-ОВ.ИТП.pdf')) {
          const part=ovParts.findIndex(([start,end])=>source.pdf_page!>=start&&source.pdf_page!<=end);
          expect(part,raw).toBeGreaterThanOrEqual(0);
          expect(url.pathname,raw).toBe(new URL(`albums/01-2024_IYaI-OV.ITP_chast${part+1}.pdf`,base).pathname);
          expectedPage=source.pdf_page!-ovParts[part][0]+1;
        }
        expect(Number(new URLSearchParams(url.hash.slice(1)).get('page')),raw).toBe(expectedPage);
      }
    }
    for(const name of targets) expect((await get(name,{method:'HEAD'})).status,name).toBe(200);
    for(const record of library.records) for(const source of record.sources||[]) expect(sources[source.key],record.key).toBeDefined();
    for(const group of recovery.groups) for(const key of group.sources) expect(sources[key]).toBeDefined();
    const metadata=decode(await (await get('data/metadata-light.js')).text(),'ATLAS_METADATA_GZIP');
    for(const object of metadata.objects) for(const link of object.sourceKeys||object.albumRecord?.sources||[]) expect(sources[link.key],object.id).toBeDefined();
    for(const record of metadata.albumIndex) for(const link of record.sources||[]) expect(sources[link.key],record.key).toBeDefined();
    const split=window.AtlasPackageLinks!.map('albums/АР_полный.pdf#page=100');
    expect(split?.href).toBe(base+'albums/AR_polnyy_chast2.pdf#page=24');
  });
  it('routes all 222 original OV.ITP pages to the correct lossless PDF part',async()=>{
    const window:any={};
    const document={readyState:'loading',currentScript:{src:base+'assets/package-links.js'},baseURI:base+'index.html',addEventListener(){},querySelectorAll(){return [];}};
    vm.runInNewContext(await (await get('assets/package-links.js')).text(),{window,document,URL},{timeout:1000});
    for(const [index,[start,end]] of ovParts.entries()) {
      const name=`albums/01-2024_IYaI-OV.ITP_chast${index+1}.pdf`;
      expect((await get(name,{method:'HEAD'})).status,name).toBe(200);
      for(let page=start;page<=end;page++) for(const directory of ['albums','source_album']) {
        const mapped=window.AtlasPackageLinks.map(`${directory}/01-2024_ИЯИ-ОВ.ИТП.pdf#page=${page}`);
        expect(mapped?.href).toBe(base+name+`#page=${page-start+1}`);
      }
    }
  });
  it('delivers the eleven RD13 roof reinforcement bodies as separate on-demand chunks',async()=>{
    const window:any={};
    vm.runInNewContext(await (await get('data/mu_rebar.js')).text(),{window},{timeout:1000});
    const data=window.ATLAS_MU_REBAR;
    const bodies=data.bodies.filter((body:{renderId:string})=>body.renderId.endsWith('_RD13'));
    expect(bodies.map((body:{mu:number})=>body.mu)).toEqual([40,41,42,43,50,54,55,56,57,58,59]);
    expect(new Set(bodies.map((body:{chunk:number})=>body.chunk)).size).toBe(11);
    for(const body of bodies) {
      expect(data.chunks).toContain(body.chunk);
      expect(body.bars_total).toBeGreaterThan(0);
      expect(body.rd13_split.main_render_id).toBe(body.old_render_id);
      expect((await get(`data/geometry_${body.chunk}.js`,{method:'HEAD'})).status).toBe(200);
    }
    const release:any={};
    vm.runInNewContext(await (await get('data/release-info.js')).text(),{window:release},{timeout:1000});
    expect(release.ATLAS_RELEASE).toMatchObject({release:'3D_ATLAS_V12_18',mu_rebar_section:'Армирование и узлы МУ · 52'});
  });
  it('delivers all 559 unique nodes with resolvable element references',async()=>{
    const data=decode(await (await get('data/nodes.js')).text(),'ATLAS_NODES_GZIP');
    const metadata=decode(await (await get('data/metadata-light.js')).text(),'ATLAS_METADATA_GZIP');
    expect(data.nodes).toHaveLength(559);
    expect(new Set(data.nodes.map((node:{k:string})=>node.k)).size).toBe(559);
    for(const node of data.nodes) {
      expect(node.l,node.k).toBeTruthy();
      expect(node.sec,node.k).toBeTruthy();
      for(const index of Object.values(node.roles).flat()) if(typeof index==='number') {
        expect(metadata.albumIndex[index]?.id,node.k).toBeTruthy();
      }
    }
    expect(data.nodes.find((node:{k:string})=>node.k==='F2_MU1')).toMatchObject({sheet:'АС.2, л. 23',sec:'Перекрытия'});
    expect(await (await get('index.html')).text()).toContain('assets/atlas-nodes.js');
  });
  it('uses the actual opened sheet number in both library and model metadata',async()=>{
    const expected={66:'56',67:'57',90:'80',91:'81',94:'84',153:'143',154:'144',157:'147'};
    for(const [file,key,field] of [['data/library.js','ATLAS_LIBRARY_GZIP','sources'],['data/metadata-light.js','ATLAS_METADATA_GZIP','albumSources']]) {
      const data=decode(await (await get(file)).text(),key);
      for(const [page,sheet] of Object.entries(expected)) expect(data[field][`NAV_AS2_PDF${page}`]).toMatchObject({printed_sheet:sheet,pdf_page:Number(page)});
    }
  });
  it('serves a PDF byte range and enforces public asset isolation',async()=>{
    const pdf=await get('drawings/AS2_changes.pdf',{headers:{range:'bytes=0-7'}});
    expect(pdf.status).toBe(206);expect(pdf.headers.get('content-type')).toBe('application/pdf');
    expect(await pdf.text()).toMatch(/^%PDF-/);
    const html=await get('index.html',{method:'HEAD'});
    expect(html.status).toBe(200);
    expect(html.headers.get('content-security-policy')).toContain(base);
    expect(html.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(html.headers.has('set-cookie')).toBe(false);
    expect((await get('../.env')).status).toBe(404);
    expect((await get('engineering/private.pdf')).status).toBe(404);
  });
  it('preserves immutable data, conditional requests and invalid-range protection',async()=>{
    const json=await get('CURRENT_RELEASE.json',{method:'HEAD'});
    expect(await json.text()).toBe('');
    expect(json.headers.get('cache-control')).toContain('immutable');
    expect((await get('CURRENT_RELEASE.json',{headers:{'if-none-match':json.headers.get('etag')!}})).status).toBe(304);
    const invalid=await get('drawings/AS2_changes.pdf',{headers:{range:'bytes=999999999999-'}});
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get('content-range')).toMatch(/^bytes \*\/\d+$/);
    const sw=await get('service-worker.js',{method:'HEAD'});
    expect(sw.headers.get('cache-control')).toBe('public, no-cache');
    expect(sw.headers.get('service-worker-allowed')).toBe('/model-assets/troitsk-r25v12-18/');
  });
  it('maps alternate-sheet PDF buttons before opening a new tab',async()=>{
    const card=await (await get('assets/atlas-card.js')).text();
    const helper=card.split('\n').find(line=>line.trim().startsWith('const pkgUrl ='));
    const sourceFunctions=card.slice(card.indexOf('  function sheetsOfTitle('),card.indexOf('  /* ---------- разметка карточки'));
    expect(helper).toBeDefined();
    expect(card).toContain("window.open(pkgUrl(plan.href), '_blank', 'noopener')");
    const metadata=decode(await (await get('data/metadata-light.js')).text(),'ATLAS_METADATA_GZIP');
    const library=decode(await (await get('data/library.js')).text(),'ATLAS_LIBRARY_GZIP');
    const window:any={};
    const document={readyState:'loading',currentScript:{src:base+'assets/package-links.js'},baseURI:base+'index.html',addEventListener(){},querySelectorAll(){return [];}};
    vm.runInNewContext(await (await get('assets/package-links.js')).text(),{window,document,URL},{timeout:10000});
    const opened:string[]=[];
    window.open=(href:string)=>opened.push(href);
    window.__FULL_ATLAS={sourceAvailability:()=>library.sources,sourceLinks:(o:any)=>o.albumRecord.sources,source(){throw new Error('Expected alternate-page PDF');}};
    const context=vm.createContext({window});
    vm.runInContext(helper+'\n'+sourceFunctions,context,{timeout:1000});
    for(const id of ['R03_CUT_FLOOR2','R03_CUT_FLOOR3','D_ZERO_BRICK']) {
      const object=metadata.objects.find((o:any)=>o.renderId==='ALBUM2::'+id);
      expect(object,id).toBeDefined();
      let passport:any;
      vm.runInNewContext(await (await get(`data/passports/passport_${String(object._passportChunk).padStart(3,'0')}.js`)).text(),{
        AtlasPassports:{accept:(_chunk:number,encoded:string)=>{passport=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')).toString());}}
      },{timeout:1000});
      context.object={...object,albumRecord:metadata.albumIndex[object.albumIndex]};
      context.props=passport[object.renderId];
      const plan=vm.runInContext('drawingPlan(object, props, [])',context,{timeout:1000});
      expect(plan,id).toMatchObject({hitSheet:55,pdfPage:65});
      context.plan=plan;
      vm.runInContext('openSource(plan.keys[0], plan)',context,{timeout:1000});
      expect(opened.at(-1),id).toBe(base+'albums/AS2_last_full.pdf#page=65');
    }
    expect(vm.runInContext("pkgUrl('albums/АР_полный.pdf#page=100')",context)).toBe(base+'albums/AR_polnyy_chast2.pdf#page=24');
  });
  it('reuses verified recovery links in cards and library without replacing original links',async()=>{
    const recoveryWindow:any={};vm.runInNewContext(await (await get('data/source_recovery.js')).text(),{window:recoveryWindow},{timeout:1000});
    const data=recoveryWindow.AtlasSourceRecoveryData;
    const library=decode(await (await get('data/library.js')).text(),'ATLAS_LIBRARY_GZIP');
    const window:any={};
    vm.runInNewContext(await (await get('assets/source-recovery/runtime.js')).text(),{window},{timeout:10000});
    const recovery=window.AtlasSourceRecovery.create(data,library.sources);
    const record=library.records.find((r:any)=>r.key==='VS01_BR');
    const links=recovery.links({sourceKeys:record.sources,albumRecord:record});
    expect(links).toEqual(record.sources);
    expect(links.map((l:any)=>l.key)).toEqual(['L_AS2_L98','L_AS2_L108']);
    expect(recovery.links({albumRecord:{key:'VS01_BR'}}).map((l:any)=>l.key)).toEqual(['RECOVERY_AS2_JULY_108','RECOVERY_AS2_JULY_118']);
    const original=[{key:'NAV_AS2_PDF66',method:'original'}];
    expect(recovery.links({sourceKeys:original,albumRecord:record})).toBe(original);
    expect(recovery.links({albumRecord:{key:'unknown'}})).toEqual([]);
    expect(await (await get('assets/atlas-card.js')).text()).toContain('window.__FULL_ATLAS.sourceLinks(o)');
    expect(await (await get('assets/atlas-engine.js')).text()).toContain('sourceLinks:o=>albumLinks(o)');
    const html=await (await get('library.html')).text();
    expect(html.indexOf('source-recovery/runtime.js')).toBeLessThan(html.indexOf('src="assets/library.js"'));
    expect(await (await get('assets/library.js')).text()).toContain('recovery.links({sourceKeys:r.sources,albumRecord:r})');
  });
});
