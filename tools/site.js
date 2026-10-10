// What the build tools (tools/meta, tools/raw) read from the site, read the way the page reads it: index.html, its
// copy (T), its views (the block between views:begin and views:end), blog/blog.js, and the posts in blog/posts/,
// checked (each one's element a tab, a date, a title of its own). Read afresh on each call.
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
module.exports = () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error(`index.html: no ${a} ... ${b}`); return html.slice(i, j + b.length); };
  const T = new Function("return " + cut("const T = {", "};\n").slice("const T = ".length, -2))();
  const B = (w => (new Function("window", fs.readFileSync(path.join(ROOT, "blog", "blog.js"), "utf8"))(w), w.A4D_BLOG))({});
  const VIEWS = new Function("esc", cut("/* views:begin", "/* views:end */") + "\nreturn VIEWS;")(B.esc);
  const dir = path.join(ROOT, "blog", "posts");
  const posts = B.newestFirst(fs.readdirSync(dir).filter(f => f.endsWith(".html")).sort()
    .flatMap(f => B.parse(fs.readFileSync(path.join(dir, f), "utf8"), "blog/posts/" + f)));
  const tabs = T.en.tabs.map(x => x.id), seen = new Set();
  for (const p of posts){
    if (!tabs.includes(p.tab)) throw new Error(`${p.src}: <${p.tab}> is not a tab (${tabs.join(", ")})`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error(`${p.src}: date="YYYY-MM-DD" is missing`);
    if (seen.has(p.slug)) throw new Error(`${p.src}: another post has the title "${p.h}"`);
    seen.add(p.slug);
  }
  return { ROOT, html, cut, T, B, VIEWS, posts };
};
