#!/usr/bin/env python3
"""Generates src/scene.html: the animated dusk scene (sky, stars, sun glow, clouds, three mountain ridges, lake with shimmer,
shore lights, pines, a small lodge, fireflies, vignette) used behind the glass code card (host gate + in-app lock card).
Pure inline SVG + a few divs; all motion is CSS (src/scene.css). Deterministic (seeded)."""
import random, pathlib, sys
R = pathlib.Path(__file__).resolve().parent.parent
rnd = random.Random(11)
f = lambda n: str(int(round(n)))
P = lambda pts: ' '.join(f'{f(x)},{f(y)}' for x, y in pts)

FAR = [(-100,600),(120,500),(260,452),(380,512),(520,468),(640,522),(800,440),(960,502),(1120,430),(1280,492),(1420,442),(1560,500),(1700,600)]
MID = [(-100,612),(60,520),(150,470),(230,506),(330,424),(430,332),(520,414),(600,384),(700,302),(780,252),(860,332),(930,302),(1010,362),(1090,292),(1180,232),(1260,322),(1340,302),(1430,384),(1520,332),(1620,444),(1700,612)]
LB = [(-100,470),(60,452),(190,500),(300,566),(420,640),(530,730),(640,900)]          # left bank (top-left cliff down to bottom-centre)
RB = [(1700,498),(1560,520),(1450,566),(1350,630),(1250,716),(1150,808),(1060,900)]  # right bank
LAKE_Y = 600

def edge(p, q, y):  # point on segment p->q at height y (or q when q is higher than y)
    if q[1] <= y: return q
    t = (y - p[1]) / (q[1] - p[1]); return (p[0] + t * (q[0] - p[0]), y)
def snow(ridge, depth):
    out = []
    for i in range(1, len(ridge) - 1):
        a, b, c = ridge[i - 1], ridge[i], ridge[i + 1]
        if b[1] < a[1] and b[1] < c[1] and b[1] < 352:
            d = depth + (352 - b[1]) * .12; y = b[1] + d
            L, Rr = edge(b, a, y), edge(b, c, y); n = 6
            zz = [(L[0] + (Rr[0] - L[0]) * k / n, y + (-1) ** k * rnd.randint(7, 14) * (1 if k % 2 else .4)) for k in range(1, n)]
            out.append('M' + P([b, Rr] + zz[::-1] + [L]) + 'Z')
    return out
def ridge_d(ridge, base): return 'M' + P([(ridge[0][0], base)] + ridge + [(ridge[-1][0], base)]) + 'Z'
def at(poly, x):  # y of a polyline at x
    for (x1, y1), (x2, y2) in zip(poly, poly[1:]):
        if min(x1, x2) <= x <= max(x1, x2) and x1 != x2: return y1 + (y2 - y1) * (x - x1) / (x2 - x1)
    return None
def pine(x, y, h):
    s = []
    for k in range(3):
        top = y - h + k * h * .27; bot = y - h * .5 + k * h * .3; w = h * (.17 + .075 * k)
        s.append(f'M{f(x)},{f(top)}L{f(x - w)},{f(bot)}L{f(x + w)},{f(bot)}Z')
    t = h * .03; s.append(f'M{f(x - t)},{f(y - h*.2)}L{f(x - t)},{f(y + 6)}L{f(x + t)},{f(y + 6)}L{f(x + t)},{f(y - h*.2)}Z')  # same winding as the tiers (nonzero fill would punch a hole otherwise)
    return ''.join(s)
def pines(bank, xs, hmin, hmax, dx=0):
    d = []
    for x in xs:
        y = at(bank, x) if bank[0][0] < bank[-1][0] else at(bank[::-1], x)
        if y is None: continue
        d.append(pine(x + dx, y + 8, rnd.randint(hmin, hmax)))
    return ''.join(d)

o = []
A = o.append
A('<div class="gx-scene" aria-hidden="true">')
# --- sky + sun glow (one static layer)
A('<svg class="gx-l gx-sky" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"><defs>'
  '<linearGradient id="gxSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#060a22"/><stop offset=".3" stop-color="#101c5a"/><stop offset=".5" stop-color="#1f3f9a"/><stop offset=".64" stop-color="#5b4fb0"/><stop offset=".76" stop-color="#cc5f8c"/><stop offset=".87" stop-color="#f28a4a"/><stop offset=".96" stop-color="#ffc266"/></linearGradient>'
  '</defs><rect x="-50" y="-50" width="1700" height="700" fill="url(#gxSky)"/></svg>')
