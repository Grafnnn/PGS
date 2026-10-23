import { getPublicProject3dModel } from "@/lib/project-3d-model";

export const LEGACY_ATLAS_RELEASES = [
  "troitsk-b24-r10", "troitsk-b24-atlas-3-2", "troitsk-r25v5", "troitsk-r25v7", "troitsk-r25v8",
  ...Array.from({ length: 8 }, (_, i) => `troitsk-r25v8-ui${i + 1}`),
  "troitsk-r25v11", "troitsk-r25v11-ui1", "troitsk-r25v11-5", "troitsk-r25v12-1", "troitsk-r25v12-8", "troitsk-r25v12-10", "troitsk-r25v12-11", "troitsk-r25v12-12", "troitsk-r25v12-13", "troitsk-r25v12-14", "troitsk-r25v12-15", "troitsk-r25v12-16", "troitsk-r25v12-17"
];

export const LEGACY_DOU_ATLAS_RELEASES = ["dou200-r1-7", "dou200-r1-21", "dou200-r1-23", "dou200-r1-24", "dou200-r1-25", "dou200-r1-26"];
const troitskPrefix = getPublicProject3dModel("troitsk-building-24")!.assetBaseUrl!;
const douPrefix = getPublicProject3dModel("dou200")!.assetBaseUrl!;

function legacyPath(url: URL) {
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  const match = /^\/model-assets\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (!match) return null;
  const currentPrefix = LEGACY_ATLAS_RELEASES.includes(match[1]) ? troitskPrefix
    : LEGACY_DOU_ATLAS_RELEASES.includes(match[1]) ? douPrefix : null;
  if (!currentPrefix) return null;
  const name = match[2] || "";
  if (name && name.split("/").some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))) return null;
  return { prefix: `/model-assets/${match[1]}/`, name, currentPrefix };
}

export function legacyAtlasDestination(url: URL): URL | null {
  const legacy = legacyPath(url);
  if (!legacy || legacy.name === "service-worker.js") return null;
  const target = new URL(legacy.currentPrefix + "index.html", url.origin);
  target.search = url.search;
  target.hash = url.hash;
  return target;
}

export function legacyAtlasWorker(url: URL): string | null {
  const legacy = legacyPath(url);
  if (legacy?.name !== "service-worker.js") return null;
  // Retire only the old atlas registration. Never erase PGS caches or sessions.
  return `"use strict";
const OLD=${JSON.stringify(legacy.prefix)}, CURRENT=${JSON.stringify(legacy.currentPrefix)};
function destination(value) {
  const url=new URL(value);
  if(url.origin!==self.location.origin||!url.pathname.startsWith(OLD))return null;
  const target=new URL(CURRENT+'index.html',url.origin);target.search=url.search;target.hash=url.hash;return target.href;
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await self.clients.claim();
  for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})){
    const target=destination(client.url);
    if(target)try{await client.navigate(target);}catch{}
  }
  await self.registration.unregister();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||event.request.mode!=='navigate')return;
  const target=destination(event.request.url);
  if(target)event.respondWith(Response.redirect(target,307));
});
`;
}
