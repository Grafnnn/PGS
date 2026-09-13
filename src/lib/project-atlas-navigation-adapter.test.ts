import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { runInNewContext, Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/assets/project-models/troitsk-b24-atlas-3-2.manifest.json";
import { atlasNavigationLogic } from "./project-atlas-navigation-logic";
import { adaptProjectAtlasNavigation, adaptProjectAtlasSelectionBundle, adaptProjectAtlasSelectionWorker, atlasConfirmedContextLinks, atlasAlbumTransactions, atlasEscapeHandler } from "./project-atlas-navigation-adapter";
import { adaptProjectAtlasPerformance, adaptProjectAtlasWorker, adaptProjectAtlasWorkerBundle } from "./project-atlas-performance-adapter";
import { adaptProjectAtlasDrawings } from "./project-atlas-drawing-adapter";

// The test harness exercises the exact shipped browser functions against the frozen project data.
function original(name: string) {
  const asset = (manifest.files as Record<string, { storage: string; compressed: boolean }>)[name];
  const raw = readFileSync("src/assets/project-models/troitsk-b24-atlas-3-2/" + asset.storage);
  return (asset.compressed ? gunzipSync(raw) : raw).toString();
}
function data(name: string) {
  let result: any;
  runInNewContext(original(name), { window: { ALBUM_ACCEPT: (_key: string, packed: string) => { result = JSON.parse(gunzipSync(Buffer.from(packed, "base64")).toString()); } } });
  return result;
}
const logic = runInNewContext(atlasNavigationLogic + ";createAtlasNavigationLogic()", { ArrayBuffer, Float32Array, Uint32Array, Int8Array });
const index = data("data/index.js"), rows = index.rows || index.values.map((v: any[]) => Object.fromEntries(index.columns.map((key: string, n: number) => [key, v[n]])));
const h = data("data/hierarchy.js"), registry = data("data/sources.js"), confirmed = atlasConfirmedContextLinks;
const pages = ["stair", "floors", "roof", "lifts", "master"].flatMap(m => data("pages/" + m + ".js"));
const rawWorker = JSON.parse(original("assets/worker_bundle.js").split("window.ALBUM_WORKER_SOURCE=")[1].trim().replace(/;$/, ""));

describe("Atlas contextual drawing resolver", () => {
  const resolve = (context: any, page?: any) => logic.drawing({ context, page, h, rows, registry: registry.sources, extras: registry.extras, confirmed, prepared: pages });
  it.each([
    ["F2_MU1", "R05S_N_024"], ["R07_LIFT1_WALL_E", "R07_L79"], ["MU55", "R02_AS399"],
    ["L1_МБ1_F1_01", "R04_L57"], ["R10L_STAIR_L1_ЛП4_F3_P1_upper_X_009", "R10L_STAIR_L63"]
  ])("preserves exact source %s through element, node and canonical page", (key, source) => {
    const i = rows.findIndex((r: any) => r.key === key);
    const nodeId = h.byKey[key];
    const page = pages.find(p => p.id.startsWith("node_D01_") && p.indices.includes(i));
    expect(page).toBeTruthy();
    for (const links of [resolve({ kind: "element", key }), resolve({ kind: "node", nodeId }), resolve({ kind: "view" }, page)]) {
      expect(links.some((l: any) => l.key === source)).toBe(true);
      expect(links.every((l: any) => !l.key.startsWith("NAV_"))).toBe(true);
    }
  });
  it.each(["L1_R04_FLOOR_IN", "L1_R04_PLATE_т"])("resolves the verified node A context for %s without claiming an exact detail", key => {
    const result = resolve({ kind: "node", nodeId: h.byKey[key] });
    expect(result).toContainEqual(expect.objectContaining({ key: "R04_node_A", role: "Узел сборки" }));
    expect(result.some((l: any) => l.role === "Чертёж элемента")).toBe(false);
  });
  it("offers the explicit lift view as context, not all-detail evidence", () => {
    expect(resolve({ kind: "node", nodeId: "g:0c7213c3c24b54b277b5" })).toContainEqual(expect.objectContaining({ key: "R07_L79", role: "План раздела", via: "Общий вид лифта №1" }));
  });
  it("keeps type/sample distinct and unresolved WALL_S empty after another selection", () => {
    expect(resolve({ kind: "node", nodeId: "entity:DETAIL_S" })).toContainEqual(expect.objectContaining({ key: "R02_AR9", role: "Схема типа" }));
    expect(resolve({ kind: "view" }, {...pages.find(p=>p.key==='roof::sample'),isType:true})).toContainEqual(expect.objectContaining({key:'R02_AR9',role:'Схема типа'}));
    expect(resolve({ kind: "element", key: "F2_MU1" }).length).toBeGreaterThan(0);
    expect(resolve({ kind: "node", nodeId: "entity:WALL_S" })).toEqual([]);
    expect(resolve({ kind: "view" }, { indices: [], source: [] })).toEqual([]);
  });
  it("never infers a source merely from the smallest containing view", () => {
    const result = resolve({ kind: "element", key: "MU55" });
    expect(result.some((l: any) => l.key === "R05S_N_149")).toBe(false);
  });
  it("walks only the current node's actual ancestors when exact source is absent", () => {
    const result = logic.drawing({ context: { kind: "node", nodeId: "child" }, h: { nodes: { child: { parent: "parent" }, parent: { label: "Own assembly", sources: [{ key: "own" }] } }, order: [] }, rows: [], registry: { own: {} } });
    expect(result).toEqual([{ key: "own", role: "Узел сборки", via: "Own assembly" }]);
  });
});

describe("Atlas scope and bounded cache", () => {
  it("covers the full active building, keeps roof and combines the actual ventchamber objects once", () => {
    const all = logic.scope(logic.albums[0], h, rows);
    expect(all).toHaveLength(10412);expect(new Set(all).size).toBe(10412);
    const union = new Set(logic.albums.slice(1).flatMap((a: any) => logic.scope(a, h, rows)));
    expect([...union].sort()).toEqual([...all].sort());
    const vc = logic.scope(logic.albums.find((a: any) => a.id === "chamber"), h, rows);
    expect(vc).toContain(rows.findIndex((r: any) => r.key === "VC_W"));
    expect(vc).toContain(rows.findIndex((r: any) => r.key === "VC_ROOF"));
    expect(new Set(vc).size).toBe(vc.length);
  });
  it("retains required blocks plus byte-bounded most-recent spare blocks", () => {
    const cache = new Map([['active',{binary:new ArrayBuffer(100),lastUsed:1}],['old',{binary:new ArrayBuffer(60),lastUsed:2}],['recent',{binary:new ArrayBuffer(60),lastUsed:3}]]);
    expect(logic.prune(cache,['active'],80)).toEqual({blocks:2,bytes:160,spareBytes:60});expect(cache.has('recent')).toBe(true);expect(cache.has('old')).toBe(false);
    logic.prune(cache,[],0);expect(cache.size).toBe(0);
  });
  it("keeps crosslink parents within the album boundary and includes all existing entrance piles", () => {
    const hierarchy=structuredClone(h);
    for(const a of logic.albums.slice(1)){
      const roots=a.roots.filter((id:string)=>hierarchy.nodes[id]);
      hierarchy.nodes['album:'+a.id]={id:'album:'+a.id,children:roots.length===1?hierarchy.nodes[roots[0]].children:roots};
    }
    expect(logic.path('chamber',hierarchy,'entity:VC_W').map((n:any)=>n.id)).toEqual(['album:chamber','entity:VC_W']);
    expect(logic.path('chamber',hierarchy,'building')).toEqual([]);
    expect(logic.path('foundations',hierarchy,'entity:L1_Фп-1').map((n:any)=>n.id)).toEqual(['album:foundations','entity:L1_Фп-1']);
    expect(logic.owner(hierarchy,'building','roof')).toBe('building');
    expect(logic.owner(hierarchy,'entity:VC_W','chamber')).toBe('chamber');
    expect(logic.owner(hierarchy,'album:roof','chamber')).toBe('roof');
    const foundation=new Set(logic.scope(logic.albums.find((a:any)=>a.id==='foundations'),hierarchy,rows));
    for(const key of ['E2_PILE1','E3_PILE1','E6_PILE4','E8_PILE4','R09L_E4_PILE_10'])expect(foundation.has(rows.findIndex((r:any)=>r.key===key))).toBe(true);
  });
  it("compacts a single body to its exact v/f/n ranges", () => {
    const i=rows.findIndex((r:any)=>r.key==='F2_MU1'),b=data('blocks/'+rows[i].block+'.js');
    const bytes=Buffer.from(b.geometry_b64,'base64');b.binary=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
    const packed=logic.geometry([b],[i],rows),range=b.info.find((r:any[])=>r[0]===i);
    expect(packed.vertices).toBe(8);expect(packed.faces).toBe(12);expect(packed.buffer.byteLength).toBe(276);
    expect([...new Float32Array(packed.buffer,0,24)]).toEqual([...new Float32Array(b.binary,range[1]*12,24)]);
    const f=[...new Uint32Array(b.binary,b.vertices*12+range[3]*12,36)].map(v=>v-range[1]);
    expect([...new Uint32Array(packed.buffer,96,36)]).toEqual(f);
    expect(()=>logic.geometry([b],[-1],rows)).toThrow('Incomplete');
    expect(()=>logic.geometry([b,b],[i],rows)).toThrow('Duplicate');
  });
});

describe('Atlas album transactions',()=>{
  it.each([false,true])('does not save a pending album under another owner (load assigned early=%s)',async early=>{
    const gates=new Map<string,{promise:Promise<void>;resolve:()=>void}>();
    const gate=(id:string)=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});gates.set(id,{promise,resolve});};
    gate('roof');gate('lifts');
    // The runtime bindings below are supplied by a single VM so assignments match the shipped code.
    const context:any={atlasLogic:logic,structuredClone,atlasAlbum:'building',atlasAlbumStates:new Map(),S:{page:'whole',camera:'building camera'},hold:async(id:string)=>{await gates.get(id)?.promise;},early};
    const runtime=runInNewContext(`let serial=0;function beginNavigation(o={}){return o.navToken??++serial;}function navigationCurrent(t){return t===serial;}function snapshot(){return {...structuredClone(S),atlasAlbum};}function atlasSyncContext(){}
async function atlasLoadNode(node,opts){const id=opts.atlasAlbum;if(early){atlasAlbum=id;S={page:node,camera:id+' camera'};}await hold(id);if(!navigationCurrent(opts.navToken))return false;atlasAlbum=id;S={page:node,camera:id+' camera'};return true;}
async function atlasRestore(state,opts){await hold(opts.atlasAlbum);if(!navigationCurrent(opts.navToken))return false;atlasAlbum=opts.atlasAlbum;S=structuredClone(state);return true;}
${atlasAlbumTransactions}
({open:atlasOpenAlbum,states:atlasAlbumStates,state:()=>({S,atlasAlbum})})`,context);
    const roof=runtime.open('roof'),lifts=runtime.open('lifts');
    gates.get('lifts')!.resolve();expect(await lifts).toBe(true);
    gates.get('roof')!.resolve();expect(await roof).toBe(false);
    expect(runtime.states.has('roof')).toBe(false);expect(runtime.states.get('building').page).toBe('whole');
    expect(runtime.state().atlasAlbum).toBe('lifts');expect(runtime.state().S.page).toBe('album:lifts');
    expect(await runtime.open('roof')).toBe(true);expect(runtime.state().S.page).toBe('album:roof');
    expect(await runtime.open('building')).toBe(true);expect(runtime.state().S.camera).toBe('building camera');
  });
});

