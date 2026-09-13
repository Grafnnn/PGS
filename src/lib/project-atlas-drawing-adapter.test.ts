import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createContext, runInContext, runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import manifest from "@/assets/project-models/troitsk-b24-atlas-3-2.manifest.json";
import sourceLinks from "@/assets/project-models/troitsk-b24-atlas-3-2.source-links.json";
import { adaptProjectAtlasDrawings, atlasConfirmedDrawingLinks, atlasDrawingRenderer } from "@/lib/project-atlas-drawing-adapter";

class Element {
  children: Element[] = [];
  textContent = "";
  style: Record<string, string> = {};
  attrs: Record<string, string> = {};
  href = ""; target = ""; rel = ""; src = ""; title = ""; alt = "";
  naturalWidth = 1600; clientWidth = 600; scrollLeft = 0; scrollTop = 0;
  naturalHeight = 1000; clientHeight = 600; isConnected = true; focused = false; open = false;
  events: Record<string, (event?: unknown) => void> = {};
  onclick?: (event?: unknown) => void;
  onload?: () => void;
  constructor(public tag = "div") {}
  set innerHTML(_value: string) { this.children = []; }
  append(...elements: Element[]) { this.children.push(...elements); }
  replaceChildren(...elements: Element[]) { this.children = elements; }
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  addEventListener(name: string, callback: (event?: unknown) => void) { this.events[name] = callback; }
  showModal() { this.open = true; }
  close() { this.open = false; this.events.close?.(); }
  remove() { this.isConnected = false; }
  focus() { this.focused = true; }
  getClientRects() { return [1]; }
}
const exact = { title: "АС.2 · лист 23 / PDF 24", file: "sources/first.jpg", printed_sheet: "23", pdf: "documents/AS2_last_full.pdf", pdf_page: 24 };
const imageOnly = { title: "АС.2 · опирание 8–8", file: "sources/second.svg", printed_sheet: "56", pdf: null, pdf_page: null };
function harness(ensurePack = async (_file: string) => ({ ok: true, message: "" })) {
  const elements = Object.fromEntries(["drawingResource", "drawingTitle", "drawingInfo", "drawingPanel"].map(id => [id, new Element()]));
  const body = new Element("body");
  const events: Record<string, () => void> = {};
  const context = createContext({
    drawingTicket: 0, drawingSession: 0, $: (id: string) => elements[id],
    sources: async () => ({ sources: { exact, R05S_N_024: exact, imageOnly } }), ensurePack,
    friendlySource: (s: { title: string }) => s.title, sourceMode: (s: string) => s,
    document: { body, createElement: (tag: string) => new Element(tag) },
    window: { addEventListener(name: string, callback: () => void) { events[name] = callback; }, removeEventListener(name: string) { delete events[name]; } },
    MutationObserver: class { observe() {} disconnect() {} }
  });
  runInContext(atlasDrawingRenderer, context);
  return { elements, body, events, context, open: (key: string) => runInContext(`openSource(${JSON.stringify(key)})`, context) as Promise<void> };
}

