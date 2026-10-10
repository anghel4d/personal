// The raw page: the whole site in HTML and CSS alone, at raw/ (raw/index.html).
//   node tools/raw/build.js
// No JavaScript and no rendering: the same tree as index.html (the corner controls, the statement, the layers and
// their panels, drawn by the page's own VIEWS), with the sea replaced by a still picture made of CSS. What the page
// does with script, CSS does here:
//   - the address: a layer is the target of the address (#work, #blog/<post>), so :target shows it, as the page's
//     own router shows #work; with nothing targeted, the ocean;
//   - the language: every piece of copy is there in both, and two radio buttons pick which shows (:has);
//   - the theme: the system's light or dark setting, and a checkbox that turns it the other way (:has);
//   - the posts: <details>, which a browser opens by itself when the address points inside one;
//   - the poise: a "next · about" and "previous · work" link at each end of a layer.
// The page sends a browser without JavaScript here (<noscript>), and ?raw (or &raw) on any address does the same.
// tools/meta/build.js runs this too. Rerun it after changing the copy, the views, the styles or the posts.
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const cut = (a, b, from = 0) => { const i = html.indexOf(a, from), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`index.html: no ${a} ... ${b}`); return html.slice(i, j + b.length); };

// the copy, the views and the posts, as the page has them
const T = new Function("return " + cut("const T = {", "};\n").slice("const T = ".length, -2))();
const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const VIEWS = new Function("esc", cut("/* views:begin", "/* views:end */") + "\nreturn VIEWS;")(esc);
const B = (w => (new Function("window", fs.readFileSync(path.join(ROOT, "blog", "blog.js"), "utf8"))(w), w.A4D_BLOG))({});
const postDir = path.join(ROOT, "blog", "posts");
const posts = B.newestFirst(fs.readdirSync(postDir).filter(f => f.endsWith(".html")).sort()
  .flatMap(f => B.parse(fs.readFileSync(path.join(postDir, f), "utf8"), "blog/posts/" + f)));

// both languages: English as the page has it, French beside it with its ids marked, so no id is there twice
const both = (en, fr, tag = "span") => en === fr ? en : `<${tag} class="l-en">${en}</${tag}><${tag} class="l-fr" lang="fr">${fr}</${tag}>`;
const frIds = s => s.replace(/\b(id|aria-labelledby|aria-controls)="([^"]+)"/g, '$1="$2-fr"');
const ORDER = ["home", "menu", "work", "about", "blog", "contact"];
const pz = (r, l) => {                                     // a layer's two ends: the one before it, the one after
  const i = ORDER.indexOf(r), t = T[l], a = ORDER[i - 1], b = ORDER[i + 1];
  return `<p class="pz">${a ? `<a href="#${a === "home" ? "" : a}">${t.prev} · ${t[a]}</a>` : "<span></span>"}${b ? `<a href="#${b}">${t.next} · ${t[b]}</a>` : ""}</p>`;
};
const inner = (r, view) => ["en", "fr"].map(l => {
  const s = `<div class="inner l-${l}"${l === "fr" ? ' lang="fr"' : ""}>${view(T[l], l)}${pz(r, l)}</div>`;
  return l === "fr" ? frIds(s) : s;
}).join("");
// a post's address points inside it (an empty anchor at the start of its text), so the browser unfolds it
const postsWithAnchor = l => posts.map(p => l === "fr" ? p : { ...p, html: `<span class="anchor" id="blog/${p.slug}"></span>` + p.html });
const blogView = (t, l) => VIEWS.blog(t, l, "", postsWithAnchor(l), new Set(), B.inline);