A('<svg class="gx-l gx-sun" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"><defs>'
  '<radialGradient id="gxGlow" cx="1000" cy="600" r="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".95"/><stop offset=".16" stop-color="#ffb064" stop-opacity=".75"/><stop offset=".42" stop-color="#f06a64" stop-opacity=".38"/><stop offset=".75" stop-color="#7a50c0" stop-opacity=".12"/><stop offset="1" stop-color="#7a50c0" stop-opacity="0"/></radialGradient>'
  '</defs><circle cx="1000" cy="600" r="760" fill="url(#gxGlow)"/></svg>')
# --- stars, two groups twinkling in antiphase
for cls in ('gx-sa', 'gx-sb'):
    c = ''.join(f'<circle cx="{f(rnd.uniform(0,1600))}" cy="{f(rnd.uniform(0,330))}" r="{rnd.choice([.8,1,1.2,1.5,1.9])}" fill="#fff" opacity="{rnd.choice([.55,.7,.85,1])}"/>' for _ in range(34))
    A(f'<svg class="gx-l gx-st {cls}" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">{c}</svg>')
# --- clouds (divs; direction ltr)
A('<div class="gx-clouds">')
for i, (top, w, h, dur, delay, kind, op) in enumerate([(9,70,13,150,-20,'a',.55),(17,58,10,120,-70,'b',.6),(27,80,12,170,-120,'a',.5),(36,66,10,135,-40,'c',.7),(46,90,11,190,-150,'c',.6),(53,60,8,110,-90,'b',.55)]):
    A(f'<i class="gx-cl gx-c{kind}" style="top:{top}%;width:{w}vmax;height:{h}vmax;animation-duration:{dur}s;animation-delay:{delay}s;opacity:{op}"></i>')
A('</div>')
# --- far ridge
fd = ridge_d(FAR, 640)
A(f'<svg class="gx-l gx-far" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"><defs><linearGradient id="gxFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a8be0"/><stop offset=".55" stop-color="#4d58b4"/><stop offset="1" stop-color="#3b4aa0"/></linearGradient>'
  f'<linearGradient id="gxHaze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd2a0" stop-opacity="0"/><stop offset="1" stop-color="#ffd2a0" stop-opacity=".42"/></linearGradient></defs>'
  f'<path d="{fd}" fill="url(#gxFar)" opacity=".92"/><rect x="-100" y="520" width="1800" height="84" fill="url(#gxHaze)"/></svg>')
# --- mid ridge with snow caps and sun-lit side
md = ridge_d(MID, 640)
sn = ''.join(f'<path d="{d}"/>' for d in snow(MID, 52))
A(f'<svg class="gx-l gx-mid" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"><defs>'
  '<linearGradient id="gxMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4fb2"/><stop offset=".6" stop-color="#262e78"/><stop offset="1" stop-color="#171d5a"/></linearGradient>'
  '<linearGradient id="gxLit" x1="520" y1="0" x2="1560" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffa860" stop-opacity="0"/><stop offset=".55" stop-color="#ff8aa0" stop-opacity=".2"/><stop offset="1" stop-color="#ff9060" stop-opacity="0"/></linearGradient>'
  '<linearGradient id="gxSnow" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9c4ff"/><stop offset=".55" stop-color="#fff0e0"/><stop offset="1" stop-color="#ffcf9a"/></linearGradient>'
  f'<path id="gxMidP" d="{md}"/></defs>'
  '<use href="#gxMidP" fill="url(#gxMid)"/><use href="#gxMidP" fill="url(#gxLit)"/>'
  f'<g fill="url(#gxSnow)" opacity=".92">{sn}</g></svg>')
