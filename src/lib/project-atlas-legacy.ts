import { getPublicProject3dModel } from "@/lib/project-3d-model";

export const LEGACY_ATLAS_RELEASES = [
  "troitsk-b24-r10", "troitsk-b24-atlas-3-2", "troitsk-r25v5", "troitsk-r25v7", "troitsk-r25v8",
  ...Array.from({ length: 8 }, (_, i) => `troitsk-r25v8-ui${i + 1}`),
  "troitsk-r25v11"
];

const currentPrefix = getPublicProject3dModel("troitsk-building-24")!.assetBaseUrl!;

function legacyPath(url: URL) {
  let pathname: string;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  const match = /^\/model-assets\/([^/]+)(?:\/(.*))?$/.exec(pathname);
  if (!match || !LEGACY_ATLAS_RELEASES.includes(match[1])) return null;
  const name = match[2] || "";
  if (name && name.split("/").some(part => !part || part === "." || part === ".." || /[\\\x00-\x1f]/.test(part))) return null;
  return { prefix: `/model-assets/${match[1]}/`, name };
}

export function legacyAtlasDestination(url: URL): URL | null {
  const legacy = legacyPath(url);
  if (!legacy || legacy.name === "service-worker.js") return null;
  const target = new URL(currentPrefix + "index.html", url.origin);
  target.search = url.search;
  target.hash = url.hash;
  return target;
}

export function legacyAtlasWorker(url: URL): string | null {
  const legacy = legacyPath(url);
  if (legacy?.name !== "service-worker.js") return null;
  // Retire only the old atlas registration. Never erase PGS caches or sessions.
  return `"use strict";
const OLD=${JSON.stringify(legacy.prefix)}, CURRENT=${JSON.stringify(currentPrefix)};
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
