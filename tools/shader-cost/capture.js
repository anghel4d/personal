// usage: node capture.js <page url> <out.json>
// Loads the page in headless Chromium (WebGPU on SwiftShader) and records every WGSL module and pipeline it creates.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'] });
  const ctx = await b.newContext({ viewport: { width: 402, height: 812 } });
  await ctx.addInitScript(() => {
    window.__mods = []; window.__pipes = [];
    const P = GPUDevice.prototype, csm = P.createShaderModule;
    P.createShaderModule = function (d) {
      const m = csm.call(this, d);
      Object.defineProperty(m, '__i', { value: window.__mods.length, enumerable: true });
      window.__mods.push({ label: d.label || null, code: d.code }); return m;
    };
    const ser = d => JSON.parse(JSON.stringify(d, (k, v) => (v && typeof v === 'object' && v.__i !== undefined) ? { mod: v.__i } : (k === 'layout' ? 'auto' : v)));
    for (const f of ['createRenderPipeline', 'createRenderPipelineAsync', 'createComputePipeline', 'createComputePipelineAsync']) {
      const o = P[f]; P[f] = function (d) { window.__pipes.push({ kind: f.includes('Render') ? 'G' : 'C', d: ser(d) }); return o.call(this, d); };
    }
  });
  const p = await ctx.newPage();
  await p.goto(url);
  // every pipeline exists before the first frame
  await p.waitForFunction(() => window.__pipes.length > 0 && ((window.A4D_STATE || {}).stats || {}).frames >= 1, null, { timeout: 600000, polling: 500 });
  const r = await p.evaluate(() => ({ mods: window.__mods, pipes: window.__pipes }));
  fs.writeFileSync(out, JSON.stringify(r, null, 1));
  console.log(r.mods.length, 'modules,', r.pipes.length, 'pipelines');
  await b.close();
})();
