// The link previews: what Discord, X, Slack, iMessage and the rest show when a link to the site is shared.
//   node tools/meta/build.js
// They read a page's meta tags without running it, and never see the part of an address after #, so each address
// that can be shared is a real path with its own small page: /work/, /about/, /blog/, /contact/, /menu/ and
// /blog/<post>/ (the post's title as a slug). Each holds that address's title, opening words and picture, then hands
// over to the site at /#<address>, which shows the path again. This writes, from the copy in index.html (T.en) and
// the posts in blog/posts/ (read by blog/blog.js, as the page reads them):
//   - the home page's tags, between the meta:begin and meta:end markers in its head;
//   - those small pages (and removes the ones for posts that are gone);
//   - the address map between the routes:begin and routes:end markers, which the page reads to keep its title and
//     tags in step as it moves between addresses (for previewers that do run the page), and to find the posts' files.
//   - the statement and the panels' English copy, between their markers in index.html (statement:begin, work:begin
//     and so on), so search engines and assistants that do not run script read the whole site; the page draws them
//     again in the visitor's language;
//   - the same copy in the body of each small page, for whoever reads that address without running it;
//   - the home page's structured data (a ProfilePage: the person and the company), and robots.txt, sitemap.xml and
//     llms.txt (the site as plain Markdown, for assistants).
// Rerun it after adding, changing or removing a post (wrangler.jsonc runs it before each deploy). It also writes
// the raw page (tools/raw/build.js).
// The picture, assets/card.jpg, is the scene by night with no text, a golden rectangle. Its address carries a hash
// of the file, so previewers that keep pictures fetch a new one.
// Rerun it after changing the statement or a panel's opening lines.
const fs = require("fs"), path = require("path");
const site = require("../site.js")(), { ROOT, B, BLOG_OPEN } = site, T = site.T.en;
const SITE = "https://anghel4d.com", NAME = "Matei Anghel", FULL = "Matei Alexandru Anghel";
const { VIEWS } = site;
// who the site is about, for search engines: the home page's title and description, and its structured data
const COMPANY = "Broadside Technology", COMPANY_URL = "https://broadside.tech";
const HOME_DOC = `${FULL} · Founder of ${COMPANY}`;
const HOME_DESC = `${FULL}: software engineer and AI researcher, founder and CEO of ${COMPANY}, which builds agentic AI systems and the simulated worlds to train them in.`;
const SAME_AS = ["https://github.com/anghel4d", "https://x.com/pyrusdotc"];
const EMAIL = (VIEWS.contact(T).match(/mailto:([^"]+)/) || [])[1];
if (!EMAIL) throw new Error("the contact view has no mailto: link");
const card = fs.readFileSync(path.join(ROOT, "assets", "card.jpg"));
const CARD = `${SITE}/assets/card.jpg?v=${require("crypto").createHash("sha1").update(card).digest("hex").slice(0, 8)}`;
// its size, from the JPEG's frame header
const CARD_WH = (b => {
  for (let i = 2; i + 9 < b.length; i += 2 + b.readUInt16BE(i + 2))
    if (b[i + 1] >= 0xc0 && b[i + 1] <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(b[i + 1])) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
  throw new Error("assets/card.jpg: no frame header");
})(card);
const CARD_ALT = "The full moon over the sea at night, its light a path of glitter on the water, and a bank of cloud on the horizon.";
const MARK = "written by tools/meta/build.js";
const file = path.join(ROOT, "index.html");
let html = site.html;
const posts = site.posts.map(p => ({ ...p, first: p.blocks.find(b => !b.startsWith("#")) || "" }));

// plain text (struck-through words keep their stroke, as combining marks), and its opening words: up to 200 characters, cut at a word
const plain = s => s.replace(/<[^>]+>/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/~~(.+?)~~/g, (_, x) => [...x].map(c => c + "\u0336").join("")).replace(/__(.+?)__/g, "$1")
  .replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/\s+/g, " ").trim();
const opening = (s, n = 200) => s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n)).replace(/[\s,;:.\-]+$/, "") + "\u2026";
const esc = B.esc;

// the statement's words (its dinkus, "* * *", is ornament)
const home = plain(T.statement.replace(/<span class="dinkus"[^>]*>[^<]*<\/span>/, "")), open = T.tabs.find(x => x.open);
const routes = {
  home: { title: NAME, desc: home },
  menu: { title: NAME, desc: home },
  work: { title: T.work, desc: opening(`${T.items[0].h}: ${T.items[0].p}`) },
  about: { title: T.about, desc: opening(T.aboutP[0]) },
  blog: { title: T.blog, desc: `${open.t}: ${posts.filter(p => p.tab === open.id).map(p => p.h).join(" \u00b7 ")}` },
  contact: { title: T.contact, desc: T.contactLead }
};
// the blog set aside: its tabs coming soon, its posts out of the address map, and their pages (blog/) left as they are
if (!BLOG_OPEN) routes.blog.desc = `${T.tabs.map(x => x.t).join(", ").replace(/, ([^,]*)$/, " and $1")}: coming soon.`;
if (BLOG_OPEN) for (const p of posts) routes["blog/" + p.slug] = { title: p.h, desc: opening(plain(p.first)), date: p.date, src: p.src };
for (const [r, m] of Object.entries(routes)) {
  m.url = r === "home" ? SITE + "/" : `${SITE}/${r}/`;
  m.doc = m.title === NAME ? NAME : `${m.title} \u00b7 ${NAME}`;
  m.type = m.date ? "article" : "website";
}
for (const r of ["home", "menu"]) Object.assign(routes[r], { doc: HOME_DOC, desc: HOME_DESC });

// the structured data: the home page is the profile of a person, who founded the company
const person = {
  "@type": "Person", "@id": `${SITE}/#person`, name: NAME, alternateName: [FULL, "anghel4d", "pyrusdotc"],
  givenName: "Matei", additionalName: "Alexandru", familyName: "Anghel", url: SITE + "/", email: "mailto:" + EMAIL,
  jobTitle: `Founder and CEO, ${COMPANY}`, worksFor: { "@id": `${SITE}/#company` }, description: plain(T.aboutP[0]),
  knowsAbout: ["Agentic AI systems", "Context engineering", "Multi-agent systems", "Model post-training", "Reinforcement learning environments",
    "World simulation", "High-performance systems", "Compilers", "Data pipelines"],
  alumniOf: [{ "@type": "CollegeOrUniversity", name: "John Abbott College" }, { "@type": "CollegeOrUniversity", name: "Concordia University" }],
  nationality: { "@type": "Country", name: "Canada" }, knowsLanguage: ["en", "fr"], sameAs: SAME_AS
};
const company = {
  "@type": "Organization", "@id": `${SITE}/#company`, name: COMPANY, url: COMPANY_URL, founder: { "@id": `${SITE}/#person` },
  foundingDate: "2026-02", description: plain(T.items[0].p)
};
const LD = { "@context": "https://schema.org", "@graph": [
  { "@type": "ProfilePage", "@id": `${SITE}/#page`, url: SITE + "/", name: HOME_DOC, description: HOME_DESC, inLanguage: ["en", "fr"],
    mainEntity: { "@id": `${SITE}/#person` } },
  person, company,
  { "@type": "WebSite", "@id": `${SITE}/#site`, url: SITE + "/", name: NAME, publisher: { "@id": `${SITE}/#person` } }
] };

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
  `<meta property="og:image:width" content="${CARD_WH[0]}">`,
  `<meta property="og:image:height" content="${CARD_WH[1]}">`,
  `<meta property="og:image:alt" content="${esc(CARD_ALT)}">`,
  ...(m.date ? [`<meta property="article:published_time" content="${m.date}">`, `<meta property="article:author" content="${NAME}">`] : []),
  `<meta name="twitter:card" content="summary_large_image">`,
  `<meta name="twitter:creator" content="@pyrusdotc">`,
  `<meta name="theme-color" content="#071824">`,
  `<meta name="author" content="${NAME}">`,
  ...(m === routes.home ? [...SAME_AS.map(u => `<link rel="me" href="${u}">`),
    `<script type="application/ld+json">${JSON.stringify(LD).replace(/</g, "\\u003c")}</script>`] : [])
].join("\n");