# --- lake (static): water gradient, mirrored mountains, sun column, shore-light reflections
lights = [(x, rnd.randint(587, 597)) for x in sorted([rnd.randint(300, 780) for _ in range(16)] + [rnd.randint(1190, 1500) for _ in range(12)])]
refl = ''.join(f'<rect x="{x}" y="{LAKE_Y+3}" width="1.6" height="{rnd.randint(12,30)}" fill="#ffcf8a" opacity=".32"/>' for x, _ in lights)
A('<svg class="gx-l gx-lake" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"><defs>'
  '<linearGradient id="gxLk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6b26a"/><stop offset=".08" stop-color="#e9825f"/><stop offset=".2" stop-color="#9b5fb8"/><stop offset=".48" stop-color="#34419f"/><stop offset="1" stop-color="#0a1244"/></linearGradient>'
  '<linearGradient id="gxMk" x1="0" y1="600" x2="0" y2="830" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
  '<mask id="gxMask" maskUnits="userSpaceOnUse" x="-100" y="600" width="1800" height="300"><rect x="-100" y="600" width="1800" height="300" fill="url(#gxMk)"/></mask>'
  '<radialGradient id="gxCol" cx="1000" cy="640" r="260" gradientTransform="translate(1000 640) scale(.34 1) translate(-1000 -640)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".8"/><stop offset="1" stop-color="#ffb064" stop-opacity="0"/></radialGradient>'
  '<filter id="gxBl" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter></defs>'
  f'<rect x="-100" y="{LAKE_Y}" width="1800" height="310" fill="url(#gxLk)"/>'
  f'<g mask="url(#gxMask)" filter="url(#gxBl)" opacity=".5"><use href="#gxMidP" transform="translate(0 {LAKE_Y*2}) scale(1 -1)" fill="#3a3f9c"/></g>'
  f'<ellipse cx="1000" cy="720" rx="130" ry="190" fill="url(#gxCol)"/>{refl}</svg>')
# --- shimmer bars (animated by translateX)
bars = []
for i in range(34):
    y = rnd.uniform(612, 888); k = (y - 600) / 300; w = rnd.uniform(50, 120) + 260 * k * rnd.random(); x = rnd.uniform(-100, 1700 - w)
    near = max(0, 1 - abs((x + w / 2) - 1000) / 520); col = '#ffe6b0' if near > .45 else '#c9d4ff'
    bars.append(f'<rect class="gx-bar gx-b{i%4}" x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(1.6+2.6*k)}" rx="2" fill="{col}" opacity="{round(.12+.34*near+.1*k,2)}" style="animation-delay:-{round(rnd.uniform(0,12),1)}s"/>')
A(f'<svg class="gx-l gx-shim" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">{"".join(bars)}</svg>')
# --- shore lights
A('<svg class="gx-l gx-lights" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">' + ''.join(f'<circle class="gx-t{i%3}" cx="{x}" cy="{y}" r="{rnd.choice([1.3,1.6,1.9])}" fill="#ffd08a"/>' for i, (x, y) in enumerate(lights)) + '</svg>')
# --- near banks, pines, lodge
lbd = 'M' + P([(-100, 900)] + LB + [(640, 900)]) + 'Z'
rbd = 'M' + P([(1700, 900)] + RB + [(1060, 900)]) + 'Z'
lp = pines(LB, [-40, 10, 60, 105, 150, 195, 240, 285, 330, 375, 420, 470, 520], 80, 175)
rp = pines(RB, [1660, 1615, 1570, 1525, 1480, 1435, 1390, 1345, 1300, 1255, 1210, 1165, 1120], 70, 160)
lodge = ('<g transform="translate(64 34)"><path d="M70,424h104l-14,-20h-76z" fill="#0b1030"/><path d="M78,424h88v34h-88z" fill="#0d1334"/>'
         '<path d="M104,432h12v14h-12zM124,432h12v14h-12zM144,432h12v14h-12z" class="gx-win" fill="#ffc46b"/>'
         '<path d="M60,460h126v5h-126z" fill="#0b1030"/><path d="M200,462 l0,-40 l5,0" stroke="#0b1030" stroke-width="3" fill="none"/></g>')
A('<svg class="gx-l gx-near" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"><defs>'
  '<linearGradient id="gxNr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2260"/><stop offset=".4" stop-color="#0b1236"/><stop offset="1" stop-color="#050818"/></linearGradient></defs>'
  f'<path d="{lbd}" fill="url(#gxNr)"/><path d="{rbd}" fill="url(#gxNr)"/>{lodge}'
  f'<g class="gx-sw gx-sw1" fill="#070b24"><path d="{lp}"/></g><g class="gx-sw gx-sw2" fill="#070b24"><path d="{rp}"/></g></svg>')
# --- fireflies
ff = []
for i in range(16):
    ff.append(f'<i class="gx-ff gx-f{i%3}" style="left:{rnd.randint(4,96)}%;top:{rnd.randint(42,94)}%;--dx:{rnd.randint(-40,40)}px;--dy:{-rnd.randint(40,130)}px;animation-duration:{rnd.randint(9,19)}s;animation-delay:-{rnd.randint(0,18)}s"></i>')
A('<div class="gx-flies">' + ''.join(ff) + '</div>')
A('<div class="gx-vig"></div><div class="gx-flash"></div></div>')
out = ''.join(o)
(R / 'src' / 'scene.html').write_text(out, encoding='utf-8')
print('scene.html', len(out), 'bytes')