describe('Atlas Escape priority',()=>{
  it('consumes each inner layer before allowing the outer model to close',()=>{
    const elements=new Map<string,any>();const $=(id:string)=>{if(!elements.has(id))elements.set(id,{hidden:true,focus:vi.fn()});return elements.get(id);};
    const ui={props:false,navOpen:false};let mobile=false,modal:any;
    const context:any={window:{},document:{querySelectorAll:()=>modal?[modal]:[]},Event,$,UI:ui,narrow:()=>mobile,atlasHighlight:null,
      backDrawing:async()=>{$('drawingPanel').hidden=true;},closePanels:()=>{for(const id of ['pgs-camera-menu','clipPanel','morePanel'])$(id).hidden=true;},closeProps:()=>{ui.props=false;},setNav:()=>{ui.navOpen=false;},atlasClearHighlight:()=>{context.atlasHighlight=null;},error:vi.fn()};
    runInNewContext(atlasEscapeHandler,context);
    const escape=()=>{const e={key:'Escape',defaultPrevented:false,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn()};const consumed=context.window.PGS_ATLAS_CONSUME_ESCAPE(e);expect(e.preventDefault).toHaveBeenCalledTimes(consumed?1:0);return consumed;};
    expect(escape()).toBe(false);
    modal={open:true,dispatchEvent:vi.fn(),close:()=>{modal.open=false;}};expect(escape()).toBe(true);modal=null;
    for(const id of ['drawingPanel','pgs-camera-menu','clipPanel','morePanel']){$(id).hidden=false;expect(escape()).toBe(true);expect($(id).hidden).toBe(true);}
    ui.props=true;context.atlasHighlight='MU55';expect(escape()).toBe(true);expect(ui.props).toBe(false);
    expect(escape()).toBe(true);expect(context.atlasHighlight).toBeNull();
    ui.navOpen=true;expect(escape()).toBe(false);mobile=true;expect(escape()).toBe(true);expect(ui.navOpen).toBe(false);
    expect(escape()).toBe(false);
  });
});

