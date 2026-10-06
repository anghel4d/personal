# anghel4d.com

Personal site for Matei Anghel, served at anghel4d.com. One static `index.html`, no build step, no package manager.

## Layout of index.html

1. `<head>`: Google Fonts (Newsreader, JetBrains Mono), an inline SVG favicon (the lion), then three.js r147 from jsdelivr. Post-processing is our own; no `examples/js` helpers are loaded.
2. `<style>`: colour tokens on `:root`, light and dark sets (dark via `prefers-color-scheme` and `[data-theme="dark"]`). `--scene` is the gradient shown before the first frame and whenever WebGL is unavailable; it mirrors the rendered scene in each theme.
3. Markup: corner controls (lion mark, menu, name, en/fr, theme), the two-line statement, and three panels (`#work`, `#about`, `#contact`) opened over a blurred veil.
4. UI script: `T.en` / `T.fr` copy, hash routing (`#work` etc.), the theme cycle (day, night, auto; default day), and `window.A4D_STATE`, which the scene reads (`night`, `targetNight`, `pointer`, `open`, `reduce`). The scene adds `look` (the live `LOOK` object: `speed`, `rows` and `levels` are read every frame) and `stats` (render size, block size, fps, GPU time), which a tuning panel can use.
5. Scene script (three.js, WebGL2). The water follows [CAUSTIC//VOLUME](https://github.com/ScottieFox/caustic-volume) (MIT, `licenses/caustic-volume.txt`); the FFT pass, the height-field intersection and the B-spline filter come from [Clearwater](https://github.com/Aureliengmz/clearwater) (MIT, `licenses/clearwater.txt`). three.js is a thin layer here: every pass is a GLSL3 `RawShaderMaterial` drawn into a `WebGLRenderTarget`. All tunables (depth, water optics, sand, sun, glints, sky brightness, exposure, saturation, speed, resolution, palette) live in the `LOOK` block; colours belong there, not scattered through the shaders.
   - **Sea**: a JONSWAP spectrum with a cross swell, 256x256 over a 4.2 m patch (`L`), transformed on the GPU each frame, made choppy by horizontal displacement, then inverted into a periodic texture of height and slope (mipmapped). Dispersion is quantised so the surface repeats every 2 minutes. A rotated copy at 2.6x scale hides the tiling, and fine noise ripples are added close to the camera.
   - **Caustics**: one photon per vertex of a grid laid over the patch, refracted to a horizontal plane; intensity is the ratio of the flat-water landing area to the actual one (`dFdx`/`dFdy`), accumulated additively, 3x3 instanced for tiling. The bed map (512x512, 192x192 photons) runs one pass per channel (IOR 1.3310 / 1.3340 / 1.3380) for dispersion and is focused at `LOOK.dbed`; deeper bed reads it defocused. Eight more slices from the surface to 3 m (`DVOL`), four to a texture, form the caustic volume.
   - **Water**: one full-screen pass. Rays above the horizon shade the sky and stop. Below it, a fixed-point intersection with the height field, exact Fresnel, reflection of the sky (an equirect environment map, refreshed twice a second) plus the glint sun's disc, refraction into the water, in-scattering along the ray (the caustic slices exaggerated against their own blurred average make the light shafts, `LOOK.god`), and the bed: rippled white sand, lit by the bed caustics, Beer-Lambert attenuated (`LOOK.sigA`, `LOOK.sigS`). The bed shelves away from the viewer (`LOOK.shelf`), so near water is bright turquoise and far water turns deep blue; the farthest water fades into the horizon haze (`LOOK.fog`).
   - **Sky**: a vivid cyan-blue gradient that pales toward the horizon, a haze band, a cumulus bank on the horizon (towers by azimuth, billowed edges, sunlit tops, blue-grey bases), sparse high clouds and wisps, the glint sun's glow, and at night the moon and stars. Its brightness (`LOOK.sky`) is set so the sky reads as the light the water is lit by.
   - **Post**: temporal accumulation (Halton jitter, reprojection onto the water plane, history clipped to the neighbourhood so moving water does not ghost), a bloom pyramid at a low weight, then faint chromatic aberration, AgX tone mapping with a saturated look, vignette and grain. Shaders output linear HDR; tone mapping happens only in the final pass. There is no lens-diffraction glare.
   - **Pixels**: the scene renders a fixed number of rows (`LOOK.rows`, 300) whatever the screen. Each rendered pixel covers a whole block of device pixels and the canvas is scaled up with `image-rendering: pixelated`, so the low resolution reads as an intentional, lossless pixel look. `LOOK.levels` (off by default) adds a GIF-like quantisation with a 4x4 ordered dither.
   - **Runtime**: the water's clock is real elapsed time times `LOOK.speed` (0.75), so it moves at the same pace at any frame rate; the camera's handheld drift runs on its own clock. Frames are capped at 30 a second (15 while a panel is open), paced against a running target so any refresh rate averages 30. Performance target: the GPU finishes a frame in under about 55% of the 33 ms budget. A fence after each frame measures GPU time; the pixel blocks grow (up to 2x) when a frame is still running as the next is due, and shrink back after three seconds of comfortable frames. Rendering pauses when the tab is hidden and time slows to 12% under reduced motion. Without WebGL2, renderable float targets, three.js, or a shader that compiles, the page keeps the `--scene` gradient (`html.no-gl`). The canvas fades in (`html.gl`) only after the first good frame.

## Rules

- Keep three.js pinned at 0.147.0. It is the last release that ships the UMD build together with `examples/js`; moving to ES modules needs an import map and a rework of the script tags.
- Every piece of visible copy exists in English and French. Add both, or neither.
- Keep it fast on integrated GPUs: 30 fps with the GPU under about 55% of the frame budget. Check any shader change against frame time, not just looks.
- Respect `prefers-reduced-motion` and keep keyboard focus visible.
- Site copy: plain sentences, no em dashes.

## Design

- Palette: mist sky `#E6F0F3`, ink `#12313D`; night ink `#D7ECF2` on `#071824`. The water colour comes from the shaders; `--scene` only mirrors it for the fallback.
- Type: Newsreader italic for the voice; JetBrains Mono, lowercase, for the corner controls.
- The camera pitches down until the horizon sits 38% down the screen (`HORIZON`), with the statement resting just above it (CSS `bottom: calc(62vh + ...)`; keep the two in step). The eye is 1.25 m above the water (`EYE`).
- Two suns: the real one (55 degrees up, front right, `LOOK.sun`) lights the water and makes the caustics; a glint sun sits 3.5 degrees above the top edge of the frame (computed in `frame()`) and only makes the glitter path and the glow in the sky, so its disc never shows. The moon (12 degrees up, left) does both at night and is in frame.
- Mark: a lion's face in a sunburst mane (Sun in Aries, Moon in Leo). The source is `assets/lion.svg`; an inline copy lives in `index.html`.

## Preview and deploy

- Preview: `python3 -m http.server 8000`, then open http://localhost:8000.
- Deploy: any static host (for example Cloudflare Pages) with the domain's DNS at Porkbun. A `cv.pdf` placed next to `index.html` can be linked from the contact panel.
