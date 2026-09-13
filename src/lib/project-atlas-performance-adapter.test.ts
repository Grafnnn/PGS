import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { runInNewContext, Script } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import manifest from "@/assets/project-models/troitsk-b24-atlas-3-2.manifest.json";
import { atlasGestureController } from "./project-atlas-controls";
import { adaptProjectAtlasPerformance, adaptProjectAtlasWorker, adaptProjectAtlasWorkerBundle, atlasRenderController } from "./project-atlas-performance-adapter";

function original(name: keyof typeof manifest.files) {
  return gunzipSync(readFileSync("src/assets/project-models/troitsk-b24-atlas-3-2/" + manifest.files[name].storage)).toString();
}
function gestures() {
  const camera = { scale: 8, size: 65, yaw: -.95, pitch: .68, target: [0, 0, 0], pan: [0, 0] };
  const changed = vi.fn(), settled = vi.fn(), select = vi.fn(), release = vi.fn();
  const control = runInNewContext(atlasGestureController + ";createAtlasGestureController", {})({ camera: () => camera, viewport: () => ({ width: 1000, height: 700 }), changed, settled, select, capture: vi.fn(), release });
  const event = (pointerId: number, x: number, y = 350, pointerType = "touch", button = 0, shiftKey = false) => ({ pointerId, x, y, pointerType, button, shiftKey });
  return { camera, control, changed, settled, select, release, event };
}

describe("Atlas pointer gestures", () => {
  it("pinches in/out around the fingers without rotating or selecting", () => {
    const { camera, control, select, event } = gestures();
    control.down(event(1, 400)); control.down(event(2, 600));
    control.move(event(1, 300)); control.move(event(2, 700));
    expect(camera.scale).toBe(16); expect(camera.pan).toEqual([0, 0]); expect(camera.yaw).toBe(-.95);
    control.move(event(1, 400)); control.move(event(2, 600));
    expect(camera.scale).toBe(8);
    control.up(event(1, 400)); control.move(event(2, 610));
    expect(camera.yaw).toBeCloseTo(-1.03);
    control.up(event(2, 610)); expect(select).not.toHaveBeenCalled();
    control.down(event(3, 500)); control.up(event(3, 500)); expect(select).toHaveBeenCalledOnce();
  });
  it("keeps an off-center anchor and supports two-finger translation", () => {
    const { camera, control, event } = gestures();
    control.down(event(1, 200, 200)); control.down(event(2, 400, 200));
    control.move(event(1, 100, 200)); control.move(event(2, 500, 200));
    expect(camera.scale).toBe(16); expect(camera.pan).toEqual([200, 150]);
    control.move(event(1, 130, 180)); control.move(event(2, 530, 180));
    expect(camera.pan).toEqual([230, 130]);
  });
  it.each([1, 2])("rebases when pointer %s leaves and ignores its normal capture loss", (id) => {
    const { camera, control, select, event } = gestures();
    control.down(event(1, 400)); control.down(event(2, 600));
    control.up(event(id, id === 1 ? 400 : 600));
    control.up(event(id, 0), true);
    const remaining = id === 1 ? 2 : 1, x = remaining === 1 ? 400 : 600;
    control.move(event(remaining, x)); expect(camera.yaw).toBe(-.95);
    control.move(event(remaining, x + 20)); expect(camera.yaw).toBeCloseTo(-1.11);
    control.up(event(remaining, x + 20)); expect(select).not.toHaveBeenCalled();
  });
  it("cancels captures, suppresses three-finger selection, and recovers", () => {
    const { camera, control, event, select, release } = gestures();
    for (let id = 1; id <= 3; id++) control.down(event(id, id * 100));
    control.move(event(1, 900)); expect(camera.yaw).toBe(-.95);
    control.cancel(); expect(release).toHaveBeenCalledTimes(3); expect(control.active()).toBe(false);
    control.move(event(1, 0)); expect(camera.yaw).toBe(-.95);
    control.down(event(4, 500)); control.up(event(4, 500), true); expect(select).not.toHaveBeenCalled();
    control.down(event(5, 500)); control.up(event(5, 500)); expect(select).toHaveBeenCalledOnce();
  });
  it("retains mouse rotate, Shift/right pan, wheel, finite bounds and click threshold", () => {
    const { camera, control, event, select } = gestures();
    control.down(event(1, 400, 350, "mouse")); control.move(event(1, 420, 350, "mouse")); control.up(event(1, 420, 350, "mouse"));
    expect(camera.yaw).toBeCloseTo(-1.11); expect(select).not.toHaveBeenCalled();
    for (const [button, shift] of [[0, true], [2, false]] as const) {
      control.down(event(1, 400, 350, "mouse", button, shift)); control.move(event(1, 420, 350, "mouse", button, shift)); control.up(event(1, 420, 350, "mouse", button, shift));
    }
    expect(camera.pan[0]).toBe(40);
    for (let n = 0; n < 50; n++) control.wheel({ x: 500, y: 350, deltaY: -10000, deltaMode: 0 });
    expect(camera.scale).toBeCloseTo(840); expect(Number.isFinite(camera.pan[0])).toBe(true);
    control.wheel({ x: 500, y: 350, deltaY: NaN, deltaMode: 0 }); expect(camera.scale).toBeCloseTo(840);
  });
  it("does not divide by a near-zero pinch distance", () => {
    const { camera, control, event } = gestures();
    control.down(event(1, 500)); control.down(event(2, 500)); control.move(event(2, 501));
    expect(camera.scale).toBe(8); expect(camera.pan).toEqual([0, 0]);
  });
});

