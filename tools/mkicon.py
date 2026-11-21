"""Makes the browser-tab icon + the iPhone/Safari home-screen icon as REAL FILES (src/icons/*) and src/icons.html (the <link> tags that point at them).
Why files: macOS Safari ignores data: URI icons (WebKit bug 236616), so the icons must be published next to the pages (make_site.py copies src/icons/ to the site root).
The links carry ?v=<hash of the files>, so a changed logo is fetched again (Safari/Chrome cache icons hard).
usage: python3 tools/mkicon.py [logo.png]   (default: desktop/assets/icon-512.png, the program's logo)"""
import hashlib, pathlib, sys
from PIL import Image
R = pathlib.Path(__file__).resolve().parent.parent
D = R / 'src/icons'; D.mkdir(exist_ok=True)
src = Image.open(sys.argv[1] if len(sys.argv) > 1 else R / 'desktop/assets/icon-512.png').convert('RGBA')
# browser tab icon: the rounded logo itself on a transparent ground (PNG 32/64 + a multi-size .ico for old Safari/IE habits)
tab64 = src.resize((64, 64), Image.LANCZOS); tab32 = src.resize((32, 32), Image.LANCZOS)
tab64.save(D / 'icon-64.png', 'PNG', optimize=True); tab32.save(D / 'icon-32.png', 'PNG', optimize=True)
src.resize((48, 48), Image.LANCZOS).save(D / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# iOS home-screen icon must be a full opaque square (iOS rounds it itself): put the logo over a gradient taken from its own colours
w = src.size[0]; a = src.getpixel((int(w * .2), int(w * .2)))[:3]; z = src.getpixel((int(w * .8), int(w * .8)))[:3]
bg = Image.new('RGB', (w, w)); px = bg.load()
for y in range(w):
    for x in range(w):
        t = (x + y) / (2 * w - 2); px[x, y] = tuple(round(a[k] + (z[k] - a[k]) * t) for k in range(3))
logo = src.crop(src.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()).resize((w, w), Image.LANCZOS)  # fill the square: iOS' own rounding then hugs the logo's edge
bg.paste(logo, (0, 0), logo)
touch = bg.resize((180, 180), Image.LANCZOS)
touch.save(D / 'apple-touch-icon.png', 'PNG', optimize=True)
# install icons (the manifest of the hosted site and the notification icon of tools/sw.js): the same opaque square as the iPhone icon, at 192 and 512
bg.resize((192, 192), Image.LANCZOS).save(D / 'icon-192.png', 'PNG', optimize=True); bg.resize((512, 512), Image.LANCZOS).save(D / 'icon-512.png', 'PNG', optimize=True)
v = hashlib.sha1(b''.join((D / n).read_bytes() for n in ('icon-32.png', 'icon-64.png', 'favicon.ico', 'apple-touch-icon.png'))).hexdigest()[:8]
out = (f'<link rel="icon" type="image/png" sizes="32x32" href="icon-32.png?v={v}">'
       f'<link rel="icon" type="image/png" sizes="64x64" href="icon-64.png?v={v}">'
       f'<link rel="shortcut icon" href="favicon.ico?v={v}">'
       f'<link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png?v={v}">')
(R / 'src/icons.html').write_text(out, encoding='utf-8'); print('icons.html', len(out), 'bytes; v =', v)
