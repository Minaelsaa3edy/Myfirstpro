#!/usr/bin/env python3
"""Draws the Myfirstpro Desktop logo (assets/logo.svg) and every image made from it:
app icon (png + multi-size ico) and the installer pictures (sidebar + header, 24-bit BMP). Run: python3 tools/make-brand.py"""
import pathlib, io
from PIL import Image
from playwright.sync_api import sync_playwright
A = pathlib.Path(__file__).resolve().parent.parent / 'assets'
FONT = (pathlib.Path(__file__).resolve().parent.parent / 'src/renderer/fonts/cairo-latin-wght-normal.woff2').as_uri()

def logo(size_bg=True):
    return '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
<defs>
 <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bc0"/><stop offset="1" stop-color="#0c2650"/></linearGradient>
 <linearGradient id="gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
 <linearGradient id="am" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffbf5a"/><stop offset="1" stop-color="#e0912a"/></linearGradient>
 <filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#04162f" flood-opacity=".45"/></filter>
</defs>
<rect x="48" y="48" width="928" height="928" rx="224" fill="url(#bg)"/>
<rect x="48" y="48" width="928" height="928" rx="224" fill="url(#gl)"/>
<g filter="url(#sh)">
 <path d="M300 700 V318 L512 540 L724 318 V700" fill="none" stroke="#fff" stroke-width="128" stroke-linejoin="round" stroke-linecap="round"/>
</g>
<g filter="url(#sh)">
 <rect x="300" y="778" width="196" height="64" rx="18" fill="url(#am)"/>
 <rect x="528" y="778" width="196" height="64" rx="18" fill="url(#am)"/>
</g>
</svg>'''

def page(w, h, body, css=''):
    return f'''<!doctype html><meta charset="utf-8"><style>@font-face{{font-family:C;src:url("{FONT}");font-weight:200 1000}}
html,body{{margin:0;width:{w}px;height:{h}px;overflow:hidden}}body{{font-family:C,Tahoma,sans-serif}}{css}</style>{body}'''

def shot(pw_page, html, w, h, scale):
    pw_page.set_viewport_size({'width': w, 'height': h})
    pw_page.set_content(html); pw_page.wait_for_timeout(250)
    return Image.open(io.BytesIO(pw_page.screenshot(omit_background=True)))

svg = logo()
(A / 'logo.svg').write_text(svg, encoding='utf-8')
with sync_playwright() as p:
    b = p.chromium.launch()
    # app icon
    ctx = b.new_context(device_scale_factor=1); pg = ctx.new_page()
    big = shot(pg, page(1024, 1024, f'<div style="width:1024px;height:1024px">{svg}</div>', 'html{background:transparent}body{background:transparent}'), 1024, 1024, 1).convert('RGBA')
    big.save(A / 'icon-1024.png'); big.resize((512, 512), Image.LANCZOS).save(A / 'icon-512.png'); big.resize((256, 256), Image.LANCZOS).save(A / 'icon.png')
    big.save(A / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    # installer sidebar 164x314 (rendered 4x then reduced)
    ctx2 = b.new_context(device_scale_factor=4); pg2 = ctx2.new_page()
    side = page(164, 314, f'''<div style="position:relative;width:164px;height:314px;background:linear-gradient(170deg,#133a74 0%,#0c2650 60%,#081a38 100%);color:#fff;text-align:center">
      <div style="position:absolute;left:0;right:0;top:34px;display:flex;justify-content:center"><div style="width:96px;height:96px">{svg}</div></div>
      <div style="position:absolute;left:0;right:0;top:148px;font-weight:800;font-size:22px;letter-spacing:.2px">Myfirstpro</div>
      <div style="position:absolute;left:0;right:0;top:178px;font-weight:600;font-size:11px;letter-spacing:5px;color:#ffbf5a">DESKTOP</div>
      <div style="position:absolute;left:46px;right:46px;top:206px;height:2px;background:linear-gradient(90deg,transparent,#e0912a,transparent)"></div>
      <div style="position:absolute;left:0;right:0;bottom:16px;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#9db6dd">MINA.N.F</div></div>''')
    im = shot(pg2, side, 164, 314, 4).convert('RGB').resize((164, 314), Image.LANCZOS); im.save(A / 'installerSidebar.bmp')
    hdr = page(150, 57, f'''<div style="width:150px;height:57px;background:#fff;display:flex;align-items:center;justify-content:center;gap:8px">
      <div style="width:38px;height:38px">{svg}</div><div style="line-height:1.1"><div style="font-weight:800;font-size:14px;color:#0c2650">Myfirstpro</div><div style="font-weight:700;font-size:8.5px;letter-spacing:3px;color:#e0912a">DESKTOP</div></div></div>''')
    im = shot(pg2, hdr, 150, 57, 4).convert('RGB').resize((150, 57), Image.LANCZOS); im.save(A / 'installerHeader.bmp')
    b.close()
print('brand assets written to', A)
