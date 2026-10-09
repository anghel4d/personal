// @ts-check
/* The keyboard, as one command. Vim's hjkl and the arrow keys are two faces of the same four steps; Shift turns j
   and k into edge steps. Each key press becomes a single "a4d:nav" event, { dir, edge }, which the page acts on, so
   both sets of keys do exactly the same thing. The page loads this once the first view is up.
   Checked with TypeScript, no build: tsc --noEmit --strict --allowJs --checkJs --target es2022 --lib es2022,dom nav.js */

/** @typedef {"h" | "j" | "k" | "l"} Dir  left, down, up, right */
/** @typedef {{ dir: Dir, edge: boolean }} Nav  edge: Shift+j or Shift+k, to the top or the bottom, then on */
/** @typedef {"scroll" | "lean" | "jump" | "break"} Act */

/** @type {Readonly<Record<string, Dir>>} */
const KEYS = { h: "h", j: "j", k: "k", l: "l", ArrowLeft: "h", ArrowDown: "j", ArrowUp: "k", ArrowRight: "l" };

/** A key press as a step, or null. @param {Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey">} e
    @returns {Nav | null} */
const navOf = e => {
  const dir = e.altKey || e.ctrlKey || e.metaKey ? undefined : KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  return dir ? { dir, edge: e.shiftKey && (dir === "j" || dir === "k") } : null;
};

/** What a step down or up does to a layer: inside it, scroll a little or (an edge step) jump to its edge; at its
    edge, lean on the gauge toward the one beside it or (an edge step) go straight there.
    @param {boolean} atEdge @param {boolean} edge @returns {Act} */
const actOf = (atEdge, edge) => atEdge ? (edge ? "break" : "lean") : (edge ? "jump" : "scroll");

/** The next item along, from index i (-1: none yet) among n, without wrapping.
    @param {number} i @param {number} n @param {-1 | 1} d @returns {number} */
const stepOf = (i, n, d) => i < 0 ? (d > 0 ? 0 : n - 1) : Math.min(n - 1, Math.max(0, i + d));

addEventListener("keydown", e => {
  const t = /** @type {Element | null} */ (e.target), nav = t?.closest?.("input, textarea, select, [contenteditable]") ? null : navOf(e);
  if (nav && document.dispatchEvent(new CustomEvent("a4d:nav", { detail: nav, cancelable: true })) === false) e.preventDefault();
});

Object.assign(window, { A4D_NAV: { navOf, actOf, stepOf } });
