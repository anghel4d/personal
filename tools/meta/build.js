// The link previews: what Discord, X, Slack, iMessage and the rest show when a link to the site is shared.
//   node tools/meta/build.js
// They read a page's meta tags without running it, and never see the part of an address after #, so each address
// that can be shared is a real path with its own small page: /work/, /about/, /blog/, /contact/, /menu/ and
// /blog/<post>/ (the post's title as a slug). Each holds that address's title, opening words and picture, then hands
// over to the site at /#<address>, which shows the path again. This writes, all from index.html itself (the copy in
// T.en and the posts' Markdown):
//   - the home page's tags, between the meta:begin and meta:end markers in its head;
//   - those small pages (and removes the ones for posts that are gone);
//   - the address map between the routes:begin and routes:end markers, which the page reads to keep its title and
//     tags in step as it moves between addresses (for previewers that do run the page).
// Rerun it after changing the statement, a panel's opening lines, or the posts.
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const SITE = "https://anghel4d.com", NAME = "Matei Anghel", CARD = SITE + "/assets/card.jpg";
const CARD_ALT = "Turquoise water over white sand, a path of glitter under the sun and a bank of cloud on the horizon, " +
  "with the line \u201cMatei Anghel is a goated vibe coder and you should probably hire him.\u201d";
const MARK = "written by tools/meta/build.js";
const file = path.join(ROOT, "index.html");
let html = fs.readFileSync(file, "utf8");

// the copy, as the page defines it
const t0 = html.indexOf("const T = {");
if (t0 < 0) throw new Error("index.html: no `const T = {`");
const T = new Function("return " + html.slice(t0 + "const T = ".length, html.indexOf("};\n", t0) + 1))().en;
// the posts, as the page reads them
const slug = h => h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const posts = [...html.matchAll(/<script type="text\/markdown"([^>]*)>\n([\s\S]*?)\n<\/script>/g)].map(([, attrs, src]) => {
  const at = k => (attrs.match(new RegExp(k + '="([^"]*)"')) || [])[1];
  const blocks = src.trim().split(/\n\s*\n/).map(b => b.split("\n").map(l => l.trim()).join(" "));
  const h = blocks[0].startsWith("# ") ? blocks.shift().slice(2).trim() : "";
  return { tab: at("data-tab"), date: at("data-date"), h, slug: slug(h), first: blocks.find(b => !b.startsWith("#")) || "" };
}).sort((a, b) => b.date.localeCompare(a.date));

// plain text, and its opening words: up to 200 characters, cut at a word
const plain = s => s.replace(/<[^>]+>/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/__(.+?)__/g, "$1")
  .replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/\s+/g, " ").trim();
const opening = (s, n = 200) => s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n)).replace(/[\s,;:.\-]+$/, "") + "\u2026";
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const home = plain(T.statement), open = T.tabs.find(x => x.open);
const routes = {
  home: { title: NAME, desc: home },
  menu: { title: NAME, desc: home },
  work: { title: T.work, desc: opening(`${T.items[0].h}: ${T.items[0].p}`) },
  about: { title: T.about, desc: opening(T.aboutP[0]) },
  blog: { title: T.blog, desc: `${open.t}: ${posts.filter(p => p.tab === open.id).map(p => p.h).join(" \u00b7 ")}` },
  contact: { title: T.contact, desc: T.contactLead }
};
for (const p of posts) routes["blog/" + p.slug] = { title: p.h, desc: opening(plain(p.first)), date: p.date };
for (const [r, m] of Object.entries(routes)) {
  m.url = r === "home" ? SITE + "/" : `${SITE}/${r}/`;
  m.doc = m.title === NAME ? NAME : `${m.title} \u00b7 ${NAME}`;
  m.type = m.date ? "article" : "website";
}

const tags = m => [
  `<title>${esc(m.doc)}</title>`,
  `<meta name="description" content="${esc(m.desc)}">`,
  `<link rel="canonical" href="${m.url}">`,
  `<meta property="og:site_name" content="${NAME}">`,
  `<meta property="og:type" content="${m.type}">`,
  `<meta property="og:title" content="${esc(m.title)}">`,
  `<meta property="og:description" content="${esc(m.desc)}">`,
  `<meta property="og:url" content="${m.url}">`,
  `<meta property="og:image" content="${CARD}">`,
  `<meta property="og:image:width" content="1200">`,
  `<meta property="og:image:height" content="630">`,
  `<meta property="og:image:alt" content="${esc(CARD_ALT)}">`,
  ...(m.date ? [`<meta property="article:published_time" content="${m.date}">`, `<meta property="article:author" content="${NAME}">`] : []),
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:creator" content="@pyrusdotc">`,
  `<meta name="theme-color" content="#E6F0F3">`
].join("\n");

const between = (s, a, b, body) => {
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < i) throw new Error(`index.html needs the ${a} and ${b} markers`);
  return s.slice(0, i + a.length) + "\n" + body + "\n" + s.slice(j);
};
html = between(html, "<!-- meta:begin -->", "<!-- meta:end -->", tags(routes.home));
const map = Object.fromEntries(Object.entries(routes).map(([r, m]) => [r, { doc: m.doc, title: m.title, desc: m.desc, url: m.url, type: m.type }]));
html = between(html, "<!-- routes:begin -->", "<!-- routes:end -->",
  `<script type="application/json" id="routes">${JSON.stringify(map).replace(/</g, "\\u003c")}</script>`);
fs.writeFileSync(file, html);

// the small pages
const page = (r, m) => `<!doctype html>
<!-- ${MARK}: the link preview for /${r}/, then on to the page -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${tags(m)}
<link rel="icon" href="/assets/lion.svg" type="image/svg+xml">
<script>location.replace("/" + location.search + "#${r}")</script>
</head>
<body style="margin:0;background:#E6F0F3;color:#12313D;font:18px Georgia,serif">
<p style="margin:24px"><a href="/#${r}" style="color:inherit">${esc(m.title)}</a></p>
</body>
</html>
`;
const written = [];
for (const [r, m] of Object.entries(routes)) {
  if (r === "home") continue;
  const dir = path.join(ROOT, ...r.split("/"));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(r, m));
  written.push("/" + r + "/");
}
// pages left from posts that are gone
const blogDir = path.join(ROOT, "blog");
for (const d of fs.existsSync(blogDir) ? fs.readdirSync(blogDir) : []) {
  const f = path.join(blogDir, d, "index.html");
  if (!routes["blog/" + d] && fs.existsSync(f) && fs.readFileSync(f, "utf8").includes(MARK)) {
    fs.rmSync(path.join(blogDir, d), { recursive: true });
    console.log("removed /blog/" + d + "/");
  }
}
for (const [r, m] of Object.entries(routes)) console.log(`${(r === "home" ? "/" : "/" + r + "/").padEnd(32)} ${m.title} | ${m.desc}`);
