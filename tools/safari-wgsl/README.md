# safari-wgsl

Whether Safari can compile the WebGPU renderer's shaders, without a Mac or an iPhone. Development only; nothing here is part of the site.

Safari compiles WGSL with WebKit's own compiler (`Source/WebGPU/WGSL`), not Tint or naga, and a shader it rejects sends the page to the three.js renderer without a word. `wgslc-report` drives that compiler the way WebKit's WebGPU does for a page: the static check with the default device limits (warnings included, as `getCompilationInfo()` would report them), then, for each entry point, the preparation for `layout: "auto"` and the Metal generation for an Apple GPU family. It stops short of compiling that Metal, which only Apple's systems can do.

## Setup (Ubuntu 24.04; the build takes about 4 minutes)

```sh
apt-get install cmake ninja-build clang ruby libicu-dev
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/WebKit/WebKit webkit
git -C webkit sparse-checkout set --cone Source/cmake Source/WTF Source/bmalloc Source/WebGPU/WGSL
git -C webkit checkout
ln -s "$PWD/webkit/Source" Source        # here, in tools/safari-wgsl
cmake -G Ninja -S . -B build -DPORT=JSCOnly -DCMAKE_BUILD_TYPE=Release -DENABLE_STATIC_JSC=ON -DUSE_SYSTEM_MALLOC=ON \
  -DUSE_HEADER_MAPS=OFF -DDEVELOPER_MODE=OFF -DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++
ninja -C build wgslc-report
```

`CMakeLists.txt` stands in for WebKit's root project: it builds bmalloc, WTF and the WGSL compiler only, with a stand-in for JavaScriptCore (the compiler uses WTF alone). For what a given Safari ships, clone a release branch instead of main, for example `--branch safari-7622.1.22.13-branch` (Safari 26.0, the first with WebGPU on by default). Older branches build the compiler as one executable; the CMake handles that layout. Branch 7624.5.1.11 needs `-DUSE_SYSTEM_MALLOC=OFF`.

## Use

```sh
node ../shader-cost/capture.js http://localhost:8000/index.html cap.json   # every WGSL module the page creates
./check.sh cap.json                                                       # Apple GPU family 8: iPhone 15 (A16)
./check.sh cap.json 9                                                     # family 9: A17 Pro and later
```

Without a working WebGPU (a container, a CI box), `node capture-mock.js cap.json` records the same modules with a stand-in for the GPU.

One line per module, OK or FAILED with the error, its line and column, the source line and a caret. Set `OUT` to keep the full reports, which also list each entry point's automatic bind group layout and the size of the Metal it generates. `wgslc-report --dump-msl=FILE` writes that Metal out.

## What it found (October 2026)

- All 13 modules (20 entry points) pass with no errors or warnings on WebKit main and on the release branches 7622.1.22.13, 7624.5.1.11 and 7625.1.29.18, for families 8 and 9.
- The water shader needs its `diagnostic(off, derivative_uniformity)`: without it, main and 7625 reject the call to `surfH` in the intersection loop ("requires uniform control flow"). 7622 and 7624 have no uniformity analysis.
- WebKit's automatic layouts mark every `texture_2d<f32>` unfilterable-float, even one sampled through a filtering sampler. It checks textures against samplers only for explicit layouts, so the page's automatic ones are unaffected.
- The Metal it writes guards `sqrt`, `log`, `log2` and `acos`: an input out of range gives 0 for `sqrt` and -inf for the logs, not NaN.