const between = (s, a, b, body) => {
  const i = s.indexOf(a), j = s.indexOf(b);
  if (i < 0 || j < i) throw new Error(`index.html needs the ${a} and ${b} markers`);
  return s.slice(0, i + a.length) + "\n" + body + "\n" + s.slice(j);
};
html = between(html, "<!-- meta:begin -->", "<!-- meta:end -->", tags(routes.home));
// the copy itself, in English, for readers that do not run script
const blogView = () => VIEWS.blog(T, "en", "", BLOG_OPEN && posts, new Set(), B.inline);
const view = r => r === "blog" ? blogView() : VIEWS[r](T);
html = between(html, "<!-- statement:begin -->", "<!-- statement:end -->", T.statement);
for (const r of ["work", "about", "blog", "contact"]) html = between(html, `<!-- ${r}:begin -->`, `<!-- ${r}:end -->`, view(r));
const map = Object.fromEntries(Object.entries(routes).map(([r, m]) => [r, { doc: m.doc, title: m.title, desc: m.desc, url: m.url, type: m.type, src: m.src }]));
html = between(html, "<!-- routes:begin -->", "<!-- routes:end -->",
  `<script type="application/json" id="routes">${JSON.stringify(map).replace(/</g, "\\u003c")}</script>`);
fs.writeFileSync(file, html);

