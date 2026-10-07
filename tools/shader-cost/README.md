# shader-cost

What the WebGPU renderer's shaders cost on a real GPU architecture, without that GPU. Development only; nothing here is part of the site.

The page's WGSL is compiled to SPIR-V by naga, then by AMD's production shader compiler (ACO, inside Mesa's RADV driver) on RADV's null device, which compiles for any AMD family with no AMD hardware present. Vulkan's pipeline-executable statistics then give, per shader stage: instructions, VGPRs, branches, ACO's estimated latency, and its inverse throughput (cycles of one SIMD per 64 lanes of work, a wave64 or two wave32s, with the shader at its full occupancy). The last is the figure to compare.

## Setup (Ubuntu 24.04)

```sh
apt-get install mesa-vulkan-drivers libvulkan-dev spirv-cross
cargo install naga-cli
gcc -O1 -o radvstats radvstats.c -lvulkan
```

Playwright with its Chromium must be installed globally (`npm root -g`), and the site served on localhost (`python3 -m http.server 8000`).

## Use

```sh
node capture.js http://localhost:8000/index.html cap.json    # every WGSL module and pipeline the page creates
python3 cost.py cap.json                                       # statistics for every pipeline (default family navi21, RDNA2)
python3 cost.py cap.json --family gfx1103                      # another family (gfx1103: RDNA3 integrated)
python3 cost.py cap.json --pipeline water --variants v.py      # price parts of one pipeline
```

A variants file holds `VARIANTS = {name: [(old, new), ...]}`: text substitutions in the pipeline's module. Removing a part and comparing against `'base': []` prices it; forcing a branch (`if (hz > 0.0)` to `if (false)`) prices each path of a shader alone.

## Reading the numbers

- The estimates are static. ACO assumes a loop runs 8 times, a uniform branch is taken half the time and a divergent one three quarters, so a loop that runs twice is overcharged; force paths with variants rather than trusting the blended total.
- Frame cost is the sum over passes of waves times inverse throughput. A full-screen pass at W x H runs W x H / 64 waves; a compute dispatch runs its threads / 64.
- The model is ALU and issue bound. It does not see memory bandwidth, texture-cache misses, rasterisation or blending; check those against `#diag` timings on real hardware where possible.
- naga's SPIR-V differs from what each browser generates (Chrome on Vulkan uses Tint), but ACO's optimisation evens out most of the difference.
