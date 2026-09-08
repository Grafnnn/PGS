import { promisify } from "node:util";
import { gunzip as gunzipCallback, gzip as gzipCallback } from "node:zlib";

export const PROJECT_MODEL_EMBED_VERSION = "monolith-v1";

const integration = Buffer.from(`
<style id="pgs-model-embed-style">
:where(*,*::before,*::after){border-radius:0!important}
.hero{border-radius:14px!important}
.inspector,.section-card{border-radius:11px!important}
dialog{border-radius:13px!important}
</style>
<script id="pgs-model-embed-script">
window.addEventListener('keydown',function(event){
  if(event.key==='Escape'&&!event.defaultPrevented&&parent!==window){
    parent.postMessage({type:'pgs:project-model-close'},'*');
  }
});
</script>
`, "utf8");

const gunzip = promisify(gunzipCallback);
const gzip = promisify(gzipCallback);

export function hasProjectModelEmbed(url: string) {
  return new URL(url).searchParams.get("embed") === PROJECT_MODEL_EMBED_VERSION;
}

export async function appendProjectModelEmbed(source: Uint8Array, encoding: "gzip" | "identity") {
  const html = encoding === "gzip" ? await gunzip(source) : source;
  const embedded = Buffer.concat([html, integration]);
  // Browsers must receive one gzip member containing both the model and its integration.
  return encoding === "gzip" ? gzip(embedded) : embedded;
}

export function acceptsProjectModelGzip(header: string | null) {
  const encodings = (header ?? "").split(",").map((part) => {
    const [name, ...parameters] = part.trim().toLowerCase().split(";");
    const quality = parameters.map((value) => value.trim()).find((value) => value.startsWith("q="));
    return { name, quality: quality ? Number(quality.slice(2)) : 1 };
  });
  const gzip = encodings.find((encoding) => encoding.name === "gzip") ?? encodings.find((encoding) => encoding.name === "*");
  return Boolean(gzip && gzip.quality > 0 && gzip.quality <= 1);
}