describe("Atlas UI adapter and visible-only selection", () => {
  it("composes with production adapters, parses and fails closed on drift", () => {
    const before=adaptProjectAtlasPerformance(adaptProjectAtlasDrawings(original('assets/album.js'))),after=adaptProjectAtlasNavigation(before);
    expect(()=>new Script(after)).not.toThrow();expect(()=>adaptProjectAtlasNavigation(after)).toThrow();
    expect(after).not.toContain("selectedIndices:S.selection?[]");expect(after).toContain('else if(i<0)atlasClearHighlight()');
    expect(after).not.toContain('innerHTML=html;showProps()');expect(after).not.toContain("else if(n.self.length===1&&!n.children.length)select");
    expect(()=>new Script(adaptProjectAtlasSelectionBundle(adaptProjectAtlasWorkerBundle(original('assets/worker_bundle.js'))))).not.toThrow();
  });
  it("keeps owner IDs/depth occlusion and all interior materials unchanged when highlighting", () => {
    const buffer=new ArrayBuffer(6*12+2*15);
    new Float32Array(buffer,0,18).set([-1,-1,0,1,-1,0,0,1,0,-.5,-.5,-1,.5,-.5,-1,0,.5,-1]);new Uint32Array(buffer,72,6).set([0,1,2,3,4,5]);new Int8Array(buffer,96,6).set([0,0,127,0,0,127]);
    const postMessage=vi.fn(),self={onmessage:(_event:unknown)=>{}};
    runInNewContext(adaptProjectAtlasSelectionWorker(adaptProjectAtlasWorker(rawWorker)),{self,postMessage,performance});
    self.onmessage({data:{type:'init',buffer,vertices:6,faces:2,info:[[0,3,0,1],[3,3,1,1]],meta:[{bounds:[[-1,-1,0],[1,1,0]],rgb:[120,160,200]},{bounds:[[-.5,-.5,-1],[.5,.5,-1]],rgb:[200,100,50]}]}});
    const draw=(selected:number)=>{self.onmessage({data:{type:'render',seq:1,width:100,height:80,camera:{yaw:0,pitch:Math.PI/2,scale:25,target:[0,0,0],pan:[0,0]},visible:[0,1],opacity:1,selected}});return postMessage.mock.calls.at(-1)![0];};
    const idle=draw(-1),hidden=draw(1),visible=draw(0);
    expect(Buffer.from(hidden.owner)).toEqual(Buffer.from(idle.owner));expect(Buffer.from(hidden.pixels)).toEqual(Buffer.from(idle.pixels));expect(Buffer.from(visible.owner)).toEqual(Buffer.from(idle.owner));
    const owners=new Int32Array(idle.owner),a=new Uint8Array(idle.pixels),b=new Uint8Array(visible.pixels);let changed=0;
    for(let i=0;i<owners.length;i++)if(a[i*4]!==b[i*4]||a[i*4+1]!==b[i*4+1]||a[i*4+2]!==b[i*4+2]){changed++;expect(owners[i]).toBe(0);expect([owners[i-1],owners[i+1],owners[i-100],owners[i+100]].some(n=>n!==0)).toBe(true);}
    expect(changed).toBeGreaterThan(0);
  });
});
