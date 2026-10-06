# anghel4d.com

Personal site for Matei Anghel, served at anghel4d.com. One static `index.html`, no build step, no package manager.

## Layout of index.html

1. `<head>`: Google Fonts (Newsreader, JetBrains Mono), an inline SVG favicon (the lion), then three.js r147 from jsdelivr. Post-processing is our own; no `examples/js` helpers are loaded.
2. `<style>`: colour tokens on `:root`, light and dark sets (dark via `prefers-color-scheme` and `[data-theme="dark"]`). `--scene` is the gradient shown before the first frame and whenever WebGL is unavailable; it mirrors the rendered scene in each theme.
3. Markup: corner controls (lion mark, menu, name, en/fr, theme), the two-line statement, and three panels (`#work`, `#about`, `#contact`) opened over a blurred veil.
4. UI script: `T.en` / `T.fr` copy, hash routing (`#work` etc.), the theme cycle (day, night, auto; default day), and `window.A4D_STATE`, which the scene reads (`night`, `targetNight`, `pointer`, `open`, `reduce`).
5. Scene script (three.js, WebGL2). The water is adapted from [Clearwater](https://github.com/Aureliengmz/clearwater) (MIT, `licenses/clearwater.txt`). three.js is a thin layer here: every pass is a GLSL3 `RawShaderMaterial` drawn into a `WebGLRenderTarget`.
   - **Surface**: a Tessendorf FFT spectrum, 256x256 over a 4.6 m patch (`L`), transformed on the GPU each frame (16 radix-2 passes) into a mipmapped texture of height, slope and slope squared. Dispersion is quantised so the surface loops every 60 s.
   - **Caustics**: a 256x256 grid of light rays is refracted through the surface onto a plane 1.6 m down (`DEPTH`), instanced 3x3 for seamless tiling. Intensity is the ratio of each triangle's area before and after refraction (`dFdx`/`dFdy`), accumulated additively. One pass per colour channel (IOR 1.3315 / 1.3335 / 1.3365) gives dispersion. Half-float, 1024x1024, mipmapped, repeating.
   - **Water**: one full-screen pass. Rays above the horizon shade the sky and stop there. Below it, a three-step fixed-point intersection with the height field (plus a rotated, scaled copy and a micro layer to hide tiling), exact Fresnel, Beckmann sun glints widened by the unresolved slope variance (LEAN mapping), refraction to a shelving bed (`floorDepth`) of pebbles (`assets/pebbles.jpg`, de-tiled after Quilez), sand and weed, Beer-Lambert absorption and scattering (`SIG_A`, `SIG_S`, red first), forward in-scattering, suspended specks, and distance haze.
   - **Sky**: analytic gradient, a low distant shore (`ridge`, kept under the statement), sun or moon disc and halo, stars at night.
   - **Post**: bright pass and two-level bloom, then lens-diffraction glare: the bright part of the frame is convolved by FFT with an aperture's diffraction pattern. A Web Worker builds that kernel at startup (a few hundred ms of CPU) and the glare appears once it arrives; it needs float32 render targets and refreshes every other frame on small screens. The final pass adds faint chromatic aberration, then ACES tone mapping, slight desaturation, gamma, vignette and grain. Shaders output linear HDR; tone mapping happens only in the final pass.
   - **Runtime**: resolution adapts to frame time, frame rate halves while a panel is open, rendering pauses when the tab is hidden, and time slows to 12% under reduced motion. Without WebGL2, renderable float targets, three.js, the pebble texture, or a shader that compiles, the page keeps the `--scene` gradient (`html.no-gl`). The canvas fades in (`html.gl`) only after the first good frame.

## Rules

- Keep three.js pinned at 0.147.0. It is the last release that ships the UMD build together with `examples/js`; moving to ES modules needs an import map and a rework of the script tags.
- Every piece of visible copy exists in English and French. Add both, or neither.
- Keep it fast on integrated GPUs. Check any shader change against frame time, not just looks.
- Respect `prefers-reduced-motion` and keep keyboard focus visible.
- Site copy: plain sentences, no em dashes.

## Design

- Palette: mist sky `#E6F0F3`, ink `#12313D`; night ink `#D7ECF2` on `#071824`. The water colour comes from the shaders; `--scene` only mirrors it for the fallback.
- Type: Newsreader italic for the voice; JetBrains Mono, lowercase, for the corner controls.
- The horizon sits 58% down the screen (`camera.setViewOffset`), with the statement resting just above it. The eye is 1.25 m above the water (`EYE`).
- The sun sits 2.6 degrees above the top edge of the frame, computed from the camera in `frame()`, so its glints reach the bottom of the screen and its disc never shows. The moon (19 degrees up, slightly left) is in frame at night.
- Mark: a lion's face in a sunburst mane (Sun in Aries, Moon in Leo). The source is `assets/lion.svg`; an inline copy lives in `index.html`.

## Preview and deploy

- Preview: `python3 -m http.server 8000`, then open http://localhost:8000. Opening the file directly will not work: WebGL cannot read `assets/pebbles.jpg` from `file://`.
- `tools/make_pebbles.py` regenerates `assets/pebbles.jpg` (numpy, scipy, pillow).
- Deploy: any static host (for example Cloudflare Pages) with the domain's DNS at Porkbun. A `cv.pdf` placed next to `index.html` can be linked from the contact panel.