// the small pages, each with its copy in the body
const MENU = ["work", "about", "blog", "contact"];
const body = r => MENU.includes(r) ? view(r)
  : r === "menu" ? `<nav><ul>${MENU.map(x => `<li><a href="/${x}/">${esc(T[x])}</a></li>`).join("")}</ul></nav>`
  : (p => p ? `<article><h1>${B.inline(p.h)}</h1><p><time datetime="${p.date}">${p.date}</time></p>${p.html}</article>` : "")(posts.find(p => "blog/" + p.slug === r));
const page = (r, m) => `<!doctype html>
<!-- ${MARK}: the link preview for /${r}/, then on to the page -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${tags(m)}
<link rel="icon" href="/assets/lion.svg" type="image/svg+xml">
<noscript><meta http-equiv="refresh" content="0; url=/raw/#${r}"></noscript>
<script>location.replace("/" + location.search + "#${r}")</script>
</head>
<body style="margin:0;background:#E6F0F3;color:#12313D;font:18px/1.5 Georgia,serif">
<main style="max-width:40em;margin:24px auto;padding:0 16px">
<p><a href="/" style="color:inherit">${NAME}</a> · <a href="/#${r}" style="color:inherit">${esc(m.title)}</a></p>
${body(r)}
</main>
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
for (const d of BLOG_OPEN && fs.existsSync(blogDir) ? fs.readdirSync(blogDir) : []) {
  const f = path.join(blogDir, d, "index.html");
  if (!routes["blog/" + d] && fs.existsSync(f) && fs.readFileSync(f, "utf8").includes(MARK)) {
    fs.rmSync(path.join(blogDir, d), { recursive: true });
    console.log("removed /blog/" + d + "/");
  }
}
for (const [r, m] of Object.entries(routes)) console.log(`${(r === "home" ? "/" : "/" + r + "/").padEnd(32)} ${m.title} | ${m.desc}`);
// for crawlers and assistants: everyone welcome; the site is one page, whose addresses all come back to it
fs.writeFileSync(path.join(ROOT, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE}/</loc></url>
</urlset>
`);
// llms.txt: the site's English copy as Markdown
const links = s => s.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, "[$2]($1)").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
fs.writeFileSync(path.join(ROOT, "llms.txt"), [
  `# ${NAME}`, "", `> ${HOME_DESC}`, "",
  `${FULL} (${NAME}) is the founder and CEO of ${COMPANY} (${COMPANY_URL}). Site: ${SITE}/`, "",
  `## ${T.aboutH}`, "", ...T.aboutP.flatMap(p => [p, ""]), T.stance, "", T.noted, "",
  `## ${T.workH}`, "",
  ...T.items.flatMap(it => [`### ${plain(it.h)}`, "", `${it.when}.`, "", it.p, "", ...(it.tryit ? [it.tryit, ""] : []),
    ...(it.links.length ? [it.links.map(l => `[${l[0]}](${l[1]})`).join(" · "), ""] : [])]),
  T.earlier, "",
  `## ${T.contactH}`, "", T.contactLead, "", `Email: ${EMAIL}`, "", links(T.contactRest), ""
].join("\n"));
// and the raw page, from the same copy and posts
require("../raw/build.js");