describe("Atlas delivery/raster preservation", () => {
  it("adapts only the known runtime, parses, and fails closed on drift/reapplication", () => {
    const album = original("assets/album.js"), adapted = adaptProjectAtlasPerformance(album);
    expect(() => new Script(adapted)).not.toThrow();
    expect(adapted).not.toContain("let drag=null;");
    expect(adapted).toContain("lostpointercapture");
    expect(() => adaptProjectAtlasPerformance(adapted)).toThrow();
    const worker = adaptProjectAtlasWorkerBundle(original("assets/worker_bundle.js"));
    expect(() => new Script(worker)).not.toThrow();
    expect(() => adaptProjectAtlasWorkerBundle("bad")).toThrow();
    expect(() => adaptProjectAtlasWorker("changed source")).toThrow();
  });
  it("keeps idle RGBA/owner identical through clipping, opacity and x-ray selection", () => {
    const worker = JSON.parse(original("assets/worker_bundle.js").split("window.ALBUM_WORKER_SOURCE=")[1].trim().replace(/;$/, ""));
    const vertices = new Float32Array([-1,-1,0, 1,-1,0, 0,1,0, -.5,-.5,-1, .5,-.5,-1, 0,.5,-1]);
    const faces = new Uint32Array([0,1,2, 3,4,5]), normals = new Int8Array([0,0,127, 0,0,127]);
    const buffer = new ArrayBuffer(vertices.byteLength + faces.byteLength + normals.byteLength);
    new Float32Array(buffer, 0, vertices.length).set(vertices); new Uint32Array(buffer, vertices.byteLength, faces.length).set(faces); new Int8Array(buffer, vertices.byteLength + faces.byteLength).set(normals);
    function harness(source: string) {
      const postMessage = vi.fn(), self = { onmessage: (_event: unknown) => {} };
      runInNewContext(source, { self, postMessage, performance });
      self.onmessage({ data: { type: "init", buffer, vertices: 6, faces: 2, info: [[0,3,0,1],[3,3,1,1]], meta: [{ bounds: [[-1,-1,0],[1,1,0]], rgb:[120,160,200] }, { bounds:[[-.5,-.5,-1],[.5,.5,-1]],rgb:[200,100,50] }] } });
      return (settings: Record<string, unknown>) => {
        self.onmessage({ data: { type:"render",seq:1,width:100,height:80,camera:{yaw:-.95,pitch:.68,scale:25,target:[0,0,0],pan:[0,0]},visible:[0,1],opacity:1,selected:-1,...settings } });
        return postMessage.mock.calls.at(-1)![0];
      };
    }
    const before = harness(worker), after = harness(adaptProjectAtlasWorker(worker));
    for (const settings of [{}, { opacity:.5 }, { selected:1 }, { selectedIndices:[0,1] }, { clip:[[-.2,.6],[-.8,.7],[-2,1]],offsets:{1:.2} }]) {
      const a=before(settings),b=after(settings);
      expect(b.type).toBe("frame"); expect(Buffer.from(b.pixels)).toEqual(Buffer.from(a.pixels)); expect(Buffer.from(b.owner)).toEqual(Buffer.from(a.owner));
      const recycled=after({...settings,recyclePixels:b.pixels,recycleOwner:b.owner});
      expect(recycled.pixels).toBe(b.pixels); expect(recycled.owner).toBe(b.owner);
      expect(Buffer.from(recycled.pixels)).toEqual(Buffer.from(a.pixels));
    }
  });
  it("coalesces input, preserves one in-flight, presents intermediate frames, then exact picking", () => {
    const frames: Array<() => void> = [], posts: Record<string, unknown>[] = [];
    const canvas={width:100,height:80,dataset:{},getBoundingClientRect:()=>({width:100,height:80})};
    const elements: Record<string, unknown>={stage:canvas,sceneLoading:{hidden:false},renderStats:{textContent:""},resident:{textContent:""}};
    const scope={requestAnimationFrame:(fn:()=>void)=>{frames.push(fn);return frames.length;},performance,URLSearchParams,location:{search:"?perf"},$:(id:string)=>elements[id],canvas,ctx:{putImageData:vi.fn()},ImageData:class {},workerReady:true,workerBusy:false,pendingRender:false,pick:null,pickGeneration:-1,lastFrame:null,generation:1,seq:0,worker:{postMessage:(m:Record<string,unknown>)=>posts.push(m)},S:{camera:{yaw:0,pitch:0,size:10,scale:5,pan:[0,0],target:[0,0,0]},visible:[1],selection:null,cardIds:[],opacity:1,clip:null},keyMap:new Map(),currentTreeId:()=>"building",offsets:()=>({}),window:{},drawOverlay:vi.fn(),fmt:String,activeBlocks:[]};
    const api=runInNewContext(atlasRenderController+";({render,atlasPresent})",scope);
    for(let i=0;i<20;i++)api.render(); expect(frames.length).toBe(1); frames.shift()!(); expect(posts.length).toBe(1);
    for(let i=0;i<20;i++)api.render(); frames.shift()!(); expect(posts.length).toBe(1);
    const response=(seq:number)=>({seq,width:100,height:80,pixels:new ArrayBuffer(32000),owner:new ArrayBuffer(32000),ms:40,triangles_tested:10});
    api.atlasPresent(response(1),1,0,0);frames.shift()!();expect(canvas.dataset).toMatchObject({quality:"interactive"});
    frames.shift()!();expect(posts.length).toBe(2);
    api.atlasPresent(response(2),1,0,0);frames.shift()!();expect(canvas.dataset).toMatchObject({quality:"exact"});expect(scope.pickGeneration).toBe(1);
  });
});
