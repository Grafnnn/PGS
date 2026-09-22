import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { projectAtlasR25Response } from './project-atlas-r25-response';
const boot = await readFile('src/assets/atlas-ui/20260922-boot/boot.js','utf8');
function fixture(cssReady = true) {
  const dataset: Record<string,string> = {}, message = {textContent:''};
  const events: Record<string,(e: unknown)=>void> = {};
  let timeout = () => {}, cleared = false;
  const context = vm.createContext({ document: {documentElement:{dataset}, getElementById:()=>message,
    querySelector:()=>({sheet:cssReady?{}:null}), addEventListener:(n:string,fn:(e:unknown)=>void)=>{events[n]=fn;}},
    window:{addEventListener:(n:string,fn:(e:unknown)=>void)=>{events[n]=fn;}},
    getComputedStyle:()=>({getPropertyValue:()=>cssReady?'1':''}),
    setTimeout:(fn:()=>void)=>{timeout=fn;return 1;}, clearTimeout:()=>{cleared=true;} });
  vm.runInContext(boot,context);
  return {context,dataset,message,events,expire:()=>timeout(),cleared:()=>cleared};
}
describe('Atlas first paint',()=>{
  it('keeps the legacy shell hidden until the new shell is assembled',()=>{
    const f=fixture();expect(f.dataset.atlasBoot).toBe('loading');
    f.context.window.AtlasBoot.ready();expect(f.dataset.atlasBoot).toBe('ready');expect(f.cleared()).toBe(true);
  });
  it('shows retry on stalled scripts rather than an endless blank page',()=>{
    const f=fixture();f.expire();expect(f.dataset.atlasBoot).toBe('error');expect(f.message.textContent).toContain('повторите');
    f.context.window.AtlasBoot.ready();expect(f.dataset.atlasBoot).toBe('ready');
  });
  it('does not expose the shell when its stylesheet is missing',()=>{
    const f=fixture(false);f.context.window.AtlasBoot.ready();expect(f.dataset.atlasBoot).toBe('loading');
    f.events.error({target:{tagName:'LINK'}});expect(f.dataset.atlasBoot).toBe('error');
  });
  it('reports initialization errors but does not hide an already working shell',()=>{
    const f=fixture();f.events.error({target:f.context.window});expect(f.dataset.atlasBoot).toBe('error');
    f.context.window.AtlasBoot.ready();f.events.error({target:f.context.window});expect(f.dataset.atlasBoot).toBe('ready');
  });
  it('serves a new immutable scope and preserves source recovery and no-JS fallback',async()=>{
    const get=(name:string)=>projectAtlasR25Response(new Request('https://pgs.local/model-assets/troitsk-r25v8-ui3/'+name),name.split('/'),'v8-ui3');
    const html=await(await get('index.html')).text();
    expect(html.indexOf('window.AtlasBoot')).toBeLessThan(html.indexOf('<link'));
    expect(html).toContain('<noscript>');expect(html).toContain('href="index.html">Повторить загрузку');
    expect(html).toContain('assets/source-recovery/registry.js');
    expect(await(await get('assets/prototype.js')).text()).toMatch(/window\.AtlasBoot\?\.ready\(\);\s*$/);
    expect((await(await get('CURRENT_RELEASE.json')).json()).ui_revision).toBe('20260922-4-first-paint');
    expect(await(await get('assets/offline-manifest.js')).text()).toContain('20260922-4-first-paint');
  });
});
