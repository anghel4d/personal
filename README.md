# anghel4d.com

The personal site of Matei Anghel: a single static page over a live lagoon, with physically based caustics and a day and night mode. It is drawn with WebGPU, compute shaders included, and with three.js on WebGL2 where WebGPU is missing.

The water follows [CAUSTIC//VOLUME](https://github.com/ScottieFox/caustic-volume) by Scottie, with parts of [Clearwater](https://github.com/Aureliengmz/clearwater) by Aurélien at Lumaris. Tone mapping is the GT7 operator from Polyphony Digital's [SIGGRAPH 2025 course talk](https://blog.selfshadow.com/publications/s2025-shading-course/), ported from their sample implementation. All three are under the MIT license (`licenses/`). Far from the camera the waves are tiled after Morten Mikkelsen's [Practical Real-Time Hex-Tiling](https://jcgt.org/published/0011/03/05/) (JCGT, 2022), blended to keep their variance as in Heitz and Neyret's histogram-preserving blending (HPG 2018).

Open `index.html` through any static server (`python3 -m http.server`) to preview it. See `CLAUDE.md` for how it is built.