describe("Atlas drawing interaction adapter", () => {
  it("backs every recovered ID with its frozen explicit source text and registry file", async () => {
    async function data<T>(name: keyof typeof manifest.files): Promise<T> {
      const file = manifest.files[name];
      const text = gunzipSync(await readFile(`src/assets/project-models/troitsk-b24-atlas-3-2/${file.storage}`)).toString();
      return JSON.parse(gunzipSync(Buffer.from(JSON.parse(text.match(/ALBUM_ACCEPT\([^,]+,\s*("[^"]+")/)![1]), "base64")).toString());
    }
    const index = await data<{ columns: string[]; values: unknown[][] }>("data/index.js");
    const keyColumn = index.columns.indexOf("key"), blockColumn = index.columns.indexOf("block"), sourcesColumn = index.columns.indexOf("sources");
    const rows = new Map(index.values.map(row => [row[keyColumn], row]));
    const registry = await data<{ sources: Record<string, { file: string }> }>("data/sources.js");
    const hierarchy = await data<{ nodes: Record<string, { model_key: string }> }>("data/hierarchy.js");
    type Block = { records: { key: string; props: { source: string } }[] };
    const blocks = new Map<string, Block>();
    const ids = sourceLinks.groups.flatMap(g => g.ids);
    expect(new Set(ids).size).toBe(189);
    for (const group of sourceLinks.groups) {
      for (const key of group.sourceKeys) expect(manifest.files).toHaveProperty(registry.sources[key].file);
      for (const node of group.ownBodyNodes) expect(group.ids).toContain(hierarchy.nodes[node].model_key);
      for (const id of group.ids) {
        const row = rows.get(id)!;expect(row).toBeDefined();expect(row[sourcesColumn]).toEqual([]);
        const blockId = String(row[blockColumn]);
        if (!blocks.has(blockId)) blocks.set(blockId, await data<Block>(`blocks/${blockId}.js` as keyof typeof manifest.files));
        const record = blocks.get(blockId)!.records.find(record => record.key === id)!;
        expect(record.props.source).toBe(group.evidence);
      }
    }
  });
  it("keeps the preview, links its exact image, and separates PDF viewing from downloading", async () => {
    const h = harness();await h.open("R05S_N_024");
    const [toolbar, viewport] = h.elements.drawingResource.children;
    const [open, zoom, pdf, download] = toolbar.children;
    expect(open.textContent).toBe("Открыть чертёж");
    expect(open.href).toBe("drawing.html?source=R05S_N_024");
    expect(open.target).toBe("_blank");
    expect(open.rel).toContain("noopener");
    expect(viewport.children[0].href).toBe("drawing.html?source=R05S_N_024");
    expect(viewport.children[0].children[0].src).toBe(exact.file);
    expect(pdf.href).toBe("drawing.html?source=R05S_N_024&view=page");
    expect(pdf.target).toBe("_blank");
    expect(pdf.attrs).not.toHaveProperty("download");
    expect(download.href).toBe(exact.pdf);
    expect(download.attrs).toHaveProperty("download", "");
    expect(toolbar.children.filter(e => e.tag === "iframe")).toHaveLength(0);
    zoom.onclick!();expect(viewport.children[0].children[0].style.width).toBe("1600px");
    expect(zoom.attrs["aria-pressed"]).toBe("true");
    zoom.onclick!();expect(viewport.children[0].children[0].style.width).toBe("");
  });
  it("opens the exact PDF page in a modal on a plain click and preserves the preview on Escape", async () => {
    const h = harness();await h.open("R05S_N_024");
    const [toolbar, viewport] = h.elements.drawingResource.children;
    const anchor = toolbar.children[2];let prevented = false, stopped = false;
    anchor.onclick!({ button: 0, preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);
    const dialog = h.body.children[0];expect(dialog.open).toBe(true);
    expect(dialog.children[1].children[0].src).toMatch(/^drawing-pages\/[a-f0-9]+\.webp$/);
    expect(dialog.children[0].children[0].children[1].textContent).toBe("Страница PDF 24 · Лист 23");
    dialog.events.keydown({ key: "Escape", preventDefault() {}, stopPropagation() { stopped = true; } });
    expect(stopped).toBe(true);expect(dialog.open).toBe(false);expect(dialog.isConnected).toBe(false);
    expect(anchor.focused).toBe(true);expect(h.elements.drawingResource.children[1]).toBe(viewport);
  });
  it("keeps modified clicks as independent, bookmarkable source links", async () => {
    const h = harness();await h.open("imageOnly");let prevented = false;
    const anchor = h.elements.drawingResource.children[0].children[0];
    anchor.onclick!({ button: 0, ctrlKey: true, preventDefault() { prevented = true; } });
    expect(prevented).toBe(false);expect(h.body.children).toHaveLength(0);
    anchor.onclick!({ button: 0, preventDefault() { prevented = true; } });
    expect(prevented).toBe(true);expect(h.body.children[0].children[1].children[0].src).toBe(imageOnly.file);
  });
  it("closes a sheet on browser navigation without restoring focus into the old preview", async () => {
    const h = harness();await h.open("imageOnly");
    const anchor = h.elements.drawingResource.children[0].children[0];
    anchor.onclick!({ button: 0, preventDefault() {} });
    const dialog = h.body.children[0];h.events.hashchange();
    expect(dialog.open).toBe(false);expect(dialog.isConnected).toBe(false);
    expect(anchor.focused).toBe(false);expect(h.events).toEqual({});
  });
  it("fits vector drawings above their small intrinsic size without overflowing the stage", async () => {
    const h = harness();await h.open("imageOnly");
    h.elements.drawingResource.children[0].children[0].onclick!({ button: 0, preventDefault() {} });
    const image = h.body.children[0].children[1].children[0];
    image.naturalWidth = 212;image.naturalHeight = 150;image.onload!();
    expect(image.style.width).toBe("568px");
  });
  it("opens a source without a PDF and never retains links from the previous source", async () => {
    const h = harness();await h.open("exact");await h.open("imageOnly");
    const [toolbar, viewport] = h.elements.drawingResource.children;
    expect(toolbar.children.map(e => e.textContent)).toEqual(["Открыть чертёж", "Крупно"]);
    expect(toolbar.children[0].href).toBe("drawing.html?source=imageOnly");
    expect(viewport.children[0].children[0].src).toBe(imageOnly.file);
    expect(h.elements.drawingResource.children[2].textContent).toContain("не подтверждена");
  });
  it("does not let a delayed previous PDF append links to another source", async () => {
    let resolve!: (value: { ok: boolean; message: string }) => void;
    let entered!: () => void;
    const pending = new Promise<void>(done => { entered = done; });
    const h = harness(file => file.endsWith(".pdf") ? (entered(), new Promise(done => { resolve = done; })) : Promise.resolve({ ok: true, message: "" }));
    const first = h.open("exact");await pending;
    await h.open("imageOnly");resolve({ ok: true, message: "" });await first;
    expect(h.elements.drawingTitle.textContent).toBe(imageOnly.title);
    expect(h.elements.drawingResource.children[0].children).toHaveLength(2);
  });
  it("rejects unknown source files instead of making a link", async () => {
    const h = harness(async () => ({ ok: false, message: "Источник не зарегистрирован" }));
    await h.open("exact");
    expect(h.elements.drawingResource.children).toHaveLength(1);
    expect(h.elements.drawingResource.children[0].textContent).toContain("не зарегистрирован");
  });
  it.each([
    ["node", "entity:MU55", null, "R02_AS399,R02_AC22"],
    ["node", "body:MU55", null, "R02_AS399,R02_AC22"],
    ["element", "body:MU55", "MU55", "R02_AS399,R02_AC22"],
    ["node", "section:roof", null, "R02_AR9"],
    ["node", "building", null, null],
    ["node", "entity:unknown-roof-child", null, null],
    ["view", "section:roof", null, null]
  ])("restores only explicit source context: %s %s", (kind, nid, key, expected) => {
    const context = { context: { kind, key }, nid, ss: { R02_AS399: {}, R02_AC22: {}, R02_AR9: {} }, links: [], mode: "" };
    runInNewContext(atlasConfirmedDrawingLinks, context);
    expect(context.links).toEqual(expected ? expected.split(",").map(key => ({ key })) : []);
  });
  it("does not override an existing direct source", () => {
    const context = { context: { kind: "node" }, nid: "entity:MU55", ss: { R02_AS399: {} }, links: [{ key: "direct" }], mode: "direct" };
    runInNewContext(atlasConfirmedDrawingLinks, context);
    expect(context.links).toEqual([{ key: "direct" }]);expect(context.mode).toBe("direct");
  });
  it("patches only the verified function and explicit context, failing closed on drift", async () => {
    const asset = manifest.files["assets/album.js"];
    const source = gunzipSync(await readFile(`src/assets/project-models/troitsk-b24-atlas-3-2/${asset.storage}`)).toString();
    const adapted = adaptProjectAtlasDrawings(source);
    expect(adapted).toContain(atlasDrawingRenderer);
    expect(adapted).toContain(atlasConfirmedDrawingLinks);
    expect(adapted.slice(adapted.indexOf("let drawingFocus=null;"))).toBe(source.slice(source.indexOf("let drawingFocus=null;")).replace(" if(!links.length&&context.kind!=='view'&&nid){", atlasConfirmedDrawingLinks + " if(!links.length&&context.kind!=='view'&&nid){"));
    expect(() => adaptProjectAtlasDrawings(source.replace("let drawingFocus=null;", "let drawingFocus;"))).toThrow();
    expect(() => adaptProjectAtlasDrawings(adapted)).toThrow();
  });
});
