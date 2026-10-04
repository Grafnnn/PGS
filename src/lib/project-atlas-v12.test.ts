import {describe, expect, it} from 'vitest';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {projectAtlasR25Response} from './project-atlas-r25-response';

const base='https://pgs.local/model-assets/troitsk-r25v12-8/';
const get=(name:string, init?:RequestInit)=>projectAtlasR25Response(new Request(base+name,init),name.split('/'),'v12-8');
type Source={image?:string;pdf_url?:string;pdf_page?:number;printed_sheet?:string};
function decode(text:string,key:string) {
  const window:Record<string,string>={};
  vm.runInNewContext(text,{window},{timeout:10000});
  return JSON.parse(gunzipSync(Buffer.from(window[key],'base64')).toString());
}

describe('sealed V12.8 website delivery',()=>{
  it('starts whether navigation is nested or has already been moved by the UI',async()=>{
    const engine=await (await get('assets/atlas-engine.js')).text();
    expect(engine).not.toContain("$('left').insertBefore(reviewControls,$('studyNavigation'))");
    const insertion=engine.match(/\$\('studyNavigation'\)\.before\(reviewControls\);/)?.[0];
    expect(insertion).toBeDefined();
    for(const parent of ['atlas-navigation','left','reviewBlock']) {
      const children:unknown[]=[];
      const controls={id:'review-controls'};
      const navigation={parent,before(node:unknown){children.splice(children.indexOf(navigation),0,node);}};
      children.push(navigation);
      vm.runInNewContext(insertion!,{$:(id:string)=>id==='studyNavigation'?navigation:null,reviewControls:controls},{timeout:1000});
      expect(children).toEqual([controls,navigation]);
    }
  });
  it('uses a fresh immutable URL and matching CSP for the startup repair',async()=>{
    const prefix='https://pgs.local/model-assets/troitsk-r25v12-8/';
    const html=await projectAtlasR25Response(new Request(prefix+'index.html',{method:'HEAD'}),['index.html'],'v12-8');
    expect(html.status).toBe(200);
    expect(html.headers.get('cache-control')).toBe('public, no-cache');
    expect(html.headers.get('content-security-policy')).toContain(prefix);
    const script=await projectAtlasR25Response(new Request(prefix+'assets/atlas-engine.js'),['assets','atlas-engine.js'],'v12-8');
    expect(await script.text()).toContain("$('studyNavigation').before(reviewControls)");
  });
  it('identifies the source and preserves known limitations',async()=>{
    const release=await (await get('CURRENT_RELEASE.json')).json();
    expect(release).toMatchObject({release:'V12_8',geometryChangedFromSuppliedRelease:false,elementAssignmentsChanged:false,newEngineeringApproval:false,elements:11004,rebarOnDemand:13325,sources:333,nodes:557});
    expect(release.sourceTreeSha256).toBe('3023884702990e1215f9c5fa195204c2a39b494f7e48b464830ac3dea900ff4b');
    expect(release.restoredPublicExcerpt.sha256).toBe('2afa4d7c3b1bb2fed48d3de1be3bc6e75add72b15b306ca4bd08db6eced6349f');
    expect(release.limitations.join(' ')).toContain('47');
    const index=JSON.parse(await readFile('src/assets/project-models/troitsk-r25v12-8/index.json','utf8'));
    expect(Object.keys(index.files)).toHaveLength(4480);
    expect(index.archiveSha256).toBe('1d00f7483302c39af853f4b15927a75caaa15542f0bfc90fa6f34c914f46bc0c');
  });
  it('keeps all 333 drawing previews and PDF targets inside the published release',async()=>{
    const library=decode(await (await get('data/library.js')).text(),'ATLAS_LIBRARY_GZIP');
    const recovery=await (await get('assets/source-recovery/registry.json')).json();
    const sources:Record<string,Source>={...library.sources,...recovery.sources};
    expect(Object.keys(sources)).toHaveLength(333);
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
      if(raw===source.pdf_url) expect(Number(new URLSearchParams(url.hash.slice(1)).get('page'))).toBe(source.pdf_page);
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
  it('delivers all 557 unique nodes with resolvable element references',async()=>{
    const data=decode(await (await get('data/nodes.js')).text(),'ATLAS_NODES_GZIP');
    const metadata=decode(await (await get('data/metadata-light.js')).text(),'ATLAS_METADATA_GZIP');
    expect(data.nodes).toHaveLength(557);
    expect(new Set(data.nodes.map((node:{k:string})=>node.k)).size).toBe(557);
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
    expect((await get('engineering/sources/AS2_changes.pdf')).status).toBe(404);
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
    expect(sw.headers.get('service-worker-allowed')).toBe('/model-assets/troitsk-r25v12-8/');
  });
  it('maps alternate-sheet PDF buttons before opening a new tab',async()=>{
    const card=await (await get('assets/atlas-card.js')).text();
    expect(card).toContain('window.AtlasPackageLinks.map(href)');
    expect(card).toContain("window.open(mapped && mapped.href ? mapped.href : href, '_blank', 'noopener')");
    expect(card).toContain('if (mapped && mapped.arc) return');
    expect(card).toContain('openPackagePdf(plan.href)');
    expect(card).not.toContain("window.open(s.pdf_url.split('#')[0]");
  });
  it('reuses verified recovery links in cards and library without replacing original links',async()=>{
    const data=await (await get('assets/source-recovery/registry.json')).json();
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