// the head: the page's own styles (the fonts inside them), with the files one level up, and the raw page's own
const styles = [...html.slice(0, html.indexOf("</head>")).matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]).join("\n")
  .replace(/url\(assets\//g, "url(../assets/")
  // the page's states, given to the address instead: a layer shows when it, or something in it, is the target
  .replace(".layer.on{", ".layer.on,.layer:target,.layer:has(:target){")
  .replace(".panel.on{", ".panel.on,.panel:target,.panel:has(:target){")
  .replace(".layer.shown > .inner{", ".layer.shown > .inner,.layer:target > .inner,.layer:has(:target) > .inner{")
  .replace(".open .veil{", ".open .veil,body:has(.layer:target,.layer :target) .veil{")
  .replace(".open .statement{", ".open .statement,body:has(.layer:target,.layer :target) .statement{");
for (const k of [".layer.on,.layer:target", ".panel.on,.panel:target", ".layer.shown > .inner,", ".open .veil,", ".open .statement,"])
  if (!styles.includes(k)) throw new Error("index.html's styles changed: " + k);
const tokens = sel => { const m = styles.match(new RegExp(sel.replace(/[[\]().:"=]/g, "\\$&") + "\\{([^}]*)\\}")); if (!m) throw new Error("no tokens for " + sel);
  return m[1].split(";").map(d => d.trim()).filter(d => /^--(sky|haze|ink|ink-soft|rule|veil|focus|scene):/.test(d)).join(";") + ";"; };
const DAY = tokens(":root") + '--n:0;--mode-en:"day";--mode-fr:"jour";';
const NIGHT = tokens(':root[data-theme="dark"]') + '--n:1;--mode-en:"night";--mode-fr:"nuit";';
const RAW_CSS = fs.readFileSync(path.join(__dirname, "raw.css"), "utf8")
  .replace("/* DAY */", DAY).replace("/* NIGHT */", NIGHT).replace("/* DAY */", DAY).replace("/* NIGHT */", NIGHT);

const icon = (html.match(/<link rel="icon"[^>]*>/) || [""])[0];
const mark = cut('<a class="chrome tl"', "</a>").replace('href="#"', 'href="#"');
const menuLinks = ["work", "about", "blog", "contact"].map(r => `<a href="#${r}">${both(T.en[r], T.fr[r])}</a>`).join("\n    ");
const ext = cut('<div class="ext">', "</div>");

const page = `<!doctype html>
<!-- written by tools/raw/build.js from index.html: the site in HTML and CSS alone -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Matei Anghel</title>
<meta name="description" content="${esc(T.en.statement.replace(/<[^>]+>/g, ""))}">
<link rel="canonical" href="https://anghel4d.com/">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
${icon}
${styles}
<style>
${RAW_CSS}
</style>
</head>
<body class="ready">
<div class="art" aria-hidden="true"><i class="haze"></i><i class="stars"></i><i class="wisps"></i><i class="sun"></i><i class="moon"></i><i class="bank"></i><i class="sunpath"></i><i class="moonpath"></i></div>

${mark}

<div class="chrome tr"><a class="go-menu" href="#menu">${both(T.en.menu, T.fr.menu)}</a><a class="go-home" href="#">${both(T.en.close, T.fr.close)}</a></div>
<div class="chrome bl">
  <div class="lang" role="group" aria-label="Language">
    <input class="vh" type="radio" name="lang" id="lang-en" checked><label for="lang-en">en</label><span class="sep" aria-hidden="true">/</span><input class="vh" type="radio" name="lang" id="lang-fr"><label for="lang-fr">fr</label>
  </div>
</div>
<div class="chrome br"><input class="vh" type="checkbox" id="flip"><label for="flip" id="themeBtn"><span class="l-en mode"></span><span class="l-fr mode" lang="fr"></span></label></div>

<p class="statement" id="statement">${both(T.en.statement, T.fr.statement)}</p>
<a class="chrome pz-home" href="#menu">${both(`${T.en.next} · ${T.en.menu}`, `${T.fr.next} · ${T.fr.menu}`)}</a>

<div class="veil" id="veil"></div>

<nav class="layer menu" id="menu" aria-label="Site">
  <div class="inner">
    ${menuLinks}
    ${ext}
    ${both(pz("menu", "en"), pz("menu", "fr"), "div")}
  </div>
</nav>

<section class="layer panel" id="work" aria-labelledby="workH">${inner("work", t => VIEWS.work(t))}</section>
<section class="layer panel" id="about" aria-labelledby="aboutH">${inner("about", t => VIEWS.about(t))}</section>
<section class="layer panel" id="blog" aria-labelledby="blogH">${inner("blog", blogView)}</section>
<section class="layer panel" id="contact" aria-labelledby="contactH">${inner("contact", t => VIEWS.contact(t))}</section>
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, "raw"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "raw", "index.html"), page);
if (/<script/i.test(page.replace(/<script type="application\/json"[\s\S]*?<\/script>/g, ""))) throw new Error("raw/index.html holds a script");
console.log(`raw/index.html  ${(page.length / 1024).toFixed(0)} KB, ${posts.length} posts, no script`);
