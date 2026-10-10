// usage: node capture-mock.js <out.json> [page url, default http://localhost:8000/]
// Records every WGSL module the WebGPU renderer creates, in the same form as ../shader-cost/capture.js, with a stand-in
// for the GPU: no device, no adapter, no WebGPU in the browser at all. The renderer runs its start-up against the
// stand-in (every call answers with another stand-in), which is enough for it to build every module. For check.sh.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 402, height: 812 } });
  await ctx.addInitScript(() => {
    window.__mods = [];
    const make = (name) => new Proxy(function(){}, {
      get(t, k){
        if (k === 'then') return undefined;
        if (k === Symbol.toPrimitive) return () => 1;
        if (k === 'features') return new Set();
        if (k === 'limits') return new Proxy({}, { get: () => 1 << 28 });
        if (k === 'info') return { vendor: 'mock' };
        if (k === 'lost') return new Promise(() => {});
        if (k === 'mipLevelCount') return 7; if (k === 'width' || k === 'height') return 64;
        if (k === 'createShaderModule') return d => { window.__mods.push({ label: d.label || null, code: d.code }); return make('mod'); };
        if (['requestAdapter', 'requestDevice', 'popErrorScope', 'onSubmittedWorkDone', 'mapAsync', 'createRenderPipelineAsync', 'createComputePipelineAsync'].includes(k))
          return () => Promise.resolve(k === 'popErrorScope' ? null : make(k));
        if (k === 'getCompilationInfo') return () => Promise.resolve({ messages: [] });
        if (k === 'getPreferredCanvasFormat') return () => 'bgra8unorm';
        if (k === 'getMappedRange') return () => new ArrayBuffer(1 << 16);
        return make(k);
      },
      apply(){ return make('ret'); }
    });
    Object.defineProperty(navigator, 'gpu', { value: make('gpu') });
    window.GPUTextureUsage = new Proxy({}, { get: () => 1 }); window.GPUBufferUsage = new Proxy({}, { get: () => 1 }); window.GPUMapMode = { READ: 1 }; window.GPUShaderStage = new Proxy({}, { get: () => 1 });
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t, o) { return t === 'webgpu' ? make('ctx') : gc.call(this, t, o); };
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'warning' && errs.push(m.text()));
  const u = new URL(process.argv[3] || 'http://localhost:8000/'); u.searchParams.set('inline', '');   // the scene on the page, where the stand-in is
  await p.goto(u.href);
  await p.waitForFunction(() => window.__mods.length >= 13, null, { timeout: 120000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const mods = await p.evaluate(() => window.__mods);
  fs.writeFileSync(process.argv[2], JSON.stringify({ mods, pipes: [] }, null, 1));
  console.log(mods.length, 'modules', errs.slice(0, 3).join(' | '));
  await b.close();
})();
