# Rebuilds the site's fonts from Google Fonts' latin files: python3 tools/fonts/build.py   (needs: pip install fonttools brotli)
#
# First view (inlined in index.html between the fonts:begin and fonts:end markers, so they arrive with the page and the
# text never shows in a fallback face):
#   "Newsreader Statement"  Newsreader italic, fixed at weight 400 and optical size 40: the statement
#   "JetBrains Mono"        weight 400, without its code ligatures: the corner controls and every mono line
# Later (files in assets/fonts, fetched once the first view is up):
#   "Newsreader" italic     weights 300 to 400, every optical size: the menu and the panels
#   "Newsreader" roman      every optical size: the panels
# All four hold Basic Latin and French (CHARS); a glyph outside it falls back to the next font in the stack.
import base64, os, re, subprocess, tempfile, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CSS = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,300..400&family=JetBrains+Mono:wght@400&display=swap'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'
CHARS = 'àâäæçéèêëîïôöœùûüÿÀÂÄÆÇÉÈÊËÎÏÔÖŒÙÛÜŸ«»’‘“”…–   ·°×'
UNICODES = 'U+0020-007E,' + ','.join('U+%04X' % ord(c) for c in CHARS)

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})).read()

def sources(tmp):
    css = get(CSS).decode()
    out = {}
    for sub, block in re.findall(r'/\* (\S+) \*/\s*@font-face \{(.*?)\}', css, re.S):
        if sub != 'latin': continue
        fam = re.search(r"font-family: '([^']+)'", block).group(1); style = re.search(r'font-style: (\w+)', block).group(1)
        path = os.path.join(tmp, f'{fam}-{style}.woff2'.replace(' ', ''))
        if path not in out.values(): open(path, 'wb').write(get(re.search(r'url\((\S+?)\)', block).group(1)))
        out[(fam, style)] = path
    return out

def make(src, axes, features, tmp):
    f = TTFont(src)
    if axes and 'fvar' in f:
        f = instancer.instantiateVariableFont(f, {k: v for k, v in axes.items() if k in {x.axisTag for x in f['fvar'].axes}}, updateFontNames=False)
    ttf, woff = os.path.join(tmp, 'x.ttf'), os.path.join(tmp, 'x.woff2')
    f.save(ttf)
    subprocess.run(['pyftsubset', ttf, f'--unicodes={UNICODES}', '--flavor=woff2', f'--output-file={woff}', f'--layout-features={features}',
                    '--no-hinting', '--desubroutinize', '--name-IDs=1,2,4,6'], check=True)
    return open(woff, 'rb').read()

with tempfile.TemporaryDirectory() as tmp:
    src = sources(tmp)
    text = 'kern,liga,calt,locl,mark,mkmk,ccmp'
    statement = make(src[('Newsreader', 'italic')], {'wght': 400, 'opsz': 40}, text, tmp)
    mono = make(src[('JetBrains Mono', 'normal')], {'wght': 400}, 'kern,locl,mark,mkmk,ccmp', tmp)
    italic = make(src[('Newsreader', 'italic')], {'wght': (300, 400)}, text, tmp)
    roman = make(src[('Newsreader', 'normal')], None, text, tmp)

os.makedirs(os.path.join(ROOT, 'assets', 'fonts'), exist_ok=True)
for name, data in (('newsreader-italic.woff2', italic), ('newsreader-roman.woff2', roman)):
    open(os.path.join(ROOT, 'assets', 'fonts', name), 'wb').write(data)
face = lambda fam, style, data: (f'@font-face{{font-family:"{fam}";font-style:{style};font-weight:400;font-display:block;'
                                 f'src:url(data:font/woff2;base64,{base64.b64encode(data).decode()}) format("woff2")}}')
block = '\n'.join([face('Newsreader Statement', 'italic', statement), face('JetBrains Mono', 'normal', mono)])
p = os.path.join(ROOT, 'index.html'); html = open(p, encoding='utf-8').read()
a, b = '/* fonts:begin */\n', '\n/* fonts:end */'
assert html.count(a) == 1 and html.count(b) == 1, 'index.html needs the fonts:begin and fonts:end markers'
html = html[:html.index(a) + len(a)] + block + html[html.index(b):]
open(p, 'w', encoding='utf-8').write(html)
for name, data in (('inline: statement', statement), ('inline: mono', mono), ('newsreader-italic.woff2', italic), ('newsreader-roman.woff2', roman)):
    print(f'{name:26s} {len(data):7d} bytes')
