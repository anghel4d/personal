# usage: python3 cost.py <capture.json> [--family navi21] [--pipeline water --variants variants.py]
# Compiles every captured pipeline (WGSL -> naga -> SPIR-V) with AMD's shader compiler (ACO, in Mesa's RADV driver,
# on its null device: no GPU needed) and prints its statistics per shader stage. With --pipeline and --variants, it
# compiles text variants of that pipeline's module instead (VARIANTS = {name: [(old, new), ...]}), to price its parts.
import argparse, json, os, subprocess, sys, tempfile
here = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument('capture'); ap.add_argument('--family', default='navi21')
ap.add_argument('--pipeline'); ap.add_argument('--variants'); a = ap.parse_args()
d = json.load(open(a.capture)); wd = tempfile.mkdtemp(prefix='shader-cost-')
FMT = {'rgba16float': 97, 'bgra8unorm': 44, 'rgba8unorm': 37, 'rgba32float': 109}
TYPES = {'separate_samplers': 0, 'textures': 1, 'separate_images': 2, 'images': 3, 'ubos': 6, 'ssbos': 7}
ENV = dict(os.environ, XDG_RUNTIME_DIR=os.environ.get('XDG_RUNTIME_DIR', wd), RADV_FORCE_FAMILY=a.family,
           VK_ICD_FILENAMES='/usr/share/vulkan/icd.d/radeon_icd.json', RADV_DEBUG='nocache')
KEYS = ['Instructions', 'Latency', 'Inverse Throughput', 'VGPRs', 'Branches', 'VMEM Clause', 'Subgroups per SIMD']
def spirv(code, name):
    w, s = f'{wd}/{name}.wgsl', f'{wd}/{name}.spv'
    open(w, 'w').write(code)
    r = subprocess.run(['naga', '--index-bounds-check-policy', 'Restrict', '--image-load-bounds-check-policy', 'Restrict', w, s], capture_output=True, text=True)
    if r.returncode: sys.exit(f'naga failed on {name}:\n{r.stderr[:3000]}')
    refl = json.loads(subprocess.run(['spirv-cross', s, '--reflect'], capture_output=True, text=True).stdout or '{}')
    return s, sorted(set((x.get('set', 0), x['binding'], t) for k, t in TYPES.items() for x in refl.get(k, [])))
def manifest(name, p, mods):
    D = p['d']
    if p['kind'] == 'C':
        s, binds = mods[D['compute']['module']['mod']]
        lines = [f"P {name} C {s} {D['compute'].get('entryPoint', 'main')}"]
    else:
        v, f = D['vertex'], D['fragment']; (sv, bv), (sf, bf) = mods[v['module']['mod']], mods[f['module']['mod']]
        t, prim = f['targets'][0], D.get('primitive', {}); stride = v['buffers'][0]['arrayStride'] if v.get('buffers') else 0
        lines = [f"P {name} G {sv} {v.get('entryPoint', 'vs')} {sf} {f.get('entryPoint', 'fs')} {FMT[t['format']]} {1 if t.get('blend') else 0} "
                 f"{1 if prim.get('cullMode') == 'back' else 0} {1 if prim.get('frontFace') == 'cw' else 0} {stride}"]
        binds = sorted(set(bv) | set(bf))
    return lines + [f"B {s_} {b} {t} {0x7FFFFFFF}" for s_, b, t in binds] + ['E']
def compile_(man):
    r = subprocess.run([f'{here}/radvstats'], input='\n'.join(man) + '\n', capture_output=True, text=True, env=ENV)
    if r.returncode: sys.exit(r.stderr[-3000:])
    for line in r.stdout.splitlines():
        f = line.split('\t'); st = dict(x.split('=', 1) for x in f[3:]); yield f[0], f[1], f[2].split()[-1], st
def label(p, i):
    D = p['d']; m = D['compute']['module']['mod'] if p['kind'] == 'C' else D['fragment']['module']['mod']
    nm = D.get('label') or d['mods'][m]['label'] or f'm{m}'
    return (nm + (':' + D['compute'].get('entryPoint', 'main') if p['kind'] == 'C' and not D.get('label') else '')).replace(' ', '_')
print(f"{'pipeline':18s} {'stage':10s} {'wave':>4s} " + ' '.join(f'{k[:11]:>11s}' for k in KEYS))
if a.variants:
    p = next(p for i, p in enumerate(d['pipes']) if label(p, i) == a.pipeline.replace(' ', '_'))
    ns = {}; exec(open(a.variants).read(), ns)
    mi = p['d']['compute']['module']['mod'] if p['kind'] == 'C' else p['d']['fragment']['module']['mod']
    for name, subs in ns['VARIANTS'].items():
        code = d['mods'][mi]['code']
        for old, new in subs:
            if old not in code: sys.exit(f'{name}: not in the module: {old[:90]}')
            code = code.replace(old, new)
        mods = {i: spirv(m['code'], f'm{i}') for i, m in enumerate(d['mods']) if i != mi}; mods[mi] = spirv(code, f'{name}')
        for n, ex, wave, st in compile_(manifest(name, p, mods)):
            if p['kind'] == 'G' and 'ragment' not in ex: continue
            print(f"{n[:18]:18s} {ex[:10]:10s} {wave:>4s} " + ' '.join(f"{st.get(k, '-'):>11s}" for k in KEYS))
else:
    mods = {i: spirv(m['code'], f'm{i}') for i, m in enumerate(d['mods'])}
    man = sum((manifest(label(p, i), p, mods) for i, p in enumerate(d['pipes'])), [])
    for n, ex, wave, st in compile_(man):
        print(f"{n[:18]:18s} {ex[:10]:10s} {wave:>4s} " + ' '.join(f"{st.get(k, '-'):>11s}" for k in KEYS))
