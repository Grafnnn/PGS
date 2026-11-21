/* Офлайн-кэш атласа по запросу пользователя (ядро Atlas), в пределах папки выпуска; чужие приложения не трогает.
   Имя кэша и файлы предзагрузки объекта — из assets/offline-manifest.js, который пишет сборщик по конфигу объекта:
   ATLAS_OFFLINE_PREFIX (build.offline.cache_prefix; нет — 'atlas-<project_id>-', запасной — из ATLAS_PROJECT_ID), ATLAS_OFFLINE_PRECACHE (build.offline.precache).
   Точные размеры файлов выпуска — чтобы при обрезке не перечитывать тела ответов из кэша. */
'use strict';
importScripts('assets/offline-manifest.js');
const ROOT=new URL(self.registration.scope),PREFIX=(self.ATLAS_OFFLINE_PREFIX||('atlas-'+(self.ATLAS_PROJECT_ID||'default')+'-'))+encodeURIComponent(ROOT.pathname)+'-',CACHE=PREFIX+self.ATLAS_OFFLINE_VERSION,ALLOW=new Set(self.ATLAS_OFFLINE_FILES),SIZES=self.ATLAS_OFFLINE_SIZES||{},LIMIT=64*1024*1024;
const CORE=["assets/navigation-v8.css", "UNPLACED.html", "assets/building-axes.js", "assets/view-settings.css", "assets/view-settings.js", "assets/unified.css", "index.html", "assets/release.css", "assets/navigation-optimization-module.js", "assets/loader.js", "assets/graphics-optimization-module.js", "assets/worker-source.js", "assets/atlas-engine.js", "data/metadata-light.js", "assets/passport-loader.js", "assets/graphics-tools.js", "assets/canvas-rasterizer.js", "assets/prototype.css", "assets/source-recovery/runtime.js", "assets/prototype-icons.js", "assets/prototype.js"].concat(self.ATLAS_OFFLINE_PRECACHE||[]).filter(p=>ALLOW.has(p));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(p=>new URL(p,ROOT))))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(a=>Promise.all(a.filter(n=>n.startsWith(PREFIX)&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
let trimChain=Promise.resolve(),indexed=false,totalBytes=0;const sizes=new Map();
function pathOf(url){return decodeURIComponent(new URL(url).pathname.slice(ROOT.pathname.length));}
async function bytes(c,req,response){const known=SIZES[pathOf(req.url)];if(Number.isFinite(known)&&known>=0)return known;const r=response||await c.match(req);if(!r)return 0;const n=Number(r.headers.get('content-length'));return n>0?n:(await r.clone().arrayBuffer()).byteLength;}
async function trim(c,req,n){if(!indexed){sizes.clear();totalBytes=0;for(const k of await c.keys()){const size=await bytes(c,k);sizes.set(k.url,size);totalBytes+=size;}indexed=true;}else{if(!await c.match(req))return;totalBytes-=sizes.get(req.url)||0;sizes.delete(req.url);sizes.set(req.url,n);totalBytes+=n;}if(totalBytes<=LIMIT)return;for(const[url,size]of sizes){if(CORE.includes(pathOf(url)))continue;await c.delete(url);sizes.delete(url);totalBytes-=size;if(totalBytes<=LIMIT)break;}}
/* Полевой комплект: запрос части файла (Range). Онлайн — сеть, как раньше. Без сети — кусок полного файла из кэша:
   bytes=a-b, bytes=a-, bytes=-n → 206 + Content-Range; за границей файла → 416 + Content-Range с размером файла; иной вид — весь файл 200. */
// Полевой комплект: поиск в кэше без сети — точный адрес, тот же путь в другой записи (%28 и «(»), затем без параметров.
function cacheUrls(u){
 const variants=new Set([u]),url=new URL(u);
 if(url.origin===ROOT.origin&&url.pathname.startsWith(ROOT.pathname+'albums/')){
  const literal=url.pathname.replace(/%28/gi,'(').replace(/%29/gi,')');
  url.pathname=literal;variants.add(url.href);
  url.pathname=literal.replace(/[(]/g,'%28').replace(/[)]/g,'%29');variants.add(url.href);
 }
 return variants;
}
async function fromCache(u){
 const c=await caches.open(CACHE),variants=cacheUrls(u);
 for(const ignoreSearch of [false,true])for(const key of variants){
  const response=await c.match(key,{ignoreSearch});if(response)return response;
 }
 return null;
}
function r416(size){return new Response(null,{status:416,headers:{'Content-Range':'bytes *'+'/'+size}});}
async function rangeFromCache(req){const full=await fromCache(req.url);if(!full)return Response.error();const blob=await full.blob(),size=blob.size,type=full.headers.get('content-type')||'application/octet-stream',m=/^bytes=(\d*)-(\d*)$/.exec((req.headers.get('range')||'').trim());const whole=()=>new Response(blob,{status:200,headers:{'Content-Type':type,'Content-Length':String(size),'Accept-Ranges':'bytes'}});if(!m||(m[1]===''&&m[2]===''))return whole();let a,b;if(m[1]===''){const n=Number(m[2]);if(!(n>0)||!size)return r416(size);a=Math.max(0,size-n);b=size-1;}else{a=Number(m[1]);if(a>=size)return r416(size);b=m[2]===''?size-1:Number(m[2]);if(b<a)return whole();b=Math.min(b,size-1);}return new Response(blob.slice(a,b+1,type),{status:206,statusText:'Partial Content',headers:{'Content-Type':type,'Content-Length':String(b-a+1),'Content-Range':'bytes '+a+'-'+b+'/'+size,'Accept-Ranges':'bytes'}});}
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;let path;try{path=pathOf(url);}catch{return;}if(req.headers.has('range')){event.respondWith(fetch(req).catch(()=>rangeFromCache(req)));return;}if(url.search||path.startsWith('albums/')||!ALLOW.has(path)){/* полевой комплект: файлы вне манифеста (листы albums/, данные интервала) и адреса с параметрами — из сети, без сети — из кэша */event.respondWith(fetch(req).catch(()=>fromCache(req.url).then(r=>r||Response.error())));return;}
 event.respondWith((async()=>{const c=await caches.open(CACHE),cached=await c.match(req);if(cached){if(sizes.has(req.url)){const n=sizes.get(req.url);sizes.delete(req.url);sizes.set(req.url,n);}event.waitUntil(fetch(req).then(r=>{if(r.ok&&r.status===200)return c.put(req,r);}).catch(()=>{}));return cached;}const r=await fetch(req);if(r.ok&&r.status===200){const copy=r.clone(),promise=(async()=>{const n=await bytes(c,req,copy);if(n>LIMIT)return;await c.put(req,copy);trimChain=trimChain.then(()=>trim(c,req,n),()=>trim(c,req,n));return trimChain;})();event.waitUntil(promise.catch(()=>{}));}return r;})());
});
