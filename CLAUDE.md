# anghel4d.com

Personal site for Matei Anghel, served at anghel4d.com. One static `index.html`, no build step, no package manager.

## Layout of index.html

1. `<head>`: Google Fonts (Newsreader, JetBrains Mono), an inline SVG favicon (the lion), then three.js r147 and its post-processing helpers from jsdelivr.
2. `<style>`: colour tokens on `:root`, light and dark sets (dark via `prefers-color-scheme` and `[data-theme="dark"]`).
3. Markup: corner controls (lion mark, menu, name, en/fr, theme), the two-line statement, and three panels (`#work`, `#about`, `#contact`) opened over a blurred veil.
4. UI script: `T.en` / `T.fr` copy, hash routing (`#work` etc.), the theme cycle (day, night, auto; default day), and `window.A4D_STATE`, which the scene reads (`night`, `targetNight`, `pointer`, `open`, `reduce`).
5. Scene script (three.js):
   - **Caustics pass**: a 200x200 light mesh, instanced 3x3 for seamless tiling, is refracted through periodic waves (`detailWaves`, tile 2.5 m) onto a plane 1.6 m down. Intensity is the ratio of each triangle's area before and after refraction, measured with `dFdx`/`dFdy` and accumulated with additive blending. One pass per colour channel with IOR 1.322 / 1.333 / 1.346 gives dispersion. Output goes to a half-float, mipmapped, repeating render target.
   - **Water**: a grid whose rows grow exponentially with distance (about pixel-sized triangles), displaced by Gerstner swells. The fragment shader combines non-periodic ripples (`rippleGrad`), Fresnel reflection of the analytic sky, refraction to a sloping sand floor (`floorDepth`), Beer-Lambert absorption (`SIGMA`, red first), in-scattering, caustics sampled twice at different rotations to hide tiling, light shafts sampled through the water column (7 steps), and distance haze.
   - **Sky**: analytic gradient, haze band, sun or moon disc and halo, stars at night.
   - **Post**: `UnrealBloomPass`, then a final pass for ACES tone mapping, gamma, vignette and grain. Shaders output linear HDR; tone mapping happens only in the final pass.
   - **Runtime**: resolution adapts to frame time, frame rate halves while a panel is open, rendering pauses when the tab is hidden, and time slows to 12% under reduced motion.

## Rules

- Keep three.js pinned at 0.147.0. It is the last release that ships the UMD build together with `examples/js`; moving to ES modules needs an import map and a rework of the script tags.
- Every piece of visible copy exists in English and French. Add both, or neither.
- Keep it fast on integrated GPUs. Check any shader change against frame time, not just looks.
- Respect `prefers-reduced-motion` and keep keyboard focus visible.
- Site copy: plain sentences, no em dashes.

## Design

- Palette: mist sky `#E6F0F3`, ink `#12313D`; night ink `#D7ECF2` on `#071824`. The water colour comes from the shaders, not from CSS.
- Type: Newsreader italic for the voice; JetBrains Mono, lowercase, for the corner controls.
- The horizon sits 58% down the screen (`camera.setViewOffset`), with the statement resting just above it.
- Mark: a lion's face in a sunburst mane (Sun in Aries, Moon in Leo). The source is `assets/lion.svg`; an inline copy lives in `index.html`.

## Preview and deploy

- Preview: `python3 -m http.server 8000`, then open http://localhost:8000.
- Deploy: any static host (for example Cloudflare Pages) with the domain's DNS at Porkbun. A `cv.pdf` placed next to `index.html` can be linked from the contact panel.
