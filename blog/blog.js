/* The blog's master handler: reads the posts and turns their Markdown into HTML, for the page (index.html loads it
   once the first view is up) and for tools/meta/build.js (the link previews), so the two read posts alike.

   A post is a file in blog/posts/, holding one element whose name is its tab and whose date attribute sets its date
   and its place (newest first):

     <koan date="2026-10-07">
     # The title
     Paragraphs between blank lines; a single line break is a space.
     </koan>

   Matei's Markdown: a "# " title, "## " and "### " headings, *italic* (or **italic**), __underline__,
   ~~struck through~~ and [links](https://...); anything else stays as written. Japanese runs are tagged, so they take
   a Japanese face. The post's address, blog/the-title, comes from its title. */
(function (root) {
  const esc = s => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inline = s => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="inline" href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/~~(.+?)~~/g, "<s>$1</s>").replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\*\*(.+?)\*\*/g, "<em>$1</em>").replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/[぀-ヿ一-鿿]+/g, m => `<span lang="ja">${m}</span>`);
  const slug = h => h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // every post in a file's text: { tab, date, h (the title), slug, blocks (the Markdown paragraphs), html }
  const parse = (text, src) => [...text.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>([\s\S]*?)<\/\1\s*>/g)].map(([, tab, attrs, md]) => {
    const blocks = md.trim().split(/\n\s*\n/).map(b => b.split("\n").map(l => l.trim()).join(" "));
    const h = blocks[0] && blocks[0].startsWith("# ") ? blocks.shift().slice(2).trim() : "";
    return { tab, date: (attrs.match(/\bdate="([^"]*)"/) || [, ""])[1], h, slug: slug(h), src, blocks,
      html: blocks.map(b => { const m = b.match(/^(#{2,3}) (.*)/); return m ? `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>` : `<p>${inline(b)}</p>`; }).join("") };
  }).filter(p => p.h);
  const newestFirst = list => list.sort((a, b) => b.date.localeCompare(a.date));
  // the posts in these files (paths relative to base); a file that is gone is skipped
  const load = (files, base) => Promise.all(files.map(f => fetch(new URL(f, base)).then(r => r.ok ? r.text() : "").catch(() => "").then(t => parse(t, f))))
    .then(lists => newestFirst(lists.flat()));
  root.A4D_BLOG = { esc, inline, slug, parse, load, newestFirst };
})(typeof window !== "undefined" ? window : globalThis);
